// The fourth guard. 19 §9, and it is deliberately in the same style as `requireCapability`
// for the same reason: authorisation is decided in middleware, never in a handler (INV-003).
//
// THE TWO GUARDS ARE NOT A HIERARCHY AND NEITHER IS A SUPERSET OF THE OTHER.
//
//   a `platform` principal fails `requireCapability` closed — it holds no grants, and the
//     resolver has no target to resolve against because there is no organisation
//   a `user` principal fails `requirePlatform` closed — 401, whatever they hold in `grants`
//
// They are different systems and the guards say so. 19 §9's hardest rule follows from it:
// requireCapability and requirePlatform MUST NEVER BOTH APPEAR ON ONE ROUTE. A route is
// either a tenant route or a platform route; both is a route whose authorisation model
// nobody can state in one sentence, which is `12` §1's whole argument. `routes.test.ts`
// asserts it, because "must never" without a test is a comment.
import type { RequestHandler } from 'express';
import { platformRoleHas, type PlatformCapability, type PlatformRole } from '@endur/shared';
import { ForbiddenError, UnauthenticatedError } from '../lib/errors.js';
import { loadOperator } from '../platform/session.js';

/** The platform twin of CAPABILITY_TAG, so route enumeration can see this guard too. */
export const PLATFORM_TAG = Symbol.for('endur.platformCapability');

/**
 * Attaches the operator principal, or 401. Runs INSTEAD OF `tenantResolver`, not after it:
 * a platform request has no tenant, and reaching `tenantResolver` with no organisation
 * produces a confusing 400 where a clean 401 is the truth (19 §9).
 */
export const requirePlatformAuth = (): RequestHandler => {
  const handler: RequestHandler = (req, _res, next) => {
    void loadOperator(req)
      .then((operator) => {
        if (!operator) throw new UnauthenticatedError('Sign in to the operator console.');
        req.ctx.principal = {
          kind: 'platform',
          id: operator.id,
          role: operator.role as PlatformRole,
        };
      })
      .then(next)
      .catch(next);
  };
  return handler;
};

/**
 * The capability check. One lookup, not a resolver — `19` §3 is explicit that a second
 * GRANT engine for a four-person internal team is over-engineering and would invite
 * confusion with the real one.
 *
 * A 403 here says WHICH capability, unlike the org side's deliberately vague message. The
 * argument for vagueness there is that a stranger must not learn the shape of somebody's
 * organisation from a series of refusals; here the reader is an Endur employee who already
 * knows the catalogue, and "staff cannot suspend an organisation" is the useful answer.
 */
export const requirePlatform = (capability: PlatformCapability): RequestHandler => {
  const handler: RequestHandler = (req, _res, next) => {
    const principal = req.ctx.principal;
    if (principal?.kind !== 'platform') return next(new UnauthenticatedError());
    if (!platformRoleHas(principal.role, capability)) {
      return next(
        new ForbiddenError(`An operator with the \`${principal.role}\` role cannot ${capability}.`),
      );
    }
    next();
  };
  return Object.assign(handler, { [PLATFORM_TAG]: capability });
};
