// Auth routes. 13 § Auth, 15 §5.
import { Router } from 'express';
import { urlFor } from '../files/service.js';
import { authChain } from '../../middleware/chains.js';
import { LoginDto, RegisterDto, resolveLabels } from '@endur/shared';
import type { LoginBody, MeResponse, RegisterBody } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { verifyPassword } from '../../auth/password.js';
import { destroy, regenerate, save } from '../../auth/session.js';
import { activeSupportFor, endSupportSession } from '../../db/support.js';
import { issueCsrfToken } from '../../middleware/csrfProtection.js';
import { validate } from '../../middleware/validate.js';
import { scopedRateLimits } from '../../middleware/rateLimit.js';
import { authenticate } from '../../middleware/authenticate.js';
import { AppError, ConflictError, UnauthenticatedError } from '../../lib/errors.js';
import { heldCapabilities } from '../../authz/held.js';
import { register } from './service.js';

/**
 * How many accounts on one address login will check a password against (DEC-049).
 *
 * Every candidate costs one argon2 verification — ~100ms and 19 MiB, deliberately — so an
 * uncapped window would let anybody who can create accounts on an address turn one login
 * attempt into arbitrary work. Five is far past any honest case: a person belongs to one
 * organisation, occasionally two.
 *
 * The cap is safe because the window is ordered `createdAt asc`. The OLDEST activated
 * account is always inside it, so no number of accounts created later can push somebody
 * out of their own. A hypothetical sixth is unreachable until one of the first five is
 * revoked — which fails toward the incumbent, the right direction.
 */
const MAX_LOGIN_CANDIDATES = 5;

export const authRouter: Router = Router();

// Links 6-8, router-level (12 §2). The ONE router whose tenant is optional — signing in
// and registering happen before there is an organisation to belong to — and the one place
// X-Org-Slug is honoured, because a caller with no credential cannot widen anything.
authRouter.use(authChain);

authRouter.get('/csrf', (_req, res) => {
  res.json({ token: issueCsrfToken(res) });
});

authRouter.post('/register', validate(RegisterDto), (req, res, next) => {
  const { body } = req.data as { body: RegisterBody };
  void (async () => {
    const existing = await prisma.user.findFirst({
      where: { email: body.email }, select: { id: true },
    });
    // Registration CAN say the address is taken — you are choosing an identity, and
    // refusing to say why would make the form unusable. Login cannot. See below.
    if (existing) throw new ConflictError('That email address is already registered.');

    const { org, user } = await register(body);
    await regenerate(req);
    req.session.userId = user.id;
    req.session.orgId = org.id;
    await save(req);
    issueCsrfToken(res);
    res.status(201).json({ organization: { id: org.id, slug: org.slug } });
  })().catch(next);
});

authRouter.post('/login', scopedRateLimits.login, validate(LoginDto), (req, res, next) => {
  const { body } = req.data as { body: LoginBody };
  void (async () => {
    // `users` is unique on (org_id, email), NOT on email alone (10 §3), so this lookup can
    // legitimately match rows in more than one organisation. DEC-049 decides what happens
    // then, and CONF-013 records the two answers it rejected.
    //
    //   passwordHash: not null  — an INVITED row has no hash and can never be signed in
    //     to. Without this, anyone holding `person.create` in any organisation could lock
    //     any user of any other organisation out of their own account, just by inviting
    //     their email address: the invited row was matched first and the real one was
    //     never reached. Reproduced end-to-end on 2026-08-19 (200 -> 401 after one
    //     unrelated POST /people).
    //   orderBy createdAt asc  — the incumbent is checked first and can never be pushed
    //     out of the candidate window by accounts created later. That is what makes the
    //     cap below safe.
    //
    // WHY ALL CANDIDATES ARE CHECKED AND NOT JUST THE FIRST. Until 2026-08-24 this was a
    // `findFirst`, and the oldest activated row won outright. That closed the adversarial
    // lockout above and left an HONEST one, which was measured rather than theorised: a
    // person with a real account in two organisations activates the second, chooses a
    // password, is signed in by the activation — and can never log in again. Their correct
    // password returns 401 forever, because the older row is the only one ever compared
    // against. T-072 made the path to that state one click and a link.
    const candidates = await prisma.user.findMany({
      where: {
        email: body.email,
        passwordHash: { not: null },
        // DEC-114. The synthetic member a support session acts as is never a login. It
        // already has no hash, so the line above excludes it — this one excludes it for a
        // SECOND, independent reason, because the first is a property of a column somebody
        // could set by hand one day and this is a property of what the row is. The account
        // exists to be an audit actor inside a tenant and for nothing else (19 §15).
        status: { not: 'support' },
        ...(body.orgId ? { orgId: body.orgId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_LOGIN_CANDIDATES,
      select: { id: true, orgId: true, passwordHash: true, status: true,
                org: { select: { name: true, suspendedAt: true } } },
    });

    // A DUMMY VERIFICATION WHEN THERE ARE NONE, which is the timing half of user
    // enumeration and the reason verifyPassword takes a nullable hash at all. Returning
    // instantly for an unknown address is a free oracle for which addresses are real.
    if (candidates.length === 0) {
      await verifyPassword(null, body.password);
      throw new UnauthenticatedError('That email or password is not right.');
    }

    // Sequential, not Promise.all: argon2 is deliberately memory-hard (19 MiB each), and
    // running the window in parallel would multiply the memory a single request can pin.
    const matched = [];
    for (const candidate of candidates) {
      if (await verifyPassword(candidate.passwordHash, body.password)) matched.push(candidate);
    }

    // A disabled account fails as though it did not exist — one message, one code path,
    // whatever went wrong. Any difference in wording or timing is a free tool for working
    // out which addresses are real (15 §2).
    const usable = matched.filter((candidate) => candidate.status !== 'disabled');
    if (usable.length === 0) throw new UnauthenticatedError('That email or password is not right.');

    // MORE THAN ONE, and only then, is the caller asked which. It costs nothing on stage:
    // it can only happen to somebody who holds accounts in several organisations AND uses
    // the same password for them, so no seeded org and no ordinary sign-in ever sees it.
    // Naming the organisations here is safe because the caller has, by this line, proved
    // the password for every one of them.
    if (usable.length > 1) {
      throw new AppError('ACCOUNT_AMBIGUOUS', 'That sign-in works for more than one organization.', {
        organizations: usable.map((candidate) => ({ id: candidate.orgId, name: candidate.org.name })),
      });
    }

    const user = usable[0] as (typeof usable)[number];

    // SAID HERE, WHERE IT IS UNDERSTOOD (N-070). `tenantResolver` refuses a suspended
    // organisation on every request that carries a session, so before this the sign-in
    // itself answered 200 and the FIRST console call answered 403 — the user was let in
    // and then told nothing useful at the moment they could act on it.
    //
    // AFTER the password is proved, deliberately: suspension is a fact about a named
    // organisation, and answering it to an unauthenticated caller would turn login into an
    // oracle for which organisations exist and what state they are in (15 §2). By this line
    // the caller has proved they hold the account.
    //
    // Same code and same words as the resolver, so a user who is suspended mid-session and
    // one who signs in afterwards read the same sentence.
    if (user.org.suspendedAt) {
      throw new AppError('FORBIDDEN', 'This organization has been suspended. Contact Endur support.');
    }

    // Regenerate BEFORE storing anything: session fixation prevention (15 §2).
    await regenerate(req);
    req.session.userId = user.id;
    req.session.orgId = user.orgId;
    await save(req);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    issueCsrfToken(res);
    res.json({ ok: true });
  })().catch(next);
});

authRouter.post('/logout', (req, res, next) => {
  // DEC-114. A SUPPORT SESSION IS ENDED BY SIGNING OUT, and the row is closed BEFORE the
  // session record is destroyed.
  //
  // The row is what confers the powers — `authenticate` resolves it on every request — so
  // ending it first means access is gone even if the destroy below fails. The other order
  // would leave a browser with no cookie and a live row, which anybody replaying a captured
  // cookie could still use. It also keeps the register honest: an operator who signs out
  // instead of pressing Leave has still left, and the register should say when.
  const sessionId = req.sessionID;
  // Destroy the record server-side. Clearing the cookie alone would leave a valid session
  // id alive for anyone who captured it.
  void endSupportSession(sessionId)
    .then(() => destroy(req))
    .then(() => {
      res.clearCookie('endur.sid', { path: '/' });
      res.clearCookie('endur.csrf', { path: '/' });
      res.json({ ok: true });
    })
    .catch(next);
});

authRouter.get('/me', authenticate, (req, res, next) => {
  const principal = req.ctx.principal;
  void (async () => {
    if (principal?.kind !== 'user') throw new UnauthenticatedError();
    const user = await prisma.user.findUnique({
      where: { id: principal.id },
      select: { id: true, name: true, email: true, avatarFileId: true,
                org: { select: { id: true, name: true, slug: true, industry: true, labels: true } } },
    });
    if (!user) throw new AppError('UNAUTHENTICATED', 'Your account no longer exists.');

    // The vocabulary rides along with the session, so the SPA can render domain nouns on
    // its first paint rather than flashing generic words (22 §3).
    const body: MeResponse = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarFileId ? urlFor(user.avatarFileId) : null,
      },
      organization: {
        id: user.org.id, name: user.org.name, slug: user.org.slug, industry: user.org.industry,
      },
      labels: resolveLabels(user.org.labels as never),
      capabilities: await heldCapabilities(user.org.id, user.id),
      // DEC-114. Present only inside a support session, and it rides on THIS response rather
      // than a route of its own because `<AppShell>` must render the banner on its first
      // paint. A second request would mean a customer's console looks ordinary for a frame
      // and then admits it is being driven by somebody from Endur, which is the wrong order
      // to learn that in.
      //
      // `capabilities` above is already correct for a support session without being told
      // about one: `heldCapabilities` reads `collectGrants`, which is where the minted grants
      // come from, so the sidebar hides Results for an operator for the same reason it hides
      // it for anybody who has been denied it.
      //
      // TWO SOURCES, AND THE SECOND ONE IS THE DISCLOSURE. `principal.support` is the caller's
      // own session and can only ever tell the OPERATOR something they already know. The
      // customer is signed in to a different session and carries no support flag at all, so
      // without the second branch their console would look exactly as it always does while
      // somebody from Endur drove it — a promise legible only to the person being watched.
      // One extra indexed lookup, once per boot, on a table that is empty for almost every
      // organisation almost always.
      ...(principal.support
        ? { support: principal.support }
        : await activeSupportFor(user.org.id).then((live) => (live ? { support: live } : {}))),
    };
    res.json(body);
  })().catch(next);
});
