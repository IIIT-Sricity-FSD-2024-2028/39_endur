// Booking, the CONSOLE half. 13 § Booking, 23 §3, T-095.
//
// The public picker moved to `lib/booking-public.ts` in R-504: it is in the respondent
// tree, which no store code may reach, and this half now reads through RTK Query
// (`store/api/endpoints/booking.ts`). Both still read the SAME `remaining` number from the
// same server; neither computes it.
//
// Its commands are a hook now (`useBookableCommands`) rather than free functions, because a
// command that goes through the store needs the store's `dispatch`. Each resolves with what
// the server answered, as before, and re-reads what it changed by itself.
import { useCallback } from 'react';
import type {
  BookableSummary,
  BookingSummary,
  CreateBookableBody,
  PutSlotsBody,
  UpdateBookableBody,
} from '@endur/shared';
import { ApiError } from './api.js';
import {
  useCancelBookingMutation,
  useCloseBookableMutation,
  useCreateBookableMutation,
  useDeleteBookableMutation,
  useGetBookableQuery,
  useGetBookablesQuery,
  useGetBookingsQuery,
  useOpenBookableMutation,
  usePutSlotsMutation,
  useUpdateBookableMutation,
} from '../store/api/endpoints/booking.js';
import { unwrapApi, useLoadable, type Loadable } from './query.js';

/**
 * 403 and 402 are ANSWERS, not failures: the page renders each as its own state, so
 * neither becomes an error banner offering a retry that cannot help. A 402 is a DIFFERENT
 * answer from a refusal (DEC-011): it names something buyable.
 */
function answerOf(error: Error | null): { forbidden: boolean; upgrade: boolean; error: Error | null } {
  const status = error instanceof ApiError ? error.status : 0;
  return {
    forbidden: status === 403,
    upgrade: status === 402,
    error: status === 403 || status === 402 ? null : error,
  };
}

export type BookablesController = Loadable<BookableSummary[]> & {
  rows: BookableSummary[];
  /** Absent capability — a 403. The page renders a refusal, never "nothing yet". */
  forbidden: boolean;
  /** A 402. A DIFFERENT answer from a refusal (DEC-011): it names something buyable. */
  upgrade: boolean;
  reload: () => Promise<void>;
};

export function useBookables(enabled = true): BookablesController {
  const list = useLoadable(useGetBookablesQuery(undefined, { skip: !enabled }));
  if (!enabled) {
    return {
      data: null, loading: false, error: null, rows: [], forbidden: false, upgrade: false,
      reload: list.reload,
    };
  }
  const answer = answerOf(list.error);
  // On a refusal there is nothing to show, not the last list somebody else could see.
  const data = answer.forbidden || answer.upgrade ? null : list.data;
  return { ...list, ...answer, data, rows: data ?? [] };
}

/**
 * One bookable and its bookings. Both are read at once: the detail page has nothing useful
 * to show with only one of them. Moving to another bookable never shows the last one.
 */
export function useBookable(id: string | undefined): {
  bookable: BookableSummary | null;
  bookings: BookingSummary[];
  loading: boolean;
  forbidden: boolean;
  upgrade: boolean;
  error: Error | null;
  reload: () => Promise<void>;
} {
  const bookable = useLoadable(useGetBookableQuery(id ?? '', { skip: !id }), { current: true });
  const bookings = useLoadable(useGetBookingsQuery(id ?? '', { skip: !id }), { current: true });
  const { reload: reloadBookable } = bookable;
  const { reload: reloadBookings } = bookings;

  const reload = useCallback(async () => {
    await Promise.all([reloadBookable(), reloadBookings()]);
  }, [reloadBookable, reloadBookings]);

  const answer = answerOf(bookable.error ?? bookings.error);
  return {
    bookable: bookable.data,
    bookings: bookings.data ?? [],
    loading: Boolean(id) && (bookable.loading || bookings.loading),
    ...answer,
    reload,
  };
}

/** The list page's one command. Resolves with the new bookable, which the page opens. */
export function useCreateBookable(): (body: CreateBookableBody) => Promise<BookableSummary> {
  const [createBookable] = useCreateBookableMutation();
  return useCallback((body: CreateBookableBody) => unwrapApi(createBookable(body)), [createBookable]);
}

export type BookableCommands = {
  update: (body: UpdateBookableBody) => Promise<BookableSummary>;
  putSlots: (body: PutSlotsBody) => Promise<BookableSummary>;
  /** With the caller's idempotency key (`openKey`). */
  open: (key: string) => Promise<BookableSummary>;
  close: () => Promise<BookableSummary>;
  remove: () => Promise<void>;
  /** Somebody ELSE's booking — `booking.cancel`, and the only caller of that verb. */
  cancelBooking: (bookingId: string) => Promise<void>;
};

/** The detail page's commands, for one bookable. */
export function useBookableCommands(id: string): BookableCommands {
  const [updateBookable] = useUpdateBookableMutation();
  const [putSlots] = usePutSlotsMutation();
  const [openBookable] = useOpenBookableMutation();
  const [closeBookable] = useCloseBookableMutation();
  const [deleteBookable] = useDeleteBookableMutation();
  const [cancelBooking] = useCancelBookingMutation();

  return {
    update: useCallback((body: UpdateBookableBody) => unwrapApi(updateBookable({ id, body })), [id, updateBookable]),
    putSlots: useCallback((body: PutSlotsBody) => unwrapApi(putSlots({ id, body })), [id, putSlots]),
    open: useCallback((key: string) => unwrapApi(openBookable({ id, key })), [id, openBookable]),
    close: useCallback(() => unwrapApi(closeBookable(id)), [id, closeBookable]),
    remove: useCallback(() => unwrapApi(deleteBookable(id)), [id, deleteBookable]),
    cancelBooking: useCallback(
      (bookingId: string) => unwrapApi(cancelBooking({ bookingId, bookableId: id })),
      [id, cancelBooking],
    ),
  };
}

/**
 * The idempotency key for opening one bookable. Derived from the id, so every press of
 * "Open" for it is the same request: the server answers a repeat with the first link.
 */
export const openKey = (id: string): string => `bookable-open-${id}`;
