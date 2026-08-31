// The seeded grant matrix. AUTHORITATIVE TABLE: 50-SEED-AND-DEMO.md §1.
//
// Every preset uses the same matrix — only the role NAMES differ, which is the whole point
// of the generic model. All rows are written `derived: true`; editing one in the powers
// grid clears that flag so regeneration never silently reverts an administrator's change.
//
// Presets ship NO deny grants. A deny is a deliberate administrator act, and seeding one
// would teach the wrong lesson about a rule that is absolute (INV-004).
//
// T-015/T-025 build the full five presets on top of this; the table itself lives here so
// both they and registration read one copy.
import type { Capability, Scope } from '@endur/shared';

export type Level = 1 | 2 | 3 | 4;
type Row = Partial<Record<Level, Scope>>;

const S = (l1?: Scope, l2?: Scope, l3?: Scope, l4?: Scope): Row => ({
  ...(l1 ? { 1: l1 } : {}), ...(l2 ? { 2: l2 } : {}),
  ...(l3 ? { 3: l3 } : {}), ...(l4 ? { 4: l4 } : {}),
});

export const GRANT_MATRIX: Partial<Record<Capability, Row>> = {
  'org.read': S('all', 'all', 'all', 'all'),
  'org.update': S('all'),
  'org.delete': S('all'),

  'unit.read': S('subtree', 'subtree', 'own_unit'),
  'unit.create': S('subtree', 'subtree'),
  'unit.update': S('subtree', 'subtree'),
  'unit.delete': S('subtree'),
  'unit.reparent': S('subtree'),

  'role.read': S('all', 'all', 'all'),
  'role.create': S('all'), 'role.update': S('all'), 'role.delete': S('all'),

  'grant.read': S('all', 'all'),
  'grant.update': S('all'),

  'person.read': S('subtree', 'subtree', 'own_unit'),
  'person.create': S('subtree', 'subtree'),
  'person.update': S('subtree', 'subtree'),
  'person.delete': S('subtree'),
  'person.import': S('subtree'),

  'assignment.create': S('subtree', 'own_unit'),
  'assignment.delete': S('subtree', 'own_unit'),

  // 57. `revoke` stops one level short of the other two ON PURPOSE: creating a sign-in is
  // routine and re-issuing is the support path, but revoking ends somebody's access in the
  // middle of their working day. Three verbs exist so this line can differ from the one
  // above it — one `account.manage` would have made the distinction unsayable.
  'account.create': S('subtree', 'subtree'),
  'account.reset': S('subtree', 'subtree'),
  'account.revoke': S('subtree'),

  'group.read': S('subtree'), 'group.create': S('subtree'),
  'group.update': S('subtree'), 'group.delete': S('subtree'),
  'delegation.read': S('subtree'), 'delegation.create': S('subtree'),
  'delegation.revoke': S('subtree'),

  // L4 READS SUBJECTS, and it is the only row in `organize` that reaches that far down.
  // Added by T-086, closing the smaller half of OPEN-009. The owner's words: "student /
  // lowest tier shouldn't see roles, people and department pages at all (even if they see
  // nothing actually in it). ONLY COURSES LIST." Translated out of the university preset
  // (INV-002): the L4 role sees the SUBJECTS list and nothing else in `organize`.
  //
  // `own_unit` rather than `all`: a respondent-level account has a reason to see the
  // subjects of the section they are in, and no reason at all to enumerate every subject
  // in the organisation. It is `own_unit` and not `subtree` for the same reason `unit.read`
  // is at L3 — L4 sits at the bottom, so a subtree below them is usually empty and, when it
  // is not, they are not the person who should be reading it.
  //
  // It is a change to what EVERY organisation gets by default, which is why 50 §1 held it
  // for the owner rather than a session assuming it.
  'subject.read': S('subtree', 'subtree', 'own_unit', 'own_unit'),
  'subject.create': S('subtree', 'subtree'),
  'subject.update': S('subtree', 'subtree'),
  'subject.archive': S('subtree', 'subtree'),

  // `all`, not `subtree`: templates are org-wide artefacts with no unit, so a unit scope
  // would mean nobody could read them. Scope is about the org graph; templates are not in it.
  'template.read': S('all', 'all', 'all'),
  'template.clone': S('all', 'all', 'all'),
  'template.create': S('all', 'all'),
  'template.update': S('all', 'all'),
  'template.delete': S('all'),

  'campaign.read': S('subtree', 'subtree', 'own_unit'),
  'campaign.create': S('subtree', 'subtree', 'own_unit'),
  'campaign.update': S('subtree', 'subtree', 'own_unit'),
  'campaign.launch': S('subtree', 'subtree', 'own_unit'),
  'campaign.close': S('subtree', 'subtree', 'own_unit'),
  'campaign.delete': S('subtree'),

  'response.read': S('subtree', 'subtree', 'own_unit'),
  // L3 sees their own results: a reviewee seeing their own feedback is the product working.
  'results.read': S('subtree', 'subtree', 'own_unit'),
  'response.export': S('subtree', 'subtree'),
  'results.export': S('subtree', 'subtree'),
  // T-081, D-033. This row DID NOT EXIST and its absence was not a restriction — no seeded
  // role in the product held `analysis.read`, so /api/v1/analysis would have 403'd for every
  // user of every organisation, Gold included, while `16` §3 entitled it at Silver. Same
  // shape as D-012 and D-028: the entitlement said yes and the grant said nothing.
  // routes.test.ts now asserts no mounted route can require a capability nobody is seeded.
  'analysis.read': S('subtree', 'subtree', 'own_unit'),

  // T-083, and these are the nine rows D-033 deliberately LEFT — a grant to a route that
  // does not exist cannot be tested, so they land the day the router mounts. That is also
  // the day routes.test.ts starts checking them.
  //
  // THE SCOPES ARE NOT COPIED FROM THE ROW ABOVE, and two things about them are decisions.
  //
  // `self`, at every level that has it: a reflection is somebody's private assessment OF
  // THEMSELVES, and there is no legitimate wider read. A `subtree` on `reflection.read`
  // would put a supervisor inside a person's own words about their own weaknesses, which is
  // the one thing 44 says getting wrong "exposes someone's private self-assessment to a
  // peer". What a supervisor gets is the CHECK-IN — the conversation — and that is the only
  // row here that reaches past the caller.
  //
  // NOT L4, and that is the same reading of the ladder `results.read` already takes one
  // block up: L3 is the REVIEWEE (the person feedback is about) and L4 is the
  // RESPONDENT-level role (the person who gives it). Somebody nobody reviews has nothing to
  // reflect on, and the item would appear for every account in the product and open an
  // empty page — D-027's exact shape.
  'reflection.create': S('self', 'self', 'self'),
  'reflection.read': S('self', 'self', 'self'),
  'actionplan.create': S('self', 'self', 'self'),
  'actionplan.read': S('self', 'self', 'self'),
  'checkin.create': S('subtree', 'subtree', 'own_unit'),
  'checkin.read': S('subtree', 'subtree', 'own_unit'),

  // T-094. `all` at every level, for the reason `template.*` is `all`: an announcement has
  // no unit of its own — its AUDIENCE names one — so a unit scope here would mean nobody
  // could read anything. Scope is about the org graph, and this row is not in it.
  //
  // READ REACHES L4 and the other three do not, which is the whole shape of the feature:
  // everybody is somebody an announcement can be sent to, and being sent one is not a
  // permission anybody should have to be given.
  //
  // `publish` STOPS ONE LEVEL SHORT OF `create`, and that gap is why the two are separate
  // verbs at all (11 §3). Drafting is not broadcasting: out of the box a level-2 coordinator
  // can write a notice and a level-1 administrator is the one who sends it. An
  // `announcement.manage` would have made that unsayable, exactly as `account.revoke` would
  // have been unsayable folded into `account.create` (57).
  'announcement.read': S('all', 'all', 'all', 'all'),
  'announcement.create': S('all', 'all'),
  'announcement.publish': S('all'),
  'announcement.delete': S('all'),

  // T-095. `all` at every level that has a row, for the reason `announcement.*` is `all`: a
  // bookable has no unit of its own, so a unit scope here would mean nobody could read
  // anything. Scope is about the org graph and this row is not in it.
  //
  // READ REACHES L3 and the writes stop at L2. Somebody running a section should be able to
  // see what is booked in it; publishing slots is a coordinator's job upward of that.
  //
  // `cancel` STOPS ONE LEVEL SHORT OF `update`, and that gap is the whole reason it is a
  // separate verb (11 §3). Out of the box a level-2 coordinator can add and remove slots and
  // a level-1 administrator is the one who can take back a booking somebody already made —
  // exactly the shape `announcement.publish` has one block up, and `account.revoke` in 57.
  'booking.read': S('all', 'all', 'all'),
  'booking.create': S('all', 'all'),
  'booking.update': S('all', 'all'),
  'booking.delete': S('all'),
  'booking.cancel': S('all'),

  'simulator.run': S('all', 'subtree'),
  'audit.read': S('all'),
  'billing.read': S('all'), 'billing.update': S('all'),
};

export type GrantSeed = { capability: Capability; scope: Scope };

/**
 * Plus, for EVERY role without exception, `person.read self` and `person.update self`.
 * A default-deny model silently produces an unopenable profile page if `self` is
 * forgotten, so this is never omitted (50 §1, 11 §10 has a test for it).
 */
export const UNIVERSAL_SELF_GRANTS: GrantSeed[] = [
  { capability: 'person.read', scope: 'self' },
  { capability: 'person.update', scope: 'self' },
];

/**
 * WHICH MATRIX ROW A ROLE STARTS FROM, given its position and how many roles there are.
 * `DEC-112`, `T-107`, `50` §1.
 *
 * IT USED TO BE `Math.min(index + 1, 4)`, AND THAT IS THE BUG. `GRANT_MATRIX` describes four
 * levels; a ten-role college — Director, Dean, HoD, Professor, Assistant Professor, Hostel
 * Manager, Mess Manager, Sports Officer, Support Staff, Student — put **six roles onto the
 * level-4 row**, which is the RESPONDENT row: `org.read`, `subject.read own_unit`,
 * `announcement.read`, and the two universal self-grants. Five capabilities.
 *
 * So a Professor signed in and got an empty console. The demo run recorded it as F4 —
 * *"the Professor gets 403 on the campaigns list and holds only 5 capabilities; a Student also
 * holds 5"* — and it was recovered by hand with thirty grant cells.
 *
 * THE FOUR LEVELS WERE NEVER POSITIONS, THEY WERE ROLES IN THE FEEDBACK LOOP, and the matrix
 * says so all the way down: L3 is *"the REVIEWEE (the person feedback is about)"* and L4 is
 * *"the RESPONDENT-level role (the person who gives it)"*. Counting from the top makes those
 * two labels land on whoever happens to sit fourth and fifth, which in a real ladder is a
 * Professor and an Assistant Professor — both reviewees, both handed the respondent's row.
 *
 * SO THE LAST ROLE IS THE RESPONDENT AND THE MIDDLE IS THE REVIEWEE:
 *
 *   · four roles or fewer — unchanged, `index + 1`. Every seeded preset has exactly four, so
 *     no existing organisation moves and `50` §1's table still describes what it describes.
 *   · more than four — the top three keep levels 1, 2 and 3, THE BOTTOM ROLE GETS 4, and
 *     everything between gets 3.
 *
 * WHY THE MIDDLE GETS 3 RATHER THAN A SPREAD. A proportional map (`ceil(i / n * 4)`) reads
 * neatly and puts a Dean on level 1, which carries `org.delete`, `role.create` and
 * `grant.update` — the whole organisation, to somebody two steps down. Level 3 is `own_unit`
 * almost everywhere, so the failure mode of being generous here is a Sports Officer who can
 * run a campaign in their own unit. That is the job. The failure mode of being generous at
 * level 1 is somebody deleting the organisation.
 *
 * IT ALSO REACHES `F2`. `reflection.*` and `actionplan.*` are `self` at levels 1–3 and absent
 * at 4, so the entire Gold improvement loop was unreachable for any organisation whose
 * reviewee sat fifth or lower — and ungrantable, because the no-escalation guard needs a
 * granter holding the capability at `all` and nobody ever holds these at `all`. Putting the
 * middle of the ladder on level 3 hands it back without touching either rule.
 */
export function levelForRole(index: number, roleCount: number): Level {
  if (roleCount <= 4) return Math.min(index + 1, 4) as Level;
  if (index < 3) return (index + 1) as Level;
  return index === roleCount - 1 ? 4 : 3;
}

export function grantsForLevel(level: Level): GrantSeed[] {
  const rows = Object.entries(GRANT_MATRIX).flatMap(([capability, row]) => {
    const scope = row?.[level];
    return scope ? [{ capability: capability as Capability, scope }] : [];
  });
  return [...rows, ...UNIVERSAL_SELF_GRANTS];
}
