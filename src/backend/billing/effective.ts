// Works out which tier is really in force today, because a period can end with nothing writing to the row.
// The entitlement gate and the plan page both call this, so they can never disagree about the tier.
import { tierRank, type Tier } from '@endur/shared';
import { periodHasEnded } from './period.js';

// The few subscription fields needed to answer the question.
export type PeriodFacts = {
  tier: string;
  pendingTier: string | null;
  periodEnd: Date;
};

// The tier in force now: the paid tier until the period ends, then a scheduled downgrade if one exists, otherwise bronze.
export function effectiveTier(row: PeriodFacts, now?: Date): Tier {
  const tier = row.tier as Tier;
  if (!periodHasEnded(row.periodEnd, now)) return tier;

  const pending = row.pendingTier as Tier | null;
  if (pending && tierRank(pending) < tierRank(tier)) return pending;
  return 'bronze';
}
