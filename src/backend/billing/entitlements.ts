// Which tier includes which capability. 16 §3.
//
// Two things this table asserts, both deliberate:
//   - THE ENTIRE ORG-STRUCTURE AND PERMISSION SURFACE IS IN BRONZE. Correct handling of
//     who-can-see-what is in every tier, never an upgrade (01 §6). Selling privacy as a
//     paid feature would be indefensible.
//   - `simulator.run` is in Bronze too. It is the cheapest trust-builder in the product,
//     and gating it would mean the customers least able to configure permissions
//     correctly are the ones who cannot check their work (N-005).
import { CAPABILITIES, type Capability } from '@endur/shared';

export const TIERS = ['bronze', 'silver', 'gold', 'enterprise'] as const;
export type Tier = (typeof TIERS)[number];

/** `module.*` expands to every capability in that module. */
const expand = (patterns: readonly string[]): Capability[] =>
  patterns.flatMap((pattern) =>
    pattern.endsWith('.*')
      ? CAPABILITIES.filter((capability) => capability.startsWith(pattern.slice(0, -1)))
      : CAPABILITIES.filter((capability) => capability === pattern),
  );

const bronze = expand([
  'org.*', 'unit.*', 'role.*', 'grant.*', 'person.*', 'assignment.*',
  'group.*', 'delegation.*', 'subject.*', 'template.*', 'campaign.*',
  'response.read', 'results.read', 'simulator.run',
]);
const silver = [...bronze, ...expand(['analysis.read', 'results.export', 'response.export'])];
const gold = [...silver, ...expand(['reflection.*', 'actionplan.*', 'checkin.*'])];
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
