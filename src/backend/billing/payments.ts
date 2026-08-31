// The payment ledger's ONE writer. DEC-080.
//
// TWO CALLERS, ONE FUNCTION, and that is the point rather than an economy. Registration
// (`features/auth/service.ts`) and a plan change (`features/billing/service.ts`) capture the
// same money for the same reason, and the earnings page adds both up as one column. Two
// inserts written a fortnight apart is how the two paths start disagreeing about what a
// rupee is — one storing 99, the other 9900.
//
// THE PRICE IS READ HERE AND NOWHERE ELSE. Every caller passes a TIER; none of them passes
// an amount, and there is no parameter to pass one through. A client that posts its own
// number is posting a number nothing reads, which is what keeps a price from becoming an
// authorisation input (INV-003).
//
// SINCE DEC-097 THE AMOUNT IS THE DIFFERENCE, and the change is entirely inside this module:
// `fromTier` was already on every call, and it was already being stored — it was simply not
// being priced against. A signup has `fromTier: null` and still costs the full price, because
// there was no plan before it. That is `changeCostMinor`'s whole shape.
//
// IT TAKES A `Tx`, NEVER `prisma`. Both callers already own a transaction that writes the
// subscription row, and a capture recorded outside it could survive a rolled-back signup —
// revenue for an organisation that does not exist.
import { randomBytes } from 'node:crypto';
import { changeCostMinor, type Tier } from '@endur/shared';
import type { Prisma } from '@prisma/client';

/**
 * The transaction handle, STRUCTURALLY — naming the one model this file writes and nothing
 * else. It was `Prisma.TransactionClient`, which is the base client's handle; an EXTENDED
 * client's is a different type, and `platform/db.ts` wraps every operator write so the seam's
 * rules apply to them too. `platform/audit.ts` already carries this exact pattern and the same
 * reasoning — approving an Enterprise request (`DEC-111`) is the third caller and the first
 * one to come from the platform side.
 *
 * It also narrows rather than loosens: this module can now touch `payment` and nothing else,
 * which is a better statement of what it does than "any transaction".
 */
type Tx = {
  payment: {
    create(args: { data: Prisma.PaymentUncheckedCreateInput }): Promise<{ amountMinor: number }>;
  };
};

/**
 * `signup` is written by registration; `change` by `POST /billing/tier`; `expiry` by the
 * scheduled downgrade firing on read (`DEC-098`); `lapse` by a period ending with nobody
 * renewing (`DEC-113`). The last two capture NO money and are written anyway, because
 * `payments` is the only table that records a plan MOVE with a from and a to on it — and they
 * are two kinds rather than one because *"asked to spend less"* and *"stopped paying"* are the
 * same row and opposite facts. Shared with the client as `@endur/shared`'s `PaymentKind`.
 */
export type PaymentKind = 'signup' | 'change' | 'expiry' | 'lapse';

/**
 * A reference, minted by us.
 *
 * WE MINT ONE WHEN THE CLIENT SENT NONE, rather than leaving the column null. The row is the
 * only record the capture happened; a reference is how a human matches it to the dialog the
 * customer saw, and half the rows having one is worse than a convention nobody can rely on.
 * The prefix says plainly where it came from — nothing here pretends to be a gateway id.
 */
export const paymentReference = (): string => `endur_${randomBytes(9).toString('hex')}`;

/**
 * Record one capture. Returns the row so a caller can echo the reference back.
 *
 * `fromTier` is `null` on a signup because there was no plan before it — that is a real
 * absence and not an unknown, and the earnings page reads `kind` rather than inferring the
 * difference from this column. Since DEC-097 it is also an INPUT TO THE PRICE, so passing it
 * wrongly no longer just mislabels a row: it bills the wrong amount.
 *
 * `pricedFrom` SPLITS THE TWO JOBS `fromTier` HAD BEEN DOING — `DEC-113`. It defaults to
 * `fromTier` and only one caller passes it, so the difference rule is untouched everywhere
 * else.
 *
 * WHY IT HAD TO EXIST. `DEC-097` charges the difference because the customer ALREADY PAID for
 * the tier they are leaving. A lapse breaks that assumption: an organisation that let Gold run
 * out sits on a bronze period nobody bought, so pricing their rejoin as bronze → gold would
 * charge ₹900 for a ₹999 plan — and would keep doing it, which makes letting the plan lapse
 * every month cheaper than staying on it. The move is still recorded as bronze → gold, because
 * that is what moved; what is measured against nothing is the PRICE.
 */
export async function recordPayment(
  tx: Tx,
  input: {
    orgId: string;
    tier: Tier;
    fromTier?: Tier | null;
    /** What the price is measured against. Defaults to `fromTier`; `null` means full price. */
    pricedFrom?: Tier | null;
    kind: PaymentKind;
    payerName: string;
    payerEmail: string;
    /** What the client says it captured. A LABEL — see the header. */
    reference?: string | null;
  },
) {
  return tx.payment.create({
    data: {
      orgId: input.orgId,
      tier: input.tier,
      fromTier: input.fromTier ?? null,
      kind: input.kind,
      payerName: input.payerName,
      payerEmail: input.payerEmail,
      // PRICED SERVER-SIDE. The one line this module exists for — and since DEC-097 it
      // prices the MOVE rather than the destination, which is also what stops
      // `/ops/earnings` overstating every customer who has ever upgraded.
      amountMinor: changeCostMinor(
        input.pricedFrom === undefined ? (input.fromTier ?? null) : input.pricedFrom,
        input.tier,
      ),
      currency: 'INR',
      status: 'succeeded',
      reference: input.reference?.trim() || paymentReference(),
    },
  });
}
