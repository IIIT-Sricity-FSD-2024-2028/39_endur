// Builds the Express app: global middleware first, then every feature route, error handler last.
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
import { analysisRouter } from './features/analysis/router.js';
import { checkinsRouter, reflectRouter } from './features/improve/router.js';
import { auditRouter } from './features/audit/router.js';
import { billingRouter } from './features/billing/router.js';
import { inboxRouter } from './features/inbox/router.js';
import { announcementsRouter } from './features/announcements/router.js';
import { bookablesRouter, bookingsRouter } from './features/booking/router.js';
import { platformRouter } from './features/platform/router.js';
import { docsRouter } from './features/docs/router.js';
import { mount } from './lib/mount.js';
import { isProd } from './lib/config.js';

export function createApp() {
  const app = express();

  // Trust the proxy in front of us, so the real client IP is used and not the proxy's.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // 0. context - makes the per-request ctx object that everything later writes into.
  app.use(context);
  // 1. requestId - gives every request its own id so logs can be traced.
  app.use(requestId);
  // 2. requestLogger - logs the request when it arrives and when it finishes.
  app.use(requestLogger);
  // 3. security - security headers, plus CORS rules for the console app.
  app.use(security);
  app.use(consoleCors);

  // Health check, kept above the rate limiter so a monitor can never lock itself out.
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, requestId: _req.ctx.requestId });
  });

  // 4. bodyParser - reads JSON and form bodies, capped at 256kb so a huge body cannot flood us.
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  // 5. rateLimit - limits how many requests one IP address may send.
  app.use(globalRateLimit);

  // Read cookies and load the session, so later middleware knows which org and user this is.
  app.use(cookieParser());
  app.use(sessionMiddleware);

  // Feature routers. mount() remembers the URL prefix, which lets tests list every route.
  mount(app, '/api/v1/auth/activate', activationRouter);
  mount(app, '/api/v1/auth', authRouter);
  mount(app, '/api/v1/org', orgRouter);
  mount(app, '/api/v1/units', unitsRouter);
  mount(app, '/api/v1/roles', rolesRouter);
  mount(app, '/api/v1/grants', grantsRouter);
  mount(app, '/api/v1/authz', authzRouter);
  // Mounted before /people so an account URL is not swallowed by the people router.
  mount(app, '/api/v1/people/:id/account', personAccountRouter);
  mount(app, '/api/v1/people', peopleRouter);
  mount(app, '/api/v1/subjects', subjectsRouter);
  mount(app, '/api/v1/templates', templatesRouter);
  mount(app, '/api/v1/campaigns', campaignsRouter);
  // Results sit under the campaign URL but are their own feature (they hold the anonymity gate).
  mount(app, '/api/v1/campaigns', resultsRouter);
  // Public routes for respondents: no login, no session, its own CORS and rate limit.
  mount(app, '/api/v1/public', publicRouter);
  mount(app, '/api/v1/home', homeRouter);
  mount(app, '/api/v1/profile', profileRouter);
  mount(app, '/api/v1/inbox', inboxRouter);
  // Announcements reuse the same audience rules that campaigns use.
  mount(app, '/api/v1/announcements', announcementsRouter);
  // Two mounts: a bookable is what the org offers, a booking is what someone booked.
  mount(app, '/api/v1/bookables', bookablesRouter);
  mount(app, '/api/v1/bookings', bookingsRouter);
  mount(app, '/api/v1/analysis', analysisRouter);
  // /reflect is the reviewee's own loop, /checkins is the supervisor's side of it.
  mount(app, '/api/v1/reflect', reflectRouter);
  mount(app, '/api/v1/checkins', checkinsRouter);
  // The organisation's own audit log (Endur's server log files are a separate thing).
  mount(app, '/api/v1/audit', auditRouter);
  // The organisation's own billing; the operator side of billing lives under /platform.
  mount(app, '/api/v1/billing', billingRouter);
  // Platform routes for Endur staff: separate accounts, cookie and capabilities, no org.
  mount(app, '/api/v1/platform', platformRouter);
  // Serves uploaded files: no org, no login, no CSRF.
  mount(app, '/api/v1/files', filesRouter);

  // API docs, built by reading the routers above, so it must be mounted last. Off in production.
  if (!isProd) mount(app, '/api/v1/docs', docsRouter(app));

  // 14. auditWriter - safety net that writes any pending audit rows.
  app.use(auditWriter);

  // 15. notFound - turns an unknown URL into a 404 error.
  app.use(notFound);
  // 16. errorFunnel - must be last; turns every error into one JSON shape.
  app.use(errorFunnel);

  return app;
}
