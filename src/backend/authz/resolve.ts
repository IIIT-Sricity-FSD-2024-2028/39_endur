// The GRANT resolver. 11 §5.
//
// Five properties, each of which a marker can ask about directly:
//   1. DENY ALWAYS BEATS ALLOW (INV-004) — absolute. No scope, level, group membership
//      or delegation overrides an explicit deny.
//   2. A narrower scope wins a tie, so the trace names the most specific rule that applied.
//   3. Powers are scoped to the ASSIGNMENT's unit (INV-005), via the anchor.
//   4. Default is deny. No grant means no. There is no implicit permission anywhere.
//   5. Every decision records which grant decided it — that is what powers the simulator,
//      the audit log, and support debugging.
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
  /** Per-request memo, so repeated checks in one handler cost one query (11 §7). */
  memo?: Map<string, Promise<Decision>>;
};

export async function resolve(input: ResolveInput): Promise<Decision> {
  const at = input.at ?? new Date();
  const key = `${input.capability}:${targetKey(input.target)}`;

  const memoised = input.memo?.get(key);
  if (memoised) return memoised;

  const promise = run(input, at);
  input.memo?.set(key, promise);
  return promise;
}

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
    // Step 2 — capability match.
    if (grant.capability !== capability) continue;

    const trace = { grantId: grant.grantId, via: grant.via, scope: grant.scope, effect: grant.effect };

    // Step 3 — validity, of the grant itself. (The edge and the unit's end date were
    // already applied while collecting, because that is where they are visible.)
    if (grant.validFrom > at || (grant.validTo && grant.validTo <= at)) {
      considered.push({ ...trace, rejectedBecause: 'expired' });
      continue;
    }

    // Step 4 — scope, using the anchor unit.
    const { covers, because } = await scopeCovers(grant, target, scopeCtx);
    if (!covers) {
      considered.push({ ...trace, rejectedBecause: because ?? 'out of scope' });
      continue;
    }

    considered.push(trace);
    survivors.push(grant);
  }

  // Step 5 — ANY deny denies. Report the narrowest, because that is the most specific
  // rule and therefore the most useful thing to tell someone.
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

  // Step 6 — allow.
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

  // Step 7 — default deny. `out_of_scope` and `expired` are distinguished from
  // `no_grant` because they mean different things to the person reading the message:
  // one is "ask someone else", the other is "nobody gave you this at all".
  const hadCapability = considered.length > 0;
  const reason = hadCapability
    ? considered.every((entry) => entry.rejectedBecause === 'expired')
      ? 'expired'
      : 'out_of_scope'
    : 'no_grant';

  return { allowed: false, capability, reason, considered };
}

/** Narrowest scope wins; a tie is broken by the most senior role (lowest level number). */
function narrowest_(grants: CandidateGrant[]): CandidateGrant {
  return grants.reduce((a, b) => {
    const byScope = SCOPE_BREADTH[a.scope] - SCOPE_BREADTH[b.scope];
    if (byScope !== 0) return byScope < 0 ? a : b;
    return (a.level ?? 99) <= (b.level ?? 99) ? a : b;
  });
}

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

const targetKey = (target: Target): string =>
  'unitId' in target && target.unitId
    ? `${target.kind}:${target.unitId}`
    : 'userId' in target
      ? `${target.kind}:${target.userId}`
      : target.kind;
