// The inbox page: which card is open, where the keyboard cursor is, and each card's failed
// mark. docs/REDUX-PLAN.md §6.10 (R-711, DEC-R03). The queue is the cache's (`getInbox`, an
// infinite query) and the tab and filters are the URL's, so a filtered queue is a link.
//
// Trace for "Mark read":
//   the card's button → `inboxMarked` (below) → `inboxApi.markInbox`, which patches the card
//   in the cache at once and puts back THAT card if the server refuses → `inboxMarked.rejected`
//   here keeps the reason, shown on the card (never a toast, 58 § States).
import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import { signedOut } from '../authSlice.js';
import { inboxApi, type InboxArgs, type MarkAction } from '../api/endpoints/inbox.js';
import { rootReducer } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

export type InboxScreenState = {
  /** The open card, as `${responseId}:${questionId}`. */
  expanded: string | null;
  /** The keyboard cursor (j / k), an index into the cards on screen. */
  cursor: number;
  /** A failed mark, by response id, shown on that card. */
  failures: Record<string, SerializedApiError>;
};

const initialState: InboxScreenState = { expanded: null, cursor: 0, failures: {} };

/**
 * Mark a card read, unread, archived or back. OPTIMISTIC: the endpoint patches the cache
 * first and reverts the one card on failure. `keep` leaves a card that no longer belongs in
 * the tab where it is (opening an unread card marks it read, and it must not vanish while
 * it is being read).
 */
export const inboxMarked = createScreenThunk(
  'inbox/inboxMarked',
  async (
    mark: { responseId: string; action: MarkAction; keep?: boolean; args: InboxArgs },
    { dispatch, rejectWithValue },
  ) => {
    try {
      await dispatch(inboxApi.endpoints.markInbox.initiate({
        responseId: mark.responseId,
        action: mark.action,
        keep: mark.keep,
        args: mark.args,
      })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

/**
 * A message from Endur, read or unread. Deliberately simpler than the queue (DEC-101): marked
 * locally first and NOT reverted, because a message that silently un-reads itself mid-read is
 * the more alarming failure; a lost mark comes back bold on the next load.
 */
export const messageMarked = createScreenThunk(
  'inbox/messageMarked',
  async (mark: { id: string; action: 'read' | 'unread' }, { dispatch }) => {
    await dispatch(inboxApi.endpoints.markMessage.initiate(mark))
      .unwrap()
      .catch(() => undefined);
  },
);

export const inboxScreenSlice = createSlice({
  name: 'inbox',
  initialState,
  reducers: {
    /** A card's header pressed: open it (closing any other), or close it. */
    cardToggled(state, action: PayloadAction<{ key: string; index: number }>) {
      const { key, index } = action.payload;
      state.expanded = state.expanded === key ? null : key;
      state.cursor = index;
    },
    /** `j` / `k`: one card down or up, within the cards on screen. */
    cursorMoved(state, action: PayloadAction<{ by: 1 | -1; count: number }>) {
      const { by, count } = action.payload;
      state.cursor = Math.min(Math.max(0, state.cursor + by), Math.max(0, count - 1));
    },
    /** A tab or a filter changed: a different queue, so nothing is open and the cursor is at
     *  the top. */
    inboxQueueChanged(state) {
      state.expanded = null;
      state.cursor = 0;
    },
    inboxLeft() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(inboxMarked.pending, (state, action) => {
        delete state.failures[action.meta.arg.responseId];
      })
      .addCase(inboxMarked.rejected, (state, action) => {
        if (action.payload) state.failures[action.meta.arg.responseId] = action.payload;
      })
      .addCase(signedOut, () => initialState);
  },
  selectors: {
    selectInboxScreen: (state) => state,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof inboxScreenSlice> {}
}

const injected = inboxScreenSlice.injectInto(rootReducer);

export const { cardToggled, cursorMoved, inboxQueueChanged, inboxLeft } = inboxScreenSlice.actions;

export const { selectInboxScreen } = injected.selectors;
