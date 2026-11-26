// Past feedback: the members-only forms the signed-in person has answered, listed on Home under
// the forms still waiting.
//
// THAT, NEVER WHAT (INV-006). The participation row is the whole of it: a response carries no
// identity, so nothing here could lead back to an answer, the reader's own included. Public-link
// campaigns never appear: they record no participation, so there is no way to know who answered.
import type { AnsweredForm } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { statusOf } from '../campaigns/status.js';

/** A history, not an archive: past this many, the oldest are not what anybody comes back for. */
const LIMIT = 50;

export async function readAnswered(orgId: string, userId: string): Promise<AnsweredForm[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { orgId, participants: { some: { userId } } },
    // Newest first. By the campaign, because the time of the answer is not kept (see the type).
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: LIMIT,
    select: {
      id: true,
      name: true,
      publicToken: true,
      closedAt: true,
      startsAt: true,
      endsAt: true,
      subjects: { select: { subject: { select: { name: true } } } },
    },
  });

  const now = new Date();
  return campaigns.map((campaign) => {
    // Answered means launched and opened, so draft and scheduled cannot happen; read as open.
    const closed = statusOf(campaign, now) === 'closed';
    return {
      campaignId: campaign.id,
      name: campaign.name,
      about: campaign.subjects.length === 1 ? (campaign.subjects[0]?.subject.name ?? null) : null,
      status: closed ? 'closed' : 'open',
      closedAt: closed ? ((campaign.closedAt ?? campaign.endsAt)?.toISOString() ?? null) : null,
      endsAt: closed ? null : (campaign.endsAt?.toISOString() ?? null),
    };
  });
}
