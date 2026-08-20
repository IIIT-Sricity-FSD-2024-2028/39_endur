// T-040 — the four stat cards. 40 § Interactions, design_specs/design/08 §8.1.
//
// Pure, so the edges are reachable. The one that matters is the response rate: it was wrong
// on the server until T-040 and it is the second number an evaluator looks at.
import { describe, expect, it } from 'vitest';
import type { QuestionSummary, ResultsView } from '@endur/shared';
import { commentCount, newSince, ratingAverage, statCards } from './stats.js';

const question = (over: Partial<QuestionSummary> & { questionId: string; kind: QuestionSummary['kind'] }): QuestionSummary => ({
  text: 'A question', answered: 10, ...over,
});

const view = (over: Partial<ResultsView> = {}): ResultsView => ({
  responseCount: 612,
  audienceEstimate: null,
  responseRate: null,
  suppressed: false,
  threshold: 5,
  questions: [
    question({ questionId: 'q1', kind: 'rating', average: 4.3, answered: 612 }),
    question({ questionId: 'q2', kind: 'rating', average: 3.9, answered: 600 }),
    question({ questionId: 'q3', kind: 'nps', answered: 500, npsMix: { promoters: 300, passives: 100, detractors: 100, score: 40 } }),
    question({ questionId: 'q4', kind: 'text', answered: 287 }),
  ],
  ...over,
});

describe('the average is across RATING questions only', () => {
  it('averages the rating questions and says how many', () => {
    expect(ratingAverage(view().questions ?? [])).toEqual({ average: 4.1, over: 2 });
  });

  it('leaves NPS out of it', () => {
    // A 0-10 instrument averaged with a 1-5 scale is a number about nothing. The NPS
    // question above scores 40 and would drag the mean to 16 if it were included.
    const nps = [question({ questionId: 'n', kind: 'nps', average: 8, answered: 5 })];
    expect(ratingAverage(nps)).toBeNull();
  });

  it('is null rather than zero when the form has no rating questions', () => {
    expect(ratingAverage([question({ questionId: 't', kind: 'text' })])).toBeNull();
  });
});

describe('comments are answers to free-text questions and nothing else', () => {
  it('counts them across every text question', () => {
    expect(commentCount(view().questions ?? [])).toBe(287);
  });

  it('counts nothing when there is no text question', () => {
    expect(commentCount([question({ questionId: 'r', kind: 'rating', answered: 99 })])).toBe(0);
  });
});

describe('the response rate needs a denominator that exists', () => {
  it('says there is none for an open link, and says WHY', () => {
    // The server sent responses ÷ subjects here until T-040, which rendered between 1750%
    // and 4675% on every seeded demo campaign — on the screen the evaluator opens straight
    // after scanning. A dash with a reason is the honest replacement.
    const rate = statCards(view(), 0)[1];
    expect(rate?.value).toBe('—');
    expect(rate?.context).toMatch(/no total to measure against/);
  });

  it('renders a real rate when the audience is a real set of people', () => {
    const rate = statCards(view({ audienceEstimate: 800, responseRate: 0.77 }), 0)[1];
    expect(rate?.value).toBe('77%');
    expect(rate?.context).toBe('of 800');
  });
});

describe('the cards as a set', () => {
  it('is four of them, in the order the mockup draws', () => {
    expect(statCards(view(), 0).map((card) => card.kicker))
      .toEqual(['Responses', 'Response rate', 'Avg rating', 'Comments']);
  });

  it('says nothing about arrivals until something arrives', () => {
    expect(statCards(view(), 0)[0]?.context).toBeUndefined();
    expect(statCards(view(), 3)[0]?.context).toBe('+3 just now');
  });

  it('agrees with itself about one question', () => {
    const one = view({ questions: [question({ questionId: 'q1', kind: 'rating', average: 4 })] });
    expect(statCards(one, 0)[2]?.context).toBe('across 1 question');
  });

  it('reports what share of respondents wrote something', () => {
    expect(statCards(view(), 0)[3]).toMatchObject({ value: '287', context: '47% left one' });
  });
});

describe('which comments arrived while somebody was watching', () => {
  const items = [
    { id: 'a', submittedAt: '2026-08-20T10:00:00.000Z' },
    { id: 'b', submittedAt: '2026-08-20T09:00:00.000Z' },
  ];

  it('marks only the ones after the page opened', () => {
    expect([...newSince(items, '2026-08-20T09:30:00.000Z')]).toEqual(['a']);
  });

  it('marks NOTHING when there is no baseline', () => {
    // Opening a campaign with 287 comments must not flash all 287 — that reads as a
    // rendering bug rather than as news (21 §7).
    expect(newSince(items, null).size).toBe(0);
  });
});
