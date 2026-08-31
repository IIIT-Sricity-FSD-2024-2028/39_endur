// Link 14. A safety net, not the writer: the real audit row is written inside the mutation's transaction.
// After the response it checks that any state-changing request actually produced an audit row.
import type { RequestHandler } from 'express';
import { logger } from '../lib/logger.js';
import { isDev } from '../lib/config.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Routes that may change state with no audit row: authentication keeps its own log.
const EXEMPT = [/^\/api\/v1\/auth\//];

export const auditWriter: RequestHandler = (req, res, next) => {
  res.on('finish', () => {
    if (!MUTATING.has(req.method)) return;
    if (res.statusCode >= 400) return; // the request failed, so there is nothing to record
    if (EXEMPT.some((pattern) => pattern.test(req.path))) return;
    if (req.ctx.auditWritten) return;

    const message = `${req.method} ${req.path} mutated state without writing an audit row`;
    logger.error({ requestId: req.ctx.requestId }, message);
    if (isDev) {
      // Thrown in development only, so a missing audit call is noticed the day it is written.
      throw new Error(`INV-007: ${message}. Push to ctx.audit inside ctx.tx().`);
    }
  });
  next();
};
