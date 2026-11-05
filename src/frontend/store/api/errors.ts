// Errors are plain objects in the store and `ApiError`s in the page. docs/REDUX-PLAN.md §6.2.
//
// The store must hold only serialisable values (RTK's check stays ON), and an `ApiError` is
// a class instance with methods. So the base query stores the plain shape below, and each
// `lib` hook rebuilds the class before handing it to a page. Pages keep working unchanged
// with `instanceof ApiError`, `error.fieldError('name')` and `error.decidedBy`.
import type { ErrorCode } from '@endur/shared';
import { ApiError, SessionExpiredError } from '../../lib/api.js';

/** What the store holds for a failed request. */
export type SerializedApiError =
  | {
      kind: 'api';
      status: number;
      code: ErrorCode;
      message: string;
      requestId: string;
      details: Record<string, unknown>;
      retryAfter: number | null;
    }
  /** No response at all: offline, DNS, a refused connection. Not an `ApiError` today
   *  either, so pages that check `instanceof ApiError` keep showing their own wording. */
  | { kind: 'network'; status: 0; message: string };

export function serializeApiError(error: unknown): SerializedApiError {
  if (error instanceof ApiError) {
    return {
      kind: 'api',
      status: error.status,
      code: error.code,
      message: error.message,
      requestId: error.requestId,
      details: error.details,
      retryAfter: error.retryAfter ?? null,
    };
  }
  return {
    kind: 'network',
    status: 0,
    message: error instanceof Error ? error.message : 'The request did not reach the server.',
  };
}

/**
 * One instance per stored error object. Without this, every render would build a new
 * `ApiError`, and an effect that depends on `error` would run on every render.
 */
const rebuilt = new WeakMap<SerializedApiError, Error>();

/** The page-facing error: an `ApiError` (or `SessionExpiredError` on a 401), or a plain
 *  `Error` for a network failure. */
export function toApiError(error: SerializedApiError): Error {
  const cached = rebuilt.get(error);
  if (cached) return cached;

  let built: Error;
  if (error.kind === 'network') {
    built = new Error(error.message);
  } else {
    const init = {
      code: error.code,
      status: error.status,
      message: error.message,
      requestId: error.requestId,
      details: error.details,
      ...(error.retryAfter === null ? {} : { retryAfter: error.retryAfter }),
    };
    built = error.status === 401 ? new SessionExpiredError(init) : new ApiError(init);
  }
  rebuilt.set(error, built);
  return built;
}

/** Narrowing for a value that came out of a rejected action's `payload`. */
export const isSerializedApiError = (value: unknown): value is SerializedApiError =>
  typeof value === 'object' &&
  value !== null &&
  ((value as SerializedApiError).kind === 'api' || (value as SerializedApiError).kind === 'network');
