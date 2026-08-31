// ctx.tx: runs a handler's writes and its audit rows in ONE transaction, so the log can never disagree with the data.
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './client.js';

export type Tx = Prisma.TransactionClient;

// Runs fn inside a transaction and writes the collected audit rows before it commits.
export async function runInTransaction<T>(req: Request, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const result = await fn(tx);
    await flushAudit(req, tx);
    return result;
  });
}

// Actions whose audit row is written with no actor and no IP, whoever is signed in.
// response.submit is here because the audit row and the response share a timestamp, and names plus times would de-anonymise answers.
const ANONYMOUS_ACTIONS: ReadonlySet<string> = new Set(['response.submit']);

// Writes every audit row collected during this request, inside the caller's transaction.
async function flushAudit(req: Request, tx: Tx): Promise<void> {
  const { audit, decision, requestId, orgId, principal } = req.ctx;
  if (audit.length === 0) return;

  await tx.auditLog.createMany({
    data: audit.map((intent) => ({
      orgId: orgId ?? null,
      actorUserId:
        principal?.kind === 'user' && !ANONYMOUS_ACTIONS.has(intent.action) ? principal.id : null,
      action: intent.action,
      targetType: intent.targetType ?? null,
      targetId: intent.targetId ?? null,
      // Which grant decided it. Only the resolver knows, so the decision is carried on the request context.
      ...(decision?.decidedBy ? { decidedBy: decision.decidedBy } : {}),
      requestId,
      // IP is stored for signed-in staff actions only, never for a response submission (see above).
      ip:
        principal?.kind === 'user' && !ANONYMOUS_ACTIONS.has(intent.action)
          ? (req.ip ?? null)
          : null,
    })),
  });

  // Already written; do not write them again if the handler opens a second transaction.
  req.ctx.audit = [];
  req.ctx.auditWritten = true;
}

// Writes a "denied" audit row for a refused request. Not in a transaction, because nothing changed,
// and any failure is swallowed so logging can never turn a 403 into a 500.
export async function writeDenial(
  req: Request,
  action: string,
  decidedBy?: unknown,
): Promise<void> {
  const { orgId, principal, requestId } = req.ctx;
  if (!orgId) return;

  try {
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: principal?.kind === 'user' ? principal.id : null,
        action,
        outcome: 'denied',
        // A refusal names no target row; the actor, action and time are the security event.
        ...(decidedBy ? { decidedBy: decidedBy as never } : {}),
        requestId,
        ip: principal?.kind === 'user' && !ANONYMOUS_ACTIONS.has(action) ? (req.ip ?? null) : null,
      },
    });
  } catch {
    // Swallowed on purpose. See above.
  }
}
