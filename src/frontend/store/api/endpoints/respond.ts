// The respondent routes on RTK Query: the form behind a link, and its submit. Used by the
// `/r/:token` page and by the forms waiting on a member's Home, which go through exactly
// these routes (only `channel` differs), so the answer is equally anonymous from both.
// docs/REDUX-PLAN.md §6.10 (R-704, DEC-R03).
//
// In the respondent graph (bundle.test.ts): it reaches `api.ts`, which the entry chunk
// already carries, and nothing of the console.
import type {
  BookingReceipt,
  CreateBookingBody,
  PublicBookable,
  PublicCampaign,
  SubmitResponseBody,
} from '@endur/shared';
import { api } from '../api.js';

export type SubmitAnswersArgs = {
  token: string;
  body: SubmitResponseBody;
  /** One per form fill, reused on retry: everyone in a room holds the same token. */
  key: string;
  /** Answering from Home: the card, Home's counts and the campaign re-read afterwards. */
  campaignId?: string | undefined;
};

export const respondApi = api.injectEndpoints({
  endpoints: (build) => ({
    /**
     * The whole form in ONE request (39, rule 7: a second request is a second chance to
     * fail on a venue network). A bad, closed or not-yet-open token is a uniform 404.
     */
    getPublicCampaign: build.query<PublicCampaign, string>({
      query: (token) => `/public/campaigns/${encodeURIComponent(token)}`,
      transformResponse: (response: { data: PublicCampaign }) => response.data,
    }),

    submitAnswers: build.mutation<{ responseCount: number }, SubmitAnswersArgs>({
      query: ({ token, body, key }) => ({
        url: `/public/campaigns/${encodeURIComponent(token)}/responses`,
        method: 'POST',
        body,
        idempotencyKey: key,
      }),
      transformResponse: (response: { data: { responseCount: number } }) => response.data,
      // From Home: `Waiting` EVEN ON A FAILURE. A 409 means it was already answered (the
      // link, another tab) and a 404 that it closed; either way the card should go. Home's
      // counts and the campaign change only when it went through. From a link: nothing is
      // cached that this changes.
      invalidatesTags: (result, _error, { campaignId }) =>
        campaignId
          ? [
            'Waiting' as const,
            ...(result ? (['Home', { type: 'Campaign', id: campaignId }] as const) : []),
          ]
          : [],
    }),

    // ---- booking, the public half (`/book/:token`). No session: the token is the access.

    /** The bookable and its upcoming slots. Unknown, unopened or closed is a uniform 404. */
    getPublicBookable: build.query<PublicBookable, string>({
      query: (token) => `/public/bookables/${encodeURIComponent(token)}`,
      transformResponse: (response: { data: PublicBookable }) => response.data,
    }),

    /**
     * Takes a slot. The key is minted per ATTEMPT, never derived from the token: everybody
     * in the room holds the same token, and a key derived from it would make one person's
     * retry replay somebody else's booking.
     */
    takeSlot: build.mutation<BookingReceipt, { token: string; body: CreateBookingBody; key: string }>({
      query: ({ token, body, key }) => ({
        url: `/public/bookables/${encodeURIComponent(token)}/bookings`,
        method: 'POST',
        body,
        idempotencyKey: key,
      }),
      transformResponse: (response: { data: BookingReceipt }) => response.data,
    }),

    /**
     * The booker's OWN. The cancel token is the authorisation, and it reaches one row.
     *
     * NOT `cancelBooking`: that is the console's (staff cancelling somebody's booking, by
     * id), and both inject into the one `api`. Under the same name the first injected won,
     * so the console's Cancel went to this route with an object for a token and got the
     * uniform 404 (found by e2e/booking.spec.ts; `endpoints.test.ts` now forbids it).
     */
    cancelOwnBooking: build.mutation<void, string>({
      query: (cancelToken) => ({
        url: `/public/bookings/${encodeURIComponent(cancelToken)}/cancel`,
        method: 'POST',
      }),
    }),
  }),
});

export const { useGetPublicCampaignQuery, useGetPublicBookableQuery } = respondApi;
