// Link 5 (global) and link 12 (scoped). One factory, so every bucket is declared the
// same way and the differences between them are visible.
import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { config } from '../lib/config.js';

type Bucket = { windowMs: number; max: number; keyBy?: (req: Parameters<RequestHandler>[0]) => string };

const bucket = ({ windowMs, max, keyBy }: Bucket) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // The limiter must not answer for itself — errorFunnel owns every response body
    // (12 §4.16), so a 429 goes through the same envelope as everything else.
    handler: (_req, _res, next) => {
      const error = new Error('Too many requests') as Error & { code: string; status: number };
      error.code = 'RATE_LIMITED';
      error.status = 429;
      next(error);
    },
    ...(keyBy ? { keyGenerator: keyBy } : {}),
  });

/** Coarse, per IP. Skipped for health checks so a monitor cannot lock itself out. */
export const globalRateLimit = bucket({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
});

/**
 * Scoped buckets (12 §4.12). Declared here, applied per route by the feature routers.
 *
 * `respondentSubmit` is deliberately NOT tight, and the number has to match that sentence.
 * A whole campus behind one NAT shares an IP, and a lecture hall answering a QR code at the
 * same moment is the SUCCESS case — a limit that mistakes it for abuse silently blocks real
 * respondents during the demo. It is here to stop a script, not a crowd.
 */
export const scopedRateLimits = {
  login: bucket({ windowMs: 15 * 60_000, max: 10 }),
  respondentSubmit: bucket({ windowMs: 60_000, max: 120 }),
  simulator: bucket({ windowMs: 60_000, max: 30 }),
};

/** Exported so a test can build a tight bucket and prove the 429 path still works. */
export { bucket };
