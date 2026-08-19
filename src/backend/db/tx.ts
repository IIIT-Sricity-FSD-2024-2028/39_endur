// ctx.tx — the transaction helper that makes INV-007 true.
//
// The subtle requirement: an audit row must be written IN THE SAME TRANSACTION as the
// mutation it describes. A post-response middleware writing its own transaction can
// succeed when the mutation rolled back, or the reverse — and an audit log that disagrees
// with reality is worse than no audit log at all (12 §4.14).
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './client.js';

export type Tx = Prisma.TransactionClient;

export async function runInTransaction<T>(req: Request, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const result = await fn(tx);
    await flushAudit(req, tx);
    return result;
  });
}

async function flushAudit(req: Request, tx: Tx): Promise<void> {
  const { audit, decision, requestId, orgId, principal } = req.ctx;
  if (audit.length === 0) return;

  await tx.auditLog.createMany({
    data: audit.map((intent) => ({
      orgId: orgId ?? null,
      actorUserId: principal?.kind === 'user' ? principal.id : null,
      action: intent.action,
      targetType: intent.targetType ?? null,
      targetId: intent.targetId ?? null,
      // WHICH GRANT decided it. The resolver is the only thing that knows, which is why
      // the decision is carried on the context rather than recomputed here (INV-007).
      ...(decision?.decidedBy ? { decidedBy: decision.decidedBy } : {}),
      requestId,
      ip: req.ip ?? null,
    })),
  });

  // Written; do not write again if the handler calls tx twice.
  req.ctx.audit = [];
  req.ctx.auditWritten = true;
}
