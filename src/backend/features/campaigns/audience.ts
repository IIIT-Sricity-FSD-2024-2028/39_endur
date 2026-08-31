// How many people a campaign is for.
// Two callers want different answers from the same rule: the create screen wants a number to show,
// while the response-rate card wants the truth or nothing. The counting itself lives here once.
import type { AudienceRule } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { unitSubtree } from '../../db/graph.js';

// Rules that resolve to real people are capped here.
const MAX = 500;

// The honest count, or null when there is no such thing.
// 'anyone' returns null on purpose: a link has no roll and no denominator, so any number would be invented
// - and substituting the subject count is what once showed response rates of 4675%.
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

// Reads the stored rule defensively: the column is JSON and older rows hold {}, which would otherwise throw.
export const ruleOf = (stored: unknown): AudienceRule => {
  const kind = (stored as { kind?: string } | null)?.kind;
  return kind === 'unit' || kind === 'role' ? (stored as AudienceRule) : { kind: 'anyone' };
};

// The position filter for a rule that resolves to people. One implementation, so "everyone in Housekeeping"
// means the same set of people on every screen that says it.
export async function positionFilter(
  orgId: string,
  rule: Extract<AudienceRule, { kind: 'unit' | 'role' }>,
): Promise<{ roleId: string } | { unitId: { in: string[] } }> {
  if (rule.kind === 'role') return { roleId: rule.roleId };
  return {
    unitId: { in: rule.includeSubtree ? await unitSubtree(orgId, rule.unitId) : [rule.unitId] },
  };
}

// WHO, by account id - the recipients of an announcement.
// One deliberate difference from the count above: here 'anyone' means every member of staff, because an
// announcement has no link and no stranger reads it. People with no account, or a disabled one, are skipped.
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

  // Distinct, because one person can hold two positions inside the same subtree.
  return [...new Set(people.map((person) => person.userId as string))];
}
