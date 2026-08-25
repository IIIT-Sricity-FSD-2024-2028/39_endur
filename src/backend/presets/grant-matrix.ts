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

export function grantsForLevel(level: Level): GrantSeed[] {
  const rows = Object.entries(GRANT_MATRIX).flatMap(([capability, row]) => {
    const scope = row?.[level];
    return scope ? [{ capability: capability as Capability, scope }] : [];
  });
  return [...rows, ...UNIVERSAL_SELF_GRANTS];
}
