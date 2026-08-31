// The PLATFORM capability catalogue — Endur's own side of the product. 19 §4.
//
// SEPARATE FROM `capabilities.ts`, AND THE SEPARATION IS THE POINT. If these strings
// entered CAPABILITY_CATALOGUE then the per-module wildcard expansion in TIER_ENTITLEMENTS
// would sweep them up, the powers grid (33) would render them as assignable rows, and an
// organisation administrator could be granted `platform.analytics.read`. Two files is what
// makes that mistake impossible rather than merely unlikely.
//
// The `platform.` prefix is the second half of the same defence: a string that leaks into
// the org catalogue is visibly wrong at a glance, and a test asserts it never has.

/** 19 §3. Two named roles, deliberately NOT a grid — see the note at the bottom. */
export type PlatformRole = 'owner' | 'staff';

type Entry = {
  /** Which roles hold it. A fixed set per capability; there is no resolver here. */
  roles: readonly PlatformRole[];
  note: string;
};

const OWNER_ONLY = ['owner'] as const;
const BOTH = ['staff', 'owner'] as const;

export const PLATFORM_CAPABILITY_CATALOGUE = {
  'platform.org.read': {
    roles: BOTH,
    note: 'The estate list, and one org’s METADATA. Never its content (INV-011)',
  },
  'platform.org.suspend': {
    roles: OWNER_ONLY,
    note: 'Suspends staff sign-in for an org. Destructive, so owner only',
  },
  'platform.plan.read': { roles: BOTH, note: 'What an org is on, and since when' },
  'platform.plan.override': {
    roles: BOTH,
    note: 'Set a tier administratively — a support action, and the reason `billing.update` must not mean this (19 §8)',
  },
  'platform.analytics.read': {
    roles: OWNER_ONLY,
    note: 'The whole estate at once. Support helps one customer at a time and `platform.org.read` is what that needs (71)',
  },
  'platform.revenue.read': {
    roles: OWNER_ONLY,
    note: 'The MONEY — what the estate has paid, by period and by tier (DEC-080, 71). Deliberately NOT platform.analytics.read: DEC-035 collapsed the two when it deleted pricing, and DEC-080 splits them again because they answer different questions. Support helps one customer at a time and never needs a revenue total; the owner asks about revenue without wanting the adoption page',
  },
  'platform.usage.read': { roles: BOTH, note: 'Seats, campaign counts, response volume — as NUMBERS' },
  'platform.message.send': { roles: BOTH, note: 'Contact an org’s administrators (70 § Interactions)' },
  'platform.audit.read': { roles: BOTH, note: 'The platform’s own audit trail — ours, not a customer’s' },
  'platform.logs.read': {
    roles: BOTH,
    note: 'The rotating application log files (18 §2) through 72. Safe under INV-011 because 18 §3 already guarantees no body, no credential and no respondent identity reaches a log line',
  },
  'platform.logs.export': {
    roles: BOTH,
    note: 'A filtered COPY of a log file, downloaded (72 § Interactions, DEC-074). Separate from platform.logs.read on purpose: a read is a page on a screen, an export is a file that outlives the session and the retention window',
  },
  'platform.enterprise.read': {
    roles: OWNER_ONLY,
    note: 'The queue of customers asking to be sold Enterprise (DEC-100, 70). OWNER ONLY by direct instruction, and for platform.revenue.read’s reason: staff see every organisation because support helps one customer at a time, and this is a REVENUE queue rather than a support one — the same split DEC-080 already made',
  },
  'platform.enterprise.update': {
    roles: OWNER_ONLY,
    note: 'Move a request to contacted or closed. Separate from the read for the reason every other pair here is: reading the queue changes nothing, and working it is the action that must be attributable',
  },
  'platform.support.enter': {
    roles: BOTH,
    note: 'Open a customer’s OWN console as a time-boxed support principal (DEC-114, 19 §15). BOTH roles, because this is the support job as 19 §3 describes it — “is this customer OK?” is not answerable from an aggregate. The powers it confers inside the tenant are GRANTS resolved by the ordinary engine, minus SUPPORT_DENIED_CAPABILITIES, which is where INV-011 is restated for the wider door',
  },
  'platform.support.read': {
    roles: BOTH,
    note: 'The register of support sessions — who entered which organisation, why, and when they left. Split from platform.support.enter for the reason every other pair here is split: reading the register changes nothing, and entering is the action that must be attributable. Held by BOTH so an operator can see their own trail without an owner opening it for them',
  },
  'platform.operator.manage': { roles: OWNER_ONLY, note: 'Create, disable and re-role operator accounts' },
} as const satisfies Record<string, Entry>;

export type PlatformCapability = keyof typeof PLATFORM_CAPABILITY_CATALOGUE;

export const PLATFORM_CAPABILITIES = Object.keys(
  PLATFORM_CAPABILITY_CATALOGUE,
) as PlatformCapability[];

/**
 * The whole authorisation decision for the platform surface, and it is one line.
 *
 * There is NO second GRANT engine here and there must not be one (19 §14): a permission
 * grid for a four-person internal team is over-engineering, and a second resolver invites
 * confusion with the real one. Two fixed roles, a fixed set each, and a lookup.
 */
export const platformRoleHas = (role: PlatformRole, capability: PlatformCapability): boolean =>
  (PLATFORM_CAPABILITY_CATALOGUE[capability].roles as readonly PlatformRole[]).includes(role);

/** What an operator holds, for `/platform/me` — the client renders tabs from this. */
export const capabilitiesForRole = (role: PlatformRole): PlatformCapability[] =>
  PLATFORM_CAPABILITIES.filter((capability) => platformRoleHas(role, capability));
