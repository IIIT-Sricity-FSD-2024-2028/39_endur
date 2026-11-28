// R-717: the customer console's response rates are selectors', as `/ops`' figures are
// (§6.12). The server sends counts; these pin that each selector reads the RTK Query cache
// entry for what the page asked for, divides the two counts, keeps the last answer on screen
// while the next loads, and is memoised.
import { describe, expect, it } from 'vitest';
import type { AnalysisView, HomeView, ResultsView } from '@endur/shared';
import { setupStore } from '../index.js';
import { homeApi } from '../api/endpoints/home.js';
import { resultsApi } from '../api/endpoints/results.js';
import { analysisApi } from '../api/endpoints/analysis.js';
import { deriveHomeFigures, homeRangeChosen, selectHomeFigures } from './home.js';
import { deriveResultsFigures, selectResultsFigures } from './results.js';
import { confidenceOf, deriveAnalysisFigures, selectAnalysisFigures } from './analysis.js';
import { shareOf } from './figures.js';

const stats = (over: Partial<HomeView['stats']> = {}): HomeView['stats'] => ({
  window: '30d',
  responses: 40,
  subjectsCovered: 6,
  activeCampaigns: 2,
  audience: { asked: 50, answered: 37 },
  responsesEver: 900,
  ...over,
});
const home = (over: Partial<HomeView['stats']> = {}): HomeView => ({
  stats: stats(over),
  prompts: [],
  configured: true,
});

const results = (over: Partial<ResultsView> = {}): ResultsView => ({
  responseCount: 612,
  audienceEstimate: 800,
  suppressed: false,
  threshold: 5,
  questions: [
    { questionId: 'q1', kind: 'rating', text: 'Rate it', answered: 612, average: 4.3 },
    { questionId: 'q2', kind: 'rating', text: 'Rate that', answered: 600, average: 3.9 },
    { questionId: 'q3', kind: 'text', text: 'Anything else?', answered: 287 },
  ],
  ...over,
});

const analysis = (responseCount: number, audienceEstimate: number | null): AnalysisView => ({
  suppressed: false,
  threshold: 5,
  reliability: { responseCount, audienceEstimate },
});

describe('the home response rate', () => {
  it('is the answered count OF the people asked, the two counts the server sent', () => {
    expect(deriveHomeFigures(stats()).rate).toEqual({ count: 37, of: 50, percent: 74 });
    expect(deriveHomeFigures(stats()).overRoll).toBe(false);
  });

  it('is no rate at all, not 0%, when no campaign has a countable audience', () => {
    expect(deriveHomeFigures(stats({ audience: null })).rate).toBeNull();
  });

  it('is a real 0% when people were asked and nobody answered', () => {
    expect(deriveHomeFigures(stats({ audience: { asked: 10, answered: 0 } })).rate?.percent).toBe(0);
  });

  it('marks more answers than people asked, rather than hiding the percentage', () => {
    const figures = deriveHomeFigures(stats({ audience: { asked: 40, answered: 54 } }));
    expect(figures.rate?.percent).toBe(135);
    expect(figures.overRoll).toBe(true);
  });

  it('reads the cache entry for the range in state.home.range, and keeps it while the next loads', async () => {
    const store = setupStore();
    expect(selectHomeFigures(store.getState())).toBeNull();

    await store.dispatch(homeApi.util.upsertQueryData('getHome', '30d', home()));
    const thirty = selectHomeFigures(store.getState());
    expect(thirty?.rate?.percent).toBe(74);
    // Memoised: an unrelated action does not re-derive.
    store.dispatch({ type: 'unrelated/action' });
    expect(selectHomeFigures(store.getState())).toBe(thirty);

    // "7 days" pressed, and its answer not in yet: the figures stay the 30-day ones, as the
    // page around them does, instead of blanking.
    store.dispatch(homeRangeChosen({ range: '7d' }));
    expect(selectHomeFigures(store.getState())?.window).toBe('30d');

    await store.dispatch(homeApi.util.upsertQueryData('getHome', '7d', home({
      window: '7d', audience: { asked: 50, answered: 10 },
    })));
    expect(selectHomeFigures(store.getState())).toMatchObject({ window: '7d', rate: { percent: 20 } });
  });
});

describe('the results figures', () => {
  it('divides responses by the people asked, and says what it is a share of', () => {
    expect(deriveResultsFigures(results()).rate).toEqual(shareOf(612, 800));
    expect(deriveResultsFigures(results()).rate?.percent).toBe(77);
  });

  it('has no rate for an open link, an empty audience, or a suppressed result', () => {
    expect(deriveResultsFigures(results({ audienceEstimate: null })).rate).toBeNull();
    expect(deriveResultsFigures(results({ audienceEstimate: 0 })).rate).toBeNull();
    expect(deriveResultsFigures(results({ suppressed: true })).rate).toBeNull();
  });

  it('averages the rating questions only, and counts the written answers as a share', () => {
    const figures = deriveResultsFigures(results());
    expect(figures.rating).toEqual({ average: 4.1, over: 2 });
    expect(figures.comments).toBe(287);
    expect(figures.commentShare).toEqual({ count: 287, of: 612, percent: 47 });
    expect(deriveResultsFigures(results({ responseCount: 0 })).commentShare).toBeNull();
  });

  it('reads the entry for this campaign and filter, and falls back only within the campaign', async () => {
    const store = setupStore();
    await store.dispatch(resultsApi.util.upsertQueryData('getResults', { campaignId: 'c1', search: '' }, results()));
    await store.dispatch(resultsApi.util.upsertQueryData('getResults', { campaignId: 'c2', search: '' }, results({ responseCount: 5 })));

    expect(selectResultsFigures(store.getState(), 'c1', '')?.responseCount).toBe(612);
    // A filter whose answer is still loading: the page keeps c1's last answer, and so do the
    // figures — never another campaign's.
    expect(selectResultsFigures(store.getState(), 'c1', '?unitId=u1')?.responseCount).toBe(612);
    expect(selectResultsFigures(store.getState(), 'c3', '')).toBeNull();
  });
});

describe('the analysis reliability', () => {
  it('rates confidence by the count first, then one step down for a thin known rate', () => {
    expect(confidenceOf(8, null)).toBe('low');
    expect(confidenceOf(42, null)).toBe('medium');
    expect(confidenceOf(120, null)).toBe('high');
    // 120 of 400 is 30%: not thin, so it stays high.
    expect(confidenceOf(120, shareOf(120, 400))).toBe('high');
    // 120 of 1000 is 12%: thin, one step down.
    expect(confidenceOf(120, shareOf(120, 1000))).toBe('medium');
    // 40 of 1000 is 4%: medium by count, low once the rate is known to be thin.
    expect(confidenceOf(40, shareOf(40, 1000))).toBe('low');
  });

  it('derives the rate and the confidence from the two counts', () => {
    expect(deriveAnalysisFigures({ responseCount: 31, audienceEstimate: 50 })).toEqual({
      responseCount: 31,
      audienceEstimate: 50,
      rate: { count: 31, of: 50, percent: 62 },
      confidence: 'medium',
    });
    expect(deriveAnalysisFigures({ responseCount: 31, audienceEstimate: null }).rate).toBeNull();
  });

  it('reads the cache entry for the filters the page asked with', async () => {
    const store = setupStore();
    await store.dispatch(analysisApi.util.upsertQueryData('getAnalysis', '?campaignId=c1', analysis(31, 50)));
    expect(selectAnalysisFigures(store.getState(), '?campaignId=c1')?.rate?.percent).toBe(62);
    // New filters still loading: the last answer stays, as on the page.
    expect(selectAnalysisFigures(store.getState(), '?campaignId=c2')?.rate?.percent).toBe(62);
  });
});
