// The listener middleware. docs/REDUX-PLAN.md §5, R-103.
//
// RTK's standard home for side effects that REACT to actions: "when this happens, also do
// that". The builder's autosave (R-302) and the cache reset on sign-out (R-106) live here,
// rather than in a `useEffect` or a timer inside whichever component happened to be mounted
// when the action fired.
//
// One instance for the app, added to every store `setupStore` builds. Listeners registered
// with `startAppListening` at module load therefore apply to every such store, tests
// included; a listener that only one store should have is added with `addAppListener`,
// dispatched to that store, and removed with the function the dispatch returns.
//
// The type imports below are erased at compile time, so the circle with `../index.ts` is a
// circle of types only — the documented RTK pattern, not a runtime cycle.
import { addListener, createListenerMiddleware } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from '../index.js';

export const listenerMiddleware = createListenerMiddleware();

/** `startListening`, typed with this app's state and dispatch. */
export const startAppListening = listenerMiddleware.startListening.withTypes<
  RootState,
  AppDispatch
>();
export type AppStartListening = typeof startAppListening;

/** The dispatchable form: `store.dispatch(addAppListener({ … }))` returns an unsubscribe. */
export const addAppListener = addListener.withTypes<RootState, AppDispatch>();
