// The four stat cards, as pure functions. 40 § Interactions, design_specs/design/08 §8.1.
//
// Separated from the page for the reason every other `*.ts` beside a page in this repo is:
// each of these has a plural, an agreement or a "there is no such number" case in it, and
// this screen is the second half of the demo's decisive beat. A rule assembled inside JSX is
// one nobody can check without rendering the whole page.
import type { QuestionSummary, ResultsView } from '@endur/shared';

export type Stat = {
  kicker: string;
  value: string;
  context?: string | undefined;
};

/** Ratings only. NPS is a 0–10 instrument and averaging it with a 1–5 scale is nonsense. */
export function ratingAverage(questions: QuestionSummary[]): { average: number; over: number } | null {
  const rated = questions.filter(
    (question) => question.kind === 'rating' && typeof question.average === 'number',
  );
  if (rated.length === 0) return null;
  const total = rated.reduce((sum, question) => sum + (question.average ?? 0), 0);
  return { average: Math.round((total / rated.length) * 10) / 10, over: rated.length };
}

/** A "comment" is an answer to a free-text question. There is no other kind. */
export const commentCount = (questions: QuestionSummary[]): number =>
  questions
    .filter((question) => question.kind === 'text')
    .reduce((sum, question) => sum + question.answered, 0);

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;

export function statCards(view: ResultsView, arrived: number): Stat[] {
  const questions = view.questions ?? [];
  const rating = ratingAverage(questions);
  const comments = commentCount(questions);

  return [
    {
      kicker: 'Responses',
      value: String(view.responseCount),
      // The API carries no "+18 today" and inventing a window would be inventing a number.
      // What it does carry is the arrival this poll just saw, which is the thing the
      // evaluator is watching for anyway.
      ...(arrived > 0 ? { context: `+${arrived} just now` } : {}),
    },
    responseRateCard(view),
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
      ...(view.responseCount > 0
        ? { context: `${Math.round((comments / view.responseCount) * 100)}% left one` }
        : {}),
    },
  ];
}

/**
 * The card that was wrong until T-040, and wrong in the most visible way available.
 *
 * `responseRate` is null whenever the audience is "anyone with the link", because a link has
 * no roll and therefore no denominator. Rendering that as a dash **and saying why** is the
 * honest answer; the alternative the server used to give was responses-divided-by-subjects,
 * which showed between 1750% and 4675% on every seeded demo campaign.
 */
function responseRateCard(view: ResultsView): Stat {
  if (view.responseRate === null || view.audienceEstimate === null) {
    return {
      kicker: 'Response rate',
      value: '—',
      context: 'anyone with the link can respond, so there is no total to measure against',
    };
  }
  return {
    kicker: 'Response rate',
    value: `${Math.round(view.responseRate * 100)}%`,
    context: `of ${view.audienceEstimate}`,
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
