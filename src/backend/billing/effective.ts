// WHICH TIER IS ACTUALLY IN FORCE, given a subscription row and today's date. DEC-113, 16 §7d.
//
// WHY THIS IS A FUNCTION AND NOT A COLUMN READ. A period that has ended is a fact the row
// already carries — `period_end` is in the past — and until `DEC-113` nothing read it. So a
// Gold organisation whose month ran out kept Gold: `requireEntitlement` selected `tier` alone,
// `readBilling` returned early unless a downgrade had been SCHEDULED, and the product went on
// serving a plan nobody had paid for, indefinitely, with `period_end` frozen in the past. That
// is the bug this file closes, and it was reported as *"on plan expiration, nothing happens."*
//
// TWO CALLERS, ONE ANSWER, AND THAT IS THE WHOLE DESIGN.
//
//   · `middleware/requireEntitlement.ts` calls it and DOES NOT WRITE. It is on the hot path of
//     every gated request, including GETs, and a gate that writes is a gate that can fail for
//     reasons that have nothing to do with the question it was asked.
//   · `features/billing/service.ts` `readBilling` calls it and DOES write — it moves the row,
//     records the move in `payments`, and starts the next period.
//
// So the row catches up whenever somebody opens the plan page, and until then the gate already
// behaves as if it had. `49` § Interactions requires that the tier the customer reads and the
// tier the gate decides with are the same answer; before this file they were the same COLUMN,
// which was a stronger-looking property that quietly stopped being true the moment a period
// ended. Deriving both from one function is what actually keeps it.
//
// IT SUPERSEDES ONE SENTENCE OF DEC-098 — *"`pending_tier` is never consulted by
// `requireEntitlement`"* — and keeps the property that sentence was protecting. The gate now
// consults it, through here, and cannot reach a different conclusion from the page because the
// conclusion is computed once.
import { tierRank, type Tier } from '@endur/shared';
import { periodHasEnded } from './period.js';

/** What a subscription row has to carry for the question to be answerable. */
export type PeriodFacts = {
  tier: string;
  pendingTier: string | null;
  periodEnd: Date;
};

/**
 * The tier in force right now.
 *
 * WHILE THE PERIOD RUNS IT IS THE COLUMN, unchanged, and that is every ordinary call. A
 * scheduled downgrade does not move anything early — the customer paid for this period and
 * holds it to its last day (`periodHasEnded` is inclusive of that day, deliberately).
 *
 * ONCE IT HAS ENDED, TWO OUTCOMES:
 *
 *   · a scheduled move down applies — the customer asked for this and named the tier;
 *   · otherwise it is BRONZE. `16` §7 has said *"expiry moves the org to Bronze, never to zero
 *     access"* since long before anything implemented it. Never zero: an organisation that
 *     stopped paying still reads its own history, still collects responses, still answers the
 *     QR codes already in the world. Respondents did not choose the plan (`16` §6).
 *
 * A STALE PENDING TIER — one that is no longer BELOW the current tier, which can only happen if
 * something wrote the row outside `joinTier` — falls through to bronze rather than being
 * honoured. Moving an organisation UP for free because of a months-old request is the one
 * outcome nobody asked for, and the period has ended either way.
 */
export function effectiveTier(row: PeriodFacts, now?: Date): Tier {
  const tier = row.tier as Tier;
  if (!periodHasEnded(row.periodEnd, now)) return tier;

  const pending = row.pendingTier as Tier | null;
  if (pending && tierRank(pending) < tierRank(tier)) return pending;
  return 'bronze';
}
