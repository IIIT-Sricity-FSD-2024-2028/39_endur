// The home dashboard route.
import { Router } from 'express';
import { tenantChain } from '../../middleware/chains.js';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { authenticate } from '../../middleware/authenticate.js';
import { HomeDto, type HomeQuery } from '@endur/shared';
import { UnauthenticatedError } from '../../lib/errors.js';
import { readHome } from './service.js';
import { readWaiting } from './waiting.js';

export const homeRouter: Router = Router();

// Links 6 to 8 for every route below: resolve the org, attach the principal, check CSRF.
homeRouter.use(tenantChain);

// One endpoint rather than six: a dashboard that fires six requests is six chances to be slow on venue wifi.
// org.read is seeded to every role, so this never 403s - the sections inside it vary instead, by being absent.
homeRouter.get('/', authenticate, validate(HomeDto), requireCapability('org.read'), (req, res, next) => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user') return next(new UnauthenticatedError());
  // The window is validated and defaulted by the DTO, so a junk range means 30 days rather than a 400.
  const { query } = req.data as { query: HomeQuery };
  void readHome(req.ctx.orgId as string, principal.id, req.ctx.authzVersion ?? 0, query.window)
    .then((home) => res.json({ data: home }))
    .catch(next);
});

// Members-only forms waiting for this person's answer: the card on Home and the sidebar count.
// org.read for the same reason as above, and nothing more: being asked for feedback is not a power
// anybody should have to be given.
homeRouter.get('/waiting', authenticate, requireCapability('org.read'), (req, res, next) => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user') return next(new UnauthenticatedError());
  // An Endur operator in a support session is not "our own people" and may not answer
  // (requireMembership), so nothing is waiting for them.
  if (principal.support) return res.json({ data: [] });
  void readWaiting(req.ctx.orgId as string, principal.id)
    .then((data) => res.json({ data }))
    .catch(next);
});
