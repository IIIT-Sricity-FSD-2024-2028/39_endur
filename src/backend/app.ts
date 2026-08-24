// THE MIDDLEWARE CHAIN. This file is the Phase-1 graded artifact.
//
// The order below is not a style choice — every adjacency is a requirement, and each one
// is stated in 12 §5. The ones already load-bearing here:
//
//   requestId  -> everything     correlation must exist even if the NEXT link throws
//   bodyParser -> validate       nothing to validate otherwise
//   everything -> errorFunnel    registered last, or Express never routes errors to it
//
// Links 6-16 land in T-006..T-013 and slot in at the marked positions. Do not reorder to
// make something work; if a link seems to need moving, the constraint table is the thing
// to argue with.
//
// TWO KINDS OF MIDDLEWARE LIVE HERE, and the split is the point (12 §2):
//
//   APPLICATION-LEVEL, below — links 0-5 and 14-16. They apply to EVERY request,
//   including /healthz and including a URL that matches no route at all.
//
//   ROUTER-LEVEL, in each feature router — links 6-8, as `router.use(tenantChain)`.
//   They apply to one router's routes and they differ BETWEEN routers: the console gets
//   a required tenant and CSRF, auth gets an optional tenant and the slug header, the
//   respondent surface gets its own CORS and no CSRF at all. See middleware/chains.ts.
//   (Moved out of this file by T-064; the diagram in 12 §2 has drawn them per-router
//   since the first revision, and D-017 was the gap between the two.)
import express from 'express';
import {
  context,
  requestId,
  requestLogger,
  security,
  consoleCors,
  globalRateLimit,
  notFound,
  errorFunnel,
  auditWriter,
} from './middleware/index.js';
import cookieParser from 'cookie-parser';
import { sessionMiddleware } from './auth/session.js';
import { authRouter } from './features/auth/router.js';
import { orgRouter } from './features/org/router.js';
import { unitsRouter } from './features/units/router.js';
import { authzRouter, grantsRouter, rolesRouter } from './features/roles/router.js';
import { peopleRouter } from './features/people/router.js';
import { activationRouter, personAccountRouter } from './features/accounts/router.js';
import { subjectsRouter } from './features/subjects/router.js';
import { templatesRouter } from './features/templates/router.js';
import { campaignsRouter } from './features/campaigns/router.js';
import { publicRouter } from './features/public/router.js';
import { resultsRouter } from './features/results/router.js';
import { homeRouter } from './features/home/router.js';
import { filesRouter } from './features/files/router.js';
import { profileRouter } from './features/profile/router.js';
import { inboxRouter } from './features/inbox/router.js';
import { mount } from './lib/mount.js';

export function createApp() {
  const app = express();

  // Behind the Vite dev proxy and, at demo time, a tunnel. Without this the rate limiter
  // sees one IP for everybody and X-Forwarded-* is ignored.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  //  0 · context      ctx exists before anything can want to write to it
  app.use(context);
  //  1 · requestId
  app.use(requestId);
  //  2 · requestLogger
  app.use(requestLogger);
  //  3 · security
  app.use(security);
  app.use(consoleCors);

  // Liveness sits above the rate limiter on purpose: a monitor polling every few seconds
  // must never be able to lock itself out, and it needs no tenant or principal.
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, requestId: _req.ctx.requestId });
  });

  //  4 · bodyParser   256kb: the largest legitimate body is a ~20-question form, and an
  //                   unbounded parser is a free denial of service. CSV import bypasses
  //                   this with its own streaming parser and 5MB cap.
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  //  5 · rateLimit (global, per IP)
  app.use(globalRateLimit);

  // Cookie parsing and the SESSION LOAD sit above the routers, and above tenantResolver.
  // That refines 12 §5 rather than contradicting it: the table says tenantResolver
  // precedes `authenticate`, and it still does — but tenantResolver resolves the org FROM
  // req.session.orgId, so the session record has to be loaded by the time it runs.
  //
  // The distinction that makes both true: LOADING a session is not AUTHENTICATING.
  // Loading happens here, for everybody; deciding who the principal is happens at link 7,
  // inside a router, once the tenant and its db client exist.
  app.use(cookieParser());
  app.use(sessionMiddleware);

  // Feature routers. mount() rather than app.use() records the prefix, which is what
  // lets the route-enumeration test see every route without walking Express internals
  // (lib/mount.ts). A router added with app.use() is a route the test cannot check.
  //
  // Per ROUTER, at the top of each file:  6 tenantResolver -> 7 authenticate ->
  //                                       8 csrfProtection      (middleware/chains.ts)
  // Per ROUTE, inside each router:        9 validate -> 10 requireCapability ->
  //                                       11 requireEntitlement -> 12 rateLimit(scoped)
  //                                       -> 13 idempotency
  // Activation is unauthenticated by nature (57) and has its own chain, so it is mounted
  // beside /auth rather than inside it — again so the enumeration test can see it.
  mount(app, '/api/v1/auth/activate', activationRouter);
  mount(app, '/api/v1/auth', authRouter);
  mount(app, '/api/v1/org', orgRouter);
  mount(app, '/api/v1/units', unitsRouter);
  mount(app, '/api/v1/roles', rolesRouter);
  mount(app, '/api/v1/grants', grantsRouter);
  mount(app, '/api/v1/authz', authzRouter);
  // BEFORE /api/v1/people, so an account request does not walk the people chain first and
  // fall through. Its own mount rather than a sub-router on peopleRouter, because
  // routes.test.ts walks mountedRouters() and does not recurse (INV-003).
  mount(app, '/api/v1/people/:id/account', personAccountRouter);
  mount(app, '/api/v1/people', peopleRouter);
  mount(app, '/api/v1/subjects', subjectsRouter);
  mount(app, '/api/v1/templates', templatesRouter);
  mount(app, '/api/v1/campaigns', campaignsRouter);
  // Results hang off a campaign's path but live in their own feature: the k-anonymity gate
  // is what they are actually about, and it should be findable in one look (52 §2).
  mount(app, '/api/v1/campaigns', resultsRouter);
  // The respondent surface. No session, no capability, its own CORS policy and its own
  // rate limit — the only routes a stranger's phone ever touches (13 §6, DEC-009).
  mount(app, '/api/v1/public', publicRouter);
  mount(app, '/api/v1/home', homeRouter);
  mount(app, '/api/v1/profile', profileRouter);
  mount(app, '/api/v1/inbox', inboxRouter);
  // Serving uploaded bytes. Its own chain — no tenant, no principal, no CSRF (48).
  mount(app, '/api/v1/files', filesRouter);

  // 14 · auditWriter — the safety net (the write itself happens in ctx.tx)
  app.use(auditWriter);

  // 15 · notFound
  app.use(notFound);
  // 16 · errorFunnel — MUST be last. An error middleware registered before a route never
  //      sees that route's errors, which is the classic Express mistake (12 §5).
  app.use(errorFunnel);

  return app;
}
