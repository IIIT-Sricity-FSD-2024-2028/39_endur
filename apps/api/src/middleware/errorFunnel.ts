// Link 16. THE SINGLE EXIT. Registered last, or Express never routes errors here.
//
// Rules: every error leaves through this function. No handler calls res.status(500).
// Anything unrecognised becomes a generic 500 carrying only the requestId — the detail
// goes to the log, never to the client. Stack traces do not cross this boundary.
import type { ErrorRequestHandler } from 'express';
import type { ErrorCode, ErrorEnvelope } from '@endur/shared';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { isProd } from '../lib/config.js';

export const errorFunnel: ErrorRequestHandler = (err, req, res, _next) => {
  const error = toAppError(err);
  const requestId = req.ctx?.requestId ?? 'unknown';

  logger[error.status >= 500 ? 'error' : 'warn'](
    { requestId, err, status: error.status, code: error.code },
    error.code,
  );

  // A response already streaming cannot be replaced with an envelope; handing it to
  // Express lets it destroy the socket rather than emit a half JSON body.
  if (res.headersSent) return _next(err);

  const body: ErrorEnvelope = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      requestId,
    },
  };
  res.status(error.status).json(body);
};

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err && typeof err === 'object') {
    const candidate = err as { code?: unknown; status?: unknown; type?: unknown; message?: unknown };

    // express.json() rejects an oversized body with this shape.
    if (candidate.type === 'entity.too.large')
      return new AppError('PAYLOAD_TOO_LARGE', 'That upload is too large.');
    if (candidate.type === 'entity.parse.failed')
      return new AppError('BAD_REQUEST', 'The request body is not valid JSON.');
    // Our rate limiter hands its own code across (12 §4.5).
    if (candidate.code === 'RATE_LIMITED')
      return new AppError('RATE_LIMITED', 'Too many requests. Try again shortly.');
  }

  // Unknown: the message is NOT forwarded. It could contain a query, a path, or a
  // credential, and none of that is a client's business.
  return new AppError(
    'INTERNAL' satisfies ErrorCode,
    isProd ? 'Something went wrong.' : `Something went wrong: ${describe(err)}`,
  );
}

const describe = (err: unknown): string =>
  err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown error';
