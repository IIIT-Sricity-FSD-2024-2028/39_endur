// The only writer of the payment ledger, and the only place a price is worked out.
// Callers pass a tier and never an amount, so a client can never decide what it pays.
import { randomBytes } from 'node:crypto';
import { changeCostMinor, type Tier } from '@endur/shared';
import type { Prisma } from '@prisma/client';

// The transaction handle, narrowed to the one table this file writes.
type Tx = {
  payment: {
    create(args: { data: Prisma.PaymentUncheckedCreateInput }): Promise<{ amountMinor: number }>;
  };
};

// Kinds of row: a signup, a plan change, an expiry downgrade, or a lapse when nobody renewed.
export type PaymentKind = 'signup' | 'change' | 'expiry' | 'lapse';

// Mints our own reference, such as endur_ab12cd, for when the client sent none.
export const paymentReference = (): string => `endur_${randomBytes(9).toString('hex')}`;

// Records one payment and returns the row. The amount charged is the difference between the old and the new tier.
export async function recordPayment(
  tx: Tx,
  input: {
    orgId: string;
    tier: Tier;
    fromTier?: Tier | null;
    // What the price is measured against. Defaults to fromTier; null means charge the full price.
    pricedFrom?: Tier | null;
    kind: PaymentKind;
    payerName: string;
    payerEmail: string;
    // Whatever reference the client says it captured. A label only.
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
      // Priced here on the server, from the move itself - the one line this module exists for.
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
