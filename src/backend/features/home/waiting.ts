// Members-only forms waiting for the signed-in person: the card at the top of Home, and the
// count beside Home in the sidebar.
//
// WHO IT IS FOR is the campaign's audience rule, the same rule that is its denominator
// (`campaigns/audience.ts`): a role, a unit (and maybe everything under it), or anyone in the
// organisation. WHETHER THEY HAVE ANSWERED is the participation row, which says THAT and never
// WHAT (INV-006). Nothing here reads a response.
import type { AudienceRule, WaitingForm } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { unitSubtree } from '../../db/graph.js';
import { whereStatus } from '../campaigns/status.js';
import { ruleOf } from '../campaigns/audience.js';

/** A card, not a queue: past this many, the oldest-closing first is what matters. */
const LIMIT = 20;

export async function readWaiting(orgId: string, userId: string): Promise<WaitingForm[]> {
  const campaigns = await prisma.campaign.findMany({
    where: {
      orgId,
      access: 'organization',
      ...whereStatus('open'),
      participants: { none: { userId } },
    },
    // Closing soonest first: that is the one the reader would otherwise miss.
    orderBy: [{ endsAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    // Wider than LIMIT, because some of these are for other people and are dropped below.
    take: 100,
    select: {
      id: true,
      name: true,
      publicToken: true,
      endsAt: true,
      audienceRule: true,
      template: { select: { estimatedSeconds: true, _count: { select: { questions: true } } } },
      subjects: { select: { subject: { select: { name: true } } } },
    },
  });
  if (campaigns.length === 0) return [];

  const forMe = await audienceTest(orgId, userId);
  const waiting: WaitingForm[] = [];
  for (const campaign of campaigns) {
    if (waiting.length === LIMIT) break;
    // Open means launched, so the token is there; the check keeps the type honest.
    if (!campaign.publicToken) continue;
    if (!(await forMe(ruleOf(campaign.audienceRule)))) continue;
    waiting.push({
      campaignId: campaign.id,
      token: campaign.publicToken,
      name: campaign.name,
      about: campaign.subjects.length === 1 ? (campaign.subjects[0]?.subject.name ?? null) : null,
      questionCount: campaign.template._count.questions,
      estimatedSeconds: campaign.template.estimatedSeconds,
      endsAt: campaign.endsAt?.toISOString() ?? null,
    });
  }
  return waiting;
}

/**
 * "Is this rule about me?", answered from the caller's positions, read once.
 *
 * The same reading of a rule as `positionFilter`: a role rule matches a position holding that
 * role, a unit rule a position in that unit (or under it, with `includeSubtree`).
 */
async function audienceTest(
  orgId: string,
  userId: string,
): Promise<(rule: AudienceRule) => Promise<boolean>> {
  const positions = await prisma.node.findMany({
    where: {
      orgId,
      kind: 'position',
      edgesAsChild: { some: { type: 'member', parent: { kind: 'person', userId } } },
    },
    select: { roleId: true, unitId: true },
  });
  const roles = new Set(positions.flatMap((position) => (position.roleId ? [position.roleId] : [])));
  const units = new Set(positions.flatMap((position) => (position.unitId ? [position.unitId] : [])));

  const subtrees = new Map<string, string[]>();
  const subtree = async (unitId: string): Promise<string[]> => {
    const known = subtrees.get(unitId);
    if (known) return known;
    const found = await unitSubtree(orgId, unitId);
    subtrees.set(unitId, found);
    return found;
  };

  return async (rule) => {
    if (rule.kind === 'anyone') return true;
    if (rule.kind === 'role') return roles.has(rule.roleId);
    const covered = rule.includeSubtree ? await subtree(rule.unitId) : [rule.unitId];
    return covered.some((unitId) => units.has(unitId));
  };
}
