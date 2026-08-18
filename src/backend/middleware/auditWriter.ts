// Link 14. A SAFETY NET, not the writer.
//
// The actual write happens inside ctx.tx, in the mutation's own transaction (db/tx.ts).
// This middleware runs after the response and asserts that any request which mutated
// state produced at least one audit row.
//
// In development the assertion THROWS. That is deliberate: a forgotten audit call is
// caught on the day it is written, by the person who wrote it, rather than discovered
// months later when someone asks who changed a permission.
import type { RequestHandler } from 'express';
import { logger } from '../lib/logger.js';
import { isDev } from '../lib/config.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Routes that legitimately mutate without an audit row: authentication is its own log. */
const EXEMPT = [/^\/api\/v1\/auth\//, /^\/api\/v1\/_echo$/];

export const auditWriter: RequestHandler = (req, res, next) => {
  res.on('finish', () => {
    if (!MUTATING.has(req.method)) return;
    if (res.statusCode >= 400) return; // nothing happened, so nothing to record
    if (EXEMPT.some((pattern) => pattern.test(req.path))) return;
    if (req.ctx.auditWritten) return;

    const message = `${req.method} ${req.path} mutated state without writing an audit row`;
    logger.error({ requestId: req.ctx.requestId }, message);
    if (isDev) {
      // Thrown on the finish event so it surfaces loudly in the dev server output without
      // corrupting a response that has already been sent.
      throw new Error(`INV-007: ${message}. Push to ctx.audit inside ctx.tx().`);
    }
  });
  next();
};
