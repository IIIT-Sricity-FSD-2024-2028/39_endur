// Campaign status, derived on read. DEC-016, 17-BACKGROUND-JOBS.md.
//
// THE ONLY PLACE THIS IS COMPUTED. Every read path calls in here; a second copy of these
// five lines somewhere else is exactly the drift that dropping the stored column was meant
// to end.
//
// Why derived rather than stored: a stored status needs something to write it, and that
// something is a scheduler — a timer that can be late, be down, or leave a row stuck
// between states on the one morning it matters. Derivation cannot drift from the dates
// because it IS the dates.
import type { CampaignStatus } from '@endur/shared';

export type StatusFacts = {
  publicToken: string | null;
  closedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

export function statusOf(campaign: StatusFacts, now: Date = new Date()): CampaignStatus {
  // An explicit close wins over the dates. Somebody pressing Close means it now, and a
  // scheduled end date that has not arrived must not reopen it.
  if (campaign.closedAt) return 'closed';
  // No token means it was never launched. Minting the token is the irreversible act, and
  // it is exactly what "has left draft" means.
  if (!campaign.publicToken) return 'draft';
  if (campaign.startsAt && campaign.startsAt.getTime() > now.getTime()) return 'scheduled';
  if (campaign.endsAt && campaign.endsAt.getTime() < now.getTime()) return 'closed';
  return 'open';
}

/** Accepting a response is a narrower question than "is it open": it is only ever `open`. */
export const isAccepting = (campaign: StatusFacts, now: Date = new Date()): boolean =>
  statusOf(campaign, now) === 'open';

/**
 * The `where` fragment that finds campaigns of a given status, so a list can filter in SQL
 * rather than reading every row and discarding most of them.
 *
 * It restates the derivation in Prisma's vocabulary, which is the one duplication this
 * design costs — so the test that pins it compares this against statusOf() directly rather
 * than trusting that they were written together.
 */
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
