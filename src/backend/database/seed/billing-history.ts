// THE PAYMENT HISTORY A SEEDED ORGANISATION ARRIVES WITH.
//
// WHY THIS FILE EXISTS. Every path in the running product that moves an organisation onto a
// paid tier writes a payment row in the same transaction as the tier itself — `auth/service.ts`
// on join, `billing/service.ts` on a plan change, `platform/service.ts` on an Enterprise
// approval. The seeds were the one writer that skipped it: they created the `Subscription` row
// directly and nothing else. The estate that produced was four organisations sitting on paid
// tiers having never been charged a rupee, and an earnings page that answered "₹500 lifetime"
// across two Enterprise customers. The page was right; the data was a lie.
//
// SO THE SEED NOW SEEDS THE JOURNEY, NOT THE DESTINATION. An organisation did not appear on
// Gold — it joined on Bronze and upgraded, and both of those are captures. Writing them means
// the revenue chart, the tier-over-time series, the recent-payments list and the lifetime total
// all have something true to show, from the same ledger the product writes to at runtime.
//
// IT PRICES NOTHING ITSELF. Every row goes through `recordPayment`, which is "the only place a
// price is worked out" — the seed names a move and gets the move's cost. A hand-priced demo row
// is a number nobody can check against the plan catalogue, and it would drift the first time a
// tier's price changed.
import { type Tier } from '@endur/shared';
import { recordPayment, type PaymentKind } from '../../billing/payments.js';

/** The transaction handle `recordPayment` needs. `PrismaClient` satisfies it, so the seed can pass its own. */
type Tx = Parameters<typeof recordPayment>[0];

// EVERY ORGANISATION JOINS ON BRONZE, because that is what the join flow actually offers and
// because a signup row priced at the destination tier would say somebody bought Enterprise off
// the public sign-up page, which no code path allows.
const JOINS_ON: Tier = 'bronze';

/** One step of an organisation's billing past: what moved, and how long ago. */
type Step = { kind: PaymentKind; fromTier: Tier | null; tier: Tier; monthsAgo: number };

/**
 * The steps that land an organisation on `tier`.
 *
 * SPREAD ACROSS THE YEAR RATHER THAN STAMPED TODAY, because the earnings page defaults to a
 * twelve-month window and a chart with every rupee in the newest bucket is a chart that proves
 * the query ran. Ten months and four months are inside that window with room either side.
 *
 * THE TWO ROWS SUM TO THE FULL PRICE OF THE TIER, and that is `changeCostMinor` doing it rather
 * than arithmetic here: joining costs ₹99, and an upgrade costs the difference. An organisation
 * on Gold has therefore paid exactly Gold's ₹999, which is the property that makes the seeded
 * lifetime total a figure somebody can check by hand against the plan catalogue.
 */
export function historyFor(tier: Tier): Step[] {
  const signup: Step = { kind: 'signup', fromTier: null, tier: JOINS_ON, monthsAgo: 10 };
  if (tier === JOINS_ON) return [signup];
  return [signup, { kind: 'change', fromTier: JOINS_ON, tier, monthsAgo: 4 }];
}

/** `monthsAgo` as a real date. Mid-month, so a month bucket is never ambiguous at its edges. */
const monthsBack = (months: number, now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 15, 10, 0, 0));

/**
 * Writes one organisation's whole billing past. Called right after its `Subscription` row, in
 * the same place and the same order the product writes the two.
 */
export async function seedBillingHistory(
  tx: Tx,
  input: { orgId: string; tier: Tier; payerName: string; payerEmail: string },
  now: Date = new Date(),
): Promise<void> {
  for (const step of historyFor(input.tier)) {
    await recordPayment(tx, {
      orgId: input.orgId,
      tier: step.tier,
      fromTier: step.fromTier,
      kind: step.kind,
      payerName: input.payerName,
      payerEmail: input.payerEmail,
      at: monthsBack(step.monthsAgo, now),
    });
  }
}
