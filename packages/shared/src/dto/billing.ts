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
  /**
   * A DOWNGRADE ASKED FOR AND NOT YET HAD — `DEC-098`. `null` is the ordinary case.
   *
   * IT IS NOT A SECOND ANSWER TO "WHAT PLAN ARE THEY ON". `tier` above is in force, is what
   * the entitlement gate decides with, and stays that way until the period ends; this is the
   * date-stamped intention beside it. The page prints one sentence from it and offers to
   * cancel; nothing else in either app may branch on it, which is `49` § Interactions'
   * requirement that the tier the customer reads and the tier the gate decides with are the
   * same column.
   */
  pendingTier: Tier | null;
  seats: number;
  /** What the meter counts, in its parts. `16` §5: a plan's size must never be a surprise. */
  seatBreakdown: { activeUsers: number; nonPersonSubjects: number };
};

/**
 * A CAPTURE, as the ledger records it. DEC-080.
 *
 * `kind` separates the write paths — `signup` is written by registration, `change` by
 * `POST /billing/tier` — because the earnings page has to answer two different questions
 * ("what did we take?" and "who is moving?") and inferring the second from a null
 * `fromTier` would be inference where a column will do.
 *
 * `expiry` IS A THIRD KIND AND IT IS NOT A CAPTURE — `DEC-098`. It is written when a scheduled
 * downgrade fires, with `amountMinor: 0`, and it exists so a plan MOVE that took no money is
 * still legible in the one table that records plan moves. `/ops/analytics` counts downgrades
 * from here (`DEC-102`) precisely because the old source counted only what OPERATORS did.
 *
 * A ZERO-AMOUNT ROW IN A LEDGER IS UNUSUAL AND IS THE POINT. The alternative is a tier that
 * changed with no record anywhere of when or why — an append-only ledger with a hole in it is
 * worse than one with a ₹0 line somebody asks about. `/ops/earnings` excludes this kind from
 * its window for the opposite reason: counting it as a payment would drag the average down
 * with events where no money moved.
 */
export type PaymentKind = 'signup' | 'change' | 'expiry';

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

/**
 * SCHEDULING A MOVE DOWN — `DEC-098`, `16` §7b.
 *
 * The tier, and nothing else. No date: the only date this can fire on is the one already on
 * the row, and letting a client name one would be a second answer to when the period ends.
 *
 * `enterprise` IS IN THE SCHEMA HERE TOO, for `JoinTierBody`'s reason: the service refuses it
 * with a sentence about how Enterprise is arranged, and a schema rejection would say "not a
 * valid tier" about a tier the page is printing a price for. It is also, always, a move UP —
 * so the rank check refuses it before the Enterprise check is ever reached.
 *
 * THERE IS NO BODY ON THE CANCEL. `DELETE /billing/downgrade` clears whatever is scheduled;
 * naming the tier would invite a caller to cancel a downgrade that had already been replaced
 * by a different one and be told it succeeded.
 */
export const ScheduleDowngradeBody = z.object({
  tier: z.enum(TIERS),
});
export type ScheduleDowngradeBody = z.infer<typeof ScheduleDowngradeBody>;

export const ScheduleDowngradeDto = dto({ body: ScheduleDowngradeBody });

/**
 * ASKING TO BE SOLD ENTERPRISE — `DEC-100`, `T-100`, `49` § Asking for Enterprise.
 *
 * THE TIER IS NOT A FIELD. There is exactly one tier a customer can ask for — the one they
 * cannot assign themselves — so naming it would be a parameter with one legal value, and the
 * first thing a reader would wonder is what happens when they send a different one.
 *
 * NOR IS WHO IS ASKING. `asked_by`, `asked_name` and `asked_email` come from the session, the
 * same way `payments.payer_name` does (INV-010: identity never arrives in a body).
 *
 * A NOTE, AND NOTHING ELSE. `DEC-100` is explicit that this is not a sales lead form: the row
 * carries who asked, which organisation, when, and one optional sentence. The conversation
 * happens off-product, which is what "arranged with us" has always meant.
 */
export const EnterpriseRequestBody = z.object({
  note: z.string().max(1000).optional(),
});
export type EnterpriseRequestBody = z.infer<typeof EnterpriseRequestBody>;

export const EnterpriseRequestDto = dto({ body: EnterpriseRequestBody });

/** What the customer's own page reads back — enough for one sentence, and no more. */
export type EnterpriseRequestState = {
  /** `null` when nothing is open. The card's verb depends on this and on nothing else. */
  requestedAt: string | null;
};

