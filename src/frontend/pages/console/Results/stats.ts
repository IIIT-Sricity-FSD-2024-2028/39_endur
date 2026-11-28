// The four stat cards, as pure functions. 40 § Interactions, design_specs/design/08 §8.1.
//
// Separated from the page for the reason every other `*.ts` beside a page in this repo is:
// each of these has a plural, an agreement or a "there is no such number" case in it, and
// this screen is the second half of the demo's decisive beat. A rule assembled inside JSX is
// one nobody can check without rendering the whole page.
import type { ResultsFigures } from '../../../store/screens/results.js';

export type Stat = {
  kicker: string;
  value: string;
  context?: string | undefined;
};

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;

/**
 * The four cards, worded. Every NUMBER on them is `selectResultsFigures`'
 * (store/screens/results.ts, R-717): this only chooses the words around it.
 */
export function statCards(figures: ResultsFigures, arrived: number): Stat[] {
  const { rating, comments, commentShare } = figures;
  return [
    {
      kicker: 'Responses',
      value: String(figures.responseCount),
      // The API carries no "+18 today" and inventing a window would be inventing a number.
      // What it does carry is the arrival this poll just saw, which is the thing the
      // evaluator is watching for anyway.
      ...(arrived > 0 ? { context: `+${arrived} just now` } : {}),
    },
    responseRateCard(figures),
    rating
      ? {
          kicker: 'Avg rating',
          value: rating.average.toFixed(1),
          context: `across ${plural(rating.over, 'question')}`,
        }
      : { kicker: 'Avg rating', value: '—', context: 'no rating questions on this form' },
    {
      kicker: 'Comments',
      value: String(comments),
      ...(commentShare ? { context: `${commentShare.percent}% of ${commentShare.of} responses left one` } : {}),
    },
  ];
}

/**
 * The card that was wrong until T-040, and wrong in the most visible way available.
 *
 * There is no rate whenever the audience is "anyone with the link", because a link has no
 * roll and therefore no denominator. Rendering that as a dash **and saying why** is the
 * honest answer; the alternative the server used to give was responses-divided-by-subjects,
 * which showed between 1750% and 4675% on every seeded demo campaign.
 */
function responseRateCard(figures: ResultsFigures): Stat {
  const { rate } = figures;
  if (rate === null) {
    return {
      kicker: 'Response rate',
      value: '—',
      context: 'anyone with the link can respond, so there is no total to measure against',
    };
  }
  // OVER THE ROLL IS NOT A PERCENTAGE WORTH PRINTING (N-069). `access: 'public'` and a unit
  // audience is the commonest shape in the product (DEC-037), and it means the numerator
  // counts everyone holding the link while the denominator counts only the people expected
  // to answer. 135% is arithmetically true and reads as a broken dashboard, so above the
  // roll the card states the two counts and says why they do not divide.
  if (figures.overRoll) {
    return {
      kicker: 'Responses',
      value: `${rate.count} of ${rate.of} asked`,
      context: 'more answers than people asked — anyone holding the link can respond',
    };
  }
  // The percentage with the two counts it was divided from, so it can be checked (§6.12).
  return {
    kicker: 'Response rate',
    value: `${rate.percent}%`,
    context: `${rate.count} of ${rate.of} asked`,
  };
}

/**
 * Which comments arrived since the reader last looked.
 *
 * Compared against a timestamp captured on the FIRST successful load, so opening a page with
 * 287 comments does not flash all 287 (`21` §7). Returns ids rather than mutating the items,
 * because "is this new" is a property of the viewing, not of the response.
 */
export const newSince = (
  items: Array<{ id: string; submittedAt: string }>,
  since: string | null,
): Set<string> =>
  new Set(since === null ? [] : items.filter((item) => item.submittedAt > since).map((i) => i.id));
