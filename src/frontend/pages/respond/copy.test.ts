// T-039 — the four sentences. 39 rules 1 and 6, design_specs/design/07 §7.2, §7.5.
//
// Every one of them has a plural or a subject-verb agreement in it and every one of them is
// read off a phone held up in front of the room.
import { describe, expect, it } from 'vitest';
import type { ResolvedLabels } from '@endur/shared';
import { anonymityLine, costLine, respondedLine, thanksLine } from './copy.js';

/** The nonsense fixture: an English noun appearing below means somebody hardcoded one. */
const LABELS: ResolvedLabels = {
  unit: { one: 'Zblorn', many: 'Zblorns' },
  subject: { one: 'Quaxel', many: 'Quaxels' },
  respondent: { one: 'Frimble', many: 'Frimbles' },
  reviewee: { one: 'Vandor', many: 'Vandors' },
  campaign: { one: 'Plithe', many: 'Plithes' },
};

describe('the cost, stated before they scroll', () => {
  it('is the line the mockup draws', () => {
    expect(costLine({ questionCount: 8, estimatedSeconds: 110, anonymous: true }))
      .toBe('8 questions · about 2 minutes · anonymous');
  });

  it('rounds the estimate UP', () => {
    // Promising less time than it takes is the one direction that annoys somebody mid-form.
    expect(costLine({ questionCount: 1, estimatedSeconds: 61, anonymous: false }))
      .toBe('1 question · about 2 minutes');
  });

  it('says nothing about time it cannot measure', () => {
    // Rounding zero up to "about 1 minute" would be a made-up number in the one line that
    // has to be true.
    expect(costLine({ questionCount: 2, estimatedSeconds: 0, anonymous: true }))
      .toBe('2 questions · anonymous');
  });

  it('does not claim anonymity a campaign does not have', () => {
    expect(costLine({ questionCount: 3, estimatedSeconds: 90, anonymous: false }))
      .not.toMatch(/anonymous/);
  });
});

describe('anonymity is stated twice, and only when it is true', () => {
  it('gives the second statement', () => {
    expect(anonymityLine(true)).toBe('Your answers are anonymous.');
  });

  it('says nothing rather than inventing the opposite promise', () => {
    // Neither 39 nor design_specs/design/07 gives copy for the non-anonymous case, and both
    // things this page could invent are wrong — a promise it cannot keep, or a warning
    // about a linkage the schema does not make (a response row has no respondent column).
    expect(anonymityLine(false)).toBeNull();
  });
});

describe('the thank-you', () => {
  it('names what the feedback was about', () => {
    expect(thanksLine({ subjectName: 'Data Structures', anonymous: true }))
      .toBe('Your feedback on Data Structures has been recorded anonymously.');
  });

  it('drops the subject when there was not one', () => {
    expect(thanksLine({ subjectName: undefined, anonymous: true }))
      .toBe('Your feedback has been recorded anonymously.');
  });

  it('does not say "anonymously" when it was not', () => {
    expect(thanksLine({ subjectName: 'Data Structures', anonymous: false }))
      .toBe('Your feedback on Data Structures has been recorded.');
  });
});

describe('the count is the detail that lands', () => {
  it('uses the org\'s own noun, not "people" (INV-001)', () => {
    expect(respondedLine(612, LABELS)).toBe('612 Frimbles have responded to this Plithe.');
  });

  it('agrees with itself about one', () => {
    expect(respondedLine(1, LABELS)).toBe('1 Frimble has responded to this Plithe.');
  });

  it('says nothing when the count is not known', () => {
    // Reachable: somebody opens /r/:token/done directly, having submitted nothing. "0 have
    // responded" under "Thank you." is worse than no line.
    expect(respondedLine(0, LABELS)).toBeNull();
  });
});
