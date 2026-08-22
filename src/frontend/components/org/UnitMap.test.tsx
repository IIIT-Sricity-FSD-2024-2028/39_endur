// <UnitMap> — the organisation drawn as the graph it is (32, DEC-029).
//
// The tree next to it is covered by UnitTree.test.tsx. What matters here is what the LIST
// cannot show: how wide, how deep, and how evenly the thing branches — plus the two things
// a drawing gets wrong more often than a list does, vocabulary and accessibility.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { UnitNode } from '@endur/shared';
import { UnitMap } from './UnitMap.js';

const node = (id: string, name: string, children: UnitNode[] = []): UnitNode =>
  ({ id, name, children, peopleCount: 2, subjectCount: 0 }) as UnitNode;

const TREE: UnitNode[] = [
  node('r', 'Northfield', [
    node('eng', 'Engineering', [node('cs', 'Computer Science'), node('me', 'Mechanical')]),
    node('sci', 'Science'),
  ]),
];

describe('the layout', () => {
  it('puts a parent at the midpoint of its first and last child, not the mean', () => {
    const { container } = render(<UnitMap nodes={TREE} subjectWord="Courses" unitWord="Departments" />);
    const y = (id: string): number => {
      const box = [...container.querySelectorAll('.unit-node')].find((group) =>
        group.querySelector('.unit-node-name')?.textContent?.startsWith(id),
      );
      const transform = box?.getAttribute('transform') ?? '';
      return Number(/translate\([-\d.]+ ([-\d.]+)\)/.exec(transform)?.[1] ?? NaN);
    };

    // Engineering has two leaves; it sits between them. The mean would drag a parent toward
    // whichever side has more children and the trunk stops looking like a spine.
    expect(y('Engineering')).toBeCloseTo((y('Computer Science') + y('Mechanical')) / 2, 5);
    // And the root sits between its own first and last child, not between all the leaves.
    expect(y('Northfield')).toBeCloseTo((y('Engineering') + y('Science')) / 2, 5);
  });

  it('draws one edge per node that has a parent, and never one for a root', () => {
    const { container } = render(<UnitMap nodes={TREE} subjectWord="Courses" unitWord="Departments" />);
    expect(container.querySelectorAll('.unit-node')).toHaveLength(5);
    expect(container.querySelectorAll('.unit-edge')).toHaveLength(4);
  });

  it('renders nothing at all rather than an empty frame', () => {
    const { container } = render(<UnitMap nodes={[]} subjectWord="Courses" unitWord="Departments" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('truncates a long name rather than letting it run out of its box', () => {
    // SVG has no text truncation and no wrapping — an untrimmed name draws straight across
    // the node beside it.
    const long = [node('x', 'Department of Extremely Long Names and Related Studies')];
    render(<UnitMap nodes={long} subjectWord="Courses" unitWord="Departments" />);
    expect(screen.getByText(/…$/)).toBeTruthy();
  });
});

describe('vocabulary and accessibility', () => {
  it('names the map in the ORGANISATION’s words — INV-001', () => {
    // This label said "units" until it was caught by hand: `audit:vocab` hunts the English
    // nouns a preset replaces, and "unit" is Endur's own internal name, so it read as
    // structural. A screen-reader user would have been the only person hearing it.
    render(<UnitMap nodes={TREE} subjectWord="Wards" unitWord="Services" />);
    expect(screen.getByLabelText('Map of 5 Services')).toBeTruthy();
  });

  it('is a GROUP, not an image, once its nodes can be pressed', () => {
    // role="img" makes the whole subtree presentational, so the pressable nodes inside stop
    // existing for a screen reader while staying in the tab order — reachable by keyboard,
    // invisible to the thing announcing what you reached.
    const { container } = render(
      <UnitMap nodes={TREE} subjectWord="Courses" unitWord="Departments" onSelect={vi.fn()} />,
    );
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('group');
  });

  it('stays an image when there is nothing to press', () => {
    const { container } = render(<UnitMap nodes={TREE} subjectWord="Courses" unitWord="Departments" />);
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('img');
  });

  it('selects by keyboard as well as by click — a chart is not a mouse-only surface', () => {
    const onSelect = vi.fn();
    render(
      <UnitMap nodes={TREE} subjectWord="Courses" unitWord="Departments" onSelect={onSelect} />,
    );
    const nodes = screen.getAllByRole('button');
    fireEvent.keyDown(nodes[1] as HTMLElement, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('eng');

    fireEvent.click(nodes[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith('r');
  });

  it('says the people count always and the subject count only when there is one', () => {
    // A trailing "· 0" on most rows is noise, and "1" on its own is not a fact.
    const mixed = [node('a', 'Alpha'), { ...node('b', 'Beta'), subjectCount: 3 }];
    render(<UnitMap nodes={mixed} subjectWord="Courses" unitWord="Departments" />);
    expect(screen.getByText('2 people')).toBeTruthy();
    expect(screen.getByText('2 people · 3 Courses')).toBeTruthy();
  });
});
