// Members-only forms waiting for the signed-in person's answer: the card on Home, the count
// beside Home in the sidebar, and answering from the card.
import type { AnsweredForm, PublicCampaign, WaitingForm } from '@endur/shared';
import { useGetAnsweredQuery, useGetWaitingQuery } from '../store/api/endpoints/waiting.js';
import { useGetPublicCampaignQuery } from '../store/api/endpoints/respond.js';
import { useLoadable, type Loadable } from './query.js';

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

/**
 * The form behind one card, loaded when the card is opened: the respondent route the link
 * uses, one cache entry per token. Answering it is <RespondForm>'s thunk.
 */
export function useWaitingForm(token: string): Loadable<PublicCampaign> & { reload: () => Promise<void> } {
  return useLoadable(useGetPublicCampaignQuery(token), { current: true });
}
