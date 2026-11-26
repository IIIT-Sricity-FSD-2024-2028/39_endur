// What every screen slice shares. docs/REDUX-PLAN.md §6.10 (R-702).
//
// The screen slices hold what used to be `useState` in a page, a dialog or a widget. Every
// one of them follows the same three rules, and the helpers below are those rules:
//
// 1. **State keeps its lifetime.** Unmounting used to throw a component's state away; now
//    the PAGE dispatches a `…Left` / `…Closed` action from its effect clean-up, so the state
//    goes exactly when it used to (`useClearOnLeave`). Never from the dialog itself: under
//    <StrictMode> React mounts, cleans up and mounts again, and a dialog that closed itself
//    on clean-up would close on its first render.
// 2. **The store holds plain data.** A failed command is kept as the serialised error the
//    API layer already makes (`SerializedApiError`); the page reads a message or a field's
//    error out of it with the helpers here, and never imports `store/api` (R-110).
// 3. **Commands are thunks.** Each screen's command is a `createScreenThunk`, so its
//    `pending` / `fulfilled` / `rejected` are handled by the screen's own reducer, where the
//    evaluator can read them, and the request itself still goes through RTK Query (tags,
//    the cache) by dispatching the endpoint's `initiate`.
import { useEffect } from 'react';
import { createAsyncThunk, type UnknownAction } from '@reduxjs/toolkit';
import { useAppDispatch, type AppDispatch, type RootState } from '../index.js';
import {
  isSerializedApiError,
  serializeApiError,
  toApiError,
  type SerializedApiError,
} from '../api/errors.js';
import { ApiError } from '../../lib/api.js';

export type { SerializedApiError };

/** `createAsyncThunk` with this store's types, and a plain error as the rejection. */
export const createScreenThunk = createAsyncThunk.withTypes<{
  state: RootState;
  dispatch: AppDispatch;
  rejectValue: SerializedApiError;
}>();

/**
 * Whatever a command threw, as the plain error the store may hold: RTK Query's `unwrap()`
 * already throws one; a plain call's `ApiError` (or a network failure) is converted.
 */
export function asStoreError(error: unknown): SerializedApiError {
  return isSerializedApiError(error) ? error : serializeApiError(error);
}

/** The server's own words for a failure, or `fallback` when there was no answer at all. */
export function messageOf(error: SerializedApiError | null | undefined, fallback: string): string | null {
  if (!error) return null;
  return error.kind === 'api' ? error.message : fallback;
}

/** One field's error from a 422, for the line under that input. */
export function fieldErrorOf(
  error: SerializedApiError | null | undefined,
  field: string,
): string | undefined {
  if (!error || error.kind !== 'api') return undefined;
  const rebuilt = toApiError(error);
  return rebuilt instanceof ApiError ? rebuilt.fieldError(field) : undefined;
}

/** The page-facing error class, for the few screens that branch on it (`decidedBy`, 402). */
export function pageErrorOf(error: SerializedApiError | null | undefined): Error | null {
  return error ? toApiError(error) : null;
}

/**
 * Dispatches `action` when the calling page unmounts, or when the action itself changes
 * (another person's page, keyed by id: leaving A for B clears A). Rule 1 above.
 */
export function useClearOnLeave(action: UnknownAction): void {
  const dispatch = useAppDispatch();
  const key = `${action.type}:${JSON.stringify(action.payload ?? null)}`;
  useEffect(() => {
    const leaving = action;
    return () => {
      dispatch(leaving);
    };
    // `key` IS the action: a new object with the same type and payload every render must
    // not count as leaving.
  }, [dispatch, key]);
}
