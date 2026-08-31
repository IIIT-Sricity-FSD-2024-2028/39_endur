// Link 16. The single exit for every error, so no handler ever calls res.status(500) itself.
// Anything unrecognised becomes a plain 500 with only the request id; details go to the log, never the client.
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

  // A response already being sent cannot be replaced, so hand it back to Express.
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

// Maps any thrown value onto one of our typed AppErrors.
function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err && typeof err === 'object') {
    const candidate = err as { code?: unknown; status?: unknown; type?: unknown; message?: unknown };

    // express.json() rejects an oversized or unparseable body with these shapes.
    if (candidate.type === 'entity.too.large')
      return new AppError('PAYLOAD_TOO_LARGE', 'That upload is too large.');
    if (candidate.type === 'entity.parse.failed')
      return new AppError('BAD_REQUEST', 'The request body is not valid JSON.');
    // Our own rate limiter passes its code across.
    if (candidate.code === 'RATE_LIMITED')
      return new AppError('RATE_LIMITED', 'Too many requests. Try again shortly.');
  }

  // Unknown error: the message is not forwarded, as it could contain a query, a path or a credential.
  return new AppError(
    'INTERNAL' satisfies ErrorCode,
    isProd ? 'Something went wrong.' : `Something went wrong: ${describe(err)}`,
  );
}

// Best-effort text for an unknown thrown value, used in development messages only.
const describe = (err: unknown): string =>
  err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown error';
