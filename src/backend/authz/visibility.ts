// The list side of permissions: WHICH units a person may see, rather than "may they touch this one thing".
// It reads the same grants as resolve(), so a list can never disagree with a permission check.
import type { Capability } from '@endur/shared';
import { prisma } from '../db/client.js';
import { unitSubtree } from '../db/graph.js';
import { collectGrants } from './collect.js';
import { getCachedGrants, setCachedGrants } from './cache.js';
import type { CandidateGrant } from './types.js';

// The answer: all=true means org-wide, otherwise an explicit list of unit ids. 'self' covers rows that have no unit.
export type Visibility =
  | { all: true; self: boolean }
  | { all: false; unitIds: string[]; self: boolean };

export type VisibilityInput = {
  orgId: string;
  userId: string;
  capability: Capability;
  at?: Date;
  authzVersion?: number;
  // Per-request memo. A list handler usually asks twice: once for the rows, once for the count.
  memo?: Map<string, Promise<Visibility>>;
};

export const NOTHING: Visibility = { all: false, unitIds: [], self: false };

// True when the caller can see nothing at all, so the query can be skipped.
export const seesNothing = (v: Visibility): boolean =>
  !v.all && v.unitIds.length === 0 && !v.self;

// Which units this person may see for one capability, memoised for the request.
export async function visibleUnits(input: VisibilityInput): Promise<Visibility> {
  const key = input.capability;
  const memoised = input.memo?.get(key);
  if (memoised) return memoised;

  const promise = compute(input);
  input.memo?.set(key, promise);
  return promise;
}

// The real work: load grants, drop expired ones, subtract denies, expand scopes into unit ids.
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

  // A deny at 'all' scope ends the question: the caller sees nothing.
  if (denies.some((grant) => grant.scope === 'all')) return NOTHING;

  const deniedUnits = await unitsOf(orgId, denies);
  const self = allows.some((grant) => grant.scope === 'self') && !denies.some((g) => g.scope === 'self');

  // An org-wide allow still loses the units a deny covers - "everywhere except there" is a real case.
  if (allows.some((grant) => grant.scope === 'all')) {
    return deniedUnits.size === 0
      ? { all: true, self: true }
      : { all: false, unitIds: await allUnitsExcept(orgId, deniedUnits), self: true };
  }

  const allowedUnits = await unitsOf(orgId, allows);
  for (const unitId of deniedUnits) allowedUnits.delete(unitId);

  return { all: false, unitIds: [...allowedUnits], self };
}

// Turns grants into the units they reach: 'own_unit' is the anchor itself, 'subtree' is the anchor and all below it.
async function unitsOf(orgId: string, grants: CandidateGrant[]): Promise<Set<string>> {
  const out = new Set<string>();
  const subtreeRoots: string[] = [];

  for (const grant of grants) {
    if (!grant.anchorUnitId) continue;
    if (grant.scope === 'own_unit') out.add(grant.anchorUnitId);
    else if (grant.scope === 'subtree') subtreeRoots.push(grant.anchorUnitId);
  }

  // Distinct roots only: two positions in the same unit means one subtree query, not two.
  for (const root of new Set(subtreeRoots)) {
    for (const unitId of await unitSubtree(orgId, root)) out.add(unitId);
  }
  return out;
}

// Every unit in the org except the excluded ones.
async function allUnitsExcept(orgId: string, excluded: Set<string>): Promise<string[]> {
  const units = await prisma.node.findMany({
    where: { orgId, kind: 'unit' },
    select: { id: true },
  });
  return units.map((unit) => unit.id).filter((id) => !excluded.has(id));
}
