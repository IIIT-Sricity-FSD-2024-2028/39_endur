// Endur's own audit trail, separate from a customer's audit_log, so our internal actions never land in their evidence.
// As on the tenant side, the row is written in the same transaction as the change it describes.
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';

// The transaction handle, narrowed to the one table this file writes.
type Tx = {
  platformAuditLog: {
    create(args: { data: Prisma.PlatformAuditLogUncheckedCreateInput }): Promise<unknown>;
  };
};

// Records one operator action against an organisation.
export async function writeAudit(
  tx: Tx,
  req: Request,
  action: string,
  targetOrgId: string | null,
  payload?: Record<string, unknown>,
): Promise<void> {
  const operator = req.ctx.principal;
  // Not defensive: no operator here means the route is mounted in the wrong order, so it fails loudly.
  if (operator?.kind !== 'platform') {
    throw new Error('platform audit written outside a platform request');
  }
  await tx.platformAuditLog.create({
    data: {
      actorId: operator.id,
      action,
      targetOrgId,
      ...(payload ? { payload: payload as Prisma.InputJsonValue } : {}),
      requestId: req.ctx.requestId,
    },
  });
}
