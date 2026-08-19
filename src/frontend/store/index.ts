// The whole store, for two phases (23 §2). Server data is NOT here — it lives behind
// per-page `use*` hooks, so P3's move to RTK Query changes those hooks and nothing else.
import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import { authReducer } from './authSlice.js';
import { vocabularyReducer } from './vocabularySlice.js';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    vocabulary: vocabularyReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed at the seam, so no component ever writes `(state: RootState)` by hand.
export const useAppDispatch = (): AppDispatch => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export * from './authSlice.js';
export * from './vocabularySlice.js';
