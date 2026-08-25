// Analysis routes. 13 § Reserved (now built), 43.
//
// Both routes carry BOTH gates, in this order and never the other one:
//
//   requireCapability('analysis.read')  -> 403. may this person?
//   requireEntitlement('analysis.read') -> 402. has this org paid?
//
// `43` names this surface as the place the 402-vs-403 split (DEC-011) is worth
// demonstrating, and the order is what makes the demonstration honest: a Bronze customer
// with full permissions gets an upgrade path, and someone without the capability is never
// told to buy something they still would not be allowed to open.
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

analysisRouter.get(
  '/',
  authenticate,
  validate(AnalysisDto),
  requireCapability('analysis.read', { target: 'any' }),
  requireEntitlement('analysis.read'),
  (req, res, next) => {
    const { query } = req.data as { query: AnalysisQuery };
    void Promise.resolve()
      .then(() => readAnalysis(req.ctx.orgId as string, userOf(req), version(req), query))
      .then((view) => res.json({ data: view }))
      .catch(next);
  },
);

// The drill-through, and it carries A SECOND CAPABILITY the overview does not.
//
// It returns VERBATIM COMMENTS, and `40` already decided what verbatim comments cost:
// "seeing that the average is 4.3 and reading what one person wrote are different levels of
// access, and a head of department may reasonably have the first without the second." A
// theme detail is the second one. Gating it on `analysis.read` alone would have made the
// analysis page a way around the split `40` exists to draw — quietly, because the seeded
// matrix gives both to the same three levels and nothing would have gone wrong yet.
//
// The overview needs no such line: it returns counts and theme labels, and its corpus scope
// is already `response.read`'s (see `readableCampaigns`), so a caller holding `analysis.read`
// and no `response.read` anywhere sees an empty analysis rather than somebody else's.
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
      .then(() => readTheme(req.ctx.orgId as string, userOf(req), version(req), params.id, query))
      .then((detail) => res.json({ data: detail }))
      .catch(next);
  },
);
