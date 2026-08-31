// Link 2. Logs one JSON line per request: method, path, status, duration, org, principal and request id.
// It never logs the body, because bodies carry feedback text and passwords.
import type { RequestHandler } from 'express';
import { logger } from '../lib/logger.js';

export const requestLogger: RequestHandler = (req, res, next) => {
  res.on('finish', () => {
    const ctx = req.ctx;
    logger.info(
      {
        requestId: ctx?.requestId,
        method: req.method,
        // Just the path without the query string - Express 5 types the matched route as any.
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: ctx ? Date.now() - ctx.startedAt : undefined,
        orgId: ctx?.orgId,
        principal: ctx?.principal ? `${ctx.principal.kind}:${principalId(ctx.principal)}` : undefined,
      },
      'request',
    );
  });
  next();
};

// The id to print for a principal: a respondent has a campaign id instead of a user id.
function principalId(principal: NonNullable<Express.Request['ctx']['principal']>): string {
  return principal.kind === 'respondent' ? principal.campaignId : principal.id;
}
