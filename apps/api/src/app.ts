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
  validate,
  notFound,
  errorFunnel,
  tenantResolver,
} from './middleware/index.js';
import { z } from 'zod';

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

  //  6 · tenantResolver — INV-010. Must precede authenticate: an API key resolves the
  //      tenant AND the principal, and the db client must exist before any lookup.
  app.use(tenantResolver);
  //  7 · authenticate       T-007
  //  8 · csrfProtection     T-008
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

  // 15 · notFound
  app.use(notFound);
  // 16 · errorFunnel — MUST be last. An error middleware registered before a route never
  //      sees that route's errors, which is the classic Express mistake (12 §5).
  app.use(errorFunnel);

  return app;
}
