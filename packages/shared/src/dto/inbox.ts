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

/**
 * A MESSAGE FROM ENDUR — `DEC-101`, `T-101`, `58` § From Endur.
 *
 * A SECOND STREAM, NOT A SECOND INBOX. `58` built read/unread/archived over one queue and
 * this reuses the mechanic; what it does not do is merge into it. A comment from a respondent
 * and a message from your vendor are triaged for different reasons and one queue would
 * interleave them — so it is a TAB, with its own count.
 *
 * NOTHING HERE IS A RESPONSE. This stream is why the inbox's own file comment about carrying
 * no respondent attribute stays true of BOTH tabs: a notification names a `user_id` and a
 * subject line, and there is no column on it that could reach a `responses` row.
 */
export type InboxMessage = {
  id: string;
  at: string;
  /** `platform_message` today. A value rather than a second type — `10` §5. */
  kind: string;
  subject: string;
  body: string;
  read: boolean;
};

/**
 * `state` is the SAME enum, minus `archived`. A message from your vendor has no archive
 * because there is nothing to clear it out of the way OF — the stream is a handful of rows a
 * year, not a queue that grows with every response. Passing `archived` is a 400 rather than an
 * empty list, because an empty list would look like the archive working.
 */
export const InboxMessageQuery = PageQuery.extend({
  state: z.enum(['all', 'unread', 'read']).default('all'),
});
export type InboxMessageQuery = z.infer<typeof InboxMessageQuery>;

export const InboxMessageListDto = dto({ query: InboxMessageQuery });
export const InboxMessageMarkDto = dto({ params: z.object({ id: Id }) });

