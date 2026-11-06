// Forms waiting for the signed-in person's answer, on RTK Query.
//
// The list is `GET /home/waiting`. The form itself and the submit are the RESPONDENT routes
// (`/public/campaigns/:token`), the same two the `/r/…` link uses: a members-only campaign
// answered from Home is the same submission, gated by the same session check, recorded the
// same anonymous way. Only `channel` differs.
import type { PublicCampaign, SubmitResponseBody, WaitingForm } from '@endur/shared';
import { api } from '../api.js';

export type AnswerWaitingArgs = {
  form: Pick<WaitingForm, 'campaignId' | 'token'>;
  body: SubmitResponseBody;
  /** One per form fill, reused on retry (`submitKey` in `lib/respond.ts`). */
  key: string;
};

export const waitingApi = api.injectEndpoints({
  endpoints: (build) => ({
    getWaiting: build.query<WaitingForm[], void>({
      query: () => '/home/waiting',
      transformResponse: (response: { data: WaitingForm[] }) => response.data,
      providesTags: ['Waiting'],
    }),

    getWaitingForm: build.query<PublicCampaign, string>({
      query: (token) => `/public/campaigns/${encodeURIComponent(token)}`,
      transformResponse: (response: { data: PublicCampaign }) => response.data,
    }),

    answerWaiting: build.mutation<{ responseCount: number }, AnswerWaitingArgs>({
      query: ({ form, body, key }) => ({
        url: `/public/campaigns/${encodeURIComponent(form.token)}/responses`,
        method: 'POST',
        body,
        idempotencyKey: key,
      }),
      transformResponse: (response: { data: { responseCount: number } }) => response.data,
      // `Waiting` EVEN ON A FAILURE: a 409 means it was already answered (the link, another
      // tab), and a 404 that it closed. Either way the card should go. The counts on Home
      // and the campaign's page change only when it went through.
      invalidatesTags: (result, _error, { form }) => [
        'Waiting',
        ...(result ? (['Home', { type: 'Campaign', id: form.campaignId }] as const) : []),
      ],
    }),
  }),
});

export const { useGetWaitingQuery, useGetWaitingFormQuery, useAnswerWaitingMutation } = waitingApi;
