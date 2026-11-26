// Forms waiting for the signed-in person's answer, on RTK Query.
//
// The list is `GET /home/waiting`. The form itself and the submit are the RESPONDENT routes
// (`/public/campaigns/:token`, store/api/endpoints/respond.ts), the same two the `/r/…` link
// uses: a members-only campaign answered from Home is the same submission, gated by the same
// session check, recorded the same anonymous way. Only `channel` differs.
import type { AnsweredForm, WaitingForm } from '@endur/shared';
import { api } from '../api.js';

export const waitingApi = api.injectEndpoints({
  endpoints: (build) => ({
    getWaiting: build.query<WaitingForm[], void>({
      query: () => '/home/waiting',
      transformResponse: (response: { data: WaitingForm[] }) => response.data,
      providesTags: ['Waiting'],
    }),

    // Past feedback. Under the same tag, so answering a card moves it here in the same refresh.
    getAnswered: build.query<AnsweredForm[], void>({
      query: () => '/home/answered',
      transformResponse: (response: { data: AnsweredForm[] }) => response.data,
      providesTags: ['Waiting'],
    }),
  }),
});

export const { useGetWaitingQuery, useGetAnsweredQuery } = waitingApi;
