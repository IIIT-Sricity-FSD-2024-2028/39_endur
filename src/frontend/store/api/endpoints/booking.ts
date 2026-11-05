// Booking, the console half, on RTK Query. 13 § Booking; docs/REDUX-PLAN.md (R-504).
//
// The public picker is NOT here and never will be: it is in the respondent tree, which no
// store code may reach (`lib/booking-public.ts`, `pages/respond/bundle.test.ts`).
//
// Tags: each bookable is `{ Bookable, id }`, covering its detail and its bookings, since a
// change to either changes what the detail page shows (a cancel frees a place, so the
// counts move); the list is `{ Bookable, LIST }`, whose rows carry `booked` too.
import type {
  BookableSummary,
  BookingSummary,
  CreateBookableBody,
  PutSlotsBody,
  UpdateBookableBody,
} from '@endur/shared';
import { api } from '../api.js';

const LIST = { type: 'Bookable', id: 'LIST' } as const;
const one = (id: string) => [{ type: 'Bookable' as const, id }, LIST];

type Wrapped<T> = { data: T };
const unwrap = <T,>(response: Wrapped<T>): T => response.data;

export const bookingApi = api.injectEndpoints({
  endpoints: (build) => ({
    getBookables: build.query<BookableSummary[], void>({
      query: () => '/bookables',
      transformResponse: unwrap<BookableSummary[]>,
      providesTags: (rows) => [
        ...(rows?.map((row) => ({ type: 'Bookable' as const, id: row.id })) ?? []),
        LIST,
      ],
    }),

    getBookable: build.query<BookableSummary, string>({
      query: (id) => `/bookables/${id}`,
      transformResponse: unwrap<BookableSummary>,
      providesTags: (_result, _error, id) => [{ type: 'Bookable', id }],
    }),

    getBookings: build.query<BookingSummary[], string>({
      query: (id) => `/bookables/${id}/bookings`,
      transformResponse: unwrap<BookingSummary[]>,
      providesTags: (_result, _error, id) => [{ type: 'Bookable', id }],
    }),

    createBookable: build.mutation<BookableSummary, CreateBookableBody>({
      query: (body) => ({ url: '/bookables', method: 'POST', body }),
      transformResponse: unwrap<BookableSummary>,
      invalidatesTags: [LIST],
    }),

    updateBookable: build.mutation<BookableSummary, { id: string; body: UpdateBookableBody }>({
      query: ({ id, body }) => ({ url: `/bookables/${id}`, method: 'PATCH', body }),
      transformResponse: unwrap<BookableSummary>,
      invalidatesTags: (_result, _error, { id }) => one(id),
    }),

    putSlots: build.mutation<BookableSummary, { id: string; body: PutSlotsBody }>({
      query: ({ id, body }) => ({ url: `/bookables/${id}/slots`, method: 'PUT', body }),
      transformResponse: unwrap<BookableSummary>,
      invalidatesTags: (_result, _error, { id }) => one(id),
    }),

    /**
     * Opening mints a public token, so it carries the caller's idempotency key: a
     * double-click on stage must not produce two links, one on the projector and the other
     * on the card in somebody's hand. The same shape as launching a campaign.
     */
    openBookable: build.mutation<BookableSummary, { id: string; key: string }>({
      query: ({ id, key }) => ({ url: `/bookables/${id}/open`, method: 'POST', idempotencyKey: key }),
      transformResponse: unwrap<BookableSummary>,
      invalidatesTags: (_result, _error, { id }) => one(id),
    }),

    closeBookable: build.mutation<BookableSummary, string>({
      query: (id) => ({ url: `/bookables/${id}/close`, method: 'POST' }),
      transformResponse: unwrap<BookableSummary>,
      invalidatesTags: (_result, _error, id) => one(id),
    }),

    // The list only: re-reading the deleted bookable would be a 404 on the page that is
    // about to navigate away from it.
    deleteBookable: build.mutation<void, string>({
      query: (id) => ({ url: `/bookables/${id}`, method: 'DELETE' }),
      invalidatesTags: [LIST],
    }),

    /** Somebody ELSE's booking (`booking.cancel`). Its place goes back into the slot. */
    cancelBooking: build.mutation<void, { bookingId: string; bookableId: string }>({
      query: ({ bookingId }) => ({ url: `/bookings/${bookingId}/cancel`, method: 'POST' }),
      invalidatesTags: (_result, _error, { bookableId }) => one(bookableId),
    }),
  }),
});

export const {
  useGetBookablesQuery,
  useGetBookableQuery,
  useGetBookingsQuery,
  useCreateBookableMutation,
  useUpdateBookableMutation,
  usePutSlotsMutation,
  useOpenBookableMutation,
  useCloseBookableMutation,
  useDeleteBookableMutation,
  useCancelBookingMutation,
} = bookingApi;
