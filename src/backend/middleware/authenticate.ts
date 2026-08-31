// Link 7. Works out who is calling and puts that principal on ctx.
// Permissions are never read from the session: the session says who you are, the resolver says what you may do.
import type { Request, RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors.js';
import { loadSupportSession } from '../db/support.js';

// A flag on the session marking it as a support session, so only those sessions pay for the extra lookup.
// The flag grants nothing by itself - the database row does, and a dead row fails closed below.
declare module 'express-session' {
  interface SessionData {
    support?: boolean;
  }
}

// Attaches the support principal, or clears the session flags when the support session is over.
// It never throws, so an expired support session cannot block an ordinary login in the same browser.
async function attachSupport(req: Request): Promise<void> {
  const live = await loadSupportSession(req.sessionID);
  if (!live) {
    delete req.session.support;
    delete req.session.userId;
    delete req.session.orgId;
    return;
  }

  // The session's organisation and the row's must agree; a mismatch means something is already wrong.
  if (req.session.orgId !== live.orgId) {
    throw new UnauthenticatedError('That support session does not match this organization.');
  }

  req.ctx.principal = { kind: 'user', id: live.userId, orgId: live.orgId, support: live.context };
}

// Reads the session and attaches the matching principal.
const attach = async (req: Request): Promise<void> => {
  const { userId, orgId, support } = req.session ?? {};
  if (support) return attachSupport(req);
  if (userId && orgId) req.ctx.principal = { kind: 'user', id: userId, orgId };
  // API-key and respondent principals will be attached here in a later task.
};

// Attaches a principal if there is one and never fails. Used where signing in is optional.
export const authenticateOptional: RequestHandler = (req, _res, next) => {
  void attach(req).then(() => next(), next);
};

// Requires a principal, answering 401 when there is none.
export const authenticate: RequestHandler = (req, _res, next) => {
  void attach(req).then(() => {
    if (!req.ctx.principal) return next(new UnauthenticatedError());
    next();
  }, next);
};
