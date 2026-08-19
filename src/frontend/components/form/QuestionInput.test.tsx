// T-035 — the six inputs. 24 §5, 05 §5.3, 39 § Input specifications.
//
// These tests are the standing evidence for INV-008. They exercise the components through
// the SAME entry point the preview and the respondent form use — `<QuestionInput>`,
// switching on kind — because a test that reached past it into `RatingInput` would pass
// happily on the day somebody adds a second dispatcher beside this one.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { AnswerValue, QuestionConfig } from '@endur/shared';
import { QuestionInput, type Question } from './QuestionInput.js';

const question = (config: QuestionConfig, over: Partial<Question> = {}): Question => ({
  id: 'q1',
  kind: config.kind,
  text: 'How was it?',
  config,
  required: false,
  position: 0,
  ...over,
});

const RATING: QuestionConfig = { kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Great' };
const SINGLE: QuestionConfig = { kind: 'single', options: ['Yes, always', 'Sometimes', 'Never'], allowOther: false };
const MULTI: QuestionConfig = { kind: 'multi', options: ['Library', 'Labs', 'Cafe'] };

const mount = (q: Question, value?: AnswerValue, readOnly = false) => {
  const onChange = vi.fn();
  const result = render(
    <QuestionInput question={q} value={value} onChange={onChange} readOnly={readOnly} />,
  );
  return { onChange, ...result };
};

describe('all six kinds render, and each announces itself as a group', () => {
  it('rating draws one point per step, with the anchors on the ends', () => {
    mount(question(RATING));
    // A fieldset + legend, so the question text IS the group's accessible name. No ARIA.
    const group = screen.getByRole('group', { name: /How was it\?/ });
    expect(within(group).getAllByRole('radio')).toHaveLength(5);

    // The anchors are announced where they mean something — on the ends, not repeated on
    // all five. "1, Poor" is what the person choosing 1 needs to hear.
    expect(screen.getByRole('radio', { name: '1 — Poor' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '5 — Great' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '3' })).toBeTruthy();
  });

  it('a 1-10 rating is ten points and still not a slider', () => {
    mount(question({ kind: 'rating', max: 10, lowLabel: 'Low', highLabel: 'High' }));
    expect(screen.getAllByRole('radio')).toHaveLength(10);
    // 39 is explicit: a slider is unusable one-handed and makes an exact answer impossible.
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('NPS is fixed 0-10 with fixed anchors — eleven points, not ten', () => {
    mount(question({ kind: 'nps' }));
    expect(screen.getAllByRole('radio')).toHaveLength(11);
    expect(screen.getByRole('radio', { name: '0 — Not at all likely' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '10 — Extremely likely' })).toBeTruthy();
  });

  it('single choice is radios, multi choice is checkboxes', () => {
    const single = mount(question(SINGLE));
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    single.unmount();

    mount(question(MULTI));
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('yes / no is two options, and free text is one labelled field', () => {
    const yesno = mount(question({ kind: 'yesno' }));
    expect(screen.getByRole('radio', { name: 'Yes' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'No' })).toBeTruthy();
    yesno.unmount();

    mount(question({ kind: 'text', multiline: false }));
    // One control, so a <label> rather than a <fieldset> — a group of one is a lie to a
    // screen reader.
    expect(screen.getByLabelText(/How was it\?/)).toBeTruthy();
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('a paragraph question is a textarea, a short one is not', () => {
    const short = mount(question({ kind: 'text', multiline: false }));
    expect(screen.getByLabelText(/How was it\?/).tagName).toBe('INPUT');
    short.unmount();

    mount(question({ kind: 'text', multiline: true }));
    expect(screen.getByLabelText(/How was it\?/).tagName).toBe('TEXTAREA');
  });
});

describe('answers travel as AnswerValue, discriminated by kind', () => {
  it('a rating reports the number it shows', () => {
    const { onChange } = mount(question(RATING));
    screen.getByRole('radio', { name: '4' }).click();
    expect(onChange).toHaveBeenCalledWith({ kind: 'rating', n: 4 });
  });

  it('a single choice reports the option text, not an index', () => {
    const { onChange } = mount(question(SINGLE));
    screen.getByRole('radio', { name: 'Sometimes' }).click();
    expect(onChange).toHaveBeenCalledWith({ kind: 'single', option: 'Sometimes' });
  });

  it('multi choice adds and removes rather than replacing', () => {
    const { onChange } = mount(question(MULTI), { kind: 'multi', options: ['Library'] });
    screen.getByRole('checkbox', { name: 'Labs' }).click();
    expect(onChange).toHaveBeenCalledWith({ kind: 'multi', options: ['Library', 'Labs'] });

    screen.getByRole('checkbox', { name: 'Library' }).click();
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'multi', options: [] });
  });

  it('yes / no reports a boolean, and No is a real answer rather than an absent one', () => {
    const { onChange } = mount(question({ kind: 'yesno' }));
    screen.getByRole('radio', { name: 'No' }).click();
    expect(onChange).toHaveBeenCalledWith({ kind: 'yesno', yes: false });
  });

  it('the current value is what renders as chosen', () => {
    mount(question(RATING), { kind: 'rating', n: 2 });
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '2' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '1 — Poor' }).checked).toBe(false);
  });
});

describe('the constraints that only exist because of the question', () => {
  it('maxSelections stops the UNPICKED options rather than ignoring the tap', () => {
    // Silently swallowing the tap reads as a broken control; a disabled row plus a line of
    // copy says what happened.
    mount(
      question({ kind: 'multi', options: ['A', 'B', 'C'], maxSelections: 2 }),
      { kind: 'multi', options: ['A', 'B'] },
    );
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'C' }).disabled).toBe(true);
    // Already chosen, so it must stay removable.
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'A' }).disabled).toBe(false);
    expect(screen.getByText(/Choose up to 2/)).toBeTruthy();
  });

  it('allowOther submits the typed text, never the word "Other"', () => {
    const { onChange } = mount(
      question({ kind: 'single', options: ['Bus', 'Train'], allowOther: true }),
    );
    // A results screen full of "Other" tells nobody anything.
    fireEvent.change(screen.getByPlaceholderText('Other'), { target: { value: 'Bicycle' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'single', option: 'Bicycle' });
  });

  it('the required marker is an accent star with a screen-reader word, never a red badge', () => {
    mount(question(RATING, { required: true }));
    expect(screen.getByRole('group', { name: /required/i })).toBeTruthy();
    expect(document.querySelector('.q-star')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('an error marks the card and is announced, but only when there is one', () => {
    const clean = render(
      <QuestionInput question={question(RATING)} onChange={vi.fn()} />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    clean.unmount();

    render(
      <QuestionInput question={question(RATING)} onChange={vi.fn()} error="Please answer this." />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Please answer this.');
    expect(document.querySelector('.q-card.is-invalid')).toBeTruthy();
  });
});

describe('readOnly is the preview, and it is the SAME component (INV-008)', () => {
  it('renders every control and disables all of them', () => {
    mount(question(SINGLE), undefined, true);
    // Present and announced — the reader is meant to see exactly what a respondent gets.
    const radios = screen.getAllByRole<HTMLInputElement>('radio');
    expect(radios).toHaveLength(3);
    expect(radios.every((radio) => radio.disabled)).toBe(true);
  });

  it('is opt-in: an input with no readOnly prop accepts answers', () => {
    mount(question(SINGLE));
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Never' }).disabled).toBe(false);
  });
});
