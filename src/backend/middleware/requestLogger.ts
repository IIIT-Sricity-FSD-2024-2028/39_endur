// Link 2. Structured JSON: method, path, status, duration, orgId, principal, requestId.
//
// **Never logs the body.** Bodies carry feedback text and credentials, and a log is the
// easiest place in a system to accidentally create a permanent copy of both. This is why
// it is hand-rolled rather than pino-http's default serialiser, which logs more than we
// want by default.
import type { RequestHandler } from 'express';
import { logger } from '../lib/logger.js';

export const requestLogger: RequestHandler = (req, res, next) => {
  res.on('finish', () => {
    const ctx = req.ctx;
    logger.info(
      {
        requestId: ctx?.requestId,
        method: req.method,
        // The matched route pattern would be better cardinality, but Express 5 types it
        // as `any`; the raw path minus the query string is honest and safe.
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

function principalId(principal: NonNullable<Express.Request['ctx']['principal']>): string {
  return principal.kind === 'respondent' ? principal.campaignId : principal.id;
}
