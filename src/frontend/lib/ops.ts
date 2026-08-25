// The `/ops` API client. Step 0.1, `Mithil/plan.md`.
//
// NOT `lib/api.ts`, and deliberately a separate file rather than a shared core with a flag:
//
//   - `lib/api.ts` fires the global `onUnauthenticated` handler on any 401, which dispatches
//     `signedOut` on the ORG auth slice. An expired operator session would then look like a
//     customer being logged out, and `RequireSession` would push them to `/login` — the exact
//     confusion `19` §7 mounts a second cookie to prevent.
//   - Platform routes carry NO CSRF token. `endur.ops` is `sameSite: 'lax'`, and that is the
//     control (`19` §9); sending `X-CSRF-Token` there is noise at best.
import type { ErrorEnvelope } from '@endur/shared';

const BASE = '/api/v1/platform';

export class OpsError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string;

  constructor(init: { code: string; status: number; message: string; requestId: string }) {
    super(init.message);
    this.name = 'OpsError';
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId;
  }
}

/** Called once, from the ops router, so a 401 anywhere sends the operator to `/ops/login`
 *  rather than the customer sign-in page. */
let onUnauthenticated: (() => void) | undefined;
export function setOpsUnauthenticatedHandler(handler: () => void): void {
  onUnauthenticated = handler;
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

function toError(response: Response, payload: unknown): OpsError {
  const envelope = (payload as ErrorEnvelope | undefined)?.error;
  return new OpsError({
    code: envelope?.code ?? 'INTERNAL',
    status: response.status,
    message: envelope?.message ?? 'Something went wrong. Please try again.',
    requestId: envelope?.requestId ?? response.headers.get('X-Request-Id') ?? 'unknown',
  });
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = new Headers();
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  const response = await fetch(BASE + path, {
    method,
    headers,
    credentials: 'include',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (response.status === 204) return undefined as T;
  const payload = await parse(response);

  if (!response.ok) {
    const error = toError(response, payload);
    if (error.status === 401) onUnauthenticated?.();
    throw error;
  }
  return payload as T;
}

export const opsGet = <T>(path: string): Promise<T> => request<T>('GET', path);
export const opsPost = <TIn, TOut>(path: string, body?: TIn): Promise<TOut> =>
  request<TOut>('POST', path, body);
export const opsPatch = <TIn, TOut>(path: string, body: TIn): Promise<TOut> =>
  request<TOut>('PATCH', path, body);

/**
 * `DEC-074` — an export is a file, not JSON, so it does not go through `request()`: it needs
 * the Blob and the server's filename rather than a parsed body.
 *
 * The download is triggered from a Blob URL rather than by pointing the browser at the URL,
 * because the response is only authorised by the `endur.ops` cookie and a plain navigation
 * to a 403 would replace the page the operator is working in with an error envelope.
 */
export async function opsDownload(path: string): Promise<{ name: string; lines: number; truncated: boolean }> {
  const response = await fetch(BASE + path, { method: 'GET', credentials: 'include' });
  if (!response.ok) {
    const error = toError(response, await parse(response));
    if (error.status === 401) onUnauthenticated?.();
    throw error;
  }

  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const name = match?.[1] ?? 'export.ndjson';

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  return {
    name,
    lines: Number(response.headers.get('X-Log-Lines') ?? 0),
    truncated: response.headers.get('X-Log-Truncated') === 'true',
  };
}
