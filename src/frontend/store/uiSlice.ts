// The toast. docs/REDUX-PLAN.md §6.8 and §6.9 (R-307).
//
// Five pages used to keep their own `useState` toast and render their own `<Toast>`. Now a
// page dispatches `toastShown`, and one `<ToastHost>` per shell reads this slice and draws
// it. That also means a toast outlives the page that raised it: "Template deleted." stays
// up after the list navigates away, instead of vanishing mid-sentence.
//
// ONE toast, not a queue. The design has one fixed place for it (bottom centre,
// `.toast` in endur.css), and a newer message has always replaced an older one; a queue
// would only make later messages wait four seconds each behind earlier ones.
//
// The toast's Undo is an ACTION OBJECT, not a function, so the state stays serialisable
// and the undo shows up in the action log like everything else. Pressing Undo dispatches it.
import { createSlice, nanoid, type PayloadAction, type UnknownAction } from '@reduxjs/toolkit';
import { signedOut } from './authSlice.js';

export type ToastItem = {
  /** Made in `prepare`. A dismissal names the toast it is for, so a timer left over from
   *  an older toast can't close a newer one. */
  id: string;
  message: string;
  /** Dispatched when the reader presses Undo; no Undo button when null. */
  undo: UnknownAction | null;
};

export type UiState = { toast: ToastItem | null };

const initialState: UiState = { toast: null };

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toastShown: {
      reducer(state, action: PayloadAction<ToastItem>) {
        state.toast = action.payload;
      },
      prepare: ({ message, undo }: { message: string; undo?: UnknownAction }) => ({
        payload: { id: nanoid(), message, undo: undo ?? null },
      }),
    },

    toastDismissed(state, action: PayloadAction<{ id: string }>) {
      if (state.toast?.id === action.payload.id) state.toast = null;
    },
  },

  // A message about one person's organisation is not for the next person in this tab.
  extraReducers: (builder) => {
    builder.addCase(signedOut, () => initialState);
  },

  selectors: {
    selectToast: (state) => state.toast,
  },
});

export const { toastShown, toastDismissed } = uiSlice.actions;
export const { selectToast } = uiSlice.selectors;
