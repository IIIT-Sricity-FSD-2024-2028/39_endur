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

  return await prisma.node.count({
    where: {
      orgId,
      kind: 'person',
      edgesAsParent: { some: { type: 'member', child: await positionFilter(orgId, rule) } },
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

/**
 * The position filter for a rule that resolves to people. ONE implementation, T-094.
 *
 * It was written twice before — once in `countAudience` above and once inside
 * `audiencePreview` — and announcements would have made it three. "Everyone in
 * Housekeeping" has to mean the same set of people on every surface that says it, and
 * three copies of a subtree walk is exactly how that stops being true.
 */
export async function positionFilter(
  orgId: string,
  rule: Extract<AudienceRule, { kind: 'unit' | 'role' }>,
): Promise<{ roleId: string } | { unitId: { in: string[] } }> {
  if (rule.kind === 'role') return { roleId: rule.roleId };
  return {
    unitId: { in: rule.includeSubtree ? await unitSubtree(orgId, rule.unitId) : [rule.unitId] },
  };
}

/**
 * WHO, by user id — the recipients of an announcement (T-094).
 *
 * Deliberately different from `countAudience` in one place: **`anyone` resolves to the whole
 * organisation here rather than to null.** On a campaign `anyone` means "whoever holds the
 * link" and there is no roll to count; an announcement has no link and is never read by a
 * stranger, so the widest audience it can have is every member of staff. Same rule, two
 * surfaces, and the difference is stated rather than inherited by accident.
 *
 * People with no account are skipped, because a receipt is a row against a `users` id and
 * somebody who cannot sign in cannot read the notice. Disabled accounts are skipped for the
 * same reason. Both are what makes the read denominator honest.
 */
export async function audienceUsers(orgId: string, rule: AudienceRule): Promise<string[]> {
  if (rule.kind === 'anyone') {
    const users = await prisma.user.findMany({
      where: { orgId, disabledAt: null },
      select: { id: true },
      take: MAX,
    });
    return users.map((user) => user.id);
  }

  const people = await prisma.node.findMany({
    where: {
      orgId,
      kind: 'person',
      userId: { not: null },
      user: { disabledAt: null },
      edgesAsParent: { some: { type: 'member', child: await positionFilter(orgId, rule) } },
    },
    select: { userId: true },
    take: MAX,
  });

  // Distinct: one person can hold two positions inside the same subtree, and the receipt
  // table is keyed on (announcement, user), so a duplicate would be refused anyway.
  return [...new Set(people.map((person) => person.userId as string))];
}
