// The response inbox. 58, 13 § Inbox.
//
// A triage queue over free-text comments. The shape here is deliberately thin, and the
// things it does NOT carry are the point:
//
//   · no respondent attribute of any kind, because `responses` has no column that could
//     supply one and never will (INV-006);
//   · no sentiment, emotion, intent or topic — those need the Analyze layer (43, P3) and
//     a field nothing can fill is a field somebody stubs.
import { z } from 'zod';
import { dto } from './common.js';
import { Id, PageQuery } from './common.js';

/**
 * `state` defaults to **unread**, not `all`. The queue's purpose is what is new since last
 * time; opening on everything makes it a second results page (58).
 *
 * `all` means everything NOT archived. Archived is its own tab, and an archive click that
 * left the card sitting in All would be an archive click that did nothing.
 */
export const InboxState = z.enum(['all', 'unread', 'read', 'archived']);
export type InboxState = z.infer<typeof InboxState>;

export const InboxQuery = PageQuery.extend({
  state: InboxState.default('unread'),
  campaignId: Id.optional(),
  subjectId: Id.optional(),
});
export type InboxQuery = z.infer<typeof InboxQuery>;

export const InboxListDto = dto({ query: InboxQuery });
export const InboxMarkDto = dto({ params: z.object({ responseId: Id }) });

export type InboxResponse = {
  /**
   * THE RESPONSE id, not the card's. `inbox_state` is keyed `(user_id, response_id)` and
   * the routes are `/inbox/:responseId/read`, so this is what marks anything.
   *
   * A response answering two free-text questions therefore produces two cards that share
   * one read state, which is correct — "I have dealt with this response" is one fact, not
   * two. `questionId` exists so those two cards still have distinct keys.
   */
  id: string;
  questionId: string;
  at: string;
  campaign: { id: string; name: string };
  subject: { id: string; name: string } | null;
  /** The free-text answer itself. */
  comment: string;
  /** Which question drew it. A comment without its question is a quote without context. */
  questionText: string;
  /**
   * The rating on the SAME response, if it had one — never an average and never inferred.
   * *"3/5 · the projector in Room 4 has never worked"* is one person's whole opinion, and
   * that is the only reason a number belongs on a comment card at all.
   */
  score: number | null;
  /** That rating's scale. A 3 means nothing without knowing whether the top is 5 or 10. */
  scoreMax: number | null;
  read: boolean;
  archived: boolean;
};
