// The analysis layer.
// This file has NO query in it and must not grow one: it reads the corpus from the results service,
// which owns the anonymity gate, and runs the engine next door over the text.
// The corpus type only has a comments field on the not-suppressed branch, so the gate cannot be forgotten.
import type { AnalysisQuery, AnalysisView, ThemeDetail, ThemeSummary } from '@endur/shared';
import type { Request } from 'express';
import { NotFoundError } from '../../lib/errors.js';
import { readCorpus, type Corpus, type CorpusFilter } from '../results/service.js';
import type { CommentRow } from '../results/service.js';
import { analyse, type Document, type Theme } from './engine.js';

// Below the first number the figures are indicative; above the second they hold up.
const MEDIUM_AT = 30;
const HIGH_AT = 100;
// A known response rate below this lowers the confidence by one step.
const THIN_RATE = 0.2;

// The analysis overview for the current filters.
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
    // Nothing but the counts: no zeroed themes, no empty sentiment split - a client cannot render what it never received.
    return { suppressed: true, threshold: corpus.threshold, reliability };
  }

  const previous = window.previous
    ? await readCorpus(req, orgId, userId, authzVersion, { ...filterOf(query), ...window.previous })
    : null;

  const result = analyse({
    documents: corpus.comments.map(documentOf),
    // The comparison window is gated too: a change figure is still information about that window.
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

// The drill-through recomputes rather than storing themes, which is what makes the engine's determinism
// load-bearing: the same corpus must produce the same themes here as on the overview.
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
  // Suppressed and "no such theme" give the SAME 404: a distinct message would confirm that comments exist.
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

// Plumbing.

const keyOf = (comment: CommentRow): string => `${comment.responseId}:${comment.questionId}`;

const documentOf = (comment: CommentRow): Document => ({
  responseId: comment.responseId,
  key: keyOf(comment),
  text: comment.comment,
  at: comment.submittedAt,
  // Normalised by its own scale, because 4 out of 5 and 4 out of 10 are different opinions.
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

// The 'to' date is inclusive of the day somebody picked, so it becomes midnight the following day.
// The comparison window exists only when both ends are given, or the change figure would be measured
// against a window nobody chose.
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

// How much weight to put on these numbers, from the response count and rate.
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

// Confidence: a 4.6 from eight responses and a 4.6 from eight hundred are different facts.
// Count first, then one downgrade when the response rate is known and thin. The rate can only lower it.
function confidenceOf(responseCount: number, rate: number | null): 'low' | 'medium' | 'high' {
  const base = responseCount >= HIGH_AT ? 'high' : responseCount >= MEDIUM_AT ? 'medium' : 'low';
  if (rate === null || rate >= THIN_RATE) return base;
  return base === 'high' ? 'medium' : 'low';
}
