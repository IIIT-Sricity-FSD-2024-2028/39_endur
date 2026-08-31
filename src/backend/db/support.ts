// SUPPORT ACCESS — the seam. DEC-114, 19 §15.
//
// It lives in `db/` for the same reason `graph.ts` and `tenant.ts` do: this is the one file
// allowed to reach across the boundary two other files exist to enforce, so it should be the
// one file a reviewer has to read to know whether the boundary still holds.
//
// WHICH BOUNDARY, EXACTLY. `platform/db.ts` makes a tenant's data unreachable to an operator
// principal, and it is untouched by any of this — an operator reading the estate still gets
// counts and never content (INV-011). What this file does is different in kind: it mints an
// ordinary MEMBER of the customer's organisation, so that the ordinary chain — tenantResolver,
// authenticate, requireCapability — can decide every request about them the ordinary way.
//
// The distinction is worth stating plainly because it is the whole answer to `19` §14's
// objection. That row refused "log in AS this customer", and it was right to: acting as a
// named person makes that person's audit trail a lie. This is not that. The operator acts as
// THEMSELVES, under their own name, in a row the customer can see, with a stated reason, on a
// clock, and without the capabilities `SUPPORT_DENIED_CAPABILITIES` withholds.
import { randomUUID } from 'node:crypto';
import { SUPPORT_SESSION_MINUTES, type SupportContext } from '@endur/shared';
import { prisma } from './client.js';

/**
 * A FOURTH `users.status`, beside active | invited | disabled.
 *
 * It is a status rather than a boolean column because the three existing values already
 * describe "what kind of thing is this row", and a support account is a fourth kind — not an
 * active account with a flag on it. The practical consequence is that every query already
 * written to mean "a real member" and spelled `status: 'active'` excludes it without being
 * changed, and the one that matters most is the seat count (`16` §5): an organisation is
 * never billed for the operator who came to help them.
 */
export const SUPPORT_STATUS = 'support';

/**
 * ONE ROW PER OPERATOR PER ORGANISATION, reused across sessions, and the address is derived
 * rather than chosen.
 *
 * `.invalid` is reserved by RFC 2606 and can never be delivered to, which is the point: this
 * address must never be a place an invite, a password reset or an announcement could
 * actually arrive. The operator's REAL address stays in `platform_users` where it belongs.
 *
 * Deriving it from the operator id rather than their email also means an operator who
 * changes their address does not acquire a second identity in every customer's audit log.
 */
const emailFor = (operatorId: string): string => `${operatorId}@support.endur.invalid`;

/**
 * The synthetic member, created on first entry and reused afterwards.
 *
 * NO PERSON NODE, and that absence is doing four jobs at once. A person node is what puts
 * somebody in the people list, in an audience, in a campaign's recipients, and in the org
 * graph that `unitSubtree` walks. Having none keeps the operator out of all four — so a
 * support visit cannot accidentally send an Endur employee a feedback request, and cannot
 * appear on the customer's People screen as a colleague nobody hired.
 *
 * It also means `collectGrants` finds no person node and would ordinarily return no grants
 * at all, which is exactly the hook `authz/support.ts` mints into. The account holds nothing
 * by existing; it holds what the resolver is handed, for as long as a live session says so.
 */
async function ensureSupportUser(
  orgId: string,
  operator: { id: string; name: string },
): Promise<string> {
  const email = emailFor(operator.id);
  const existing = await prisma.user.findFirst({
    where: { orgId, email },
    select: { id: true },
  });
  if (existing) {
    // The NAME is refreshed, because it is what the customer's audit log renders and an
    // operator who changed their name should not appear under the old one forever. The
    // status is re-asserted in the same write: it is the load-bearing field, and a row that
    // somehow drifted to `active` would start costing the customer a seat.
    await prisma.user.update({
      where: { id: existing.id },
      data: { name: operator.name, status: SUPPORT_STATUS, passwordHash: null },
    });
    return existing.id;
  }
  const created = await prisma.user.create({
    data: {
      orgId,
      email,
      name: operator.name,
      // NULL. `POST /auth/login` filters on `passwordHash: { not: null }`, so this row is
      // unreachable through the front door before the status check even runs.
      passwordHash: null,
      status: SUPPORT_STATUS,
    },
    select: { id: true },
  });
  return created.id;
}

export type StartedSupportSession = {
  id: string;
  userId: string;
  reason: string;
  startedAt: Date;
  expiresAt: Date;
};

/**
 * Open one. The caller has already regenerated the express session, so `sessionId` is the
 * id the operator's browser will actually carry.
 *
 * ANY EARLIER OPEN SESSION FOR THE SAME OPERATOR AND ORGANISATION IS CLOSED FIRST, and not
 * for tidiness: two open rows would make "is this operator inside right now" a question with
 * two answers, and the register exists to answer it with one. Entering again is a NEW visit
 * with a new reason, which is the honest record of what happened.
 */
export async function startSupportSession(input: {
  operator: { id: string; name: string };
  orgId: string;
  reason: string;
  sessionId: string;
}): Promise<StartedSupportSession> {
  const userId = await ensureSupportUser(input.orgId, input.operator);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SUPPORT_SESSION_MINUTES * 60 * 1000);

  await prisma.supportSession.updateMany({
    where: { operatorId: input.operator.id, orgId: input.orgId, endedAt: null },
    data: { endedAt: now },
  });

  const row = await prisma.supportSession.create({
    data: {
      id: randomUUID(),
      operatorId: input.operator.id,
      orgId: input.orgId,
      userId,
      reason: input.reason,
      sessionId: input.sessionId,
      expiresAt,
    },
    select: { id: true, userId: true, reason: true, startedAt: true, expiresAt: true },
  });
  return row;
}

export type LiveSupportSession = {
  id: string;
  orgId: string;
  userId: string;
  operatorId: string;
  context: SupportContext;
};

/**
 * Resolve the express-session id to a LIVE support session, or null.
 *
 * EXPIRY IS IN THE QUERY, not in a branch afterwards — the same choice `platform/session.ts`
 * makes and for the same reason: a row that has run out is a row that does not match, so
 * there is no condition anybody can forget to write. `endedAt: null` is the other half; the
 * two together are what "active" means, and neither alone is.
 *
 * This runs on EVERY request inside a support session. That is deliberate rather than
 * unfortunate: it is what makes Leave take effect on the next request instead of at the next
 * login, and it is the same property permissions get from being resolved per request rather
 * than read from a session claim (`authenticate`'s own opening comment).
 */
export async function loadSupportSession(sessionId: string): Promise<LiveSupportSession | null> {
  const row = await prisma.supportSession.findFirst({
    where: { sessionId, endedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      orgId: true,
      userId: true,
      operatorId: true,
      reason: true,
      startedAt: true,
      expiresAt: true,
      operator: { select: { name: true, email: true, status: true } },
    },
  });
  if (!row) return null;
  // A disabled operator's live support session stops working on the next request, exactly
  // as their platform session does. Revoking an employee's access has to mean everywhere.
  if (row.operator.status !== 'active') return null;

  return {
    id: row.id,
    orgId: row.orgId,
    userId: row.userId,
    operatorId: row.operatorId,
    context: {
      viewer: 'operator',
      operatorName: row.operator.name,
      operatorEmail: row.operator.email,
      reason: row.reason,
      startedAt: row.startedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    },
  };
}

/**
 * IS SOMEBODY FROM ENDUR INSIDE **THIS** ORGANISATION RIGHT NOW — asked on behalf of the
 * organisation's own staff, not the operator.
 *
 * This is the half that makes the disclosure real. `loadSupportSession` above answers about
 * the CALLER's session, so it can only ever tell the operator what the operator already knows;
 * the customer is signed in to a different session entirely, and without this function their
 * console would look exactly as it always does while somebody else drove it. A promise that
 * only the person being watched can read is not a promise.
 *
 * Asked once per boot, on `/auth/me`, and no more often. It is one indexed lookup on a table
 * that is empty for almost every organisation almost always — the cost of telling the truth
 * here is a query per page load, and there is no version of this feature worth having that
 * would not pay it.
 */
export async function activeSupportFor(orgId: string): Promise<SupportContext | null> {
  const row = await prisma.supportSession.findFirst({
    where: { orgId, endedAt: null, expiresAt: { gt: new Date() } },
    // The NEWEST, on the vanishing chance of two. `startSupportSession` closes an operator's
    // own earlier row, but two different operators can legitimately be in at once — and one
    // banner naming the most recent is a better answer than a list nobody asked for.
    orderBy: { startedAt: 'desc' },
    select: {
      reason: true,
      startedAt: true,
      expiresAt: true,
      operator: { select: { name: true, email: true, status: true } },
    },
  });
  if (!row || row.operator.status !== 'active') return null;
  return {
    viewer: 'member',
    operatorName: row.operator.name,
    operatorEmail: row.operator.email,
    reason: row.reason,
    startedAt: row.startedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** Leave. Server-side, so destroying the cookie alone cannot leave a usable row behind. */
export async function endSupportSession(sessionId: string): Promise<void> {
  await prisma.supportSession.updateMany({
    where: { sessionId, endedAt: null },
    data: { endedAt: new Date() },
  });
}

/**
 * The window a support principal's minted grants are valid for, or null.
 *
 * Asked by `authz/collect.ts`, and ONLY on the path where a principal has no person node —
 * which for every real member of every organisation is a path that is never taken. The cost
 * of this whole feature on an ordinary request is therefore zero extra queries, which is why
 * the check lives there rather than as a flag threaded separately through `resolve`,
 * `visibleUnits` and `heldCapabilities`.
 *
 * IT RETURNS THE EXPIRY RATHER THAN A BOOLEAN, so the minted grants can carry `validTo` and
 * expire the way every other grant in the product expires. `authenticate` already refuses a
 * request whose session has run out, so this is the second of two independent stops — and it
 * is the one that holds if a cached grant set ever outlived the session that justified it.
 */
export async function supportGrantWindow(
  orgId: string,
  userId: string,
  at: Date,
): Promise<{ expiresAt: Date } | null> {
  const row = await prisma.supportSession.findFirst({
    where: {
      orgId,
      userId,
      endedAt: null,
      expiresAt: { gt: at },
      user: { status: SUPPORT_STATUS },
    },
    orderBy: { startedAt: 'desc' },
    select: { expiresAt: true },
  });
  return row ? { expiresAt: row.expiresAt } : null;
}
