// The platform's own audit trail. 19 §10, 19 §13.
//
// SEPARATE FROM `audit_log`, and the separation is a customer-facing promise rather than
// tidiness: `audit_log` rows carry an `org_id` and belong to the organisation that can
// export them (56). An operator's actions are OUR record. Writing "Endur changed your plan"
// into a customer's exportable trail would put our internal activity inside their evidence.
//
// INV-007's rule carries over unchanged: the row is written IN THE SAME TRANSACTION as the
// mutation it describes, so there is no state change without a record of who made it. That
// is why `writeAudit` takes a transaction client rather than reaching for `prisma` itself.
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';

/**
 * The transaction client, structurally. NOT `Prisma.TransactionClient`: writes on the
 * platform side run inside `platformClient().$transaction()` so the seam's rules apply to
 * them too, and an EXTENDED client's transaction handle is a different type from the base
 * one. Naming only the model this file touches is what keeps the two compatible.
 */
type Tx = {
  platformAuditLog: {
    create(args: { data: Prisma.PlatformAuditLogUncheckedCreateInput }): Promise<unknown>;
  };
};

export async function writeAudit(
  tx: Tx,
  req: Request,
  action: string,
  targetOrgId: string | null,
  payload?: Record<string, unknown>,
): Promise<void> {
  const operator = req.ctx.principal;
  // Not defensive: `requirePlatformAuth` has already run, and a call reaching here without
  // an operator is a route mounted in the wrong order. Failing loudly is the point.
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
