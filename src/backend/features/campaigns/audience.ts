// How many people a campaign is for. 38 § Data contract, 40 § Interactions.
//
// Extracted at T-040 because two callers need it and they need DIFFERENT answers for the
// same rule, which is exactly the situation where one shared function and two visible
// policies beats two similar-looking implementations:
//
//   audiencePreview  — the create screen. Wants a number to show while somebody is choosing.
//   readResults      — the response-RATE denominator. Wants the truth or nothing.
//
// The counting itself (a unit subtree, a role) is identical and lives here once.
import type { AudienceRule } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { unitSubtree } from '../../db/graph.js';

/** Rules that resolve to people cap out here, as `audiencePreview` has always done. */
const MAX = 500;

/**
 * The honest count, or `null` when there is no such thing.
 *
 * **`anyone` returns null and that is the whole point of this function.** A link is a link:
 * there is no roll, no invitation list and no denominator, so any number here is invented.
 * Substituting the subject count — which is what `readResults` did until T-040 — turns the
 * response rate into responses-per-subject and renders it as a percentage: every seeded demo
 * campaign showed a RESPONSE RATE between 1750% and 4675%, on the screen the evaluator
 * reaches immediately after scanning.
 */
export async function countAudience(orgId: string, rule: AudienceRule): Promise<number | null> {
  if (rule.kind === 'anyone') return null;

  const positionWhere =
    rule.kind === 'role'
      ? { roleId: rule.roleId }
      : {
          unitId: {
            in: rule.includeSubtree ? await unitSubtree(orgId, rule.unitId) : [rule.unitId],
          },
        };

  return await prisma.node.count({
    where: {
      orgId,
      kind: 'person',
      edgesAsParent: { some: { type: 'member', child: positionWhere } },
    },
    take: MAX,
  });
}

/**
 * The rule as stored, defended against rows that predate it.
 *
 * `audience_rule` is JSONB and the column has held `{}` on campaigns created before the
 * discriminated union existed — there are such rows in the dev database right now. Zod would
 * throw on them; a results page that 500s because of an old row is worse than one that
 * treats an unreadable rule as the open case it almost certainly was.
 */
export const ruleOf = (stored: unknown): AudienceRule => {
  const kind = (stored as { kind?: string } | null)?.kind;
  return kind === 'unit' || kind === 'role' ? (stored as AudienceRule) : { kind: 'anyone' };
};
