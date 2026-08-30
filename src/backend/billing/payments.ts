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
import type { Tx } from '../db/tx.js';

/**
 * `signup` is written by registration; `change` by `POST /billing/tier`; `expiry` by the
 * scheduled downgrade firing on read (`DEC-098`) — which is the one kind that captures NO
 * money and is written anyway, because `payments` is the only table that records a plan MOVE
 * with a from and a to on it. Shared with the client as `@endur/shared`'s `PaymentKind`.
 */
export type PaymentKind = 'signup' | 'change' | 'expiry';

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
 */
export async function recordPayment(
  tx: Tx,
  input: {
    orgId: string;
    tier: Tier;
    fromTier?: Tier | null;
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
      amountMinor: changeCostMinor(input.fromTier ?? null, input.tier),
      currency: 'INR',
      status: 'succeeded',
      reference: input.reference?.trim() || paymentReference(),
    },
  });
}
