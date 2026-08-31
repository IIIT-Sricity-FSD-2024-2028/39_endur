// The four account states, worked out in one place, so the list and the detail panel can never disagree.
// active - can sign in · invited - has a live link · disabled - was revoked · none - never had a sign-in
import type { AccountStatus } from '@endur/shared';

export type AccountFacts = {
  // Already reduced to a boolean by the caller: the password hash itself never travels.
  hasPassword: boolean;
  status: string;
  lastLoginAt: Date | null;
  disabledAt: Date | null;
  // The unaccepted invite, if there is one. At most one can exist.
  liveInvite: { expiresAt: Date; createdAt: Date } | null;
};

// The ORDER of these tests is the decision:
// 1. A working password wins, so a reset link on an active account never reads as "cannot sign in".
// 2. A live invite beats disabled, because re-inviting is how a revoked account is re-enabled.
// 3. disabled is what is left after a revoke with no new invite.
// 4. none is the ordinary case: a person who has never been given a key.
// An expired invite still reports invited and carries its date, so the screen can say so.
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
