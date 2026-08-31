// Link 3. Security headers plus two separate CORS policies.
// The respondent surface needs a wider policy than the console, so it gets its own instead of loosening ours.
import cors from 'cors';
import helmet from 'helmet';
import type { RequestHandler } from 'express';
import { config } from '../lib/config.js';

// Origins allowed to call the console API: the public base URL and the local dev server.
const consoleOrigins = [config.PUBLIC_BASE_URL, 'http://localhost:5173'];

// Console policy. credentials: true is required because the staff session is a cookie.
const consoleCorsPolicy = cors({
  origin: consoleOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-Request-Id', 'X-CSRF-Token', 'X-API-Key', 'X-Org-Slug'],
  exposedHeaders: ['X-Request-Id'],
});

// The console policy, skipped for respondent routes, which bring their own policy.
export const consoleCors: RequestHandler = (req, res, next) => {
  if (req.path.startsWith('/api/v1/public/')) return next();
  consoleCorsPolicy(req, res, next);
};

// Respondent routes: any origin and deliberately no credentials - the token in the URL is the whole credential.
export const publicCors = cors({
  // A wildcard, not a reflected origin: nothing to protect here, and the preflight stays cacheable.
  origin: '*',
  credentials: false,
  allowedHeaders: ['Content-Type', 'X-Request-Id'],
});

export const security: RequestHandler[] = [
  helmet({
    // The API serves JSON and images, never HTML, so a content policy here would apply to nothing.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
];
