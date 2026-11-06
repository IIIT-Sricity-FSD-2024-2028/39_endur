// Members-only forms waiting for the signed-in person's answer: the card on Home, the count
// beside Home in the sidebar, and answering from the card.
import { useCallback } from 'react';
import type { AnsweredForm, PublicCampaign, SubmitResponseBody, WaitingForm } from '@endur/shared';
import {
  useAnswerWaitingMutation,
  useGetAnsweredQuery,
  useGetWaitingFormQuery,
  useGetWaitingQuery,
} from '../store/api/endpoints/waiting.js';
import { unwrapApi, useLoadable, type Loadable } from './query.js';
import type { SubmitResult } from './respond.js';

/**
 * How often the list is re-read while the app is open. This is what makes a new form show
 * up without a reload; it is one small query, and it pauses while the tab is in the
 * background.
 */
const POLL_MS = 2 * 60 * 1000;

export type WaitingController = Loadable<WaitingForm[]> & {
  rows: WaitingForm[];
  reload: () => Promise<void>;
};

export function useWaiting(): WaitingController {
  const result = useLoadable(
    useGetWaitingQuery(undefined, { pollingInterval: POLL_MS, skipPollingIfUnfocused: true }),
    { initialOnly: true },
  );
  return { ...result, rows: result.data ?? [] };
}

/** Past feedback: the members-only forms this person has answered. That they did, never what. */
export function useAnswered(): Loadable<AnsweredForm[]> & { rows: AnsweredForm[] } {
  const result = useLoadable(useGetAnsweredQuery(), { initialOnly: true });
  return { ...result, rows: result.data ?? [] };
}

/** The form behind one card, loaded when the card is opened. */
export function useWaitingForm(token: string): Loadable<PublicCampaign> & { reload: () => Promise<void> } {
  return useLoadable(useGetWaitingFormQuery(token), { current: true });
}

/** Submits from the card. Throws the `ApiError`, so the form shows field errors inline. */
export function useAnswerWaiting(): (
  form: WaitingForm,
  body: SubmitResponseBody,
  key: string,
) => Promise<SubmitResult> {
  const [answer] = useAnswerWaitingMutation();
  return useCallback(
    async (form, body, key) => unwrapApi(answer({ form, body, key })),
    [answer],
  );
}
