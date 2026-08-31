// Support access: lets an Endur operator work inside a customer's organisation as a limited member of it.
// The operator acts as themselves, on a clock, with a stated reason, through the ordinary permission chain.
import { randomUUID } from 'node:crypto';
import { SUPPORT_SESSION_MINUTES, type SupportContext } from '@endur/shared';
import { prisma } from './client.js';

// A fourth users.status beside active, invited and disabled, so seat counts and member queries skip it.
export const SUPPORT_STATUS = 'support';

// The support account's email, derived from the operator id and always undeliverable (.invalid).
const emailFor = (operatorId: string): string => `${operatorId}@support.endur.invalid`;

// Finds or creates the support member for this operator and organisation.
// It gets NO person node, so it never appears in people lists, audiences, campaigns or the org graph.
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
    // Refresh the name and re-assert the status, so the audit log is current and no seat is billed.
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
      // No password, so this row can never be used at the login page.
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

// Opens a support session, first closing any earlier open one for the same operator and organisation.
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

// Turns a browser session id into the live support session, or null. Expiry is part of the query itself.
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
  // A disabled operator loses support access on their very next request.
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

// Is somebody from Endur inside THIS organisation right now? This is what the customer's own banner reads.
export async function activeSupportFor(orgId: string): Promise<SupportContext | null> {
  const row = await prisma.supportSession.findFirst({
    where: { orgId, endedAt: null, expiresAt: { gt: new Date() } },
    // The newest one, for the rare case where two operators are inside at once.
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

// Leave: ends the session in the database, so clearing the cookie alone cannot leave it usable.
export async function endSupportSession(sessionId: string): Promise<void> {
  await prisma.supportSession.updateMany({
    where: { sessionId, endedAt: null },
    data: { endedAt: new Date() },
  });
}

// How long a support principal's minted grants stay valid, or null when no live session exists.
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
