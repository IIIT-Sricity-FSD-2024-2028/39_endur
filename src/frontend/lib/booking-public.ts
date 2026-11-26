// Booking, the PUBLIC half: the respondent's picker. 39, 13 § Booking, T-095.
//
// SPLIT FROM `lib/booking.ts` IN R-504 (the R-109 task, done with it): this page is in the
// respondent tree — a phone, a venue network, no account — so it may reach nothing of the
// console (`pages/respond/bundle.test.ts`).
//
// Since R-704 (DEC-R03) the read is RTK Query (`store/api/endpoints/respond.ts`) and taking
// or cancelling a slot is a thunk in `store/screens/respond.ts`. What is left here is the
// read's page-facing shape and the device marker.
//
// EVERY IMPORT FROM `@endur/shared` HERE IS `import type`. A value import of the DTOs would
// pull zod onto that phone before the first slot rendered.
import type { PublicBookable } from '@endur/shared';
import { ApiError } from './api.js';
import { pageErrorOf } from '../store/screens/common.js';
import { useGetPublicBookableQuery } from '../store/api/endpoints/respond.js';

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
  const result = useGetPublicBookableQuery(token ?? '', { skip: !token });
  const plain = typeof result.error === 'object' && result.error !== null && 'kind' in result.error
    ? (result.error as Parameters<typeof pageErrorOf>[0])
    : undefined;
  const error = pageErrorOf(plain);
  const notFound = error instanceof ApiError && error.status === 404;
  const reload = async (): Promise<void> => {
    if (token) await result.refetch();
  };
  if (!token) return { bookable: null, loading: false, unavailable: true, error: null, reload };
  return {
    bookable: result.data ?? null,
    loading: result.isLoading,
    unavailable: notFound,
    error: notFound ? null : error,
    reload,
  };
}

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
