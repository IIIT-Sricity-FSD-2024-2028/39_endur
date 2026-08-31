// Link 8. CSRF protection, needed because the staff session is a cookie a browser sends on its own.
// Double-submit: a readable endur.csrf cookie that the SPA echoes back in the X-CSRF-Token header.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { config, isProd } from '../lib/config.js';

export const CSRF_COOKIE = 'endur.csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Issues a fresh CSRF token. Not httpOnly, because the SPA must read it, and it lasts as long as the session.
export function issueCsrfToken(res: Response): string {
  const token = randomBytes(32).toString('base64url');
  setCsrfCookie(res, token);
  return token;
}

// Writes the CSRF cookie with the same lifetime as the session.
function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: config.COOKIE_SECURE || isProd,
    sameSite: 'lax',
    maxAge: config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

// The middleware: safe methods pass through, anything that changes state must echo the token back.
export const csrfProtection: RequestHandler = (req, res, next) => {
  const cookies = req.cookies as Record<string, string> | undefined;
  const fromCookie = cookies?.[CSRF_COOKIE];

  if (SAFE_METHODS.has(req.method)) {
    // On a safe request, re-set or issue the cookie, so its expiry slides along with the rolling session.
    if (req.ctx.principal?.kind === 'user') {
      if (fromCookie) setCsrfCookie(res, fromCookie);
      else issueCsrfToken(res);
    }
    return next();
  }

  // Only cookie users are checked: an API key header and a respondent token are never sent by a browser by itself.
  if (req.ctx.principal && req.ctx.principal.kind !== 'user') return next();
  if (!req.ctx.principal) return next(); // nobody is signed in, so there is nothing to forge

  const fromHeader = req.get('x-csrf-token');

  if (!fromCookie || !fromHeader || !equal(fromCookie, fromHeader)) {
    // Its own error code, kept separate from a permission 403 so the two are easy to tell apart in logs.
    throw new AppError('CSRF_FAILED', 'Your session token was missing or invalid. Reload and try again.');
  }
  next();
};

// Constant-time compare, so a wrong token cannot be guessed one byte at a time.
function equal(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
