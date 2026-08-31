// Analysis routes. Both carry both gates, in this order:
//   requireCapability  -> 403, may this person?
//   requireEntitlement -> 402, has this organisation paid?
// That order is what keeps the answer honest: nobody is told to upgrade for something they
// would still not be allowed to open.
import { Router } from 'express';
import { AnalysisDto, ThemeDetailDto } from '@endur/shared';
import type { AnalysisQuery } from '@endur/shared';
import { tenantChain } from '../../middleware/chains.js';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { requireEntitlement } from '../../middleware/requireEntitlement.js';
import { authenticate } from '../../middleware/authenticate.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import { readAnalysis, readTheme } from './service.js';

export const analysisRouter: Router = Router();

analysisRouter.use(tenantChain);

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

const version = (req: { ctx: { authzVersion?: number } }) => req.ctx.authzVersion ?? 0;

// The analysis overview: themes, sentiment, trend and drivers.
analysisRouter.get(
  '/',
  authenticate,
  validate(AnalysisDto),
  requireCapability('analysis.read', { target: 'any' }),
  requireEntitlement('analysis.read'),
  (req, res, next) => {
    const { query } = req.data as { query: AnalysisQuery };
    void Promise.resolve()
      .then(() => readAnalysis(req, req.ctx.orgId as string, userOf(req), version(req), query))
      .then((view) => res.json({ data: view }))
      .catch(next);
  },
);

// The drill-through carries a SECOND capability the overview does not, because it returns the
// comments themselves - and reading what one person wrote is a different level of access from
// seeing that the average is 4.3.
// One theme, with the comments behind it.
analysisRouter.get(
  '/themes/:id',
  authenticate,
  validate(ThemeDetailDto),
  requireCapability('analysis.read', { target: 'any' }),
  requireCapability('response.read', { target: 'any' }),
  requireEntitlement('analysis.read'),
  (req, res, next) => {
    const { params, query } = req.data as { params: { id: string }; query: AnalysisQuery };
    void Promise.resolve()
      .then(() => readTheme(req, req.ctx.orgId as string, userOf(req), version(req), params.id, query))
      .then((detail) => res.json({ data: detail }))
      .catch(next);
  },
);
