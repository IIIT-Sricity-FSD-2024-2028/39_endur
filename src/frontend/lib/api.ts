// The one way the client talks to the server. 20 §4.
//
// There is NO TOKEN HERE and no refresh dance (DEC-014). The session is an httpOnly
// cookie the browser manages, so this file's whole job is: same-origin URL, credentials,
// the CSRF echo, and turning an error envelope into something a page can render.
//
// A page must never call `fetch` directly. It calls a `use*` hook, and the hook calls
// this — that seam is what makes P3's move to RTK Query additive rather than a rewrite
// (23 §3).
import type { ErrorCode, ErrorEnvelope, FieldError, DecidedBy } from '@endur/shared';

/** Every route is same-origin: Vite proxies /api to Express so dev and prod match. */
const BASE = '/api/v1';
const CSRF_COOKIE = 'endur.csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * A failed request, in the shape the UI actually needs.
 *
 * `fields` is what renders inline under a form input (14 §6); `decidedBy` is the
 * decision trace that makes a denial actionable — it tells the user whom to ask
 * rather than just "forbidden" (13 §5).
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId: string;
  readonly fields: FieldError[];
  readonly decidedBy: DecidedBy | undefined;
  readonly details: Record<string, unknown>;
  /**
   * Seconds until the caller may retry, on a 429. Read from the response rather than the
   * envelope because the limiter sets headers and `errorFunnel` writes the body — neither
   * knows about the other (12 §4.16).
   */
  readonly retryAfter: number | undefined;

  constructor(init: {
    code: ErrorCode;
    status: number;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
    retryAfter?: number;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId;
    this.details = init.details ?? {};
    this.fields = (init.details?.['fields'] as FieldError[] | undefined) ?? [];
    this.decidedBy = init.details?.['decidedBy'] as DecidedBy | undefined;
    this.retryAfter = init.retryAfter;
  }

  /** The message for one form field, or undefined. Paths are dotted: "body.name". */
  fieldError(path: string): string | undefined {
    return this.fields.find((f) => f.path === path || f.path === `body.${path}`)?.message;
  }
}

/**
 * Raised when the session is gone. Distinct from a plain ApiError so the router can
 * catch exactly this and route to /login without string-matching a code.
 */
export class SessionExpiredError extends ApiError {
  constructor(init: ConstructorParameters<typeof ApiError>[0]) {
    super(init);
    this.name = 'SessionExpiredError';
  }
}

/** Not a secret — it only has to be unguessable by another origin — so it is read on
 *  demand rather than stored anywhere (20 §5). */
function csrfToken(): string | undefined {
  for (const part of document.cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === CSRF_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/**
 * Called once whenever the server says the session is gone, from wherever the call was
 * made. Registered by the app root; it dispatches `signedOut`, and RequireSession does
 * the rest. Without this seam every page would need its own 401 handling, and the one
 * that forgot would sit there showing a spinner forever.
 */
let onUnauthenticated: (() => void) | undefined;
export function setUnauthenticatedHandler(handler: () => void): void {
  onUnauthenticated = handler;
}

type Options = Omit<RequestInit, 'body' | 'method'> & {
  /** Replays safely: the server returns the FIRST response rather than acting twice (12 §4.15). */
  idempotencyKey?: string;
  /**
   * Handle a 401 here instead of firing the global session handler.
   *
   * Exactly one call needs this: `POST /auth/login`. A 401 there is the ANSWER — "that
   * email and password don't match" — not an expired session, and letting it reach the
   * global handler would make a typo look like a logout. Every other 401 in the app means
   * what the handler assumes it means, so this stays opt-in per call.
   */
  suppress401Handler?: boolean;
};

async function request<T>(method: string, path: string, body?: unknown, opts: Options = {}): Promise<T> {
  const { idempotencyKey, suppress401Handler, headers: extraHeaders, ...init } = opts;
  const headers = new Headers(extraHeaders);

  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (!SAFE_METHODS.has(method)) {
    const token = csrfToken();
    // Send it if we have it. If we do not, the server rejects with CSRF_FAILED and the
    // UI says "reload and try again" — which is honest, and better than silently
    // pretending the request was made.
    if (token) headers.set('X-CSRF-Token', token);
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  }

  const response = await fetch(path.startsWith('/api') ? path : BASE + path, {
    ...init,
    method,
    headers,
    // Without this the session cookie is not sent and every call is anonymous.
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 204) return undefined as T;

  const payload: unknown = await parse(response);

  if (!response.ok) {
    const error = toError(response, payload);
    if (error instanceof SessionExpiredError && !suppress401Handler) onUnauthenticated?.();
    throw error;
  }
  return payload as T;
}

async function parse(response: Response): Promise<unknown> {
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return await response.text();
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * How long to wait after a 429. `Retry-After` is the conventional header, but the limiter
 * runs with `standardHeaders: 'draft-7'` and hands the response off to `errorFunnel`, so
 * what actually arrives is `RateLimit: limit=10, remaining=0, reset=842`. Read both, in
 * that order, and give up quietly rather than guessing a number to show the user.
 */
function retryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get('Retry-After');
  if (header && /^\d+$/.test(header.trim())) return Number(header.trim());

  const reset = /(?:^|[,;\s])reset\s*=\s*(\d+)/.exec(response.headers.get('RateLimit') ?? '');
  return reset?.[1] ? Number(reset[1]) : undefined;
}

function toError(response: Response, payload: unknown): ApiError {
  const envelope = (payload as ErrorEnvelope | undefined)?.error;
  const requestId = envelope?.requestId ?? response.headers.get('X-Request-Id') ?? 'unknown';
  const retryAfter = response.status === 429 ? retryAfterSeconds(response) : undefined;

  const init: ConstructorParameters<typeof ApiError>[0] = {
    // A non-JSON failure means a proxy or a crash answered instead of the app. Report it
    // as INTERNAL rather than inventing a code the server never sent.
    code: envelope?.code ?? 'INTERNAL',
    status: response.status,
    message: envelope?.message ?? 'Something went wrong. Please try again.',
    requestId,
    ...(envelope?.details ? { details: envelope.details } : {}),
    ...(retryAfter !== undefined ? { retryAfter } : {}),
  };

  return response.status === 401 ? new SessionExpiredError(init) : new ApiError(init);
}

export const apiGet = <T>(path: string, opts?: Options): Promise<T> =>
  request<T>('GET', path, undefined, opts);

export const apiPost = <TIn, TOut>(path: string, body?: TIn, opts?: Options): Promise<TOut> =>
  request<TOut>('POST', path, body, opts);

export const apiPatch = <TIn, TOut>(path: string, body: TIn, opts?: Options): Promise<TOut> =>
  request<TOut>('PATCH', path, body, opts);

export const apiPut = <TIn, TOut>(path: string, body: TIn, opts?: Options): Promise<TOut> =>
  request<TOut>('PUT', path, body, opts);

/**
 * DELETE carries a body here, which is unusual enough to be worth a line: deleting a unit
 * needs `{ reassignChildrenTo }` (32), and putting "where do the children go" in a query
 * string would make a destructive instruction look like a filter.
 */
export const apiDelete = <TOut = void, TIn = undefined>(
  path: string,
  body?: TIn,
  opts?: Options,
): Promise<TOut> => request<TOut>('DELETE', path, body, opts);
