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
import express from 'express';
import {
  context,
  requestId,
  requestLogger,
  security,
  consoleCors,
  globalRateLimit,
<<<<<<< HEAD
  validate,
=======
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
  notFound,
  errorFunnel,
  tenantResolver,
  authenticateOptional,
  csrfProtection,
  auditWriter,
} from './middleware/index.js';
import cookieParser from 'cookie-parser';
import { sessionMiddleware } from './auth/session.js';
import { authRouter } from './features/auth/router.js';
<<<<<<< HEAD
import { mount } from './lib/mount.js';
import { z } from 'zod';
=======
import { orgRouter } from './features/org/router.js';
import { unitsRouter } from './features/units/router.js';
import { authzRouter, grantsRouter, rolesRouter } from './features/roles/router.js';
import { peopleRouter } from './features/people/router.js';
import { subjectsRouter } from './features/subjects/router.js';
import { templatesRouter } from './features/templates/router.js';
import { campaignsRouter } from './features/campaigns/router.js';
import { publicRouter } from './features/public/router.js';
import { resultsRouter } from './features/results/router.js';
import { homeRouter } from './features/home/router.js';
import { mount } from './lib/mount.js';
>>>>>>> 95a69183487c1f29e2422c760433704d08948484

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

  // Cookie parsing and the SESSION LOAD sit above tenantResolver. That refines 12 §5
  // rather than contradicting it: the table says tenantResolver precedes `authenticate`,
  // and it still does — but tenantResolver resolves the org FROM req.session.orgId, so
  // the session record has to be loaded by the time it runs.
  //
  // The distinction that makes both true: LOADING a session is not AUTHENTICATING.
  // Loading happens here; deciding who the principal is happens at link 7, once the
  // tenant and its db client exist.
  app.use(cookieParser());
  app.use(sessionMiddleware);

  //  6 · tenantResolver — INV-010. Must precede authenticate: an API key resolves the
  //      tenant AND the principal, and the db client must exist before any lookup.
  app.use(tenantResolver);
  //  7 · authenticate — attaches the principal. Optional globally; individual routers
  //      use `authenticate` where a principal is required.
  app.use(authenticateOptional);

  //  8 · csrfProtection — cookie principals only, unsafe methods only.
  app.use(csrfProtection);

<<<<<<< HEAD
  mount(app, '/api/v1/auth', authRouter);

  //      per-route: validate -> requireCapability -> requireEntitlement -> rateLimit -> idempotency
  // 14 · auditWriter        T-013

  // A temporary route that exercises the pipe end to end until the feature routers land.
  // Delete when the first real router mounts (T-015).
  app.post(
    '/api/v1/_echo',
    validate(z.object({ body: z.object({ name: z.string().min(1).max(40) }) })),
    (req, res) => {
      res.json({ data: req.data });
    },
  );
=======
  // Feature routers. mount() rather than app.use() records the prefix, which is what
  // lets the route-enumeration test see every route without walking Express internals
  // (lib/mount.ts). A router added with app.use() is a route the test cannot check.
  //
  // Per route, inside each router: validate -> requireCapability -> requireEntitlement
  // -> scoped rateLimit -> idempotency.
  mount(app, '/api/v1/auth', authRouter);
  mount(app, '/api/v1/org', orgRouter);
  mount(app, '/api/v1/units', unitsRouter);
  mount(app, '/api/v1/roles', rolesRouter);
  mount(app, '/api/v1/grants', grantsRouter);
  mount(app, '/api/v1/authz', authzRouter);
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
>>>>>>> 95a69183487c1f29e2422c760433704d08948484

  // 14 · auditWriter — the safety net (the write itself happens in ctx.tx)
  app.use(auditWriter);

  // 15 · notFound
  app.use(notFound);
  // 16 · errorFunnel — MUST be last. An error middleware registered before a route never
  //      sees that route's errors, which is the classic Express mistake (12 §5).
  app.use(errorFunnel);

  return app;
}
