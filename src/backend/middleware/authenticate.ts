// Link 7. Three principal kinds, ONE middleware — the downstream chain should not care
// which kind it got (15).
//
// Permissions are NEVER read from the session. The session says who you are; the resolver
// says what you may do, on every request. A permission change therefore takes effect
// immediately rather than at next login.
import type { Request, RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors.js';
import { loadSupportSession } from '../db/support.js';

/**
 * DEC-114. A SUPPORT SESSION IS RESOLVED ON EVERY REQUEST, and only when the session says
 * it is one.
 *
 * The flag is what keeps this free for everybody else: without it, telling a support session
 * apart from an ordinary one would mean a `support_sessions` lookup on every authenticated
 * request in the product, for a row almost nobody has. With it, the query runs only inside
 * the sessions it is about.
 *
 * The flag is NOT the authorisation and cannot be forged into one. It is a boolean in a
 * server-side session record, and all it decides is whether to ask the database; the row the
 * database returns is what confers anything, and `loadSupportSession` refuses one that has
 * ended, run out, or belongs to an operator who has since been disabled. A tampered flag on
 * an ordinary session finds no row and fails closed, below.
 */
declare module 'express-session' {
  interface SessionData {
    support?: boolean;
  }
}

/**
 * ATTACHING NOTHING IS THE RIGHT ANSWER TO A DEAD SUPPORT SESSION, and it took one wrong
 * version to see why.
 *
 * Throwing here reads better — *"that support session has ended"* is a far more useful
 * sentence than the generic 401 a console route produces on its own. But this function runs
 * on `authenticateOptional`, which is mounted on the AUTH chain and the RESPONDENT chain as
 * well as the console's. Throwing would mean an operator whose hour ran out could no longer
 * `POST /auth/login` in that browser, because the login route would refuse them before it
 * ever looked at their credentials — locked out of the product by the expiry of a session
 * they were not using. Their `endur.ops` cookie is a separate cookie on a separate path and
 * is still perfectly alive, so the honest state is "this browser holds no console session",
 * and that is what this writes.
 *
 * The flags are cleared as well as ignored, so the next request costs no query and the
 * browser is back to being an ordinary signed-out one. The console then 401s through
 * `requireCapability` and the SPA routes to sign-in; the operator re-enters from `/ops`,
 * which is where they came from. `<SupportBanner>` counts the hour down in front of them the
 * whole time, so the expiry is never a surprise.
 */
async function attachSupport(req: Request): Promise<void> {
  const live = await loadSupportSession(req.sessionID);
  if (!live) {
    delete req.session.support;
    delete req.session.userId;
    delete req.session.orgId;
    return;
  }

  // The session's organisation and the row's must agree. They are written together by one
  // handler and no path changes one without the other, so this can only fire if something
  // is already wrong — which is exactly when a check earns its place, because the thing it
  // would be wrong about is which tenant an operator is standing inside.
  if (req.session.orgId !== live.orgId) {
    throw new UnauthenticatedError('That support session does not match this organization.');
  }

  req.ctx.principal = { kind: 'user', id: live.userId, orgId: live.orgId, support: live.context };
}

const attach = async (req: Request): Promise<void> => {
  const { userId, orgId, support } = req.session ?? {};
  if (support) return attachSupport(req);
  if (userId && orgId) req.ctx.principal = { kind: 'user', id: userId, orgId };
  // apiKey (X-API-Key) and respondent (token in path) principals land here in T-022/P3.
};

/** Attaches a principal if one is present; never fails. Landing page, template preview. */
export const authenticateOptional: RequestHandler = (req, _res, next) => {
  void attach(req).then(() => next(), next);
};

/** Requires one. 401 otherwise. */
export const authenticate: RequestHandler = (req, _res, next) => {
  void attach(req).then(() => {
    if (!req.ctx.principal) return next(new UnauthenticatedError());
    next();
  }, next);
};
