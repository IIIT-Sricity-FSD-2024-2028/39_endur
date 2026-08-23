// The home dashboard route. 13 § Home, 46.
import { Router } from 'express';
import { tenantChain } from '../../middleware/chains.js';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { authenticate } from '../../middleware/authenticate.js';
import { HomeDto, type HomeQuery } from '@endur/shared';
import { UnauthenticatedError } from '../../lib/errors.js';
import { readHome } from './service.js';

export const homeRouter: Router = Router();

// Links 6-8, router-level (12 §2). tenantResolver → authenticate → csrfProtection,
// applied to every route below without any of them having to ask.
homeRouter.use(tenantChain);

// Deliberately one endpoint rather than six. A dashboard that fires six requests is six
// chances to be slow on venue wifi, and it is the first screen after login (46).
//
// `org.read` is seeded to every role including the most junior, so this never 403s — the
// sections inside it are what vary, and they vary by being absent (INV-003).
homeRouter.get('/', authenticate, validate(HomeDto), requireCapability('org.read'), (req, res, next) => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user') return next(new UnauthenticatedError());
  // `window` is validated and DEFAULTED by the DTO (DEC-031), so an absent or junk range
  // is 30 days rather than a 400 — a dashboard must not fail to load over a query string.
  const { query } = req.data as { query: HomeQuery };
  void readHome(req.ctx.orgId as string, principal.id, req.ctx.authzVersion ?? 0, query.window)
    .then((home) => res.json({ data: home }))
    .catch(next);
});
