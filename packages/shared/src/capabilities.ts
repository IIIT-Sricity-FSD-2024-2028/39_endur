// The capability catalogue — the complete vocabulary of things anyone can be permitted
// to do. Authoritative table: architecture/11-PERMISSION-ENGINE.md §3, and this file and
// that table must agree (DRIFT-004, checked by `npm run audit:drift`).
//
// The catalogue is defined by the application, NEVER by the user. Administrators assign
// these existing verbs to their own role names; they never invent verbs. Bounded verbs
// plus unbounded structure is the whole reason the UI can stay simple.
//
// Naming rule: `<object>.<verb>`, lowercase, singular object.

/** Phase a capability becomes real in. P3 entries exist so the grid can grey them out. */
export type CapabilityPhase = 'P1' | 'P2' | 'P3';

export type CapabilityModule =
  | 'Organisation'
  | 'Structure'
  | 'Roles'
  | 'Powers'
  | 'People'
  | 'Accounts'
  | 'Groups'
  | 'Delegation'
  | 'Subjects'
  | 'Templates'
  | 'Campaigns'
  | 'Results'
  | 'Trust'
  | 'Platform'
  | 'Improve'
  | 'Analyze';

type Entry = { module: CapabilityModule; phase: CapabilityPhase; note?: string };

/**
 * The single source of truth. Grouped by module because the powers grid (33) renders
 * rows in exactly these groups — deriving the grouping from a flat list elsewhere would
 * be a second place to keep in sync.
 */
export const CAPABILITY_CATALOGUE = {
  'org.read': { module: 'Organisation', phase: 'P1' },
  'org.update': { module: 'Organisation', phase: 'P1', note: 'name, industry, labels' },
  'org.delete': { module: 'Organisation', phase: 'P2', note: 'danger zone' },

  'unit.read': { module: 'Structure', phase: 'P1' },
  'unit.create': { module: 'Structure', phase: 'P1' },
  'unit.update': { module: 'Structure', phase: 'P1' },
  'unit.delete': { module: 'Structure', phase: 'P1' },
  'unit.reparent': { module: 'Structure', phase: 'P2', note: "separate: it moves people's scope" },

  'role.read': { module: 'Roles', phase: 'P1' },
  'role.create': { module: 'Roles', phase: 'P1' },
  'role.update': { module: 'Roles', phase: 'P1' },
  'role.delete': { module: 'Roles', phase: 'P1' },

  'grant.read': { module: 'Powers', phase: 'P2', note: 'view the powers grid' },
  'grant.update': {
    module: 'Powers',
    phase: 'P2',
    note: 'edit who can do what — the most dangerous capability in the system',
  },

  'person.read': { module: 'People', phase: 'P1' },
  'person.create': { module: 'People', phase: 'P1' },
  'person.update': { module: 'People', phase: 'P1' },
  'person.delete': { module: 'People', phase: 'P1' },
  'person.import': { module: 'People', phase: 'P2', note: 'CSV' },
  'assignment.create': { module: 'People', phase: 'P1', note: 'give a position' },
  'assignment.delete': { module: 'People', phase: 'P1', note: 'remove a position' },

  /**
   * 57. THREE VERBS, NOT ONE, and the split is deliberate: creating a sign-in is routine,
   * re-issuing is the support path, and revoking ends somebody's access mid-day. An
   * administrator should be able to withhold the third from a coordinator while granting
   * the other two, which one `account.manage` would make impossible.
   *
   * Every one is additionally bounded by INV-012 (11 §5b): holding `account.create` is not
   * permission to create an account more powerful than your own.
   */
  'account.create': { module: 'Accounts', phase: 'P2', note: 'mint an activation link — never a password' },
  'account.reset': { module: 'Accounts', phase: 'P2', note: 're-issue activation' },
  'account.revoke': { module: 'Accounts', phase: 'P2', note: 'disable, and end live sessions' },

  'group.read': { module: 'Groups', phase: 'P2' },
  'group.create': { module: 'Groups', phase: 'P2' },
  'group.update': { module: 'Groups', phase: 'P2' },
  'group.delete': { module: 'Groups', phase: 'P2' },

  'delegation.read': { module: 'Delegation', phase: 'P2' },
  'delegation.create': { module: 'Delegation', phase: 'P2' },
  'delegation.revoke': { module: 'Delegation', phase: 'P2' },

  'subject.read': { module: 'Subjects', phase: 'P1' },
  'subject.create': { module: 'Subjects', phase: 'P1' },
  'subject.update': { module: 'Subjects', phase: 'P1' },
  'subject.archive': { module: 'Subjects', phase: 'P1' },

  'template.read': { module: 'Templates', phase: 'P1' },
  'template.create': { module: 'Templates', phase: 'P1' },
  'template.update': { module: 'Templates', phase: 'P1' },
  'template.delete': { module: 'Templates', phase: 'P1' },
  'template.clone': { module: 'Templates', phase: 'P1', note: 'library to org' },

  'campaign.read': { module: 'Campaigns', phase: 'P1' },
  'campaign.create': { module: 'Campaigns', phase: 'P1' },
  'campaign.update': { module: 'Campaigns', phase: 'P1' },
  'campaign.delete': { module: 'Campaigns', phase: 'P1' },
  'campaign.launch': {
    module: 'Campaigns',
    phase: 'P1',
    note: 'mints the public token — irreversible',
  },
  'campaign.close': { module: 'Campaigns', phase: 'P1' },

  'response.read': { module: 'Results', phase: 'P1', note: 'individual responses / comments' },
  'response.export': { module: 'Results', phase: 'P2' },
  'results.read': { module: 'Results', phase: 'P1', note: 'aggregates' },
  'results.export': { module: 'Results', phase: 'P2' },

  'simulator.run': { module: 'Trust', phase: 'P2', note: '"why was this allowed?"' },
  'audit.read': { module: 'Trust', phase: 'P2' },

  'apikey.read': { module: 'Platform', phase: 'P3', note: 'Enterprise only' },
  'apikey.create': { module: 'Platform', phase: 'P3', note: 'Enterprise only' },
  'apikey.revoke': { module: 'Platform', phase: 'P3', note: 'Enterprise only' },
  'billing.read': { module: 'Platform', phase: 'P2' },
  'billing.update': { module: 'Platform', phase: 'P2' },

  'reflection.create': { module: 'Improve', phase: 'P3' },
  'reflection.read': { module: 'Improve', phase: 'P3' },
  'actionplan.create': { module: 'Improve', phase: 'P3' },
  'actionplan.read': { module: 'Improve', phase: 'P3' },
  'checkin.create': { module: 'Improve', phase: 'P3' },
  'checkin.read': { module: 'Improve', phase: 'P3' },

  'analysis.read': { module: 'Analyze', phase: 'P3' },
} as const satisfies Record<string, Entry>;

export type Capability = keyof typeof CAPABILITY_CATALOGUE;

export const CAPABILITIES = Object.keys(CAPABILITY_CATALOGUE) as Capability[];

export const isCapability = (value: string): value is Capability =>
  Object.prototype.hasOwnProperty.call(CAPABILITY_CATALOGUE, value);

// ---------------------------------------------------------------------------
// Scopes — 11 §4. Ordered narrowest to widest; the order is meaningful, so it is
// expressed once here rather than re-listed wherever a comparison is needed.
// ---------------------------------------------------------------------------

export const SCOPES = ['self', 'own_unit', 'subtree', 'all'] as const;
export type Scope = (typeof SCOPES)[number];

/** Higher covers strictly more. Never used to override a deny — INV-004 is absolute. */
export const SCOPE_BREADTH: Record<Scope, number> = {
  self: 0,
  own_unit: 1,
  subtree: 2,
  all: 3,
};

/**
 * WHAT A CALLER HOLDS, AND HOW WIDELY — T-086, and the map replaced a bare `Capability[]`.
 *
 * A capability absent from this map is not held anywhere. A capability present maps to the
 * WIDEST scope any live allow reaches, which is a claim about existence and nothing more:
 * *"there is somewhere this reaches at least this far"*. It is NOT "everything inside that
 * scope is permitted" — a head of two sections holds `campaign.update: own_unit` twice and
 * this map says `own_unit` once, with no way to name which two.
 *
 * That weakness is deliberate and is the same one the old array carried; the map is one
 * notch more precise, not a different kind of answer. The reason it had to become one is
 * `person.read: self` — the universal grant every role gets (`50` §1) — which made the old
 * array report `person.read` for LITERALLY EVERY ACCOUNT IN THE PRODUCT, so a nav gate
 * reading it showed a People page listing exactly one person: the reader (`D-027`).
 *
 * Still usability, never enforcement (INV-003). `requireCapability()` decides every route.
 */
export type HeldCapabilities = Partial<Record<Capability, Scope>>;

/**
 * Does a held scope reach at least this far? The one comparison both apps make, expressed
 * once — `useCan(cap, 'own_unit')` is the whole point of `HeldCapabilities` existing.
 *
 * `undefined` is "not held", never "held narrowly", so an absent capability reaches nothing
 * — not even `self`.
 */
export const scopeReaches = (held: Scope | undefined, atLeast: Scope): boolean =>
  held !== undefined && SCOPE_BREADTH[held] >= SCOPE_BREADTH[atLeast];

export const EFFECTS = ['allow', 'deny'] as const;
export type Effect = (typeof EFFECTS)[number];
