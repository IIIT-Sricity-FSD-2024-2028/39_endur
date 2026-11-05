// Booking, the PUBLIC half: the respondent's picker. 39, 13 § Booking, T-095.
//
// SPLIT FROM `lib/booking.ts` IN R-504 (the R-109 task, done with it). That file's header
// used to record keeping both halves in one file as a decision: the console and the public
// picker read the SAME `remaining` number from the same server, and one file made a second
// way of computing availability impossible. Neither half computes it, though, and the
// console half now reads through the store. This page is in the respondent tree — a phone,
// a venue network, no account — and `pages/respond/bundle.test.ts` asserts that nothing but
// React and the router reaches it: no store, no RTK Query. So the public half lives here,
// on the plain client, and must stay there.
//
// EVERY IMPORT FROM `@endur/shared` HERE IS `import type`. A value import of the DTOs would
// pull zod onto that phone before the first slot rendered.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookingReceipt, CreateBookingBody, PublicBookable } from '@endur/shared';
import { ApiError, apiGet, apiPost } from './api.js';

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
