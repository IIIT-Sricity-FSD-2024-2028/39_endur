// What this file is actually asserting: the wrapper's job is to make every call carry the
// session and the CSRF echo without a page ever thinking about it, and to turn the one
// error envelope into something renderable. Both are easy to break silently.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, SessionExpiredError, apiGet, apiPost, setUnauthenticatedHandler } from './api.js';

type Call = { url: string; init: RequestInit };

function stubFetch(response: Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response);
  });
  return calls;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'endur.csrf=; max-age=0; path=/';
  setUnauthenticatedHandler(() => undefined);
});

describe('transport', () => {
  it('sends the session cookie on every call', async () => {
    const calls = stubFetch(json(200, { ok: true }));
    await apiGet('/campaigns');
    expect(calls[0]?.init.credentials).toBe('include');
  });

  it('prefixes a bare path with the versioned base', async () => {
    const calls = stubFetch(json(200, {}));
    await apiGet('/campaigns');
    expect(calls[0]?.url).toBe('/api/v1/campaigns');
  });

  it('echoes the CSRF cookie on an unsafe method', async () => {
    document.cookie = 'endur.csrf=token-abc; path=/';
    const calls = stubFetch(json(200, {}));
    await apiPost('/campaigns', { name: 'x' });
    expect(new Headers(calls[0]?.init.headers).get('X-CSRF-Token')).toBe('token-abc');
  });

  // A GET carrying the token would be harmless but pointless. What matters is that the
  // absence here is deliberate, so nobody "fixes" it by attaching it everywhere.
  it('does not echo it on a safe method', async () => {
    document.cookie = 'endur.csrf=token-abc; path=/';
    const calls = stubFetch(json(200, {}));
    await apiGet('/campaigns');
    expect(new Headers(calls[0]?.init.headers).get('X-CSRF-Token')).toBeNull();
  });

  it('sends no Idempotency-Key unless one is asked for', async () => {
    const calls = stubFetch(json(200, {}));
    await apiPost('/campaigns/1/launch', undefined, { idempotencyKey: 'key-1' });
    expect(new Headers(calls[0]?.init.headers).get('Idempotency-Key')).toBe('key-1');

    vi.unstubAllGlobals();
    const plain = stubFetch(json(200, {}));
    await apiPost('/campaigns/1/launch');
    expect(new Headers(plain[0]?.init.headers).get('Idempotency-Key')).toBeNull();
  });

  it('returns undefined for 204 rather than trying to parse a body', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(apiGet('/thing')).resolves.toBeUndefined();
  });
});

describe('errors', () => {
  it('unpacks field errors so a form can render them inline', async () => {
    stubFetch(json(422, {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'That did not validate.',
        details: { fields: [{ path: 'body.name', message: 'Required' }] },
        requestId: 'req-1',
      },
    }));

    const error = await apiPost('/units', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('VALIDATION_FAILED');
    expect((error as ApiError).requestId).toBe('req-1');
    // Both spellings resolve, because a form field is called `name`, not `body.name`.
    expect((error as ApiError).fieldError('name')).toBe('Required');
    expect((error as ApiError).fieldError('body.name')).toBe('Required');
  });

  it('keeps the decision trace on a 403, which is what makes a denial actionable', async () => {
    stubFetch(json(403, {
      error: {
        code: 'FORBIDDEN',
        message: 'Not allowed.',
        details: { decidedBy: { via: 'role', subjectName: 'Reviewer', scope: 'own_unit' } },
        requestId: 'req-2',
      },
    }));

    const error = (await apiGet('/units').catch((e: unknown) => e)) as ApiError;
    expect(error.decidedBy).toEqual({ via: 'role', subjectName: 'Reviewer', scope: 'own_unit' });
  });

  it('reports a non-JSON failure as INTERNAL rather than inventing a code', async () => {
    stubFetch(new Response('<html>502</html>', { status: 502 }));
    const error = (await apiGet('/units').catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('INTERNAL');
    expect(error.status).toBe(502);
  });

  it('raises SessionExpiredError on a 401 and tells the app once', async () => {
    const told = vi.fn();
    setUnauthenticatedHandler(told);
    stubFetch(json(401, {
      error: { code: 'UNAUTHENTICATED', message: 'Sign in.', requestId: 'req-3' },
    }));

    const error = await apiGet('/campaigns').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SessionExpiredError);
    expect(told).toHaveBeenCalledTimes(1);
  });
});

/**
 * T-031. Both of these exist for one page: the sign-in form. A 401 there is the ANSWER,
 * and a 429 there is the only place in the product where the user needs to be told how
 * long to wait.
 */
describe('the two things sign-in needs from the transport', () => {
  it('keeps a 401 local when the caller says it owns one', async () => {
    const told = vi.fn();
    setUnauthenticatedHandler(told);
    stubFetch(json(401, {
      error: { code: 'UNAUTHENTICATED', message: 'Nope.', requestId: 'req-4' },
    }));

    const error = await apiPost('/auth/login', { email: 'a@b.test' }, { suppress401Handler: true })
      .catch((e: unknown) => e);

    // Still the right class — the page catches it and renders a message.
    expect(error).toBeInstanceOf(SessionExpiredError);
    // But the app was NOT told it had been logged out of a session it never had.
    expect(told).not.toHaveBeenCalled();
  });

  it('still fires the handler for every other 401, which is the common case', async () => {
    const told = vi.fn();
    setUnauthenticatedHandler(told);
    stubFetch(json(401, {
      error: { code: 'UNAUTHENTICATED', message: 'Nope.', requestId: 'req-5' },
    }));

    await apiGet('/campaigns').catch(() => undefined);
    expect(told).toHaveBeenCalledTimes(1);
  });

  it('reads Retry-After when the server sends one', async () => {
    stubFetch(new Response(JSON.stringify({
      error: { code: 'RATE_LIMITED', message: 'Slow down.', requestId: 'req-6' },
    }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'Retry-After': '90' },
    }));

    const error = (await apiGet('/campaigns').catch((e: unknown) => e)) as ApiError;
    expect(error.retryAfter).toBe(90);
  });

  it('falls back to the draft-7 RateLimit header, which is what our limiter actually sends', async () => {
    stubFetch(new Response(JSON.stringify({
      error: { code: 'RATE_LIMITED', message: 'Slow down.', requestId: 'req-7' },
    }), {
      status: 429,
      headers: {
        'content-type': 'application/json',
        RateLimit: 'limit=10, remaining=0, reset=842',
      },
    }));

    const error = (await apiGet('/campaigns').catch((e: unknown) => e)) as ApiError;
    expect(error.retryAfter).toBe(842);
  });

  it('leaves it undefined rather than guessing a number to show someone', async () => {
    stubFetch(json(429, {
      error: { code: 'RATE_LIMITED', message: 'Slow down.', requestId: 'req-8' },
    }));

    const error = (await apiGet('/campaigns').catch((e: unknown) => e)) as ApiError;
    expect(error.retryAfter).toBeUndefined();
  });

  it('does not invent a retry hint on a status that is not 429', async () => {
    stubFetch(new Response(JSON.stringify({
      error: { code: 'INTERNAL', message: 'Boom.', requestId: 'req-9' },
    }), {
      status: 500,
      headers: { 'content-type': 'application/json', 'Retry-After': '30' },
    }));

    const error = (await apiGet('/campaigns').catch((e: unknown) => e)) as ApiError;
    expect(error.retryAfter).toBeUndefined();
  });
});
