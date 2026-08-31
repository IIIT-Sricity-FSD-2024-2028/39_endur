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
  | 'Analyze'
  | 'Announcements'
  | 'Booking';

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

  // P2 since 25 Aug, NOT P3. T-083/T-084 built the improve loop and T-081/T-082 built
  // analysis; the routes are live and entitled, and this map was the one place nobody
  // updated. `phase` is not a note — the grid greys a P3 row and stamps it "Soon", and
  // `warnings()` skips P3 when it looks for a power nobody holds, so a stale entry both
  // lied to the reader and suppressed a real warning about a shipped feature.
  'reflection.create': { module: 'Improve', phase: 'P2' },
  'reflection.read': { module: 'Improve', phase: 'P2' },
  'actionplan.create': { module: 'Improve', phase: 'P2' },
  'actionplan.read': { module: 'Improve', phase: 'P2' },
  'checkin.create': { module: 'Improve', phase: 'P2' },
  'checkin.read': { module: 'Improve', phase: 'P2' },

  'analysis.read': { module: 'Analyze', phase: 'P2' },

  /**
   * T-094. FOUR VERBS AND THE THIRD ONE IS THE POINT.
   *
   * `announcement.publish` is separate from `announcement.create` because drafting and
   * broadcasting are different acts: an organisation should be able to let a coordinator
   * write the notice without letting them reach every person in a unit with it. One
   * `announcement.manage` would make that impossible, the same argument `account.*` makes
   * for its own three (§57).
   *
   * `announcement.read` is the only one seeded to everybody — it is how a person sees what
   * was sent TO them, so withholding it would make the banner invisible to its audience.
   */
  'announcement.read': { module: 'Announcements', phase: 'P2', note: 'what was sent to me' },
  'announcement.create': { module: 'Announcements', phase: 'P2', note: 'draft' },
  'announcement.publish': {
    module: 'Announcements',
    phase: 'P2',
    note: 'separate verb: publishing is what reaches people',
  },
  'announcement.delete': { module: 'Announcements', phase: 'P2' },

  /**
   * T-095. FIVE VERBS, AND `cancel` IS THE ONE THAT HAD TO BE ITS OWN.
   *
   * The first four are the ordinary CRUD shape over a bookable and its slots. `booking.cancel`
   * is not: it reaches into a DECISION SOMEBODY ELSE MADE and takes it back. Folding it into
   * `booking.update` would mean an organisation could not let a receptionist add a slot
   * without also letting them cancel a guest's appointment, which is the same argument
   * `announcement.publish` makes against `announcement.create` and `account.revoke` makes
   * against `account.create` (§57).
   *
   * NO CAPABILITY COVERS THE PUBLIC PICKER. A booker holds a link and nothing else — they
   * have no account, exactly as a respondent has none (DEC-009) — so `/public/bookables/*`
   * is capability-free for the same reason `/public/campaigns/*` is, and cancelling with
   * your OWN cancel token is not `booking.cancel`: the token is the authorisation, and it
   * only ever reaches the one row it was minted for.
   */
  'booking.read': { module: 'Booking', phase: 'P2', note: 'bookables, slots and who booked' },
  'booking.create': { module: 'Booking', phase: 'P2', note: 'a bookable and its slots' },
  'booking.update': { module: 'Booking', phase: 'P2', note: 'edit, open, close, replace slots' },
  'booking.delete': { module: 'Booking', phase: 'P2' },
  'booking.cancel': {
    module: 'Booking',
    phase: 'P2',
    note: "separate verb: it undoes somebody else's booking",
  },
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
