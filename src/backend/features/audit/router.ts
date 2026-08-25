// The activity log's one route. 13 § Trust, 56.
//
// One route, and there will never be a second. There is no write route because the log is
// evidence: a customer-facing delete or edit on it is the feature that makes it worthless
// (52 §6), and 56 § Out of scope refuses retention controls by name. There is no export
// route because nobody has asked for one and it would be `audit.read` plus a format.
import { Router } from 'express';
import { AuditListDto } from '@endur/shared';
import type { AuditQuery } from '@endur/shared';
import { tenantChain } from '../../middleware/chains.js';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { authenticate } from '../../middleware/authenticate.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import { readAudit } from './service.js';

export const auditRouter: Router = Router();

auditRouter.use(tenantChain);

auditRouter.get(
  '/',
  authenticate,
  validate(AuditListDto),
  // `any`, because this is a list: the question is not "may you read THIS row" but "do you
  // hold audit.read anywhere", and the scope filtering inside readAudit() is the
  // authorisation (INV-003). An org-level target here would 403 every scoped holder.
  requireCapability('audit.read', { target: 'any' }),
  (req, res, next) => {
    const { query } = req.data as { query: AuditQuery };
    const principal = req.ctx.principal;
    if (principal?.kind !== 'user') throw new UnauthenticatedError();
    void readAudit(req.ctx.orgId as string, principal.id, req.ctx.authzVersion ?? 0, query)
      .then((page) => res.json(page))
      .catch(next);
  },
);
