// The permission resolver: decides whether one person may do one thing, and records why.
// Rules it keeps: a deny always beats an allow, a narrower scope wins a tie, powers only
// apply at the unit the person was assigned to, and no grant means no.
import { SCOPE_BREADTH, type Capability } from '@endur/shared';
import { collectGrants } from './collect.js';
import { getCachedGrants, setCachedGrants } from './cache.js';
import { combineParams, type ParamMode } from './params.js';
import { scopeCovers, type ScopeContext } from './scope.js';
import type { CandidateGrant, Decision, Target } from './types.js';

export type ResolveInput = {
  orgId: string;
  userId: string;
  capability: Capability;
  target: Target;
  at?: Date;
  authzVersion?: number;
  paramMode?: ParamMode;
  // Memo, so several checks inside one request share a single lookup.
  memo?: Map<string, Promise<Decision>>;
};

// Answers one permission question, reusing the memo if the same question was already asked.
export async function resolve(input: ResolveInput): Promise<Decision> {
  const at = input.at ?? new Date();
  const key = `${input.capability}:${targetKey(input.target)}`;

  const memoised = input.memo?.get(key);
  if (memoised) return memoised;

  const promise = run(input, at);
  input.memo?.set(key, promise);
  return promise;
}

// Does the real work: load this person's grants, then run them through steps 2 to 7.
async function run(input: ResolveInput, at: Date): Promise<Decision> {
  const { orgId, userId, capability, target } = input;
  const authzVersion = input.authzVersion ?? 0;

  let all = getCachedGrants(orgId, userId, authzVersion);
  if (!all) {
    all = await collectGrants(orgId, userId, at);
    setCachedGrants(orgId, userId, authzVersion, all);
  }

  const considered: Decision['considered'] = [];
  const scopeCtx: ScopeContext = { orgId, principalUserId: userId, subtreeCache: new Map() };

  const survivors: CandidateGrant[] = [];

  for (const grant of all) {
    // Step 2 - skip grants that are about a different capability.
    if (grant.capability !== capability) continue;

    const trace = { grantId: grant.grantId, via: grant.via, scope: grant.scope, effect: grant.effect };

    // Step 3 - skip grants that have expired or have not started yet.
    if (grant.validFrom > at || (grant.validTo && grant.validTo <= at)) {
      considered.push({ ...trace, rejectedBecause: 'expired' });
      continue;
    }

    // Step 4 - skip grants whose scope does not reach this target.
    const { covers, because } = await scopeCovers(grant, target, scopeCtx);
    if (!covers) {
      considered.push({ ...trace, rejectedBecause: because ?? 'out of scope' });
      continue;
    }

    considered.push(trace);
    survivors.push(grant);
  }

  // Step 5 - a single deny refuses the request; report the narrowest one, as it is the most specific.
  const denies = survivors.filter((grant) => grant.effect === 'deny');
  if (denies.length > 0) {
    const narrowest = narrowest_(denies);
    return {
      allowed: false,
      capability,
      reason: 'explicit_deny',
      decidedBy: describe(narrowest),
      considered,
    };
  }

  // Step 6 - no deny, so an allow wins and its params become the caller's limits.
  const allows = survivors.filter((grant) => grant.effect === 'allow');
  if (allows.length > 0) {
    const decisive = narrowest_(allows);
    const params = combineParams(allows, input.paramMode ?? 'union');
    return {
      allowed: true,
      capability,
      reason: 'granted',
      decidedBy: describe(decisive),
      ...(params ? { params } : {}),
      considered,
    };
  }

  // Step 7 - nothing matched, so deny by default; the reason says whether any grant existed at all.
  const hadCapability = considered.length > 0;
  const reason = hadCapability
    ? considered.every((entry) => entry.rejectedBecause === 'expired')
      ? 'expired'
      : 'out_of_scope'
    : 'no_grant';

  return { allowed: false, capability, reason, considered };
}

// Narrower scope wins; if two tie, the more senior role (lower level number) wins.
function narrowest_(grants: CandidateGrant[]): CandidateGrant {
  return grants.reduce((a, b) => {
    const byScope = SCOPE_BREADTH[a.scope] - SCOPE_BREADTH[b.scope];
    if (byScope !== 0) return byScope < 0 ? a : b;
    return (a.level ?? 99) <= (b.level ?? 99) ? a : b;
  });
}

// Trims the deciding grant down to the few fields the answer carries.
function describe(grant: CandidateGrant): NonNullable<Decision['decidedBy']> {
  return {
    grantId: grant.grantId,
    via: grant.via,
    subjectName: grant.subjectName,
    scope: grant.scope,
    ...(grant.anchorUnitId ? { anchorUnitId: grant.anchorUnitId } : {}),
    ...(grant.anchorUnitName ? { anchorUnitName: grant.anchorUnitName } : {}),
    effect: grant.effect,
  };
}

// Builds the memo key for a target.
const targetKey = (target: Target): string =>
  'unitId' in target && target.unitId
    ? `${target.kind}:${target.unitId}`
    : 'userId' in target
      ? `${target.kind}:${target.userId}`
      : target.kind;
