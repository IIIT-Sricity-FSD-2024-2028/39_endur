// The Analyze layer. 43, DEC-042.
//
// THIS FILE HAS NO QUERY IN IT, AND MUST NOT GROW ONE. It imports `readCorpus()` from the
// results service and `analyse()` from the engine next door, and that is the whole of its
// access to anything. `features/inbox/` is built the same way for the same reason
// (DEC-058): a list of individual comments is what the k-anonymity gate exists to
// withhold, and analysis is a list of individual comments with arithmetic on top.
//
// `readCorpus` returns a UNION whose `comments` field exists only on the unsuppressed
// branch, so the gate here is not a check that could be forgotten — it is the type.
import type { AnalysisQuery, AnalysisView, ThemeDetail, ThemeSummary } from '@endur/shared';
import type { Request } from 'express';
import { NotFoundError } from '../../lib/errors.js';
import { readCorpus, type Corpus, type CorpusFilter } from '../results/service.js';
import type { CommentRow } from '../results/service.js';
import { analyse, type Document, type Theme } from './engine.js';

/** Below this many responses the numbers are indicative; above the second, they hold up. */
const MEDIUM_AT = 30;
const HIGH_AT = 100;
/** A known response rate under this downgrades confidence one step. See `confidenceOf`. */
const THIN_RATE = 0.2;

export async function readAnalysis(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  query: AnalysisQuery,
): Promise<AnalysisView> {
  const window = windowOf(query);
  const corpus = await readCorpus(req, orgId, userId, authzVersion, { ...filterOf(query), ...window.now });

  const reliability = reliabilityOf(corpus);
  if (corpus.suppressed) {
    // Nothing but the counts. Not zeroed themes, not an empty sentiment split — absent,
    // exactly as `40` does it, because a client cannot render what it never received.
    return { suppressed: true, threshold: corpus.threshold, reliability };
  }

  const previous = window.previous
    ? await readCorpus(req, orgId, userId, authzVersion, { ...filterOf(query), ...window.previous })
    : null;

  const result = analyse({
    documents: corpus.comments.map(documentOf),
    // The previous window is gated too. A `delta` is a count derived from that window, and
    // a count from a below-threshold window is still information about it.
    ...(previous && !previous.suppressed
      ? { previous: previous.comments.map(documentOf) }
      : {}),
  });

  return {
    suppressed: false,
    threshold: corpus.threshold,
    reliability,
    sentiment: result.sentiment,
    trend: result.trend,
    themes: result.themes.map(summaryOf),
    drivers: result.drivers,
    commentCount: corpus.comments.length,
  };
}

/**
 * The drill-through. It recomputes rather than reading a stored theme, which is what makes
 * the engine's determinism load-bearing rather than a nicety: the same corpus produces the
 * same twelve themes here as it did on the overview, or this route 404s on an id the page
 * is currently displaying.
 */
export async function readTheme(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  themeId: string,
  query: AnalysisQuery,
): Promise<ThemeDetail> {
  const missing = 'That theme is not in the current analysis.';

  const window = windowOf(query);
  const corpus = await readCorpus(req, orgId, userId, authzVersion, { ...filterOf(query), ...window.now });
  // Suppressed and absent produce THE SAME 404. A distinct "below the threshold" message
  // here would confirm that comments exist and are being withheld, which is the one thing
  // the suppression is for (52 §2, and the same reasoning as the inbox's write routes).
  if (corpus.suppressed) throw new NotFoundError(missing);

  const byKey = new Map(corpus.comments.map((comment) => [keyOf(comment), comment]));
  const result = analyse({ documents: corpus.comments.map(documentOf) });
  const theme = result.themes.find((candidate) => candidate.id === themeId);
  if (!theme) throw new NotFoundError(missing);

  return {
    ...summaryOf(theme),
    comments: theme.members.flatMap((key) => {
      const comment = byKey.get(key);
      if (!comment) return [];
      return [
        {
          responseId: comment.responseId,
          questionId: comment.questionId,
          at: comment.submittedAt.toISOString(),
          campaign: comment.campaign,
          subject: comment.subject,
          questionText: comment.questionText,
          comment: comment.comment,
          score: comment.score,
          scoreMax: comment.scoreMax,
          valence: result.valenceOf.get(key) ?? 'neutral',
        },
      ];
    }),
  };
}

/* ---------------------------------------------------------------- plumbing */

const keyOf = (comment: CommentRow): string => `${comment.responseId}:${comment.questionId}`;

const documentOf = (comment: CommentRow): Document => ({
  responseId: comment.responseId,
  key: keyOf(comment),
  text: comment.comment,
  at: comment.submittedAt,
  // Normalised by its OWN scale, because a 4 out of 5 and a 4 out of 10 are different
  // opinions and a correlation cannot be run over a column that mixes them.
  rating:
    comment.score === null || comment.scoreMax === null || comment.scoreMax <= 1
      ? null
      : (comment.score - 1) / (comment.scoreMax - 1),
});

const summaryOf = (theme: Theme): ThemeSummary => ({
  id: theme.id,
  label: theme.label,
  mentions: theme.mentions,
  score: theme.score,
  valence: theme.valence,
  delta: theme.delta,
});

const filterOf = (query: AnalysisQuery): Omit<CorpusFilter, 'from' | 'to'> => ({
  ...(query.campaignId ? { campaignId: query.campaignId } : {}),
  ...(query.unitId ? { unitId: query.unitId } : {}),
  ...(query.subjectId ? { subjectId: query.subjectId } : {}),
});

/**
 * `to` is INCLUSIVE of the day a person picked — they chose a date on a calendar, not an
 * instant — so it becomes an exclusive bound at that day's midnight plus one.
 *
 * The comparison window exists only when both ends are given. Anchoring "the period before"
 * to an open-ended range would mean inventing a start date, and `delta` would then be a
 * number measured against a window nobody chose.
 */
function windowOf(query: AnalysisQuery): {
  now: { from?: Date; to?: Date };
  previous: { from: Date; to: Date } | null;
} {
  const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : null;
  const to = query.to ? new Date(`${query.to}T00:00:00.000Z`) : null;
  const toExclusive = to ? new Date(to.getTime() + 86_400_000) : null;

  const now = {
    ...(from ? { from } : {}),
    ...(toExclusive ? { to: toExclusive } : {}),
  };
  if (!from || !toExclusive) return { now, previous: null };

  const span = toExclusive.getTime() - from.getTime();
  return { now, previous: { from: new Date(from.getTime() - span), to: from } };
}

function reliabilityOf(corpus: Corpus): AnalysisView['reliability'] {
  const rate =
    corpus.audienceEstimate && corpus.audienceEstimate > 0
      ? Math.round((corpus.responseCount / corpus.audienceEstimate) * 100) / 100
      : null;
  return {
    responseCount: corpus.responseCount,
    audienceEstimate: corpus.audienceEstimate,
    responseRate: rate,
    confidence: confidenceOf(corpus.responseCount, rate),
  };
}

/**
 * `43` § Reliability calls this the differentiator, and it is: a 4.6 from eight responses
 * and a 4.6 from eight hundred are different facts, and presenting them identically is the
 * most common way a feedback dashboard lies.
 *
 * Count first, then ONE downgrade when the rate is known and thin — because forty responses
 * out of a thousand invitations is forty people who felt strongly enough to write, and that
 * is a different population from forty out of fifty. The rate can only ever lower the
 * reading, never raise it: a high rate on nine responses is still nine people.
 */
function confidenceOf(responseCount: number, rate: number | null): 'low' | 'medium' | 'high' {
  const base = responseCount >= HIGH_AT ? 'high' : responseCount >= MEDIUM_AT ? 'medium' : 'low';
  if (rate === null || rate >= THIN_RATE) return base;
  return base === 'high' ? 'medium' : 'low';
}
