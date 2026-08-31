// The activity log's one route, and there will never be a second.
// No write route, because the log is evidence: an edit or delete on it is what would make it worthless.
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

// One page of the organisation's activity log.
auditRouter.get(
  '/',
  authenticate,
  validate(AuditListDto),
  // 'any', because this is a list: the scope filtering inside readAudit() is the authorisation.
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
