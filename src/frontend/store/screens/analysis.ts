// EVERY FIGURE THE ANALYSIS PAGE DERIVES FROM ITS COUNTS. docs/REDUX-PLAN.md §6.12 (R-717).
//
// The server answers with counts: how many responses are in scope, and how many people were
// asked. "62% replied" and "Medium confidence" are worked out HERE, in a memoised selector
// over the RTK Query cache entry that holds those counts, so each traces to numbers on the
// page. Trace for "62% replied":
//   `state.api.queries['getAnalysis("?campaignId=…")'].data.reliability` (responseCount 31,
//   audienceEstimate 50) → `selectAnalysisFigures` → `rate` (31 of 50 · 62%) and
//   `confidence` ('medium': 31 responses, a rate that is not thin) → <ReliabilityStrip>.
//
// No slice: the page's filters are its URL, and nothing here is the reader's to change.
import { createSelector } from '@reduxjs/toolkit';
import type { AnalysisView } from '@endur/shared';
import { analysisApi } from '../api/endpoints/analysis.js';
import type { RootState } from '../index.js';
import { newestAnswer, shareOf, type Share } from './figures.js';

/** Below this many responses the figures are indicative. */
export const MEDIUM_AT = 30;
/** From this many responses they hold up. */
export const HIGH_AT = 100;
/** A known response rate under this percentage lowers the confidence by one step. */
export const THIN_PERCENT = 20;

export type Confidence = 'low' | 'medium' | 'high';

/**
 * Confidence: a 4.6 from eight responses and a 4.6 from eight hundred are different facts.
 * Count first, then one step down when the response rate is known and thin. The rate can only
 * lower it: an open link has no rate, and that is not evidence either way.
 */
export function confidenceOf(responseCount: number, rate: Share | null): Confidence {
  const base: Confidence = responseCount >= HIGH_AT ? 'high' : responseCount >= MEDIUM_AT ? 'medium' : 'low';
  if (rate === null || rate.percent >= THIN_PERCENT) return base;
  return base === 'high' ? 'medium' : 'low';
}

export type AnalysisFigures = {
  responseCount: number;
  /** The people asked; `null` where no denominator exists (an open link, or a mix with one). */
  audienceEstimate: number | null;
  /** Responses OF the people asked, with the percentage; `null` without a denominator. */
  rate: Share | null;
  confidence: Confidence;
};

/** The arithmetic, on its own so it is tested on its own. */
export function deriveAnalysisFigures(reliability: AnalysisView['reliability']): AnalysisFigures {
  const { responseCount, audienceEstimate } = reliability;
  const rate = audienceEstimate !== null && audienceEstimate > 0 ? shareOf(responseCount, audienceEstimate) : null;
  return { responseCount, audienceEstimate, rate, confidence: confidenceOf(responseCount, rate) };
}

/**
 * The analysis the page has on screen: the cached answer for these filters, or, while new
 * filters load, the newest answer (which the page keeps showing — `useLoadable`'s `data`).
 */
const selectShownAnalysis = (state: RootState, search: string): AnalysisView | undefined =>
  analysisApi.endpoints.getAnalysis.select(search)(state).data ??
  newestAnswer<AnalysisView>(state, 'getAnalysis');

/** The reliability figures, memoised: re-derived only when the cached answer changes. */
export const selectAnalysisFigures = createSelector([selectShownAnalysis], (view) =>
  view ? deriveAnalysisFigures(view.reliability) : null,
);
