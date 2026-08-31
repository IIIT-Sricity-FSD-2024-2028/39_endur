// Which plan tier includes which capability. Structure and permissions stay in Bronze and are never sold as an upgrade.
import { CAPABILITIES, TIERS, type Capability, type Tier } from '@endur/shared';

export { TIERS };
export type { Tier };

// Expands a pattern such as 'org.*' into every capability in that module.
const expand = (patterns: readonly string[]): Capability[] =>
  patterns.flatMap((pattern) =>
    pattern.endsWith('.*')
      ? CAPABILITIES.filter((capability) => capability.startsWith(pattern.slice(0, -1)))
      : CAPABILITIES.filter((capability) => capability === pattern),
  );

// Bronze: everything needed to run the organisation - structure, people, permissions, campaigns, accounts and billing.
const bronze = expand([
  'org.*', 'unit.*', 'role.*', 'grant.*', 'person.*', 'assignment.*',
  'group.*', 'delegation.*', 'subject.*', 'template.*', 'campaign.*',
  'account.*', 'billing.*',
  'response.read', 'results.read', 'simulator.run',
  // Reading announcements stays in bronze, because a downgrade never takes data away; only sending needs more.
  'announcement.read',
]);
// Silver adds analysis, exports and sending announcements.
const silver = [
  ...bronze,
  ...expand(['analysis.read', 'results.export', 'response.export', 'announcement.*']),
];
// Gold adds bookings. On a downgrade the data and the public picker survive; only the staff console is lost.
const gold = [
  ...silver,
  ...expand(['reflection.*', 'actionplan.*', 'checkin.*', 'booking.*']),
];
// Enterprise adds the audit log and API keys.
const enterprise = [...gold, ...expand(['audit.read', 'apikey.*'])];

// The lookup table the gate uses: tier -> the capabilities it includes.
export const TIER_ENTITLEMENTS: Record<Tier, ReadonlySet<Capability>> = {
  bronze: new Set(bronze),
  silver: new Set(silver),
  gold: new Set(gold),
  enterprise: new Set(enterprise),
};

// Does this tier include this capability?
export const tierIncludes = (tier: Tier, capability: Capability): boolean =>
  TIER_ENTITLEMENTS[tier].has(capability);

// The cheapest tier that would unlock a capability - what a 402 tells the caller to buy.
export const lowestTierFor = (capability: Capability): Tier | undefined =>
  TIERS.find((tier) => tierIncludes(tier, capability));
