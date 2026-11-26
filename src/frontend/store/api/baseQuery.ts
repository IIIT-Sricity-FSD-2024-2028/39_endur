// RTK Query's base query, over the app's one HTTP client. docs/REDUX-PLAN.md §6.1 (R-102).
//
// It does not re-implement anything: `request()` in `lib/api.ts` already does the CSRF
// echo, `credentials: 'include'`, idempotency keys, multipart and the error envelope. This
// adapts its throw-or-return shape to RTK Query's `{ data } | { error }`, with the error in
// its serialisable form (§6.2).
import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import { request } from '../../lib/api.js';
import { serializeApiError, type SerializedApiError } from './errors.js';

export type ApiArgs =
  | string
  | {
      url: string;
      method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
      body?: unknown;
      /** Replays safely: the server answers a retry with the first response (12 §4.15). */
      idempotencyKey?: string;
    };

export const apiBaseQuery: BaseQueryFn<ApiArgs, unknown, SerializedApiError> = async (
  args,
  { signal },
) => {
  const { url, method = 'GET', body, idempotencyKey } =
    typeof args === 'string' ? { url: args } : args;
  try {
    const data = await request<unknown>(method, url, body, {
      signal,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      // A 401 from a query is handled in the store, by `sessionExpiredMiddleware`, not by
      // the module-level callback `lib/api.ts` keeps for calls not yet migrated (R-506).
      suppress401Handler: true,
    });
    return { data };
  } catch (error) {
    return { error: serializeApiError(error) };
  }
};
