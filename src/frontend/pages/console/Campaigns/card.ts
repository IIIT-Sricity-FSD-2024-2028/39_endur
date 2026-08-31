// The campaign CARD's derived vocabulary: its status chip, its timing sentence, and the one
// note a quick campaign owes its owner. 38, design_specs/design/06 §6.1.
//
// Not to be confused with `summary.ts` next door, which writes the sentence the LAUNCH step
// restates before an irreversible action. This file is what a campaign looks like in a list.
//
// SPLIT OUT OF index.tsx BY N-079, and the reason is a bundle rather than a tidy-up.
// `<Involvement>` (24 §4) prints the same chip and the same sentence on `/app/people/:id` and
// `/app/profile`, and importing them from the page module pulled the whole campaigns LIST into
// both routes — `<ShareSheet>` and its QR library included, ~30 kB for two screens that show
// no QR code. Four readers import this file instead: the list, the campaign detail page, the
// results page and `<Involvement>`.
import type { CampaignStatus, CampaignSummary } from '@endur/shared';
import { formatDate, pluralise } from '../../../lib/format.js';

/** Status is DATA, derived on read — so the tag is a lookup, never a computation here. */
export const STATUS_TAG: Record<CampaignStatus, { label: string; className: string }> = {
  open: { label: 'Collecting', className: 'tag tag-accent-2' },
  scheduled: { label: 'Scheduled', className: 'tag tag-neutral' },
  draft: { label: 'Draft', className: 'tag tag-neutral is-draft' },
  closed: { label: 'Closed', className: 'tag tag-outline' },
};

/**
 * The two categories `POST /campaigns/quick` writes (`DEC-088`). They are DATA — a reader
 * who edits the category loses the badge and nothing else breaks, which is the cost that
 * decision accepted in exchange for having no discriminator column.
 */
export const QUICK_CATEGORIES = ['Poll', 'Suggestion box'];

/**
 * The sentence a quick campaign's card owes its owner before anybody asks (`T-092`).
 *
 * A suggestion box collects anonymously and shows NOTHING until `resultsThreshold` people
 * have answered — the k-anonymity gate, enforced in SQL (INV-005) — so the first two
 * answers on stage land in a screen that looks broken. It is not broken, and the honest fix
 * is to say the number, never to lower it.
 *
 * Only on the quick surfaces: a feedback round is read on the Results page, which says the
 * same thing itself, and repeating it on every card in the list would be noise.
 */
export function suppressionNote(campaign: CampaignSummary): string | null {
  if (!QUICK_CATEGORIES.includes(campaign.templateCategory)) return null;
  if (campaign.status === 'draft') return null;
  if (campaign.responseCount >= campaign.resultsThreshold) return null;
  return `Answers appear once ${campaign.resultsThreshold} people have responded. ${campaign.responseCount} so far.`;
}

/** "ends in 6 days" / "starts 1 Sep". The line that makes a card feel live. */
export function timing(
  /**
   * WIDENED TO THE FOUR FIELDS IT READS, so `<Involvement>` can print the same sentence about
   * the same campaign (`N-079`). It was `CampaignSummary`, which meant a person's page —
   * holding a `PersonCampaign`, a strictly smaller shape — would have needed a fourth copy of
   * "ends in 3 days". `closedAt` is optional rather than required because a shape that can
   * never be `closed` has no closing date to carry.
   */
  campaign: Pick<CampaignSummary, 'status' | 'startsAt' | 'endsAt'> & { closedAt?: string | null },
  now = Date.now(),
): string | null {
  if (campaign.status === 'closed') {
    return campaign.closedAt ? `closed ${formatDate(campaign.closedAt)}` : 'closed';
  }
  if (campaign.status === 'scheduled' && campaign.startsAt) {
    return `starts ${formatDate(campaign.startsAt)}`;
  }
  if (campaign.status === 'open' && campaign.endsAt) {
    // FLOOR, not ceil. With ceil, a campaign closing in six hours reads "ends in 1 day" —
    // it rounds AWAY from the deadline, which is the one direction that misleads. Floor
    // says "ends today" for anything inside twenty-four hours, which is what is true.
    const remaining = new Date(campaign.endsAt).getTime() - now;
    if (remaining < 0) return 'ending';
    const days = Math.floor(remaining / 86_400_000);
    if (days === 0) return 'ends today';
    return `ends in ${pluralise(days, 'day', 'days')}`;
  }
  return null;
}
