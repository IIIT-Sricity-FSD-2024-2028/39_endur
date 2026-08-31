// Rate limiting: one global bucket per IP, plus tighter named buckets for particular routes.
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { config } from '../lib/config.js';

type Bucket = { windowMs: number; max: number; keyBy?: (req: Parameters<RequestHandler>[0]) => string };

const bucket = ({ windowMs, max, keyBy }: Bucket) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // The limiter never answers by itself: it hands a 429 to the error funnel, which owns every response body.
    handler: (_req, _res, next) => {
      const error = new Error('Too many requests') as Error & { code: string; status: number };
      error.code = 'RATE_LIMITED';
      error.status = 429;
      next(error);
    },
    ...(keyBy ? { keyGenerator: keyBy } : {}),
  });

// The global bucket, counted per IP address.
export const globalRateLimit = bucket({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
});

// Login is keyed on IP AND email: a whole campus behind one address can still sign in, while one account
// can still only be guessed ten times a quarter hour. It reads req.body because validate() has not run yet.
const loginKey = (req: Parameters<RequestHandler>[0]): string => {
  const body: unknown = req.body;
  const email =
    body && typeof body === 'object' && typeof (body as { email?: unknown }).email === 'string'
      ? (body as { email: string }).email.trim().toLowerCase()
      : '';
  return `${ipKeyGenerator(req.ip ?? '')}|${email}`;
};

// Activation is keyed on IP and the token in the URL, so a bulk invite cannot lock a building out and a script cannot race through guesses.
const activationKey = (req: Parameters<RequestHandler>[0]): string => {
  const token = /\/([0-9A-Za-z]{43})(?:$|[/?])/.exec(req.path)?.[1] ?? '';
  return `${ipKeyGenerator(req.ip ?? '')}|${token}`;
};

export const scopedRateLimits = {
  login: bucket({ windowMs: 15 * 60_000, max: 10, keyBy: loginKey }),
  activate: bucket({ windowMs: 15 * 60_000, max: 10, keyBy: activationKey }),
  // Deliberately loose: a lecture hall answering one QR code at once is the success case, not abuse.
  respondentSubmit: bucket({ windowMs: 60_000, max: 120 }),
  simulator: bucket({ windowMs: 60_000, max: 30 }),
  // Operator login is limited harder than an org login: a handful of people use it and it reaches every customer's plan data.
  platformLogin: bucket({ windowMs: 15 * 60_000, max: 5, keyBy: loginKey }),
};

// Exported so a test can build a tight bucket and prove the 429 path works.
export { bucket };
