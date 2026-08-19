// Step 4 — does this grant's scope, anchored at this unit, cover this target?
//
// Scope is about the ORG GRAPH. Anything not in that graph (templates, for instance)
// cannot be meaningfully scoped by unit, which is why the seeded matrix gives template.*
// the `all` scope — see 50 §1.
import type { Scope } from '@endur/shared';
import { unitSubtree } from '../db/graph.js';
import type { CandidateGrant, Target } from './types.js';

export type ScopeContext = {
  orgId: string;
  principalUserId?: string;
  /** Per-request memo: the subtree query is several joins and repeats within one handler. */
  subtreeCache: Map<string, Promise<string[]>>;
};

export async function scopeCovers(
  grant: CandidateGrant,
  target: Target,
  ctx: ScopeContext,
): Promise<{ covers: boolean; because?: string }> {
  const scope: Scope = grant.scope;

  if (scope === 'all') return { covers: true };

  if (scope === 'self') {
    const targetUser = 'userId' in target ? target.userId : undefined;
    if (targetUser && targetUser === ctx.principalUserId) return { covers: true };
    return { covers: false, because: 'scope self, target is not the principal' };
  }

  // An unanchored grant (reached through a group with no scope unit, or a person node
  // with no primary position) cannot satisfy a unit scope — there is no unit to compare
  // against. Denying is the correct default: no anchor means no claim (11 §4).
  if (!grant.anchorUnitId) {
    return { covers: false, because: `scope ${scope} but the grant has no anchor unit` };
  }

  const targetUnit = 'unitId' in target ? target.unitId : undefined;
  if (!targetUnit) {
    // An org-level target under a unit scope: the caller's powers are confined to a unit,
    // so they do not reach the organisation as a whole.
    return { covers: false, because: `scope ${scope} does not reach an org-level target` };
  }

  if (scope === 'own_unit') {
    return targetUnit === grant.anchorUnitId
      ? { covers: true }
      : { covers: false, because: 'target is outside the anchor unit' };
  }

  // subtree
  const key = `${ctx.orgId}:${grant.anchorUnitId}`;
  let subtree = ctx.subtreeCache.get(key);
  if (!subtree) {
    subtree = unitSubtree(ctx.orgId, grant.anchorUnitId);
    ctx.subtreeCache.set(key, subtree);
  }
  return (await subtree).includes(targetUnit)
    ? { covers: true }
    : { covers: false, because: "target is outside the anchor unit's subtree" };
}
