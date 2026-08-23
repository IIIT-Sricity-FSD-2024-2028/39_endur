// `AccountStatus` — the four states, derived in ONE place. 57 § States.
//
// It lives here rather than in people/service.ts because both the list and the detail read
// it, and because the ORDER of the four tests is a product decision rather than a mapping
// detail. Two copies would eventually order them differently, and the symptom would be a
// row that says one thing in the table and another in the panel.
import type { AccountStatus } from '@endur/shared';

export type AccountFacts = {
  /** Reduced to a boolean by the caller. The hash itself never travels. */
  hasPassword: boolean;
  status: string;
  lastLoginAt: Date | null;
  disabledAt: Date | null;
  /** The unaccepted invite, if there is one. At most one exists — a partial unique index. */
  liveInvite: { expiresAt: Date; createdAt: Date } | null;
};

/**
 * THE ORDER IS THE DECISION, and each step is picked so the answer cannot be a lie.
 *
 * 1 · A password beats everything. `account.reset` on an ACTIVE account (somebody who
 *     forgot theirs) mints a live invite while the old password still works — it is not
 *     replaced until activation. Reporting `invited` there would tell an administrator
 *     that a colleague cannot sign in when they can. The load-bearing fact is "this
 *     account opens the door", so it is tested first.
 *
 * 2 · A live invite beats `disabled`. Re-issuing on a revoked account is exactly how 57
 *     says re-enabling works; between the re-issue and the activation the truthful state
 *     is "waiting for them", not "revoked". Both states mean the same thing about access
 *     — the hash is null and nobody can sign in — so nothing is hidden by preferring the
 *     one that says what happens next.
 *
 * 3 · `disabled` is what is left when somebody was revoked and nobody re-invited them.
 *
 * 4 · `none` is the ordinary case for most of the graph: a person exists, has positions,
 *     and has never been given a key. `createPerson()` writes their `users` row with a
 *     null hash, so this is a state the product is full of, not an error.
 *
 * An EXPIRED live invite still reports `invited`, carrying its past `expiresAt`. The union
 * has no fifth state and does not need one: the date is in the payload and the screen can
 * read it, where a server-side `expired` state would have to be recomputed on every render
 * anyway to stay true.
 */
export function accountStatusOf(facts: AccountFacts): AccountStatus {
  if (facts.hasPassword) {
    return { state: 'active', lastLoginAt: facts.lastLoginAt?.toISOString() ?? null };
  }
  if (facts.liveInvite) {
    return {
      state: 'invited',
      expiresAt: facts.liveInvite.expiresAt.toISOString(),
      invitedAt: facts.liveInvite.createdAt.toISOString(),
    };
  }
  if (facts.status === 'disabled') {
    // `disabledAt` is written by the revoke path and by nothing else, so a row disabled by
    // hand has no date. NULL rather than a substitute: `createdAt` would be a fabrication
    // on the one line that exists to say when access ended, and the screen can say
    // "Disabled" without a date perfectly well.
    return { state: 'disabled', disabledAt: facts.disabledAt?.toISOString() ?? null };
  }
  return { state: 'none' };
}
