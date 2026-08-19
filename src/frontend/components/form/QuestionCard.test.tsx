// T-036 — <QuestionCard>. 24 §5, 05 §5.2, 37 § Interactions.
//
// Two things here are contracts rather than styling: expansion is owned by the PARENT (so
// "exactly one open at a time" is possible at all), and a type change that would drop
// options is warned about BEFORE it happens, not undone afterwards.
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { QuestionConfig } from '@endur/shared';
import { QuestionCard } from './QuestionCard.js';
import { optionsOf, type QuestionDraft } from './kinds.js';

const CHOICE: QuestionConfig = {
  kind: 'single', options: ['Always', 'Sometimes', 'Never'], allowOther: false,
};

const draft = (over: Partial<QuestionDraft> = {}): QuestionDraft => ({
  id: 'q1', kind: 'single', text: 'How often did you attend?', config: CHOICE,
  required: false, ...over,
});

function Harness({
  initial, expanded = true, onChange, onDuplicate, onDelete, readOnly = false,
}: {
  initial: QuestionDraft;
  expanded?: boolean;
  onChange: (q: QuestionDraft) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  readOnly?: boolean;
}): JSX.Element {
  const [question, setQuestion] = useState(initial);
  const [open, setOpen] = useState(expanded);
  return (
    <QuestionCard
      question={question}
      index={0}
      expanded={open}
      readOnly={readOnly}
      onExpand={() => setOpen(true)}
      onChange={(next) => { setQuestion(next); onChange(next); }}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
    />
  );
}

const mount = (initial = draft(), opts: { expanded?: boolean; readOnly?: boolean } = {}) => {
  const onChange = vi.fn();
  const onDuplicate = vi.fn();
  const onDelete = vi.fn();
  const result = render(
    <Harness
      initial={initial}
      onChange={onChange}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      {...opts}
    />,
  );
  const latest = (): QuestionDraft => onChange.mock.calls.at(-1)?.[0] as QuestionDraft;
  return { onChange, onDuplicate, onDelete, latest, ...result };
};

describe('collapsed is a row; expansion is the parent\'s decision', () => {
  it('shows the text and the type name, and no editor', () => {
    mount(draft(), { expanded: false });
    expect(screen.getByText('How often did you attend?')).toBeTruthy();
    expect(screen.getByText('Single choice')).toBeTruthy();
    // The whole point of collapsing: a ten-question form stays scannable.
    expect(screen.queryByRole('textbox', { name: 'Option 1' })).toBeNull();
  });

  it('falls back to its position when the question has no text yet', () => {
    mount(draft({ text: '   ' }), { expanded: false });
    // A blank row with nothing on it is unreachable by name — for a reader and for a test.
    expect(screen.getByText('Question 1')).toBeTruthy();
  });

  it('asks the parent to expand — it never expands itself', () => {
    // Owning its own expansion would make "exactly one open at a time" impossible: a card
    // cannot know about its siblings.
    const onExpand = vi.fn();
    render(
      <QuestionCard
        question={draft()} index={0} expanded={false}
        onExpand={onExpand} onChange={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /How often/ }));
    expect(onExpand).toHaveBeenCalledTimes(1);
    // Still collapsed: the parent decides, and it has not said yes yet.
    expect(screen.queryByRole('textbox', { name: 'Option 1' })).toBeNull();
  });

  it('opens from the keyboard because the control is a REAL button, not a div with handlers', () => {
    render(
      <QuestionCard
        question={draft()} index={0} expanded={false}
        onExpand={vi.fn()} onChange={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()}
        onMove={vi.fn()}
      />,
    );
    // The row itself must NOT be the button: it carries the reorder controls, and a button
    // containing buttons is invalid ARIA — assistive tech collapses it into one control
    // whose name is every label inside concatenated. Found by a test that could not tell
    // the row from its own Move button.
    const control = screen.getByRole('button', { name: 'How often did you attend?' });
    expect(control.tagName).toBe('BUTTON');
    expect(control.getAttribute('aria-expanded')).toBe('false');
    // Enter and Space come free from the platform, which is the point of using one.
    expect(control.closest('.qcard')?.getAttribute('role')).toBeNull();
  });
});

describe('expanded carries the text, the type select and the editor', () => {
  it('edits the question text', () => {
    const view = mount();
    fireEvent.change(screen.getByRole('textbox', { name: 'Question 1' }), {
      target: { value: 'How often did you come?' },
    });
    expect(view.latest().text).toBe('How often did you come?');
  });

  it('offers exactly six types, grouped', () => {
    mount();
    // SIX. NOT SEVEN (DEC-010). Six ungrouped options read as a list of unrelated things.
    const select = screen.getByRole('combobox', { name: /Type of question/ });
    expect(within(select).getAllByRole('option')).toHaveLength(6);
    expect([...select.querySelectorAll('optgroup')].map((group) => group.label)).toEqual([
      'Scales', 'Choice', 'Text',
    ]);
  });

  it('renders the editor for the current type', () => {
    const view = mount(draft({ kind: 'yesno', config: { kind: 'yesno' } }));
    expect(screen.getByText('No settings for this type.')).toBeTruthy();
    view.unmount();

    mount(draft({ kind: 'rating', config: { kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Great' } }));
    expect(screen.getByLabelText('Scale')).toBeTruthy();
  });

  it('toggles Required, and duplicate and delete report to the parent', () => {
    const view = mount();
    fireEvent.click(screen.getByLabelText('Required'));
    expect(view.latest().required).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Duplicate/ }));
    expect(view.onDuplicate).toHaveBeenCalledTimes(1);

    // Immediate, with no dialog. A confirmation per question would make authoring
    // miserable; undo is the right answer for a cheap reversible action (37).
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(view.onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('changing type warns BEFORE it costs anything', () => {
  it('applies a lossless change straight away', () => {
    const view = mount();
    fireEvent.change(screen.getByRole('combobox', { name: /Type of question/ }), {
      target: { value: 'multi' },
    });
    // Single -> multi keeps the options, so there is nothing to warn about.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(view.latest().kind).toBe('multi');
    expect(optionsOf(view.latest().config)).toEqual(['Always', 'Sometimes', 'Never']);
  });

  it('holds a lossy change, states the cost, and changes NOTHING until accepted', () => {
    const view = mount();
    fireEvent.change(screen.getByRole('combobox', { name: /Type of question/ }), {
      target: { value: 'text' },
    });
    expect(screen.getByRole('alert').textContent).toContain('removes the 3 options');
    // After the change the options are gone and an apology is not a warning.
    expect(view.onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Option 1' })).toBeTruthy();
  });

  it('keeps the question as it was when the warning is declined', () => {
    const view = mount();
    fireEvent.change(screen.getByRole('combobox', { name: /Type of question/ }), {
      target: { value: 'yesno' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Keep it as it is' }));
    expect(view.onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Option 1' })).toBeTruthy();
  });

  it('applies it once when accepted, keeping the text', () => {
    const view = mount();
    fireEvent.change(screen.getByRole('combobox', { name: /Type of question/ }), {
      target: { value: 'text' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change anyway' }));

    expect(view.onChange).toHaveBeenCalledTimes(1);
    expect(view.latest().kind).toBe('text');
    // The text is the part somebody thought about; losing it for picking the wrong control
    // first would make the select a thing people avoid.
    expect(view.latest().text).toBe('How often did you attend?');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('readOnly is the launched-campaign case', () => {
  it('disables the text, the type select and the editor rather than hiding the card', () => {
    // 37 § States: a banner plus read-only editors, never controls that silently do
    // nothing. The banner is the builder's job; this is its half.
    mount(draft(), { readOnly: true });
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Question 1' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: /Type of question/ }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Duplicate/ }).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Add option' })).toBeNull();
  });
});
