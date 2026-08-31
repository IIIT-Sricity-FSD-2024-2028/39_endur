// T-036 — the six editors. 24 §5, 05 §5.3, 37 § The six types.
//
// Driven through the `<QuestionEditor>` dispatcher rather than the six renderers directly,
// for the same reason the input tests are: reaching past it would pass happily on the day
// somebody adds a second dispatcher beside this one.
//
// The constraints being asserted are the DTO's — two options minimum, ten maximum, an
// optional `maxSelections`, no placeholder key rather than an empty one. A control that
// lets somebody build a config the server rejects is a trap, not a convenience.
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { QuestionConfig } from '@endur/shared';
import { QuestionEditor } from './QuestionEditor.js';
import { optionsOf, type QuestionDraft } from './kinds.js';

const draft = (config: QuestionConfig): QuestionDraft => ({
  kind: config.kind, text: 'How did it go?', config, required: false,
});

/**
 * A CONTROLLED harness, not a fixed prop.
 *
 * The editor is controlled — it reports a config and renders whatever it is handed back —
 * so a test that never feeds the change back cannot see anything that appears AS A RESULT
 * of a change, like the "At most" field arriving when the limit is switched on. Holding
 * the state here is how the builder will hold it.
 */
function Harness({
  initial, readOnly, onChange,
}: { initial: QuestionDraft; readOnly: boolean; onChange: (q: QuestionDraft) => void }): JSX.Element {
  const [question, setQuestion] = useState(initial);
  return (
    <QuestionEditor
      question={question}
      readOnly={readOnly}
      onChange={(next) => { setQuestion(next); onChange(next); }}
    />
  );
}

const mount = (config: QuestionConfig, readOnly = false) => {
  const onChange = vi.fn();
  const result = render(
    <Harness initial={draft(config)} readOnly={readOnly} onChange={onChange} />,
  );
  /** The config the editor last asked for. */
  const config_ = (): QuestionConfig => (onChange.mock.calls.at(-1)?.[0] as QuestionDraft).config;
  return { onChange, config: config_, ...result };
};

const CHOICE: QuestionConfig = { kind: 'single', options: ['Always', 'Never'], allowOther: false };

describe('rating — a scale and both of its ends', () => {
  it('switches between 1-5 and 1-10 and nothing else', () => {
    const view = mount({ kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Great' });
    const scale = screen.getByLabelText('Scale');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['1 – 5', '1 – 10']);

    fireEvent.change(scale, { target: { value: '10' } });
    expect(view.config()).toMatchObject({ max: 10 });
  });

  it('edits both anchors, because a scale with one end labelled is unreadable in the middle', () => {
    const view = mount({ kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Great' });
    fireEvent.change(screen.getByLabelText('Low label'), { target: { value: 'Never once' } });
    expect(view.config()).toMatchObject({ lowLabel: 'Never once' });

    fireEvent.change(screen.getByLabelText('High label'), { target: { value: 'Every time' } });
    expect(view.config()).toMatchObject({ highLabel: 'Every time' });
  });
});

describe('the two kinds with nothing to configure say so, and never render an empty body', () => {
  it('yes / no uses the copy 24 §5 fixes', () => {
    const view = mount({ kind: 'yesno' });
    // An empty body reads as a control that failed to render.
    expect(screen.getByText('No settings for this type.')).toBeTruthy();
    view.unmount();
  });

  it('NPS says WHAT is fixed and why, rather than "no settings"', () => {
    mount({ kind: 'nps' });
    // 0-10 with those anchors is what makes a score comparable to anybody else's; an
    // editable one would be a rating scale wearing the name (DEC-010).
    expect(screen.getByText(/Fixed 0 – 10/)).toBeTruthy();
    expect(screen.getByText(/use a rating scale if you want your own wording/)).toBeTruthy();
  });
});

describe('single and multi choice share one option list', () => {
  it('edits an option in place', () => {
    const view = mount(CHOICE);
    fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'Rarely' } });
    expect(optionsOf(view.config())).toEqual(['Always', 'Rarely']);
  });

  it('adds one through a row where the new option will appear, not a button beside the list', () => {
    const view = mount(CHOICE);
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    expect(optionsOf(view.config())).toEqual(['Always', 'Never', '']);
  });

  it('will not delete below two — the DTO\'s floor, so the control cannot build a 422', () => {
    const two = mount(CHOICE);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Remove option 1' }).disabled).toBe(true);
    two.unmount();

    const view = mount({ kind: 'single', options: ['A', 'B', 'C'], allowOther: false });
    fireEvent.click(screen.getByRole('button', { name: 'Remove option 2' }));
    expect(optionsOf(view.config())).toEqual(['A', 'C']);
  });

  it('stops at ten and says why instead of silently ignoring the click', () => {
    const options = Array.from({ length: 10 }, (_, index) => `Option ${index + 1}`);
    mount({ kind: 'multi', options });
    expect(screen.queryByRole('button', { name: 'Add option' })).toBeNull();
    expect(screen.getByText(/Ten is the most/)).toBeTruthy();
  });

  it('gives multi choice the square dot and single the round one', () => {
    // 05 §5.3: identical controls, one difference. The dot is that difference, and it is
    // the same class the respondent form uses — the author sees what they are building.
    const single = mount(CHOICE);
    expect(document.querySelectorAll('.q-dot.q-dot-square')).toHaveLength(0);
    expect(document.querySelectorAll('.q-dot').length).toBeGreaterThan(0);
    single.unmount();

    mount({ kind: 'multi', options: ['A', 'B'] });
    expect(document.querySelectorAll('.q-dot.q-dot-square').length).toBeGreaterThan(0);
  });
});

describe('the two config flags that only one kind each has', () => {
  it('single choice toggles "Other"', () => {
    const view = mount(CHOICE);
    fireEvent.click(screen.getByLabelText(/Allow/));
    expect(view.config()).toMatchObject({ allowOther: true });
  });

  it('multi choice limits selections, and DROPS the key when the limit is turned off', () => {
    const view = mount({ kind: 'multi', options: ['A', 'B', 'C'] });
    fireEvent.click(screen.getByLabelText(/Limit how many/));
    expect(view.config()).toMatchObject({ maxSelections: 2 });

    fireEvent.change(screen.getByLabelText('At most'), { target: { value: '3' } });
    expect(view.config()).toMatchObject({ maxSelections: 3 });
  });

  it('turning the limit off removes the key rather than setting it to zero', () => {
    const view = mount({ kind: 'multi', options: ['A', 'B'], maxSelections: 2 });
    fireEvent.click(screen.getByLabelText(/Limit how many/));
    // `maxSelections: 0` would mean "choose none", which is not what "no limit" means.
    expect('maxSelections' in view.config()).toBe(false);
  });

  it('never lets the limit fall below one', () => {
    const view = mount({ kind: 'multi', options: ['A', 'B'], maxSelections: 2 });
    fireEvent.change(screen.getByLabelText('At most'), { target: { value: '0' } });
    expect(view.config()).toMatchObject({ maxSelections: 1 });
  });
});

describe('free text', () => {
  it('switches between short answer and paragraph', () => {
    const view = mount({ kind: 'text', multiline: false });
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Short answer' }).checked).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: 'Paragraph' }));
    expect(view.config()).toMatchObject({ multiline: true });
  });

  it('drops the placeholder key when it is emptied, keeping the "Your answer" fallback', () => {
    const view = mount({ kind: 'text', multiline: false, placeholder: 'One thing' });
    fireEvent.change(screen.getByLabelText(/Placeholder/), { target: { value: '' } });
    // Storing "" would silently remove the respondent input's fallback rather than
    // restoring it.
    expect('placeholder' in view.config()).toBe(false);
  });

  it('sets one when it is typed', () => {
    const view = mount({ kind: 'text', multiline: true });
    fireEvent.change(screen.getByLabelText(/Placeholder/), { target: { value: 'One thing' } });
    expect(view.config()).toMatchObject({ placeholder: 'One thing' });
  });
});

describe('readOnly is the locked-template case', () => {
  it('disables every control in every kind rather than hiding them', () => {
    // 37 § States: a locked template shows a banner and read-only editors, never controls
    // that silently do nothing.
    const configs: QuestionConfig[] = [
      { kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Great' },
      CHOICE,
      { kind: 'multi', options: ['A', 'B'] },
      { kind: 'text', multiline: false },
    ];
    for (const config of configs) {
      const view = mount(config, true);
      const fields = screen.queryAllByRole('textbox').concat(screen.queryAllByRole('combobox'));
      expect(fields.length).toBeGreaterThan(0);
      expect(fields.every((field) => (field as HTMLInputElement).disabled)).toBe(true);
      // And no way to grow the list past what is already saved.
      expect(screen.queryByRole('button', { name: 'Add option' })).toBeNull();
      view.unmount();
    }
  });
});
