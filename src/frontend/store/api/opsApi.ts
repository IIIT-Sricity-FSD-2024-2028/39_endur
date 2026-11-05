// The operator API, as a second RTK Query API slice. docs/REDUX-PLAN.md §5 (R-505).
//
// SEPARATE FROM `api`, for the reasons `lib/ops.ts` is separate from `lib/api.ts`: another
// cookie (`endur.ops`), no CSRF token, and a 401 that means the OPERATOR's session has gone,
// which must route to `/ops/login` and never sign a customer out (`19` §7). So: its own
// base query over `opsRequest()`, its own error shape (an `OpsError`, kept plain in the
// store), its own cache (`opsApi`), cleared on operator sign-out.
import { createApi, type BaseQueryFn } from '@reduxjs/toolkit/query/react';
import type { PlatformMeResponse } from '@endur/shared';
import { OpsError, opsRequest } from '../../lib/ops.js';

/** What the store holds for a failed platform request. */
export type SerializedOpsError =
  | { kind: 'ops'; status: number; code: string; message: string; requestId: string }
  /** No response at all. */
  | { kind: 'network'; status: 0; message: string };

export function isSerializedOpsError(value: unknown): value is SerializedOpsError {
  return (
    typeof value === 'object' && value !== null &&
    'kind' in value && (value.kind === 'ops' || value.kind === 'network') &&
    'status' in value && typeof value.status === 'number'
  );
}

function serialize(error: unknown): SerializedOpsError {
  if (error instanceof OpsError) {
    return { kind: 'ops', status: error.status, code: error.code, message: error.message, requestId: error.requestId };
  }
  return {
    kind: 'network',
    status: 0,
    message: error instanceof Error ? error.message : 'The request did not reach the server.',
  };
}

/** The page-facing error: an `OpsError`, or a plain `Error` with no response. One instance
 *  per stored error, so an effect that depends on it does not run on every render. */
const rebuilt = new WeakMap<SerializedOpsError, Error>();
export function toOpsError(error: SerializedOpsError): Error {
  const cached = rebuilt.get(error);
  if (cached) return cached;
  const built =
    error.kind === 'ops'
      ? new OpsError({ code: error.code, status: error.status, message: error.message, requestId: error.requestId })
      : new Error(error.message);
  rebuilt.set(error, built);
  return built;
}

export type OpsArgs = string | { url: string; method?: 'GET' | 'POST' | 'PATCH'; body?: unknown };

export const opsBaseQuery: BaseQueryFn<OpsArgs, unknown, SerializedOpsError> = async (args, { signal }) => {
  const { url, method = 'GET', body } = typeof args === 'string' ? { url: args } : args;
  try {
    return { data: await opsRequest<unknown>(method, url, body, { signal, suppress401Handler: true }) };
  } catch (error) {
    return { error: serialize(error) };
  }
};

export const opsApi = createApi({
  reducerPath: 'opsApi',
  baseQuery: opsBaseQuery,
  tagTypes: ['OpsMe', 'Estate', 'OpsOrg', 'Enterprise', 'OpsAnalytics', 'OpsEarnings', 'OpsLogs'],
  // As the org API: every screen re-reads when it mounts, from a cached copy; and on
  // reconnect, never on focus.
  refetchOnMountOrArgChange: true,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    /**
     * Who the operator is. In the entry with the API itself because `opsSlice` takes its
     * answer (`extraReducers`), as `auth` takes `/auth/me`'s; every other platform endpoint
     * is injected from its page's `lib` file.
     */
    getOpsMe: build.query<PlatformMeResponse, void>({
      query: () => '/me',
      providesTags: ['OpsMe'],
    }),
  }),
});
