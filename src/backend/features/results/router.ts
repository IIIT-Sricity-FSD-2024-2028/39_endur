// Results routes. 13, 40, 52 §2.
//
// Mounted under /campaigns, because these read a campaign's results — but kept in their own
// feature folder, because the k-anonymity gate is the thing they are actually about and it
// should be somewhere a reviewer can find in one look.
import { Router } from 'express';
import { ExportDto, ResponsesDto, ResultsDto } from '@endur/shared';
import type { ResponsesQuery, ResultsQuery } from '@endur/shared';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { requireEntitlement } from '../../middleware/requireEntitlement.js';
import { authenticate } from '../../middleware/authenticate.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import { exportResults, readResponses, readResults } from './service.js';

export const resultsRouter: Router = Router();

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

const version = (req: { ctx: { authzVersion?: number } }) => req.ctx.authzVersion ?? 0;

resultsRouter.get(
  '/:id/results',
  authenticate,
  validate(ResultsDto),
  requireCapability('results.read', { target: 'any' }),
  (req, res, next) => {
    const { params, query } = req.data as { params: { id: string }; query: ResultsQuery };
    void Promise.resolve()
      .then(() =>
        readResults(req.ctx.orgId as string, userOf(req), version(req), params.id, query),
      )
      .then((results) => res.json({ data: results }))
      .catch(next);
  },
);

// A different capability from the aggregates, on purpose. Seeing that the average is 4.3
// and reading what an individual wrote are different levels of access, and a head of
// department may reasonably have the first without the second (40).
resultsRouter.get(
  '/:id/responses',
  authenticate,
  validate(ResponsesDto),
  requireCapability('response.read', { target: 'any' }),
  (req, res, next) => {
    const { params, query } = req.data as { params: { id: string }; query: ResponsesQuery };
    void Promise.resolve()
      .then(() =>
        readResponses(req.ctx.orgId as string, userOf(req), version(req), params.id, query),
      )
      .then((page) => res.json(page))
      .catch(next);
  },
);

resultsRouter.get(
  '/:id/export',
  authenticate,
  validate(ExportDto),
  requireCapability('results.export', { target: 'any' }),
  requireEntitlement('results.export'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void Promise.resolve()
      .then(() => exportResults(req.ctx.orgId as string, userOf(req), version(req), params.id))
      .then(({ filename, csv }) => {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
      })
      .catch(next);
  },
);
