// Billing DTOs — the organisation's OWN plan. 13 § Billing, 49 § Data contract.
//
// The customer-facing half of the tier model. `platform.ts` carries the operator's half
// (`OverridePlan`), and the two must never be confused: this one changes YOUR plan and is
// decided by `billing.update`; that one changes SOMEBODY ELSE'S and is decided by
// `platform.plan.override` (19 §8).
//
// THERE IS A PRICE AND THERE IS A PAYMENT — DEC-080 supersedes DEC-035 — but NEITHER IS A
// FIELD ON THE REQUEST. The amount is read from `PLAN_OPTIONS` server-side on every write
// path, so the only new thing crossing the wire is a `paymentRef`: an opaque string the
// client generated when it ran its own simulated capture, kept so the ledger row and the
// dialog the customer saw can be matched up. Nothing authorises on it.
import { z } from 'zod';
import { dto } from './common.js';
import { TIERS, type Currency, type Tier } from '../tiers.js';

/** `subscriptions.status`. A tier is joined, never dunned, so there is no `past_due`. */
export const BillingStatus = z.enum(['trialing', 'active', 'cancelled']);
export type BillingStatus = z.infer<typeof BillingStatus>;

/**
 * The current plan, as the page reads it.
 *
 * `seats` is COMPUTED from `16` §5's formula rather than read from `subscriptions.seats`,
 * for the reason `platform/service.ts` already records: nothing has ever written that
 * column (`D-012`'s sibling), so reading it would show 0 for every organisation and look
 * like a broken meter rather than an unbuilt one. There is no seat LIMIT here either —
 * the ceiling is `T-057`'s, and a zero would render as "over your limit" for everybody.
 */
export type BillingSummary = {
  tier: Tier;
  status: BillingStatus;
  periodStart: string;
  periodEnd: string;
  seats: number;
  /** What the meter counts, in its parts. `16` §5: a plan's size must never be a surprise. */
  seatBreakdown: { activeUsers: number; nonPersonSubjects: number };
};

/**
 * A CAPTURE, as the ledger records it. DEC-080.
 *
 * `kind` separates the two write paths — `signup` is written by registration, `change` by
 * `POST /billing/tier` — because the earnings page has to answer two different questions
 * ("what did we take?" and "who is moving?") and inferring the second from a null
 * `fromTier` would be inference where a column will do.
 */
export type PaymentKind = 'signup' | 'change';

export type PaymentRecord = {
  id: string;
  at: string;
  tier: Tier;
  /** `null` on a signup — there was no plan before it. */
  fromTier: Tier | null;
  kind: PaymentKind;
  amountMinor: number;
  currency: Currency;
  /** Captured at the time. The user row may be renamed, disabled or gone later. */
  payerName: string;
  reference: string;
};

/**
 * Joining a tier. The tier, and the reference for the payment the client just simulated.
 *
 * `enterprise` is IN the schema and refused by the service, not filtered out here. A
 * validation error would say "not a valid tier" about a tier that plainly exists; the
 * service says the true thing — it is arranged with us rather than pressed (16 §4).
 *
 * `paymentRef` IS OPTIONAL, and that is deliberate rather than lax. It is a LABEL, not a
 * proof: there is no gateway to verify it against (DEC-080), so making it required would
 * dress a client-generated string up as an authorisation input and put the decision in
 * React (INV-003). A request without one still joins the tier and still writes a ledger
 * row — priced by the server — with a reference the server minted instead.
 */
export const JoinTierBody = z.object({
  tier: z.enum(TIERS),
  paymentRef: z.string().max(64).optional(),
});
export type JoinTierBody = z.infer<typeof JoinTierBody>;

export const JoinTierDto = dto({ body: JoinTierBody });
