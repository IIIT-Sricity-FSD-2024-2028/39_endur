// T-039 — the form's state maths. 39 § Validation.
//
// These are the rules that decide whether Submit lets somebody through, so they are tested
// as functions rather than through a rendered form: a rule you can only exercise by clicking
// is a rule nobody checks the edges of.
import { describe, expect, it } from 'vitest';
import type { AnswerValue } from '@endur/shared';
import type { Question } from '../../components/form/QuestionInput.js';
import {
  answeredCount, isAnswered, missingRequired, remainingLabel, toSubmitAnswers,
} from './answers.js';

const q = (over: Partial<Question> & { id: string; kind: Question['kind'] }): Question => ({
  text: 'A question', required: true, position: 1,
  config: { kind: over.kind } as Question['config'],
  ...over,
});

const RATING = q({ id: 'r', kind: 'rating', config: { kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Excellent' } });
const TEXT = q({ id: 't', kind: 'text', required: false, config: { kind: 'text', multiline: true } });
const MULTI = q({ id: 'm', kind: 'multi', config: { kind: 'multi', options: ['a', 'b'] } });

describe('present is not the same as answered', () => {
  it('counts a real answer', () => {
    expect(isAnswered({ kind: 'rating', n: 3 })).toBe(true);
    expect(isAnswered({ kind: 'yesno', yes: false })).toBe(true);
    // Zero is a real NPS score, and treating it as absent would make the lowest possible
    // answer the one the form refuses to accept.
    expect(isAnswered({ kind: 'nps', n: 0 })).toBe(true);
  });

  it('does not count a text box that was typed in and cleared', () => {
    expect(isAnswered({ kind: 'text', text: '' })).toBe(false);
    expect(isAnswered({ kind: 'text', text: '   ' })).toBe(false);
  });

  it('does not count an empty "Other"', () => {
    // The Other radio writes { option: "" } the moment it is selected. Counting that would
    // let a required question through with nothing in it.
    expect(isAnswered({ kind: 'single', option: '' })).toBe(false);
    expect(isAnswered({ kind: 'single', option: 'Something' })).toBe(true);
  });

  it('does not count a multi-choice ticked and then unticked', () => {
    expect(isAnswered({ kind: 'multi', options: [] })).toBe(false);
    expect(isAnswered({ kind: 'multi', options: ['a'] })).toBe(true);
  });

  it('does not count nothing at all', () => {
    expect(isAnswered(undefined)).toBe(false);
  });
});

describe('what the progress bar and the button read', () => {
  it('counts questions, not keys in the map', () => {
    const answers: Record<string, AnswerValue> = {
      r: { kind: 'rating', n: 4 },
      t: { kind: 'text', text: '  ' },
    };
    expect(answeredCount([RATING, TEXT, MULTI], answers)).toBe(1);
  });

  it('lists the missing required ones in screen order', () => {
    const answers: Record<string, AnswerValue> = { m: { kind: 'multi', options: ['a'] } };
    // TEXT is optional and must not appear; the order is the order the page scrolls.
    expect(missingRequired([RATING, TEXT, MULTI], answers)).toEqual(['r']);
    expect(missingRequired([MULTI, TEXT, RATING], {})).toEqual(['m', 'r']);
  });

  it('agrees with itself about one', () => {
    // This screen goes on a projector. "1 questions left" is not a detail there.
    expect(remainingLabel(1)).toBe('1 question left');
    expect(remainingLabel(2)).toBe('2 questions left');
    expect(remainingLabel(0)).toBeNull();
  });
});

describe('the payload carries only what was answered', () => {
  it('drops the empties rather than sending them', () => {
    const answers: Record<string, AnswerValue> = {
      r: { kind: 'rating', n: 5 },
      t: { kind: 'text', text: '' },
    };
    // An optional text question typed into and cleared would otherwise arrive as `""` — a
    // stored answer that says nothing, counted by every aggregate on 40 as a response.
    expect(toSubmitAnswers([RATING, TEXT], answers)).toEqual([
      { questionId: 'r', value: { kind: 'rating', n: 5 } },
    ]);
  });

  it('keeps question order, which is what the 422 paths index into', () => {
    const answers: Record<string, AnswerValue> = {
      m: { kind: 'multi', options: ['b'] },
      r: { kind: 'rating', n: 2 },
    };
    expect(toSubmitAnswers([RATING, TEXT, MULTI], answers).map((a) => a.questionId))
      .toEqual(['r', 'm']);
  });
});
