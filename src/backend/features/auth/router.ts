// Auth routes: register, login, logout, and /me.
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

// How many accounts on one email address a login will check the password against.
// Each one costs a real argon2 verification, so the window is capped; oldest first, so nobody
// can be pushed out of their own account by newer sign-ups.
const MAX_LOGIN_CANDIDATES = 5;

export const authRouter: Router = Router();

// The one router whose organisation is optional - signing in happens before you belong to one -
// and the only place the X-Org-Slug header is trusted.
authRouter.use(authChain);

// Hands the SPA a CSRF token to echo back on writes.
authRouter.get('/csrf', (_req, res) => {
  res.json({ token: issueCsrfToken(res) });
});

// Registration: creates the organisation and signs the founder straight in.
authRouter.post('/register', validate(RegisterDto), (req, res, next) => {
  const { body } = req.data as { body: RegisterBody };
  void (async () => {
    const existing = await prisma.user.findFirst({
      where: { email: body.email }, select: { id: true },
    });
    // Registration may say the address is taken: you are choosing an identity. Login may not.
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

// Login: rate limited, and it answers the same way for every kind of failure.
authRouter.post('/login', scopedRateLimits.login, validate(LoginDto), (req, res, next) => {
  const { body } = req.data as { body: LoginBody };
  void (async () => {
    // An email can exist in several organisations, so this can match more than one row.
    // passwordHash not null skips invited accounts that were never activated, and oldest first
    // keeps the existing account inside the window.
    const candidates = await prisma.user.findMany({
      where: {
        email: body.email,
        passwordHash: { not: null },
        // The synthetic support member is never a login, checked here as well as by the missing password.
        status: { not: 'support' },
        ...(body.orgId ? { orgId: body.orgId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_LOGIN_CANDIDATES,
      select: { id: true, orgId: true, passwordHash: true, status: true,
                org: { select: { name: true, suspendedAt: true } } },
    });

    // Hash anyway when nothing matched, so an unknown address takes the same time as a real one.
    if (candidates.length === 0) {
      await verifyPassword(null, body.password);
      throw new UnauthenticatedError('That email or password is not right.');
    }

    // One at a time, not in parallel: argon2 uses 19 MiB each, and parallel checks would multiply that.
    const matched = [];
    for (const candidate of candidates) {
      if (await verifyPassword(candidate.passwordHash, body.password)) matched.push(candidate);
    }

    // A disabled account fails exactly like a wrong password: one message, one path, no clues.
    const usable = matched.filter((candidate) => candidate.status !== 'disabled');
    if (usable.length === 0) throw new UnauthenticatedError('That email or password is not right.');

    // Only if the password matched in more than one organisation is the caller asked which one they meant.
    if (usable.length > 1) {
      throw new AppError('ACCOUNT_AMBIGUOUS', 'That sign-in works for more than one organization.', {
        organizations: usable.map((candidate) => ({ id: candidate.orgId, name: candidate.org.name })),
      });
    }

    const user = usable[0] as (typeof usable)[number];

    // Suspension is reported here, AFTER the password is proved, so login cannot be used to probe which orgs exist.
    if (user.org.suspendedAt) {
      throw new AppError('FORBIDDEN', 'This organization has been suspended. Contact Endur support.');
    }

    // Regenerate the session id before storing anything, which prevents session fixation.
    await regenerate(req);
    req.session.userId = user.id;
    req.session.orgId = user.orgId;
    await save(req);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    issueCsrfToken(res);
    res.json({ ok: true });
  })().catch(next);
});

// Logout: ends the session on the server and clears both cookies.
authRouter.post('/logout', (req, res, next) => {
  // End any support session first: the row is what confers the powers, so it goes before the cookie.
  const sessionId = req.sessionID;
  // Destroy the session record on the server; clearing the cookie alone would leave a valid id alive.
  void endSupportSession(sessionId)
    .then(() => destroy(req))
    .then(() => {
      res.clearCookie('endur.sid', { path: '/' });
      res.clearCookie('endur.csrf', { path: '/' });
      res.json({ ok: true });
    })
    .catch(next);
});

// Who am I: the user, their organisation, its vocabulary, and the capabilities the UI may offer.
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

    // The vocabulary travels with the session, so the app can paint domain nouns on its first render.
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
      // Present only during a support session, and sent on this response so the banner appears on the first paint.
      // Two sources: the operator's own session, and - for the customer's own staff - a lookup that discloses
      // that somebody from Endur is inside their organisation right now.
      ...(principal.support
        ? { support: principal.support }
        : await activeSupportFor(user.org.id).then((live) => (live ? { support: live } : {}))),
    };
    res.json(body);
  })().catch(next);
});
