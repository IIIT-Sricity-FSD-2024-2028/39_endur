// The Analyze layer. 43, 13 § Reserved (now built), DEC-042.
//
// Results say WHAT HAPPENED. Analysis says WHAT IT MEANS — and the difference between
// those two is the whole reason this file is careful.
//
// Every number here is arithmetic over text nobody sent anywhere: stop-words, stemming,
// document frequency, a sentiment lexicon, and a Pearson correlation over `numeric_value`
// (DEC-042). There is no model, no key, and no outbound request, and a test asserts that
// by ABSENCE rather than by reading the code.
import { z } from 'zod';
import { dto } from './common.js';
import { Id } from './common.js';
import type { Valence } from './results.js';

/**
 * A theme id is DERIVED FROM THE THEME, not stored. It is the stemmed key term, so
 * `valet parking` is `valet-parking` and stays that across requests without a table.
 *
 * That is what makes `GET /analysis/themes/:id` possible at all: the detail route
 * recomputes the corpus and filters to the theme, and it lands on the same theme both
 * times because the engine is deterministic (43 § Acceptance). A themes TABLE would have
 * been the alternative, and it would have needed a job to keep it fresh (OPEN-005 owns
 * nothing yet) and would have gone stale the moment a response arrived.
 */
export const ThemeId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)?$/).max(64);

/**
 * `from`/`to` are dates, not timestamps — a range a person picks in a date field. Both or
 * neither matters: `delta` is measured against the window immediately preceding this one,
 * so a window with no defined start has nothing to be compared with.
 */
export const AnalysisQuery = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  campaignId: Id.optional(),
  unitId: Id.optional(),
  subjectId: Id.optional(),
});
export type AnalysisQuery = z.infer<typeof AnalysisQuery>;

export const AnalysisDto = dto({ query: AnalysisQuery });
export const ThemeDetailDto = dto({
  params: z.object({ id: ThemeId }),
  query: AnalysisQuery,
});

/** One theme, as the overview lists it. */
export type ThemeSummary = {
  id: string;
  label: string;
  /** Comments containing the theme. Documents, not word occurrences — one ranty comment
   *  that says "parking" nine times is one person, and counting it nine times would say
   *  the opposite of what happened. */
  mentions: number;
  /** 0-100, where 50 is neutral. The mean lexicon score of the theme's own comments. */
  score: number;
  /**
   * Stated by the server, never derived by the client (CONF-004). It is legitimate HERE
   * for the same reason it is legitimate on an NPS band in `40`: the lexicon DEFINES which
   * words are good and which are bad, so its sign is a definition rather than an inference
   * from arithmetic.
   */
  valence: Valence;
  /**
   * Mentions in this window minus mentions in the window immediately before it, of equal
   * length. **`null` when there is no such window** — which is the normal case, because
   * `from` and `to` are both optional. A `0` there would be a claim that nothing changed,
   * and we would not know that (DEC-061).
   */
  delta: number | null;
};

export type AnalysisView = {
  /**
   * Below the k-anonymity threshold the body carries no analysis AT ALL — not zeroed, not
   * empty arrays: the fields are absent. Identical to `40`, and for the identical reason:
   * a client cannot render what it was never sent (52 §2, INV-007).
   */
  suppressed: boolean;
  threshold: number;
  reliability: {
    /** Responses in scope, not comments. Two written answers on one response are one person. */
    responseCount: number;
    /**
     * `null` where no denominator exists — an `anyone` audience has none, and summing
     * across campaigns where one of them is `anyone` would understate the denominator and
     * so overstate the rate. `40` learned this at `T-040` and it is the same field.
     */
    audienceEstimate: number | null;
    responseRate: number | null;
    confidence: 'low' | 'medium' | 'high';
  };
  /** Comment counts, not percentages. The client can divide; it cannot un-round. */
  sentiment?: { positive: number; neutral: number; negative: number };
  trend?: Array<{ date: string; positive: number; neutral: number; negative: number }>;
  themes?: ThemeSummary[];
  drivers?: Array<{
    id: string;
    label: string;
    /** Pearson r between the theme's presence on a response and that response's own
     *  rating, -1..1. Arithmetic over `numeric_value` (10 §4.4), not inference. */
    impact: number;
    valence: Valence;
  }>;
  /** How many written answers the numbers above were computed from. */
  commentCount?: number;
};

/** The drill-through. A theme without its source comments is an unfalsifiable label (43). */
export type ThemeDetail = ThemeSummary & {
  comments: Array<{
    responseId: string;
    questionId: string;
    at: string;
    campaign: { id: string; name: string };
    subject: { id: string; name: string } | null;
    questionText: string;
    comment: string;
    score: number | null;
    scoreMax: number | null;
    /** This comment's own lexicon reading, so the list can be read for WHY the theme
     *  scored as it did rather than only for what it contains. */
    valence: Valence;
  }>;
};
