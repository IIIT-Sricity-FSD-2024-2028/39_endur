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

/** `credentials: true` is required: the staff session is a cookie (DEC-014). */
export const consoleCors = cors({
  origin: consoleOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-Request-Id', 'X-CSRF-Token', 'X-API-Key', 'X-Org-Slug'],
  exposedHeaders: ['X-Request-Id'],
});

/**
 * Respondent routes: any origin, and deliberately NO credentials. There is no cookie and
 * no ambient authority to protect — the token in the path is the entire credential — so
 * `origin: true` costs nothing and lets a phone on any network submit.
 */
export const publicCors = cors({
  origin: true,
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
