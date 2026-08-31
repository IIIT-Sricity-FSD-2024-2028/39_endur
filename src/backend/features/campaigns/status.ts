// A campaign's status, worked out from its dates every time it is read, and only here.
// Stored status would need a scheduler to write it, and a timer can be late, be down, or leave a row stuck.
import type { CampaignStatus } from '@endur/shared';

export type StatusFacts = {
  publicToken: string | null;
  closedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

// The status of one campaign right now.
export function statusOf(campaign: StatusFacts, now: Date = new Date()): CampaignStatus {
  // An explicit close wins over the dates: pressing Close means now, and a later end date must not reopen it.
  if (campaign.closedAt) return 'closed';
  // No public token means it was never launched: minting the token is what leaving draft means.
  if (!campaign.publicToken) return 'draft';
  if (campaign.startsAt && campaign.startsAt.getTime() > now.getTime()) return 'scheduled';
  if (campaign.endsAt && campaign.endsAt.getTime() < now.getTime()) return 'closed';
  return 'open';
}

// Accepting answers is a narrower question than "is it open": only an open campaign accepts.
export const isAccepting = (campaign: StatusFacts, now: Date = new Date()): boolean =>
  statusOf(campaign, now) === 'open';

// The same rule written as a database filter, so a list can select by status in SQL
// instead of reading every row. A test compares the two directly, so they cannot drift apart.
export function whereStatus(status: CampaignStatus, now: Date = new Date()) {
  switch (status) {
    case 'draft':
      return { publicToken: null, closedAt: null };
    case 'scheduled':
      return { NOT: { publicToken: null }, closedAt: null, startsAt: { gt: now } };
    case 'closed':
      return {
        OR: [
          { NOT: { closedAt: null } },
          { NOT: { publicToken: null }, closedAt: null, endsAt: { lt: now } },
        ],
      };
    case 'open':
    default:
      return {
        NOT: { publicToken: null },
        closedAt: null,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      };
  }
}
