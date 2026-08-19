// <UnitTree> — the T-033 extensions. 32, 24 §4.
//
// The wizard's use of this component is covered by Setup.test.tsx; what is here is
// everything /app/structure added, and the reason it is a separate file is INV-009: there
// is ONE tree, and the next page to need it (the campaign audience picker) should find its
// behaviour already described rather than guess.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { UnitTree, daysUntil, type UnitTreeNode } from './UnitTree.js';

const tree = (over: Partial<UnitTreeNode> = {}): UnitTreeNode[] => [
  {
    id: 'root',
    name: 'Northfield',
    children: [
      {
        id: 'eng',
        name: 'Engineering',
        children: [{ id: 'cs', name: 'Computer Science', children: [] }],
        ...over,
      },
    ],
  },
];

const rowFor = (name: string): HTMLElement => {
  const input = screen.getByDisplayValue(name);
  const row = input.closest('.unit-row');
  if (!row) throw new Error(`no row for ${name}`);
  return row as HTMLElement;
};

describe('<UnitTree> — counts and badges', () => {
  it('shows people and subject counts, in the caller vocabulary (INV-001)', () => {
    render(
      <UnitTree
        nodes={tree({ peopleCount: 64, subjectCount: 7 })}
        mode="edit"
        subjectWord="Quaxels"
        onRename={vi.fn()}
      />,
    );

    expect(within(rowFor('Engineering')).getByText('64 people · 7 Quaxels')).toBeTruthy();
  });

  it('hides subject counts when the caller has no word for them', () => {
    // Better to say nothing than to invent "7 Subjects" for an organisation that calls
    // them something else.
    render(<UnitTree nodes={tree({ peopleCount: 64, subjectCount: 7 })} mode="edit" onRename={vi.fn()} />);
    expect(within(rowFor('Engineering')).getByText('64 people')).toBeTruthy();
  });

  it('counts one person in the singular', () => {
    render(<UnitTree nodes={tree({ peopleCount: 1 })} mode="edit" onRename={vi.fn()} />);
    expect(within(rowFor('Engineering')).getByText('1 person')).toBeTruthy();
  });

  it('badges a temporary unit', () => {
    render(<UnitTree nodes={tree({ isTemporary: true })} mode="edit" onRename={vi.fn()} />);
    expect(within(rowFor('Engineering')).getByText('Temporary')).toBeTruthy();
  });

  it('warns inside thirty days and stays quiet outside them (10 §9)', () => {
    const inDays = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString();

    const { unmount } = render(
      <UnitTree nodes={tree({ endsAt: inDays(6) })} mode="edit" onRename={vi.fn()} />,
    );
    expect(screen.getByText(/Ends in \d+ days/)).toBeTruthy();
    unmount();

    render(<UnitTree nodes={tree({ endsAt: inDays(90) })} mode="edit" onRename={vi.fn()} />);
    expect(screen.queryByText(/Ends in/)).toBeNull();
  });

  it('counts the days to an end date, and knows one that has passed', () => {
    const now = Date.parse('2026-08-19T12:00:00Z');
    expect(daysUntil('2026-08-26T12:00:00Z', now)).toBe(7);
    expect(daysUntil('2026-08-01T12:00:00Z', now)).toBe(-18);
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil('not a date', now)).toBeNull();
  });
});

describe('<UnitTree> — refusing a move into your own descendant', () => {
  it('says so on the row being moved, and does not call onReparent', () => {
    const onReparent = vi.fn();
    render(<UnitTree nodes={tree()} mode="edit" onRename={vi.fn()} onReparent={onReparent} />);

    fireEvent.click(screen.getByLabelText('Move Engineering'));
    // Computer Science is inside Engineering, so it cannot become its parent. It offers no
    // "Move here" — the refusal below is what a DRAG onto it produces.
    fireEvent.drop(rowFor('Computer Science'));

    expect(onReparent).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Engineering cannot go inside itself.');
  });

  it('renders a message the page passes in — a 409 from the server, on the right row', () => {
    render(
      <UnitTree
        nodes={tree()}
        mode="edit"
        onRename={vi.fn()}
        rowMessage={{ id: 'eng', text: 'That move would put the unit inside itself.' }}
      />,
    );

    expect(screen.getByRole('alert').textContent).toBe(
      'That move would put the unit inside itself.',
    );
  });
});

describe('<UnitTree> — asked to act from outside', () => {
  it('starts a move when the detail panel asks for one', () => {
    const { rerender } = render(
      <UnitTree nodes={tree()} mode="edit" onRename={vi.fn()} onReparent={vi.fn()} />,
    );
    expect(screen.queryByRole('status')).toBeNull();

    rerender(
      <UnitTree
        nodes={tree()}
        mode="edit"
        onRename={vi.fn()}
        onReparent={vi.fn()}
        request={{ id: 'cs', action: 'move', nonce: 1 }}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('Computer Science');
  });

  it('honours the SAME request twice — that is what the nonce is for', () => {
    const props = { nodes: tree(), mode: 'edit' as const, onRename: vi.fn(), onReparent: vi.fn() };
    const { rerender } = render(
      <UnitTree {...props} request={{ id: 'cs', action: 'move', nonce: 1 }} />,
    );

    // Cancel it, then ask for exactly the same thing again. Without the nonce the second
    // click on Move would be a no-op, because nothing about the request changed.
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(screen.queryByRole('status')).toBeNull();

    rerender(<UnitTree {...props} request={{ id: 'cs', action: 'move', nonce: 2 }} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('focuses a row for renaming when asked', () => {
    const props = { nodes: tree(), mode: 'edit' as const, onRename: vi.fn() };
    const { rerender } = render(<UnitTree {...props} />);
    rerender(<UnitTree {...props} request={{ id: 'cs', action: 'rename', nonce: 1 }} />);

    expect(document.activeElement).toBe(screen.getByDisplayValue('Computer Science'));
  });
});

describe('<UnitTree> — the placeholder row', () => {
  it('shows the placeholder and reports an abandoned edit', () => {
    const onCancelEdit = vi.fn();
    const nodes: UnitTreeNode[] = [
      {
        id: 'root',
        name: 'Northfield',
        children: [{ id: 'draft:1', name: '', children: [], placeholder: 'Add a Zblorn' }],
      },
    ];
    render(<UnitTree nodes={nodes} mode="edit" onRename={vi.fn()} onCancelEdit={onCancelEdit} />);

    const input = screen.getByPlaceholderText('Add a Zblorn');
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onCancelEdit).toHaveBeenCalledWith('draft:1');
  });
});
