// T-039 — the four sentences. 39 rules 1 and 6, design_specs/design/07 §7.2, §7.5.
//
// Every one of them has a plural or a subject-verb agreement in it and every one of them is
// read off a phone held up in front of the room.
import { describe, expect, it } from 'vitest';
import type { ResolvedLabels } from '@endur/shared';
import { accessNotice, anonymityLine, costLine, respondedLine, thanksLine } from './copy.js';

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

describe('<AccessNotice> — which of the two promises this form makes (24 §7, 52 §1)', () => {
  const ORG = 'Northfield University';

  it('an open anonymous link promises both, and says the one worth saying', () => {
    // The answer is anonymous AND participation is private. Nothing is given up, so there
    // is nothing extra to warn about.
    expect(accessNotice({ anonymous: true, access: 'public', organizationName: ORG }))
      .toBe('Your answers are anonymous.');
  });

  it('a RESTRICTED anonymous campaign keeps one promise and gives up the other', () => {
    // The sentence this whole component exists for. An administrator sees that Priya
    // answered and Sam did not — exactly what invitations have always allowed — and the
    // respondent is told so on the screen where it happens rather than left to assume the
    // stronger promise (52 §1).
    expect(accessNotice({ anonymous: true, access: 'organization', organizationName: ORG }))
      .toBe(
        'Your answers are anonymous. ' +
        'Northfield University will see that you responded, but not what you said.',
      );
  });

  it('a restricted NON-anonymous campaign still says what the org can see', () => {
    // No anonymity claim, because the campaign did not make one. The participation half is
    // true regardless and is the half the reader could not otherwise know.
    expect(accessNotice({ anonymous: false, access: 'organization', organizationName: ORG }))
      .toBe('Northfield University will see that you responded, but not what you said.');
  });

  it('says NOTHING for a non-anonymous open link, and that silence is deliberate', () => {
    // The fourth pair. Neither 39 nor design_specs/design/07 gives copy for it, and both
    // things this page could invent are wrong: a promise it cannot keep, or a warning
    // about a linkage the schema does not make. Silence is the only honest option without
    // a contract — asserted so that "somebody forgot" and "somebody decided" stay
    // distinguishable.
    expect(accessNotice({ anonymous: false, access: 'public', organizationName: ORG }))
      .toBeNull();
  });

  it('NEVER claims the organisation can read the answers', () => {
    // The failure that would matter. "will see that you responded" is true; anything
    // stronger would be a lie the schema contradicts (INV-006).
    for (const anonymous of [true, false]) {
      const line = accessNotice({ anonymous, access: 'organization', organizationName: ORG }) ?? '';
      expect(line).toContain('not what you said');
      expect(line).not.toMatch(/will see your answers|can read/i);
    }
  });

  it('uses the organisation from the payload, not a hardcoded word', () => {
    expect(accessNotice({ anonymous: true, access: 'organization', organizationName: 'Grand Palace' }))
      .toContain('Grand Palace');
  });
});
