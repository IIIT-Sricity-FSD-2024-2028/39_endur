// Link 5 (global) and link 12 (scoped). One factory, so every bucket is declared the
// same way and the differences between them are visible.
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
/**
 * Login is keyed on IP **and** email, which `15` § Rate limiting has always specified and
 * this file did not implement until T-031.
 *
 * Per-IP alone fails in both directions on a campus. Behind one NAT, ten people signing in
 * normally exhaust a per-IP bucket and the eleventh — who did nothing wrong — is locked
 * out of a graded demo. Raise the limit to fix that and a credential-stuffing run against
 * a thousand different addresses from that same NAT sails through. Keying on the pair
 * costs one line and removes the trade-off: a building can sign in, and one address can
 * still only be guessed at ten times per quarter hour.
 *
 * The email is lowercased because `alice@x` and `Alice@X` are the same account and must
 * not be two buckets. `ipKeyGenerator` is not decoration — it collapses an IPv6 address to
 * its /56, so an attacker with a v6 range cannot get a fresh bucket per request.
 *
 * This runs at link 12, after `express.json` at link 4, so the body is parsed and the
 * email is there to read. Reordering those two silently turns this back into per-IP.
 *
 * It reads `req.body`, not `req.data` — `validate` is link 13 and has not run yet. That is
 * the one legitimate exception to 14 §3, and it is why the shape is checked rather than
 * assumed: an unvalidated body can be a number, an array, or absent.
 */
const loginKey = (req: Parameters<RequestHandler>[0]): string => {
  const body: unknown = req.body;
  const email =
    body && typeof body === 'object' && typeof (body as { email?: unknown }).email === 'string'
      ? (body as { email: string }).email.trim().toLowerCase()
      : '';
  return `${ipKeyGenerator(req.ip ?? '')}|${email}`;
};

export const scopedRateLimits = {
  login: bucket({ windowMs: 15 * 60_000, max: 10, keyBy: loginKey }),
  respondentSubmit: bucket({ windowMs: 60_000, max: 120 }),
  simulator: bucket({ windowMs: 60_000, max: 30 }),
};

/** Exported so a test can build a tight bucket and prove the 429 path still works. */
export { bucket };
