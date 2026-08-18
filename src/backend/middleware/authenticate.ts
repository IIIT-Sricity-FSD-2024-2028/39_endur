// Link 7. Three principal kinds, ONE middleware — the downstream chain should not care
// which kind it got (15).
//
// Permissions are NEVER read from the session. The session says who you are; the resolver
// says what you may do, on every request. A permission change therefore takes effect
// immediately rather than at next login.
import type { RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors.js';

const attach: RequestHandler = (req, _res, next) => {
  const { userId, orgId } = req.session ?? {};
  if (userId && orgId) req.ctx.principal = { kind: 'user', id: userId, orgId };
  // apiKey (X-API-Key) and respondent (token in path) principals land here in T-022/P3.
  next();
};

/** Attaches a principal if one is present; never fails. Landing page, template preview. */
export const authenticateOptional: RequestHandler = attach;

/** Requires one. 401 otherwise. */
export const authenticate: RequestHandler = (req, res, next) => {
  attach(req, res, () => {
    if (!req.ctx.principal) return next(new UnauthenticatedError());
    next();
  });
};
