// Which tier includes which capability. 16 §3.
//
// Two things this table asserts, both deliberate:
//   - THE ENTIRE ORG-STRUCTURE AND PERMISSION SURFACE IS IN BRONZE. Correct handling of
//     who-can-see-what is in every tier, never an upgrade (01 §6). Selling privacy as a
//     paid feature would be indefensible.
//   - `simulator.run` is in Bronze too. It is the cheapest trust-builder in the product,
//     and gating it would mean the customers least able to configure permissions
//     correctly are the ones who cannot check their work (N-005).
//
// THE TIER NAMES THEMSELVES LIVE IN `packages/shared/src/tiers.ts`, not here (DEC-048). The
// sign-up picker has to render three of them with no session, so the browser needs the names;
// it must never need this map. What ships to the client is the vocabulary; what stays on the
// server is the DECISION.
import { CAPABILITIES, TIERS, type Capability, type Tier } from '@endur/shared';

export { TIERS };
export type { Tier };

/** `module.*` expands to every capability in that module. */
const expand = (patterns: readonly string[]): Capability[] =>
  patterns.flatMap((pattern) =>
    pattern.endsWith('.*')
      ? CAPABILITIES.filter((capability) => capability.startsWith(pattern.slice(0, -1)))
      : CAPABILITIES.filter((capability) => capability === pattern),
  );

// `account.*` AND `billing.*` ARE IN BRONZE, and both were in NO TIER AT ALL until 2026-08-24
// (T-088). Two different bugs wearing the same shape:
//
//   · `account.*` arrived with T-072 and the entitlement map was simply not updated. Making
//     sign-ins for your own people is the identity surface, and §3's first assertion is that
//     the whole org-structure and permission surface is in Bronze — an organisation that
//     cannot provision an account cannot use the product at any price.
//   · `billing.*` has been uncovered since T-003, and it is the worse of the two: with
//     `billing.update` in no tier, mounting `requireEntitlement` on `POST /billing/tier`
//     would 402 every attempt to leave the tier you are on. A paywall in front of the
//     upgrade button. It has never fired only because T-057 has not built the route.
//
// `tiers.test.ts` now asserts every capability in the catalogue appears in at least one tier,
// so the next module cannot be forgotten the way these two were.
const bronze = expand([
  'org.*', 'unit.*', 'role.*', 'grant.*', 'person.*', 'assignment.*',
  'group.*', 'delegation.*', 'subject.*', 'template.*', 'campaign.*',
  'account.*', 'billing.*',
  'response.read', 'results.read', 'simulator.run',
  // T-094. READ IS IN BRONZE AND THE REST IS NOT, and the split is the downgrade rule
  // (16 §7): a downgrade retains data and never deletes, so an organisation that drops to
  // bronze must still be able to READ the announcements it was already sent. What it loses
  // is the ability to write and send new ones.
  'announcement.read',
]);
const silver = [
  ...bronze,
  ...expand(['analysis.read', 'results.export', 'response.export', 'announcement.*']),
];
// T-095. `booking.*` joins GOLD, and unlike `announcement.*` NOTHING of it stays in bronze.
// The downgrade rule (16 §7) is that data is retained, never deleted — and it is: a
// downgraded organisation's bookables, slots and bookings all survive, and the PUBLIC picker
// keeps answering, because a guest holding a link did not choose the plan (16 §6, the same
// rule that keeps a suspended org's QR code alive). What the staff lose is the console.
const gold = [
  ...silver,
  ...expand(['reflection.*', 'actionplan.*', 'checkin.*', 'booking.*']),
];
const enterprise = [...gold, ...expand(['audit.read', 'apikey.*'])];

export const TIER_ENTITLEMENTS: Record<Tier, ReadonlySet<Capability>> = {
  bronze: new Set(bronze),
  silver: new Set(silver),
  gold: new Set(gold),
  enterprise: new Set(enterprise),
};

export const tierIncludes = (tier: Tier, capability: Capability): boolean =>
  TIER_ENTITLEMENTS[tier].has(capability);

/** The cheapest tier that would unlock it — what a 402 tells the caller to buy. */
export const lowestTierFor = (capability: Capability): Tier | undefined =>
  TIERS.find((tier) => tierIncludes(tier, capability));
