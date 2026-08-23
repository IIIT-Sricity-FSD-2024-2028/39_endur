// Account provisioning, revocation and activation. 57, 15 §2 §5, 13 § Accounts.
//
// The rule the whole file is written around, and it is the one that was RE-EXAMINED rather
// than inherited: AN ADMINISTRATOR NEVER KNOWS A CREDENTIAL THAT WORKS. They create the
// account, choose nothing about the password, and hand over a link. An administrator who
// can set a dean's password can sign in as the dean — and every audit row from that session
// then names the dean. The org chart would be intact and the audit log would be fiction,
// which is `56`'s entire subject destroyed to save one step.
import type { Request } from 'express';
import type { AccountInvite, ActivationPreview } from '@endur/shared';
import type { Capability } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { runInTransaction, type Tx } from '../../db/tx.js';
import { config } from '../../lib/config.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { hashPassword } from '../../auth/password.js';
import { urlFor } from '../files/service.js';
import { accountStatusOf } from './status.js';
import { activationUrlFor, expiryFrom, hashInviteToken, mintInviteToken } from '../../auth/inviteToken.js';

export { accountStatusOf };

/**
 * One dead end for every failure of a token, and it is the same argument CONF-015 settles
 * for campaign links: an unknown token, an expired one and one somebody already used must
 * be indistinguishable, or the endpoint answers questions about accounts the asker does
 * not own. "This link was real and has been used" is a fact about somebody else's day.
 */
const uniformDeadEnd = () =>
  new NotFoundError('That link is not active. Ask whoever invited you for a new one.');

/**
 * No `authzVersion` and no capability: the visibility question was settled in the chain
 * (`requirePersonVisible`), so what reaches the service is only what it needs to WRITE —
 * whose account, and who to record as the inviter.
 */
type PersonRef = {
  orgId: string;
  personId: string;
  callerId: string;
};

/** The person and their `users` row, or the reason there is nothing to provision. */
async function accountOf(orgId: string, personId: string) {
  const person = await prisma.node.findFirst({
    where: { id: personId, orgId, kind: 'person' },
    select: {
      id: true,
      name: true,
      userId: true,
      user: { select: { id: true, passwordHash: true, status: true } },
    },
  });
  if (!person) throw new NotFoundError('That person does not exist.');
  if (!person.user) {
    // Both creation paths write a `users` row alongside the node (createPerson and the CSV
    // import), so this is not the ordinary case. It is reachable through a hand-written row
    // and it must not be a 500: say what is missing rather than crash on a null id.
    throw new ConflictError('That person has no account record to provision. Re-add them.');
  }
  return { person, user: person.user };
}

/**
 * Provision, or re-issue. ONE function for two capabilities, because the difference between
 * them is a policy about WHO MAY, not about what happens — and two copies of a token mint
 * would be two places for the hashing to go wrong.
 *
 * `capability` is passed in rather than inferred so the row-level visibility check asks the
 * same question the route's `requireCapability` asked. Asking a different one here would
 * make the middleware's answer decorative.
 */
export async function provisionAccount(
  req: Request,
  ref: PersonRef,
  mode: { capability: Extract<Capability, 'account.create' | 'account.reset'> },
): Promise<AccountInvite> {
  // NO visibility check here: `requirePersonVisible(capability)` is link 10a on all three
  // routes and has already 404'd anybody who cannot see this person. Asking twice would be
  // two answers to one question, and the one that mattered would be the invisible one.
  const { person, user } = await accountOf(ref.orgId, ref.personId);

  // `create` is for somebody who has never had a key; `reset` is the support path for
  // somebody who has. Refusing here rather than silently re-issuing is what keeps the two
  // capabilities meaningful: a coordinator holding only `account.create` must not be able
  // to mint a working link for an account that is already somebody's.
  if (mode.capability === 'account.create' && user.passwordHash) {
    throw new ConflictError('That person already signs in. Re-issue their link instead.');
  }

  const token = mintInviteToken();
  const now = new Date();
  const expiresAt = expiryFrom(now);

  await runInTransaction(req, async (tx) => {
    // DELETE THEN INSERT, INSIDE ONE TRANSACTION. The partial unique index allows exactly
    // one unaccepted row per person, so this is not belt-and-braces: it is how re-issuing
    // invalidates the previous link in the same statement pair that creates the new one.
    // There is no window in which two links work, and no service-layer check to race.
    await tx.accountInvite.deleteMany({ where: { userId: user.id, acceptedAt: null } });
    await tx.accountInvite.create({
      data: {
        orgId: ref.orgId,
        userId: user.id,
        tokenHash: hashInviteToken(token),
        expiresAt,
        createdById: ref.callerId,
      },
    });
    req.ctx.audit.push({
      action: mode.capability,
      targetType: 'person',
      targetId: person.id,
    });
  });

  // The ONLY moment this string exists outside the request that made it. It is not stored,
  // not logged, and not returned by any later read — `token_hash` is all the database has.
  return {
    url: activationUrlFor(config.PUBLIC_BASE_URL, token),
    expiresAt: expiresAt.toISOString(),
    personName: person.name,
  };
}

/**
 * Revocation. 57 § Revocation.
 *
 * FOUR THINGS, and each one is load-bearing:
 *
 *   status = disabled     no new sign-in
 *   password_hash = NULL  there is no old password to restore, which is why re-enabling is
 *                         a fresh invite rather than an "un-disable"
 *   sessions deleted      IMMEDIATE. Sessions are rows (15 §2), and this is the route that
 *                         spends the advantage that decision bought — `authenticate` never
 *                         reads `users.status`, so a live session would otherwise outlive
 *                         the revocation until it expired on its own
 *   invites deleted       an unaccepted invite IS an issued credential. Leaving one alive
 *                         would let the revoked person set a password and walk back in
 *
 * What it does NOT do: remove the person, their positions, their templates or their audit
 * rows. Someone who has left is still the person who launched that campaign in March, and a
 * product that erases them to tidy up has destroyed its own evidence (10 §9).
 */
export async function revokeAccount(req: Request, ref: PersonRef): Promise<void> {
  const { person, user } = await accountOf(ref.orgId, ref.personId);

  // THE LOCKOUT GUARD, and it is the same one `33` puts on the powers grid. There is no
  // password reset in this product and no mailer behind one (57 § Out of scope), so an
  // owner who revokes their own account has locked the organisation permanently — not
  // until somebody helps, but for good. A logout is the action they meant.
  if (user.id === ref.callerId) {
    throw new ConflictError('You cannot revoke your own sign-in. Sign out instead.');
  }

  await runInTransaction(req, async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { status: 'disabled', passwordHash: null, disabledAt: new Date() },
    });
    await tx.accountInvite.deleteMany({ where: { userId: user.id, acceptedAt: null } });
    await endSessions(tx, user.id);
    req.ctx.audit.push({ action: 'account.revoke', targetType: 'person', targetId: person.id });
  });
}

/**
 * `sessions` is connect-pg-simple's table and deliberately NOT a Prisma model (10 §5), so
 * there is no ORM path to this row at all — this is raw by necessity, not by preference, and
 * it is parameterised, because a user id interpolated into SQL is a user id somebody can
 * shape.
 *
 * WORTH SAYING OUT LOUD: DEC-007 confines raw SQL to `db/graph.ts`, and the lint selector
 * that enforces it matches `$queryRaw` only — `$executeRaw` slips through. This call would
 * qualify for the confinement on the rule's own terms and passes because of a gap in it, not
 * because of an exemption. Recorded as `D-025` rather than quietly relied on.
 *
 * `sess` is JSONB and `userId` is written into it by `auth/session.ts`. If that key is ever
 * renamed, this silently deletes nothing — which is why `revokes an active session` asserts
 * the effect through a signed-in agent rather than by counting rows.
 */
async function endSessions(tx: Tx, userId: string): Promise<number> {
  return tx.$executeRaw`DELETE FROM sessions WHERE sess ->> 'userId' = ${userId}`;
}

/**
 * GET BEFORE POST. The screen greets the person by name and names the organisation before
 * asking for a password, because a bare password box reached from a pasted link is
 * indistinguishable from a phishing page — and this link arrived over WhatsApp.
 *
 * Everything it returns is already known to whoever holds the token, so the greeting
 * discloses nothing: a link that resolves proves the organisation and the person to the
 * holder either way. What it does NOT return is the email address, which would turn a
 * leaked link into an address harvester.
 */
export async function inspectInvite(token: string): Promise<ActivationPreview> {
  const invite = await prisma.accountInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: {
      expiresAt: true,
      acceptedAt: true,
      user: { select: { name: true } },
      org: { select: { name: true, logoFileId: true } },
    },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) throw uniformDeadEnd();

  return {
    personName: invite.user.name,
    organizationName: invite.org.name,
    organizationLogoUrl: invite.org.logoFileId ? urlFor(invite.org.logoFileId) : null,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export type Activation = { userId: string; orgId: string };

/**
 * Consume the link and set the password. The person is signed in by the ROUTER afterwards;
 * this function owns the state change and nothing about the session.
 *
 * CONSUMED BY A CONDITIONAL UPDATE, not by a read followed by a write.
 *
 * Two people racing one pasted link — the same person on a phone and a laptop, which is the
 * realistic version — would otherwise both pass an `accepted_at IS NULL` check and both set
 * a password, and the second would win silently. `UPDATE … WHERE accepted_at IS NULL` is one
 * statement: the loser blocks on the row, re-evaluates the predicate against the committed
 * version, matches nothing, and gets the uniform dead end. Exactly one activation.
 *
 * 57 § The token specifies `SELECT … FOR UPDATE`, which would work equally well and is the
 * same idea spelled out in two statements. This is the version that needs no raw SQL — and
 * therefore no exception to DEC-007, which confines it to `db/graph.ts`. Recorded in 57.
 */
export async function activateAccount(
  req: Request,
  token: string,
  password: string,
): Promise<Activation> {
  const tokenHash = hashInviteToken(token);
  // Hashed BEFORE the transaction opens: argon2id is deliberately slow, and holding a row
  // lock across it would serialise every activation behind one CPU-bound hash.
  const passwordHash = await hashPassword(password);

  return runInTransaction(req, async (tx) => {
    // Read first, only for the ids. This read decides nothing — the claim below is the
    // arbiter — so losing a race between the two is harmless.
    const invite = await tx.accountInvite.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, orgId: true },
    });
    if (!invite) throw uniformDeadEnd();

    // THE CLAIM. One statement, and its WHERE is the concurrency control: the expiry and
    // the single-use rule are both evaluated by the database against the committed row,
    // not by this process against a stale read.
    const claimed = await tx.accountInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count === 0) throw uniformDeadEnd();

    await tx.user.update({
      where: { id: invite.userId },
      data: {
        passwordHash,
        status: 'active',
        // Cleared, not left standing. A re-enabled account is not a disabled one carrying
        // a stale date, and `accountStatusOf` reads both.
        disabledAt: null,
        lastLoginAt: new Date(),
      },
    });

    const person = await tx.node.findFirst({
      where: { orgId: invite.orgId, kind: 'person', userId: invite.userId },
      select: { id: true },
    });
    // INV-007. THE ROW CARRIES NO ACTOR AND NO IP, and that is accurate rather than a gap:
    // the request arrived with no principal — it could not have arrived with one, the whole
    // point is that this person has no way in yet — and `flushAudit` records what the chain
    // decided, not what became true afterwards. `target_id` names who activated, and
    // `request_id` joins the row to the request log, which does hold the address.
    req.ctx.audit.push({
      action: 'account.activate',
      targetType: 'person',
      ...(person ? { targetId: person.id } : {}),
    });

    return { userId: invite.userId, orgId: invite.orgId };
  });
}
