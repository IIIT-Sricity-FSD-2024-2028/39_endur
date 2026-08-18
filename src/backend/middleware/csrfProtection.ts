// Link 8. Exists BECAUSE of an auth decision, not despite one: a bearer token would have
// made it unnecessary, cookies make it mandatory. That trade is the honest answer to why
// it is in the chain (DEC-014).
//
// Double-submit cookie: a readable `endur.csrf` cookie the SPA echoes in `X-CSRF-Token`.
// Chosen over a synchroniser token because it needs no server-side state and no
// token-fetch round trip at boot.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { config, isProd } from '../lib/config.js';

export const CSRF_COOKIE = 'endur.csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Deliberately NOT httpOnly — the SPA has to read it to echo it back. */
export function issueCsrfToken(res: Response): string {
  const token = randomBytes(32).toString('base64url');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: config.COOKIE_SECURE || isProd,
    sameSite: 'lax',
    path: '/',
  });
  return token;
}

export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  // Scope it precisely, or it breaks the two surfaces that must stay open:
  //   apiKey     — a header is never attached automatically by a browser
  //   respondent — no cookie, no ambient authority, and a QR scan from any origin must work
  // Only a cookie principal is exposed, because only a cookie is sent unbidden.
  if (req.ctx.principal && req.ctx.principal.kind !== 'user') return next();
  if (!req.ctx.principal) return next(); // nothing to forge yet; auth guards handle it

  const cookies = req.cookies as Record<string, string> | undefined;
  const fromCookie = cookies?.[CSRF_COOKIE];
  const fromHeader = req.get('x-csrf-token');

  if (!fromCookie || !fromHeader || !equal(fromCookie, fromHeader)) {
    // Distinct from an authorisation 403 so the two are separable in logs (13 §5).
    throw new AppError('CSRF_FAILED', 'Your session token was missing or invalid. Reload and try again.');
  }
  next();
};

/** Constant-time: a length-independent early return would leak the token a byte at a time. */
function equal(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
