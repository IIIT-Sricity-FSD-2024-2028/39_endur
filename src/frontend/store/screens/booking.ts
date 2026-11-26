// The booking console: the list's "Add", and each bookable's page (its details, its times,
// opening, closing, deleting, and cancelling somebody's booking). docs/REDUX-PLAN.md §6.10
// (R-711, DEC-R03). The bookables and their bookings are the cache's (`bookingApi`); every
// write invalidates that bookable's tag, so the page re-reads by itself.
//
// Drafts follow the Settings rule: `null` until somebody edits, and the page shows the
// server's copy meanwhile. So no effect copies an answer into state, and a re-read never
// overwrites what is being typed. An edit carries `from` (what the page showed), used as
// the starting point when nothing had been edited yet.
//
// Trace for "Save times":
//   an edit → `slotEdited` (the draft starts from the server's slots) → Save times →
//   `slotsSaved(id)` → `bookingApi.putSlots` with the whole set → the draft goes back to
//   `null`, and the page shows the server's times again.
import { createSlice, nanoid, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { BookableSummary, SlotInput } from '@endur/shared';
import { toLocalInput } from '../../lib/when.js';
import { signedOut } from '../authSlice.js';
import { bookingApi } from '../api/endpoints/booking.js';
import { rootReducer, type RootState } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

/** One slot as the editor holds it: local date-time strings, as the inputs take them. */
export type SlotDraft = { id: string; startsAt: string; endsAt: string; capacity: number; remaining: number };

export type DetailsDraft = { name: string; description: string };

export type BookingPage = {
  slots: SlotDraft[] | null;
  details: DetailsDraft | null;
  busy: boolean;
  error: SerializedApiError | null;
  sharing: boolean;
  confirming: 'close' | 'delete' | null;
  /** Somebody's booking about to be cancelled. */
  cancelling: { id: string; name: string } | null;
};

export type BookingScreenState = {
  /** The list page's "What can people book?" */
  newName: string;
  creating: boolean;
  createError: SerializedApiError | null;
  pages: Record<string, BookingPage>;
};

const initialState: BookingScreenState = { newName: '', creating: false, createError: null, pages: {} };

const blankPage = (): BookingPage => ({
  slots: null,
  details: null,
  busy: false,
  error: null,
  sharing: false,
  confirming: null,
  cancelling: null,
});

const pageOf = (state: BookingScreenState, id: string): BookingPage => (state.pages[id] ??= blankPage());

/** The server's slots as the editor shows them. */
export const slotDraftsOf = (bookable: BookableSummary): SlotDraft[] =>
  bookable.slots.map((slot) => ({
    id: slot.id,
    startsAt: toLocalInput(slot.startsAt),
    endsAt: toLocalInput(slot.endsAt),
    capacity: slot.capacity,
    remaining: slot.remaining,
  }));

export const detailsOf = (bookable: BookableSummary): DetailsDraft => ({
  name: bookable.name,
  description: bookable.description ?? '',
});

/** On the hour after `after` (or after now): where a new time starts. */
function nextHour(after?: string): Date {
  const base = after ? new Date(after) : new Date();
  const next = new Date(base.getTime() + 60 * 60 * 1000);
  next.setMinutes(0, 0, 0);
  return next;
}

// ---- the list

/** "Add": the bookable is made with no times; the page opens it, to add some. */
export const bookableCreated = createScreenThunk(
  'booking/bookableCreated',
  async (_: void, { dispatch, getState, rejectWithValue }) => {
    const name = selectBookingScreen(getState()).newName.trim();
    try {
      const created = await dispatch(bookingApi.endpoints.createBookable.initiate({ name })).unwrap();
      return created.id;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  {
    condition: (_, { getState }) => {
      const screen = selectBookingScreen(getState());
      return !screen.creating && screen.newName.trim() !== '';
    },
  },
);

// ---- one bookable

/** No other write is in flight on this bookable: a double press sends one request. */
const idle = (state: RootState, id: string): boolean => !selectBookingScreen(state).pages[id]?.busy;

/** "Save times": the whole set replaces the old one (`PUT /slots`). */
export const slotsSaved = createScreenThunk(
  'booking/slotsSaved',
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    const drafts = selectBookingScreen(getState()).pages[id]?.slots ?? [];
    const slots: SlotInput[] = drafts.map((slot) => ({
      startsAt: new Date(slot.startsAt),
      endsAt: new Date(slot.endsAt),
      capacity: slot.capacity,
    }));
    try {
      await dispatch(bookingApi.endpoints.putSlots.initiate({ id, body: { slots } })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (id, { getState }) => idle(getState(), id) },
);

/** "Save details": the name and the description. A blank description is removed. */
export const detailsSaved = createScreenThunk(
  'booking/detailsSaved',
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    const draft = selectBookingScreen(getState()).pages[id]?.details;
    if (!draft) return undefined;
    const description = draft.description.trim();
    try {
      await dispatch(bookingApi.endpoints.updateBookable.initiate({
        id,
        body: { name: draft.name.trim(), description: description === '' ? null : description },
      })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  {
    condition: (id, { getState }) =>
      idle(getState(), id) &&
      (selectBookingScreen(getState()).pages[id]?.details?.name.trim() ?? '') !== '',
  },
);

/**
 * One idempotency key per bookable, so every press of "Open" is the same request: the server
 * answers a repeat with the first link.
 */
export const openKey = (id: string): string => `bookable-open-${id}`;

export const bookableOpened = createScreenThunk(
  'booking/bookableOpened',
  async (id: string, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(bookingApi.endpoints.openBookable.initiate({ id, key: openKey(id) })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (id, { getState }) => idle(getState(), id) },
);

/** The link stops working; every booking taken stays. */
export const bookableClosed = createScreenThunk(
  'booking/bookableClosed',
  async (id: string, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(bookingApi.endpoints.closeBookable.initiate(id)).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (id, { getState }) => idle(getState(), id) },
);

/** The times and every booking on them go. The page leaves for the list once it has. */
export const bookableDeleted = createScreenThunk(
  'booking/bookableDeleted',
  async (id: string, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(bookingApi.endpoints.deleteBookable.initiate(id)).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (id, { getState }) => idle(getState(), id) },
);

/** Somebody ELSE's booking (`booking.cancel`): the place goes back into the slot. */
export const attendeeBookingCancelled = createScreenThunk(
  'booking/attendeeBookingCancelled',
  async ({ bookableId, bookingId }: { bookableId: string; bookingId: string }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(bookingApi.endpoints.cancelBooking.initiate({ bookableId, bookingId })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: ({ bookableId }, { getState }) => idle(getState(), bookableId) },
);

/** Every write on one bookable: busy while it goes, the drafts dropped once it has landed
 *  (the page shows the server's copy again), the reason kept when it did not. */
const WRITES = [slotsSaved, detailsSaved, bookableOpened, bookableClosed, bookableDeleted] as const;

export const bookingScreenSlice = createSlice({
  name: 'booking',
  initialState,
  reducers: {
    newBookableNamed(state, action: PayloadAction<{ name: string }>) {
      state.newName = action.payload.name;
    },
    slotEdited(
      state,
      action: PayloadAction<{ id: string; index: number; patch: Partial<SlotDraft>; from: SlotDraft[] }>,
    ) {
      const { id, index, patch, from } = action.payload;
      const page = pageOf(state, id);
      // A copy, so nothing that came from the cache (frozen) is edited in place.
      const slots = (page.slots ??= from.map((draft) => ({ ...draft })));
      const slot = slots[index];
      if (slot) Object.assign(slot, patch);
    },
    slotAdded: {
      reducer(state, action: PayloadAction<{ id: string; from: SlotDraft[]; slot: SlotDraft }>) {
        const page = pageOf(state, action.payload.id);
        (page.slots ??= action.payload.from.map((draft) => ({ ...draft }))).push(action.payload.slot);
      },
      /** The new time starts on the hour after the last one ends; its id is made here. */
      prepare(payload: { id: string; from: SlotDraft[] }) {
        const last = payload.from.at(-1);
        const start = nextHour(last?.endsAt);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        return {
          payload: {
            ...payload,
            slot: {
              id: `new:${nanoid()}`,
              startsAt: toLocalInput(start.toISOString()),
              endsAt: toLocalInput(end.toISOString()),
              capacity: 1,
              remaining: 1,
            },
          },
        };
      },
    },
    slotRemoved(state, action: PayloadAction<{ id: string; index: number; from: SlotDraft[] }>) {
      const { id, index, from } = action.payload;
      const page = pageOf(state, id);
      page.slots = (page.slots ?? from).filter((_slot, position) => position !== index);
    },
    detailsEdited(
      state,
      action: PayloadAction<{ id: string; patch: Partial<DetailsDraft>; from: DetailsDraft }>,
    ) {
      const { id, patch, from } = action.payload;
      const page = pageOf(state, id);
      page.details = { ...(page.details ?? from), ...patch };
    },
    /** "Discard": back to what the server holds. */
    detailsDiscarded(state, action: PayloadAction<{ id: string }>) {
      pageOf(state, action.payload.id).details = null;
    },
    bookingShareOpened(state, action: PayloadAction<{ id: string }>) {
      pageOf(state, action.payload.id).sharing = true;
    },
    bookingShareClosed(state, action: PayloadAction<{ id: string }>) {
      pageOf(state, action.payload.id).sharing = false;
    },
    bookingConfirmOpened(state, action: PayloadAction<{ id: string; what: 'close' | 'delete' }>) {
      pageOf(state, action.payload.id).confirming = action.payload.what;
    },
    attendeeCancelAsked(state, action: PayloadAction<{ id: string; booking: { id: string; name: string } }>) {
      pageOf(state, action.payload.id).cancelling = action.payload.booking;
    },
    /** Any confirmation's Cancel. */
    bookingConfirmClosed(state, action: PayloadAction<{ id: string }>) {
      const page = pageOf(state, action.payload.id);
      page.confirming = null;
      page.cancelling = null;
    },
    bookableLeft(state, action: PayloadAction<{ id: string }>) {
      delete state.pages[action.payload.id];
    },
    bookingListLeft(state) {
      state.newName = '';
      state.creating = false;
      state.createError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bookableCreated.pending, (state) => {
        state.creating = true;
        state.createError = null;
      })
      // Still "creating" until the page has gone to the new bookable.
      .addCase(bookableCreated.fulfilled, (state) => {
        state.newName = '';
      })
      .addCase(bookableCreated.rejected, (state, action) => {
        state.creating = false;
        state.createError = action.payload ?? null;
      })
      .addCase(attendeeBookingCancelled.pending, (state, action) => {
        const page = pageOf(state, action.meta.arg.bookableId);
        page.busy = true;
        page.error = null;
        page.cancelling = null;
      })
      .addCase(attendeeBookingCancelled.fulfilled, (state, action) => {
        const page = pageOf(state, action.meta.arg.bookableId);
        page.busy = false;
        page.slots = null;
      })
      .addCase(attendeeBookingCancelled.rejected, (state, action) => {
        const page = pageOf(state, action.meta.arg.bookableId);
        page.busy = false;
        page.error = action.payload ?? null;
      });

    for (const thunk of WRITES) {
      builder
        .addCase(thunk.pending, (state, action) => {
          const page = pageOf(state, action.meta.arg);
          page.busy = true;
          page.error = null;
          page.confirming = null;
        })
        .addCase(thunk.fulfilled, (state, action) => {
          const page = pageOf(state, action.meta.arg);
          page.busy = false;
          if (thunk === detailsSaved) page.details = null;
          else page.slots = null;
        })
        .addCase(thunk.rejected, (state, action) => {
          const page = pageOf(state, action.meta.arg);
          page.busy = false;
          page.error = action.payload ?? null;
        });
    }
    builder.addCase(signedOut, () => initialState);
  },
  selectors: {
    selectBookingScreen: (state) => state,
    selectBookingPage: (state, id: string): BookingPage => state.pages[id] ?? BLANK,
  },
});

const BLANK = blankPage();

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof bookingScreenSlice> {}
}

const injected = bookingScreenSlice.injectInto(rootReducer);

export const {
  newBookableNamed,
  slotEdited,
  slotAdded,
  slotRemoved,
  detailsEdited,
  detailsDiscarded,
  bookingShareOpened,
  bookingShareClosed,
  bookingConfirmOpened,
  attendeeCancelAsked,
  bookingConfirmClosed,
  bookableLeft,
  bookingListLeft,
} = bookingScreenSlice.actions;

export const { selectBookingScreen, selectBookingPage } = injected.selectors;
