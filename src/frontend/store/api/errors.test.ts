// §6.2: plain errors in the store, `ApiError`s in the page.
import { describe, expect, it } from 'vitest';
import { ApiError, SessionExpiredError } from '../../lib/api.js';
import { serializeApiError, toApiError } from './errors.js';

const apiError = new ApiError({
  code: 'VALIDATION_FAILED',
  status: 422,
  message: 'Check the form.',
  requestId: 'req-1',
  details: { fields: [{ path: 'body.name', message: 'Too long.' }] },
  retryAfter: 30,
});

describe('serializeApiError', () => {
  it('keeps everything a page reads, as a plain object the store will accept', () => {
    const plain = serializeApiError(apiError);
    expect(plain).toEqual({
      kind: 'api', status: 422, code: 'VALIDATION_FAILED', message: 'Check the form.',
      requestId: 'req-1', details: apiError.details, retryAfter: 30,
    });
    expect(Object.getPrototypeOf(plain)).toBe(Object.prototype);
  });

  it('records a request that never got an answer as a network failure', () => {
    expect(serializeApiError(new TypeError('Failed to fetch'))).toEqual({
      kind: 'network', status: 0, message: 'Failed to fetch',
    });
  });
});

describe('toApiError', () => {
  it('rebuilds an ApiError whose methods work, as a page expects', () => {
    const rebuilt = toApiError(serializeApiError(apiError));
    expect(rebuilt).toBeInstanceOf(ApiError);
    expect((rebuilt as ApiError).fieldError('name')).toBe('Too long.');
    expect((rebuilt as ApiError).retryAfter).toBe(30);
  });

  it('rebuilds a 401 as a SessionExpiredError, and a network failure as a plain Error', () => {
    const expired = serializeApiError(
      new SessionExpiredError({ code: 'UNAUTHENTICATED', status: 401, message: 'Sign in.', requestId: 'r' }),
    );
    expect(toApiError(expired)).toBeInstanceOf(SessionExpiredError);

    const offline = toApiError(serializeApiError(new TypeError('Failed to fetch')));
    expect(offline).not.toBeInstanceOf(ApiError);
    expect(offline.message).toBe('Failed to fetch');
  });

  it('returns the SAME instance for the same stored error, so effects do not re-run', () => {
    const plain = serializeApiError(apiError);
    expect(toApiError(plain)).toBe(toApiError(plain));
  });
});
