// The guard for Endur's own operator console, written in the same style as requireCapability.
// The two never appear on one route: a route is either a tenant route or a platform route, never both.
import type { RequestHandler } from 'express';
import { platformRoleHas, type PlatformCapability, type PlatformRole } from '@endur/shared';
import { ForbiddenError, UnauthenticatedError } from '../lib/errors.js';
import { loadOperator } from '../platform/session.js';

// The platform twin of CAPABILITY_TAG, so route enumeration can see this guard too.
export const PLATFORM_TAG = Symbol.for('endur.platformCapability');

// Attaches the operator principal, or answers 401. Runs instead of tenantResolver, since there is no tenant.
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

// The capability check: one lookup against the operator's role, and the 403 names the capability, since the reader works here.
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
