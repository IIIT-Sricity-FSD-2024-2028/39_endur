// The grants every new organisation starts with: which capability each role level holds, and at what scope.
// Every preset uses this same table - only the role NAMES differ, which is the point of the generic model.
// No deny grants are ever seeded: a deny is a deliberate administrator act.
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

  // revoke stops one level short of create and reset: ending somebody's access mid-day is not routine.
  'account.create': S('subtree', 'subtree'),
  'account.reset': S('subtree', 'subtree'),
  'account.revoke': S('subtree'),

  'group.read': S('subtree'), 'group.create': S('subtree'),
  'group.update': S('subtree'), 'group.delete': S('subtree'),
  'delegation.read': S('subtree'), 'delegation.create': S('subtree'),
  'delegation.revoke': S('subtree'),

  // The most junior role can read subjects in its own unit, and nothing else in this section.
  'subject.read': S('subtree', 'subtree', 'own_unit', 'own_unit'),
  'subject.create': S('subtree', 'subtree'),
  'subject.update': S('subtree', 'subtree'),
  'subject.archive': S('subtree', 'subtree'),

  // 'all', not a unit scope: templates belong to the whole organisation and sit outside the unit graph.
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
  // The reviewee level sees their own results, which is the product working as intended.
  'results.read': S('subtree', 'subtree', 'own_unit'),
  'response.export': S('subtree', 'subtree'),
  'results.export': S('subtree', 'subtree'),
  // Analysis, readable by the same levels that can read results.
  'analysis.read': S('subtree', 'subtree', 'own_unit'),

  // The improvement loop. Reflections and action plans are 'self' only: they are somebody's private
  // notes about themselves. A supervisor gets the CHECK-IN instead, which is the shared conversation.
  'reflection.create': S('self', 'self', 'self'),
  'reflection.read': S('self', 'self', 'self'),
  'actionplan.create': S('self', 'self', 'self'),
  'actionplan.read': S('self', 'self', 'self'),
  'checkin.create': S('subtree', 'subtree', 'own_unit'),
  'checkin.read': S('subtree', 'subtree', 'own_unit'),

  // Announcements are 'all' scope, because an announcement has no unit of its own - its audience names one.
  // Everyone can READ one; publishing stops one level above creating, so drafting is not broadcasting.
  'announcement.read': S('all', 'all', 'all', 'all'),
  'announcement.create': S('all', 'all'),
  'announcement.publish': S('all'),
  'announcement.delete': S('all'),

  // Bookings are 'all' scope for the same reason. Reading reaches the reviewee level and writing stops above it,
  // and cancel is one level higher again, because taking back somebody's booking is not routine.
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

// Plus, for EVERY role without exception, person.read self and person.update self, or the profile page will not open.
export const UNIVERSAL_SELF_GRANTS: GrantSeed[] = [
  { capability: 'person.read', scope: 'self' },
  { capability: 'person.update', scope: 'self' },
];

// Which matrix row a role starts from, given its position and how many roles the organisation has.
// Four roles or fewer: level = position. More than four: the top three keep 1, 2 and 3, the LAST role gets 4,
// and everyone in between gets 3 - because level 4 is the respondent row, not "whoever is fourth".
export function levelForRole(index: number, roleCount: number): Level {
  if (roleCount <= 4) return Math.min(index + 1, 4) as Level;
  if (index < 3) return (index + 1) as Level;
  return index === roleCount - 1 ? 4 : 3;
}

// All the grants one level receives when an organisation is seeded.
export function grantsForLevel(level: Level): GrantSeed[] {
  const rows = Object.entries(GRANT_MATRIX).flatMap(([capability, row]) => {
    const scope = row?.[level];
    return scope ? [{ capability: capability as Capability, scope }] : [];
  });
  return [...rows, ...UNIVERSAL_SELF_GRANTS];
}
