// Changing a question's type. 37 § Interactions and § Acceptance.
//
// A pure module gets real tests for the same reason the delete sentence does: "preserves
// text and warns once before dropping options" is an acceptance criterion, and a rule
// living inside a select's onChange cannot be checked without rendering a builder.
import { describe, expect, it } from 'vitest';
import type { QuestionConfig, QuestionKind } from '@endur/shared';
import { changeKind, defaultConfig, KIND_GROUPS, KIND_LABELS, optionsOf, type QuestionDraft } from './kinds.js';

const draft = (config: QuestionConfig, over: Partial<QuestionDraft> = {}): QuestionDraft => ({
  kind: config.kind,
  text: 'How did it go?',
  config,
  required: true,
  ...over,
});

const CHOICE: QuestionConfig = {
  kind: 'single',
  options: ['Always', 'Sometimes', 'Never'],
  allowOther: false,
};

describe('there are six kinds and the list is frozen (DEC-010)', () => {
  it('names exactly six, and the groups cover all of them exactly once', () => {
    const named = Object.keys(KIND_LABELS) as QuestionKind[];
    expect(named).toHaveLength(6);

    const grouped = KIND_GROUPS.flatMap((group) => group.kinds);
    // Not a subset check: a kind missing from the groups is a kind the select cannot
    // reach, which looks exactly like it not existing.
    expect([...grouped].sort()).toEqual([...named].sort());
    expect(grouped).toHaveLength(6);
  });

  it('gives every kind a default config that matches its own discriminant', () => {
    for (const kind of Object.keys(KIND_LABELS) as QuestionKind[]) {
      expect(defaultConfig(kind).kind).toBe(kind);
    }
  });

  it('starts a choice question with two options, the DTO\'s own floor', () => {
    const config = defaultConfig('single');
    expect(optionsOf(config)).toHaveLength(2);
  });

  it('defaults a rating to 1-5 rather than 1-10', () => {
    // A five-point scale is answerable at a glance; ten exists for people who ask for it.
    expect(defaultConfig('rating')).toMatchObject({ max: 5 });
  });
});

describe('changing type keeps what the new type can hold', () => {
  it('is a no-op when the type has not changed', () => {
    const question = draft(CHOICE);
    const change = changeKind(question, 'single');
    expect(change.question).toBe(question);
    expect(change.warning).toBeUndefined();
  });

  it('always keeps the text — it is the part somebody thought about', () => {
    for (const kind of Object.keys(KIND_LABELS) as QuestionKind[]) {
      expect(changeKind(draft(CHOICE), kind).question.text).toBe('How did it go?');
    }
  });

  it('keeps `required` and the id across a change', () => {
    const change = changeKind(draft(CHOICE, { id: 'q7' }), 'text');
    expect(change.question.required).toBe(true);
    expect(change.question.id).toBe('q7');
  });

  it('carries the options across single -> multi, which is the switch people make', () => {
    const change = changeKind(draft(CHOICE), 'multi');
    expect(optionsOf(change.question.config)).toEqual(['Always', 'Sometimes', 'Never']);
    expect(change.warning).toBeUndefined();
  });

  it('carries them back the other way too', () => {
    const multi: QuestionConfig = { kind: 'multi', options: ['A', 'B', 'C', 'D'] };
    const change = changeKind(draft(multi), 'single');
    expect(optionsOf(change.question.config)).toEqual(['A', 'B', 'C', 'D']);
    expect(change.warning).toBeUndefined();
  });

  it('produces a config whose discriminant matches the new kind, every time', () => {
    for (const kind of Object.keys(KIND_LABELS) as QuestionKind[]) {
      const change = changeKind(draft(CHOICE), kind);
      // A mismatch here is a 409 from the server: `putQuestions` rejects a config that
      // does not belong to its question (14 §4).
      expect(change.question.config.kind).toBe(change.question.kind);
    }
  });
});

describe('and warns ONCE about what it cannot keep', () => {
  it('names the count and the destination when options are dropped', () => {
    const change = changeKind(draft(CHOICE), 'text');
    expect(change.warning).toBe('Changing to Free text removes the 3 options.');
  });

  it('agrees the verb with one option', () => {
    const one: QuestionConfig = { kind: 'multi', options: ['Only this'] };
    expect(changeKind(draft(one), 'yesno').warning).toBe('Changing to Yes / No removes the 1 option.');
  });

  it('warns going to yes/no and to the scales, not only to text', () => {
    for (const kind of ['yesno', 'rating', 'nps'] as QuestionKind[]) {
      expect(changeKind(draft(CHOICE), kind).warning).toMatch(/removes the 3 options/);
    }
  });

  it('warns before hand-written rating anchors are replaced', () => {
    const rating: QuestionConfig = {
      kind: 'rating', max: 5, lowLabel: 'Never once', highLabel: 'Every time',
    };
    // Not in 37's letter, which names only options — but hand-written anchors are
    // hand-written work, and NPS replaces them by definition.
    expect(changeKind(draft(rating), 'nps').warning).toBe(
      'Changing to NPS replaces your labels "Never once" and "Every time".',
    );
  });

  it('stays quiet when the anchors were never touched', () => {
    const untouched: QuestionConfig = {
      kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Excellent',
    };
    // Warning about losing the defaults would train people to click through warnings.
    expect(changeKind(draft(untouched), 'nps').warning).toBeUndefined();
  });

  it('says nothing when nothing is lost', () => {
    expect(changeKind(draft({ kind: 'yesno' }), 'text').warning).toBeUndefined();
    expect(changeKind(draft({ kind: 'nps' }), 'rating').warning).toBeUndefined();
  });

  it('returns the CHANGED question alongside the warning, so accepting costs no second call', () => {
    const change = changeKind(draft(CHOICE), 'text');
    expect(change.question.kind).toBe('text');
    expect(optionsOf(change.question.config)).toBeNull();
  });
});
