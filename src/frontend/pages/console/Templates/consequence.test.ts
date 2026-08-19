// The delete sentence. 36 § States, 24 §6.
//
// Tested as a module for the same reason the unit-delete sentence is: "never *are you
// sure?*" is an acceptance criterion, and writing that one as a function found a real
// verb-agreement bug — "1 Quaxel ARE left without a unit" — that no amount of reading
// caught. A sentence assembled inside a component cannot be checked without a dialog.
import { describe, expect, it } from 'vitest';
import type { TemplateSummary } from '@endur/shared';
import { deleteConsequence } from './consequence.js';

const CAMPAIGN = { one: 'Feedback cycle', many: 'Feedback cycles' };

const template = (over: Partial<TemplateSummary> = {}): TemplateSummary => ({
  id: 't1', name: 'Course feedback', category: 'Teaching', description: null,
  industry: 'university', questionCount: 8, estimatedSeconds: 110, campaignCount: 0,
  isLibrary: false, clonedFromId: null, createdAt: '2026-01-01T00:00:00.000Z', ...over,
});

describe('an unused template says what is removed, in numbers', () => {
  it('names the template and counts its questions', () => {
    const { consequence, blocked } = deleteConsequence(template(), CAMPAIGN);
    expect(consequence).toBe(
      'Deleting Course feedback removes its 8 questions. Nothing has used it, so no responses are affected.',
    );
    expect(blocked).toBe(false);
  });

  it('agrees with itself at one question', () => {
    expect(deleteConsequence(template({ questionCount: 1 }), CAMPAIGN).consequence).toContain(
      'removes its 1 question.',
    );
  });

  it('never asks whether the reader is sure', () => {
    // 24 §6 as a test rather than a style-guide line: "Are you sure?" tells the reader
    // nothing they did not already know.
    expect(deleteConsequence(template(), CAMPAIGN).consequence).not.toMatch(/are you sure/i);
  });
});

describe('a template in use says so, in the org\'s own word, and blocks', () => {
  it('uses the singular for one and agrees the verb with it', () => {
    const { consequence, blocked } = deleteConsequence(template({ campaignCount: 1 }), CAMPAIGN);
    // "1 feedback cycle USES it", not "use it". Verb agreement is not a detail on a
    // projector.
    expect(consequence).toContain('1 feedback cycle uses Course feedback');
    expect(blocked).toBe(true);
  });

  it('uses the plural for more than one', () => {
    const { consequence } = deleteConsequence(template({ campaignCount: 3 }), CAMPAIGN);
    expect(consequence).toContain('3 feedback cycles use Course feedback');
  });

  it('takes the plural from the vocabulary rather than adding an s (INV-001)', () => {
    const { consequence } = deleteConsequence(
      template({ campaignCount: 2 }),
      { one: 'Plithe', many: 'Plithes' },
    );
    expect(consequence).toContain('2 plithes use');
  });

  it('says WHY rather than only that it is refused', () => {
    // The reason is the actionable half: the answers already collected would point at
    // nothing, so the fix is to close the campaigns first.
    const { consequence } = deleteConsequence(template({ campaignCount: 2 }), CAMPAIGN);
    expect(consequence).toMatch(/point at nothing/);
    expect(consequence).toMatch(/Delete or close those first/);
  });
});
