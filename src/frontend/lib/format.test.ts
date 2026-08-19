// The presentation helpers. Pure functions, so they get real tests rather than being
// checked incidentally by whichever screen happens to render them.
import { describe, expect, it } from 'vitest';
import { approxDuration, derivePlural, minutes, pluralise } from './format.js';

describe('approxDuration — the number on every template card', () => {
  it('keeps seconds up to two minutes, because "~40 sec" is what sells a short form', () => {
    expect(approxDuration(38)).toBe('~40 sec');
    expect(approxDuration(55)).toBe('~60 sec');
    expect(approxDuration(90)).toBe('~90 sec');
    expect(approxDuration(119)).toBe('~120 sec');
  });

  it('switches to minutes at two, and rounds to the nearest one', () => {
    expect(approxDuration(120)).toBe('~2 min');
    expect(approxDuration(170)).toBe('~3 min');
    expect(approxDuration(200)).toBe('~3 min');
  });

  it('never reads "~0 sec" — a very short form still takes a moment', () => {
    expect(approxDuration(3)).toBe('~10 sec');
    expect(approxDuration(4)).toBe('~10 sec');
  });

  it('is null with nothing to answer, so the caller renders the count alone', () => {
    // A template with no questions takes no time, and "~0 sec" on a card is noise the
    // reader has to decode before discarding.
    expect(approxDuration(0)).toBeNull();
    expect(approxDuration(-5)).toBeNull();
  });
});

describe('minutes — the respondent-facing estimate', () => {
  it('rounds UP, because promising less time than it takes is the annoying direction', () => {
    expect(minutes(61)).toBe('2 minutes');
    expect(minutes(120)).toBe('2 minutes');
  });

  it('never says zero minutes', () => {
    expect(minutes(0)).toBe('1 minute');
    expect(minutes(5)).toBe('1 minute');
  });
});

describe('pluralise — counts using the vocabulary\'s own plural', () => {
  it('switches on one, and never appends an "s" of its own', () => {
    // "Faculty" pluralises to "Faculty", which is exactly why both forms are arguments.
    expect(pluralise(1, 'Faculty', 'Faculty')).toBe('1 Faculty');
    expect(pluralise(3, 'Faculty', 'Faculty')).toBe('3 Faculty');
    expect(pluralise(0, 'question', 'questions')).toBe('0 questions');
  });
});

describe('derivePlural — a convenience, never an authority', () => {
  it('handles the three shallow cases it claims to', () => {
    expect(derivePlural('Ward')).toBe('Wards');
    expect(derivePlural('Property')).toBe('Properties');
    expect(derivePlural('Campus')).toBe('Campuses');
  });

  it('leaves a y after a vowel alone', () => {
    expect(derivePlural('Survey')).toBe('Surveys');
  });

  it('returns an empty string for nothing, rather than an "s"', () => {
    expect(derivePlural('   ')).toBe('');
  });
});
