// Link 3. helmet + two CORS policies.
//
// The respondent surface needs a WIDER policy than the console: a QR code can be scanned
// from anywhere, and during the demo that is the whole point. It gets its own policy
// rather than loosening the global one — the console origin allowlist stays strict.
import cors from 'cors';
import helmet from 'helmet';
import type { RequestHandler } from 'express';
import { config } from '../lib/config.js';

/**
 * The console origins. PUBLIC_BASE_URL is the tunnel origin during the demo (OPEN-002),
 * so it is allowed alongside the local dev server.
 */
const consoleOrigins = [config.PUBLIC_BASE_URL, 'http://localhost:5173'];

<<<<<<< HEAD
/** `credentials: true` is required: the staff session is a cookie (DEC-014). */
export const consoleCors = cors({
=======
/**
 * `credentials: true` is required: the staff session is a cookie (DEC-014).
 *
 * It is applied to everything EXCEPT the respondent routes (see consoleCorsExceptPublic).
 * A browser rejects `Access-Control-Allow-Origin: *` together with
 * `Access-Control-Allow-Credentials: true`, so leaving this on the public path would make
 * every cross-origin QR scan fail — with a console error about credentials, on a phone,
 * where nobody can read it.
 */
const consoleCorsPolicy = cors({
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
  origin: consoleOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-Request-Id', 'X-CSRF-Token', 'X-API-Key', 'X-Org-Slug'],
  exposedHeaders: ['X-Request-Id'],
});

/**
<<<<<<< HEAD
=======
 * The console policy, skipped for the respondent surface, which brings its own (publicCors,
 * mounted inside the public router). Two policies that never both apply to one request.
 */
export const consoleCors: RequestHandler = (req, res, next) => {
  if (req.path.startsWith('/api/v1/public/')) return next();
  consoleCorsPolicy(req, res, next);
};

/**
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
 * Respondent routes: any origin, and deliberately NO credentials. There is no cookie and
 * no ambient authority to protect — the token in the path is the entire credential — so
 * `origin: true` costs nothing and lets a phone on any network submit.
 */
export const publicCors = cors({
<<<<<<< HEAD
  origin: true,
=======
  // `*`, not a reflected origin. There is no credential to protect here and never will be
  // (DEC-009), and a wildcard is what makes the preflight cacheable for a phone that has
  // just scanned a code on a network we have never seen.
  origin: '*',
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
  credentials: false,
  allowedHeaders: ['Content-Type', 'X-Request-Id'],
});

export const security: RequestHandler[] = [
  helmet({
    // The API serves JSON and uploaded images, never HTML, so the default CSP would only
    // ever apply to error pages that do not exist. The SPA sets its own.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
];
