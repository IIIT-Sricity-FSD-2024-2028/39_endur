// The other half of the resolver, and the one INV-003 actually depends on.
//
// resolve() answers "may this caller act on THIS target". Every list endpoint asks the
// inverse: "WHICH targets may this caller see". They are not the same question, and the
// difference is what makes out-of-scope rows ABSENT rather than greyed — the API returns
// only what the caller may see, and the UI trusts it.
//
// Both sides read the same grants through the same collectGrants(), which is the point.
// A list filter written independently of the resolver is a second permission model, and
// the two would disagree the first time either changed (N-005, N-016).
import type { Capability } from '@endur/shared';
import { prisma } from '../db/client.js';
import { unitSubtree } from '../db/graph.js';
import { collectGrants } from './collect.js';
import { getCachedGrants, setCachedGrants } from './cache.js';
import type { CandidateGrant } from './types.js';

/**
 * `all` means org-wide; anything else is an explicit set of unit ids.
 *
 * `self` is separate from the unit set because a `self` grant reaches rows that have no
 * unit at all — the caller's own person row, their own profile — and folding it into an
 * empty unit list would silently turn "only yourself" into "nothing".
 */
export type Visibility =
  | { all: true; self: boolean }
  | { all: false; unitIds: string[]; self: boolean };

export type VisibilityInput = {
  orgId: string;
  userId: string;
  capability: Capability;
  at?: Date;
  authzVersion?: number;
  /** Per-request memo. A list handler often asks this twice — once for rows, once for the count. */
  memo?: Map<string, Promise<Visibility>>;
};

export const NOTHING: Visibility = { all: false, unitIds: [], self: false };

/** True when the caller can see no unit and no self row — the query can be skipped entirely. */
export const seesNothing = (v: Visibility): boolean =>
  !v.all && v.unitIds.length === 0 && !v.self;

export async function visibleUnits(input: VisibilityInput): Promise<Visibility> {
  const key = input.capability;
  const memoised = input.memo?.get(key);
  if (memoised) return memoised;

  const promise = compute(input);
  input.memo?.set(key, promise);
  return promise;
}

async function compute(input: VisibilityInput): Promise<Visibility> {
  const { orgId, userId, capability } = input;
  const at = input.at ?? new Date();
  const authzVersion = input.authzVersion ?? 0;

  let all = getCachedGrants(orgId, userId, authzVersion);
  if (!all) {
    all = await collectGrants(orgId, userId, at);
    setCachedGrants(orgId, userId, authzVersion, all);
  }

  const live = all.filter(
    (grant) =>
      grant.capability === capability &&
      grant.validFrom <= at &&
      (!grant.validTo || grant.validTo > at),
  );

  const allows = live.filter((grant) => grant.effect === 'allow');
  const denies = live.filter((grant) => grant.effect === 'deny');

  // INV-004 is absolute, and on the list side it has to be applied to the whole answer
  // before anything is returned. A deny at scope `all` is not "one fewer unit" — it is
  // the end of the question.
  if (denies.some((grant) => grant.scope === 'all')) return NOTHING;

  const deniedUnits = await unitsOf(orgId, denies);
  const self = allows.some((grant) => grant.scope === 'self') && !denies.some((g) => g.scope === 'self');

  // An org-wide allow still loses the units an anchored deny covers. "Everywhere except
  // there" is a real and common shape — an auditor with one department carved out.
  if (allows.some((grant) => grant.scope === 'all')) {
    return deniedUnits.size === 0
      ? { all: true, self: true }
      : { all: false, unitIds: await allUnitsExcept(orgId, deniedUnits), self: true };
  }

  const allowedUnits = await unitsOf(orgId, allows);
  for (const unitId of deniedUnits) allowedUnits.delete(unitId);

  return { all: false, unitIds: [...allowedUnits], self };
}

/**
 * Expand a set of grants into the units they reach. `own_unit` is the anchor itself;
 * `subtree` is the anchor and everything below it.
 *
 * An unanchored grant contributes nothing, for the same reason it cannot satisfy a unit
 * scope in scopeCovers(): no anchor means no claim (11 §4). Treating it as org-wide here
 * would quietly hand a group with no scope unit the whole organisation.
 */
async function unitsOf(orgId: string, grants: CandidateGrant[]): Promise<Set<string>> {
  const out = new Set<string>();
  const subtreeRoots: string[] = [];

  for (const grant of grants) {
    if (!grant.anchorUnitId) continue;
    if (grant.scope === 'own_unit') out.add(grant.anchorUnitId);
    else if (grant.scope === 'subtree') subtreeRoots.push(grant.anchorUnitId);
  }

  // Distinct roots only: two positions in the same unit are one subtree query, not two.
  for (const root of new Set(subtreeRoots)) {
    for (const unitId of await unitSubtree(orgId, root)) out.add(unitId);
  }
  return out;
}

async function allUnitsExcept(orgId: string, excluded: Set<string>): Promise<string[]> {
  const units = await prisma.node.findMany({
    where: { orgId, kind: 'unit' },
    select: { id: true },
  });
  return units.map((unit) => unit.id).filter((id) => !excluded.has(id));
}
