// The adapter between RTK Query and the `use*` hooks' contract. docs/REDUX-PLAN.md §6.3.
//
// Pages were written against `{ data, loading, error }` with `error` an `ApiError`, and
// promises that throw an `ApiError`. The store holds errors as plain objects (§6.2), so
// everything that leaves a hook passes through here on its way out.
import { useCallback } from 'react';
import { isSerializedApiError, toApiError } from '../store/api/errors.js';
import { isSerializedOpsError, toOpsError } from '../store/api/opsApi.js';

/**
 * `.unwrap()` for a dispatched thunk or mutation, throwing the page-facing `ApiError` (or
 * `OpsError`) rather than the plain object the store keeps.
 */
export async function unwrapApi<T>(pending: { unwrap(): Promise<T> }): Promise<T> {
  try {
    return await pending.unwrap();
  } catch (error) {
    if (isSerializedApiError(error)) throw toApiError(error);
    // The operator API's own shape: its pages check `instanceof OpsError`.
    if (isSerializedOpsError(error)) throw toOpsError(error);
    throw error;
  }
}

/** What every server-data hook returns (23 §3). The same shape as `lib/org.ts`'s. */
export type Loadable<T> = { data: T | null; loading: boolean; error: Error | null };

/** The parts of an RTK Query hook result the adapter reads. */
type QueryResult<T> = {
  data?: T | undefined;
  currentData?: T | undefined;
  isFetching: boolean;
  isUninitialized: boolean;
  error?: unknown;
  refetch: () => unknown;
};

/** The store's error, as the page expects it. Anything else RTK produced (a thrown
 *  `transformResponse`, say) becomes a plain `Error` with its message, made once. */
const others = new WeakMap<object, Error>();
function pageError(error: unknown): Error | null {
  if (error === undefined || error === null) return null;
  if (isSerializedApiError(error)) return toApiError(error);
  // The operator console's API keeps its own error shape, and its pages read an `OpsError`.
  if (isSerializedOpsError(error)) return toOpsError(error);
  if (typeof error !== 'object') return new Error('Something went wrong.');
  const cached = others.get(error);
  if (cached) return cached;
  const built = new Error((error as { message?: string }).message ?? 'Something went wrong.');
  others.set(error, built);
  return built;
}

/**
 * An RTK Query result as `Loadable<T>` plus `reload` (§6.3).
 *
 * - `data` keeps the last good result while a refetch or a new argument loads, which is
 *   what the list pages did by hand ("the last good page stays on screen"). Pass
 *   `{ current: true }` for a detail view keyed by id, so B's dialog never shows A's data.
 * - `loading` is `isFetching`: true on a refetch too, with the last data still showing.
 *   A query skipped for want of an argument also reads as loading, as before. Pass
 *   `{ initialOnly: true }` where a page swaps its whole content for a placeholder while
 *   `loading` (Settings' skeleton, "Checking your link…"): there it means "nothing to show
 *   yet", so a re-read never blanks a form somebody is typing into.
 * - `error` is the page-facing `ApiError`, the same instance for the same failure.
 */
export function useLoadable<T>(
  result: QueryResult<T>,
  options: { current?: boolean; initialOnly?: boolean } = {},
): Loadable<T> & { reload: () => Promise<void> } {
  const { refetch, isUninitialized } = result;
  const reload = useCallback(async () => {
    // Refetching a query that never started (skipped) throws; there is nothing to reload.
    if (!isUninitialized) await refetch();
  }, [refetch, isUninitialized]);

  const data = (options.current ? result.currentData : result.data) ?? null;
  const loading = result.isFetching || result.isUninitialized;
  return {
    data,
    loading: options.initialOnly ? loading && data === null : loading,
    error: pageError(result.error),
    reload,
  };
}
