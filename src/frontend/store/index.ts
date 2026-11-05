// The store. 23 §2; Phase 3 plan: docs/REDUX-PLAN.md §5 (R-101).
//
// `setupStore` is a FACTORY, and `store` is the app's single instance of it. Tests call the
// factory for a fresh store per case and get the real reducer, the real middleware and the
// real types — a hand-built `configureStore({ reducer: { auth } })` in a test is a second
// store shape that drifts from this one the first time a slice or a middleware is added.
//
// Server data lives in the RTK Query cache (`api`, R-102), and pages reach it only through
// the per-page `use*` hooks in `lib/` (23 §3): those hooks changed, the pages did not.
import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { authSlice } from './authSlice.js';
import { vocabularySlice } from './vocabularySlice.js';
import { opsSlice } from './opsSlice.js';
import { uiSlice } from './uiSlice.js';
import { api } from './api/api.js';
import { opsApi } from './api/opsApi.js';
import { listenerMiddleware } from './middleware/listeners.js';
import { sessionExpiredMiddleware } from './middleware/sessionExpired.js';
import { redactPasswords } from './devtools.js';
// Registers itself on import: what sign-out clears outside the slices (R-106).
import './middleware/sessionReset.js';

/**
 * Slices that are NOT in the entry chunk. Each one is injected from the route chunk that
 * needs it (`slice.injectInto(rootReducer)`) and adds itself to this interface by module
 * augmentation, so `RootState` knows about it without this file importing its code.
 *
 * Why it matters here in particular: everything this file imports statically is downloaded
 * by every route — the respondent's phone included (`pages/respond/bundle.test.ts`). The
 * builder and wizard slices are console-only, so they arrive with the console.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by augmentation
export interface LazyLoadedSlices {}

/** Keyed by each slice's `name` (`auth`, `vocabulary`, `ops`, `ui`) and each API's
 *  `reducerPath` (`api` for the organisation, `opsApi` for the operator console). */
export const rootReducer = combineSlices(api, opsApi, authSlice, vocabularySlice, opsSlice, uiSlice)
  .withLazyLoadedSlices<LazyLoadedSlices>();

export type RootState = ReturnType<typeof rootReducer>;

export function setupStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    // Order (§5): listeners first, as the RTK docs direct; then thunk and the dev-only
    // serialisability and immutability checks; then RTK Query's cache lifecycle; then the
    // classic 401 middleware, which reads the rejected actions both APIs produce.
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .prepend(listenerMiddleware.middleware)
        .concat(api.middleware, opsApi.middleware, sessionExpiredMiddleware),
    devTools: { actionSanitizer: redactPasswords },
  });
}

export type AppStore = ReturnType<typeof setupStore>;
export type AppDispatch = AppStore['dispatch'];

/** One store per app (Redux style guide). Mounted by `<Provider>` in `App.tsx`. */
export const store = setupStore();

// Refetch what is on screen when the network comes back (`refetchOnReconnect` in `api`).
// The app's store only: a test store has no window events worth listening to.
setupListeners(store.dispatch);

// Typed once, here, so no component ever writes `(state: RootState)` or a dispatch type by
// hand. These ARE `useDispatch` / `useSelector` / `useStore` — `.withTypes()` only attaches
// this store's types — and lint (R-110) bans the untyped originals everywhere else.
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();

export * from './authSlice.js';
export * from './vocabularySlice.js';
export * from './opsSlice.js';
export * from './uiSlice.js';
