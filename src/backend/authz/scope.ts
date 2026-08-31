// Step 4 of a permission check: does this grant's scope, from its anchor unit, cover the target?
import type { Scope } from '@endur/shared';
import { unitSubtree } from '../db/graph.js';
import type { CandidateGrant, Target } from './types.js';

export type ScopeContext = {
  orgId: string;
  principalUserId?: string;
  // Per-request memo, because the subtree query is several joins and repeats often.
  subtreeCache: Map<string, Promise<string[]>>;
};

// Says whether the grant covers the target, plus a plain reason when it does not.
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

  // A grant with no anchor unit has no unit to compare, so it cannot satisfy a unit scope.
  if (!grant.anchorUnitId) {
    return { covers: false, because: `scope ${scope} but the grant has no anchor unit` };
  }

  const targetUnit = 'unitId' in target ? target.unitId : undefined;
  if (!targetUnit) {
    // Powers limited to one unit do not reach a target that means the whole organisation.
    return { covers: false, because: `scope ${scope} does not reach an org-level target` };
  }

  if (scope === 'own_unit') {
    return targetUnit === grant.anchorUnitId
      ? { covers: true }
      : { covers: false, because: 'target is outside the anchor unit' };
  }

  // scope 'subtree': the target must sit somewhere under the anchor unit.
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
