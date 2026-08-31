// ONE DEFINITION, TWO SCREENS. `71`'s decision 4: `orgsQuiet30d` must match, exactly, the
// estate list `70` produces for the same filter — a support operator opening the estate list
// from the analytics "quiet" figure must see the same organisations counted, or the two
// screens disagree in front of a customer.
//
// Lives in `shared` rather than in either app: `src/frontend/components/platform/OrgRow.tsx`
// evaluates it per row for the "Quiet" chip and `src/backend/features/platform/service.ts`
// evaluates it estate-wide for the analytics count, and a predicate imported twice cannot
// drift the way two independent implementations of "quiet" eventually would.

/** An organisation "quiet" needs both fields — never for one that has never collected: that
 *  is onboarding, not churn, and conflating them wastes a support conversation (`70`). */
export function isQuietOrg(org: { responsesLast30d: number; lastActivityAt: string | null }): boolean {
  return org.responsesLast30d === 0 && org.lastActivityAt !== null;
}
