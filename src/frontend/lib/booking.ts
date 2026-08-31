// Booking, client side. 13 § Booking, 23 §3, T-095.
//
// ONE FILE FOR BOTH SIDES, and that is a decision rather than convenience. The console half
// and the public picker read the SAME `remaining` number, produced by the same server, and
// splitting them would make it possible for one screen to compute availability a second way.
//
// EVERY IMPORT FROM `@endur/shared` HERE IS `import type`. The public booking page is in the
// respondent tree — a phone, a venue network, no account — and `pages/respond/bundle.test.ts`
// asserts that nothing but React and the router reaches it. A value import of the DTOs would
// pull zod onto that phone before the first slot rendered.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BookableSummary,
  BookingReceipt,
  BookingSummary,
  CreateBookableBody,
  CreateBookingBody,
  PublicBookable,
  PutSlotsBody,
  UpdateBookableBody,
} from '@endur/shared';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut } from './api.js';
import type { Loadable } from './org.js';

export type BookablesController = Loadable<BookableSummary[]> & {
  rows: BookableSummary[];
  /** Absent capability — a 403. The page renders a refusal, never "nothing yet". */
  forbidden: boolean;
  /** A 402. A DIFFERENT answer from a refusal (DEC-011): it names something buyable. */
  upgrade: boolean;
  reload: () => Promise<void>;
};

export function useBookables(enabled = true): BookablesController {
  const [state, setState] = useState<Loadable<BookableSummary[]>>({
    data: null,
    loading: enabled,
    error: null,
  });
  const [forbidden, setForbidden] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((current) => ({ ...current, loading: true }));
    try {
      const response = await apiGet<{ data: BookableSummary[] }>('/bookables');
      if (!alive.current) return;
      setForbidden(false);
      setUpgrade(false);
      setState({ data: response.data, loading: false, error: null });
    } catch (error) {
      if (!alive.current) return;
      const status = error instanceof ApiError ? error.status : 0;
      setForbidden(status === 403);
      setUpgrade(status === 402);
      setState({
        data: null,
        loading: false,
        // 403 and 402 are ANSWERS, not failures: the page renders each of them as its own
        // state, so neither becomes an error banner offering a retry that cannot help.
        error: status === 403 || status === 402 ? null : (error as Error),
      });
    }
  }, [enabled]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  return { ...state, rows: state.data ?? [], forbidden, upgrade, reload: load };
}

export function useBookable(id: string | undefined): {
  bookable: BookableSummary | null;
  bookings: BookingSummary[];
  loading: boolean;
  forbidden: boolean;
  upgrade: boolean;
  error: Error | null;
  reload: () => Promise<void>;
} {
  const [bookable, setBookable] = useState<BookableSummary | null>(null);
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [forbidden, setForbidden] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Both at once: the detail page has nothing useful to show with only one of them, and
      // two sequential round trips is two chances to leave the page half-drawn.
      const [row, taken] = await Promise.all([
        apiGet<{ data: BookableSummary }>(`/bookables/${id}`),
        apiGet<{ data: BookingSummary[] }>(`/bookables/${id}/bookings`),
      ]);
      if (!alive.current) return;
      setBookable(row.data);
      setBookings(taken.data);
      setForbidden(false);
      setUpgrade(false);
      setError(null);
    } catch (cause) {
      if (!alive.current) return;
      const status = cause instanceof ApiError ? cause.status : 0;
      setForbidden(status === 403);
      setUpgrade(status === 402);
      setError(status === 403 || status === 402 ? null : (cause as Error));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  return { bookable, bookings, loading, forbidden, upgrade, error, reload: load };
}

export const createBookable = async (body: CreateBookableBody): Promise<BookableSummary> =>
  (await apiPost<CreateBookableBody, { data: BookableSummary }>('/bookables', body)).data;

export const updateBookable = async (
  id: string,
  body: UpdateBookableBody,
): Promise<BookableSummary> =>
  (await apiPatch<UpdateBookableBody, { data: BookableSummary }>(`/bookables/${id}`, body)).data;

export const putSlots = async (id: string, body: PutSlotsBody): Promise<BookableSummary> =>
  (await apiPut<PutSlotsBody, { data: BookableSummary }>(`/bookables/${id}/slots`, body)).data;

/**
 * Open it, with the caller's idempotency key.
 *
 * The same shape as `launchCampaign` and `publishAnnouncement`, for the same reason: this
 * request mints a public token, and a double-click on stage must not produce two links — one
 * on the projector and the other on the card in somebody's hand.
 */
export const openBookable = async (id: string, key: string): Promise<BookableSummary> =>
  (
    await apiPost<undefined, { data: BookableSummary }>(`/bookables/${id}/open`, undefined, {
      idempotencyKey: key,
    })
  ).data;

export const openKey = (id: string): string => `bookable-open-${id}`;

export const closeBookable = async (id: string): Promise<BookableSummary> =>
  (await apiPost<undefined, { data: BookableSummary }>(`/bookables/${id}/close`)).data;

export const deleteBookable = (id: string): Promise<void> => apiDelete(`/bookables/${id}`);

/** Somebody ELSE's booking — `booking.cancel`, and the only caller of that verb. */
export const cancelBooking = (id: string): Promise<void> =>
  apiPost<undefined, void>(`/bookings/${id}/cancel`);

// ─────────────────────────────────────────────────────────────────────────────────────────
// The public half. No session, no capability — the token is the access (DEC-009).
// ─────────────────────────────────────────────────────────────────────────────────────────

export type PublicBookableState = {
  bookable: PublicBookable | null;
  loading: boolean;
  /** The uniform 404: unknown, unopened or closed, and the server refuses to say which
   *  (13 §6) — so neither can this flag. The same shape `usePublicCampaign` takes. */
  unavailable: boolean;
  error: Error | null;
  reload: () => Promise<void>;
};

export function usePublicBookable(token: string | undefined): PublicBookableState {
  const [bookable, setBookable] = useState<PublicBookable | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setUnavailable(true);
      return;
    }
    setLoading(true);
    try {
      const response = await apiGet<{ data: PublicBookable }>(`/public/bookables/${token}`);
      if (!alive.current) return;
      setBookable(response.data);
      setUnavailable(false);
      setError(null);
    } catch (cause) {
      if (!alive.current) return;
      const status = cause instanceof ApiError ? cause.status : 0;
      setUnavailable(status === 404);
      setError(status === 404 ? null : (cause as Error));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  return { bookable, loading, unavailable, error, reload: load };
}

/**
 * Take a slot, idempotently.
 *
 * The key is minted per ATTEMPT and not derived from the token, for the reason
 * `submitKey()` gives on the response side: everybody in the room holds the same token, and
 * a key derived from it would make one person's retry replay somebody else's booking.
 */
export const takeSlot = async (
  token: string,
  body: CreateBookingBody,
  key: string,
): Promise<BookingReceipt> =>
  (
    await apiPost<CreateBookingBody, { data: BookingReceipt }>(
      `/public/bookables/${token}/bookings`,
      body,
      { idempotencyKey: key },
    )
  ).data;

export const bookKey = (): string =>
  `book-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** The booker's OWN. The cancel token is the authorisation and it reaches one row. */
export const cancelWithToken = (cancelToken: string): Promise<void> =>
  apiPost<undefined, void>(`/public/bookings/${cancelToken}/cancel`);

/** A booker's own key, kept so the page can offer "cancel this" after a reload (39 § State). */
const MARKER = (token: string) => `endur.booked.${token}`;

export function rememberBooking(token: string, cancelToken: string): void {
  try {
    window.localStorage.setItem(MARKER(token), cancelToken);
  } catch {
    // Private browsing, or storage disabled. Best-effort by design: losing the marker costs
    // the booker a cancel button, and throwing here would cost them the booking.
  }
}

export function rememberedBooking(token: string): string | null {
  try {
    return window.localStorage.getItem(MARKER(token));
  } catch {
    return null;
  }
}

export function forgetBooking(token: string): void {
  try {
    window.localStorage.removeItem(MARKER(token));
  } catch {
    // As above.
  }
}
