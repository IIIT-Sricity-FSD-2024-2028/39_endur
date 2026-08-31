// Creating, revoking and activating sign-ins.
// The rule the whole file is built around: an administrator never knows a password that works.
// They create the account and hand over a link - anything else would let them sign in as somebody else,
// and every audit row from that session would name the wrong person.
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

// One dead end for every failure of a token: unknown, expired and already-used must be indistinguishable.
const uniformDeadEnd = () =>
  new NotFoundError('That link is not active. Ask whoever invited you for a new one.');

// What the service needs to WRITE: whose account, and who to record as the inviter. Visibility was settled in the chain.
type PersonRef = {
  orgId: string;
  personId: string;
  callerId: string;
};

// The person and their account row, or the reason there is nothing to provision.
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
    // Both creation paths write an account row, so this is rare - but say what is missing rather than crash.
    throw new ConflictError('That person has no account record to provision. Re-add them.');
  }
  return { person, user: person.user };
}

// Provision or re-issue: one function for two capabilities, because the difference is who may,
// not what happens. The capability is passed in so the row-level check asks the same question the route did.
export async function provisionAccount(
  req: Request,
  ref: PersonRef,
  mode: { capability: Extract<Capability, 'account.create' | 'account.reset'> },
): Promise<AccountInvite> {
  // No visibility check here: the middleware already 404'd anybody who cannot see this person.
  const { person, user } = await accountOf(ref.orgId, ref.personId);

  // create is for somebody who never had a key; reset is the support path for somebody who did.
  if (mode.capability === 'account.create' && user.passwordHash) {
    throw new ConflictError('That person already signs in. Re-issue their link instead.');
  }

  const token = mintInviteToken();
  const now = new Date();
  const expiresAt = expiryFrom(now);

  await runInTransaction(req, async (tx) => {
    // Delete then insert inside one transaction: this is how re-issuing invalidates the previous link,
    // with no window in which two links work.
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

  // The only moment the raw token exists outside this request. Only its hash is stored.
  return {
    url: activationUrlFor(config.PUBLIC_BASE_URL, token),
    expiresAt: expiresAt.toISOString(),
    personName: person.name,
  };
}

// Revocation does four things: disables the account, clears the password hash, deletes live sessions
// so access ends immediately, and deletes any unaccepted invite, which is itself a working credential.
// It does NOT remove the person, their positions or their history.
export async function revokeAccount(req: Request, ref: PersonRef): Promise<void> {
  const { person, user } = await accountOf(ref.orgId, ref.personId);

  // You cannot revoke yourself: there is no password reset in this product, so an owner doing that would lock the org for good.
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

// The sessions table belongs to the session library and is not a Prisma model, so this has to be raw SQL.
// It is parameterised, and the user id lives inside the session's JSON.
async function endSessions(tx: Tx, userId: string): Promise<number> {
  return tx.$executeRaw`DELETE FROM sessions WHERE sess ->> 'userId' = ${userId}`;
}

// The GET before the POST: the page greets the person and names the organisation before asking for a password,
// because a bare password box reached from a pasted link looks exactly like a phishing page.
// It never returns the email address, which would turn a leaked link into an address harvester.
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

// What a successful activation returns to the router.
export type Activation = { userId: string; orgId: string };

// Consumes the link and sets the password. The router signs the person in afterwards.
// The invite is claimed with a single conditional UPDATE, so two devices racing the same link
// cannot both succeed: the loser matches nothing and gets the same dead end as a bad token.
export async function activateAccount(
  req: Request,
  token: string,
  password: string,
): Promise<Activation> {
  const tokenHash = hashInviteToken(token);
  // Hashed before the transaction opens: argon2 is deliberately slow, and holding a row lock across it would serialise activations.
  const passwordHash = await hashPassword(password);

  return runInTransaction(req, async (tx) => {
    // Read first, only for the ids. This read decides nothing; the claim below is the arbiter.
    const invite = await tx.accountInvite.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, orgId: true },
    });
    if (!invite) throw uniformDeadEnd();

    // The claim. Its WHERE clause is the concurrency control: expiry and single use are checked by the database.
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
        // Cleared, so a re-enabled account is not left carrying a stale disabled date.
        disabledAt: null,
        lastLoginAt: new Date(),
      },
    });

    const person = await tx.node.findFirst({
      where: { orgId: invite.orgId, kind: 'person', userId: invite.userId },
      select: { id: true },
    });
    // The audit row carries no actor and no IP, which is accurate: the request arrived with no principal at all.
    req.ctx.audit.push({
      action: 'account.activate',
      targetType: 'person',
      ...(person ? { targetId: person.id } : {}),
    });

    return { userId: invite.userId, orgId: invite.orgId };
  });
}
