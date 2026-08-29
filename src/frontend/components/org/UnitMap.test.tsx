// <UnitMap> — the organisation drawn as the graph it is (32, DEC-029).
//
// The tree next to it is covered by UnitTree.test.tsx. What matters here is what the LIST
// cannot show: how wide, how deep, and how evenly the thing branches — plus the two things
// a drawing gets wrong more often than a list does, vocabulary and accessibility.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { UnitNode } from '@endur/shared';
import { UnitMap } from './UnitMap.js';

const COURSES = { one: 'Course', many: 'Courses' };

// Every node carries two people to itself. `peopleTotal` is the SERVER's branch figure
// (DEC-082) and is stated, never derived — the map reads it and does no walking of its
// own, so a fixture that rolled it up would only be testing the fixture. A leaf's branch
// is itself, which is the default here.
const node = (
  id: string,
  name: string,
  children: UnitNode[] = [],
  over: Partial<UnitNode> = {},
): UnitNode =>
  ({
    id, name, children,
    peopleCount: 2, subjectCount: 0,
    peopleTotal: 2, subjectTotal: 0,
    ...over,
  }) as UnitNode;

const TREE: UnitNode[] = [
  node(
    'r',
    'Northfield',
    [
      node('eng', 'Engineering', [node('cs', 'Computer Science'), node('me', 'Mechanical')], {
        peopleTotal: 6,
      }),
      node('sci', 'Science'),
    ],
    { peopleTotal: 10 },
  ),
];

describe('the layout', () => {
  it('puts a parent at the midpoint of its first and last child, not the mean', () => {
    const { container } = render(<UnitMap nodes={TREE} subjectWord={COURSES} unitWord="Departments" />);
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
    const { container } = render(<UnitMap nodes={TREE} subjectWord={COURSES} unitWord="Departments" />);
    expect(container.querySelectorAll('.unit-node')).toHaveLength(5);
    expect(container.querySelectorAll('.unit-edge')).toHaveLength(4);
  });

  it('renders nothing at all rather than an empty frame', () => {
    const { container } = render(<UnitMap nodes={[]} subjectWord={COURSES} unitWord="Departments" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('truncates a long name rather than letting it run out of its box', () => {
    // SVG has no text truncation and no wrapping — an untrimmed name draws straight across
    // the node beside it.
    const long = [node('x', 'Department of Extremely Long Names and Related Studies')];
    render(<UnitMap nodes={long} subjectWord={COURSES} unitWord="Departments" />);
    expect(screen.getByText(/…$/)).toBeTruthy();
  });
});

describe('vocabulary and accessibility', () => {
  it('names the map in the ORGANISATION’s words — INV-001', () => {
    // This label said "units" until it was caught by hand: `audit:vocab` hunts the English
    // nouns a preset replaces, and "unit" is Endur's own internal name, so it read as
    // structural. A screen-reader user would have been the only person hearing it.
    render(<UnitMap nodes={TREE} subjectWord={{ one: 'Ward', many: 'Wards' }} unitWord="Services" />);
    expect(screen.getByLabelText('Map of 5 Services')).toBeTruthy();
  });

  it('is a GROUP, not an image, once its nodes can be pressed', () => {
    // role="img" makes the whole subtree presentational, so the pressable nodes inside stop
    // existing for a screen reader while staying in the tab order — reachable by keyboard,
    // invisible to the thing announcing what you reached.
    const { container } = render(
      <UnitMap nodes={TREE} subjectWord={COURSES} unitWord="Departments" onSelect={vi.fn()} />,
    );
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('group');
  });

  it('stays an image when there is nothing to press', () => {
    const { container } = render(<UnitMap nodes={TREE} subjectWord={COURSES} unitWord="Departments" />);
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('img');
  });

  it('selects by keyboard as well as by click — a chart is not a mouse-only surface', () => {
    const onSelect = vi.fn();
    render(
      <UnitMap nodes={TREE} subjectWord={COURSES} unitWord="Departments" onSelect={onSelect} />,
    );
    const nodes = screen.getAllByRole('button');
    fireEvent.keyDown(nodes[1] as HTMLElement, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('eng');

    fireEvent.click(nodes[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith('r');
  });

  it('says the people count always and the subject count only when there is one', () => {
    // A trailing "· 0" on most rows is noise, and "1" on its own is not a fact.
    const mixed = [node('a', 'Alpha'), node('b', 'Beta', [], { subjectCount: 3, subjectTotal: 3 })];
    render(<UnitMap nodes={mixed} subjectWord={COURSES} unitWord="Departments" />);
    expect(screen.getByText('2 people')).toBeTruthy();
    expect(screen.getByText('2 people · 3 Courses')).toBeTruthy();
  });

  it('counts ONE subject in the singular — the organisation stores both words', () => {
    // "1 Services" is what a hospital saw on every ward of its own map. A count and a
    // plural-only noun cannot be composed correctly, and the singular is not derivable:
    // "Faculty" pluralises to "Faculty" (22 §2), which is exactly where a university looks.
    const one = [node('a', 'Alpha', [], { subjectCount: 1, subjectTotal: 1 })];
    render(<UnitMap nodes={one} subjectWord={{ one: 'Service', many: 'Services' }} unitWord="Services" />);
    expect(screen.getByText('2 people · 1 Service')).toBeTruthy();
  });
});

describe('the numbers count the whole branch — DEC-081', () => {
  it('prints the branch figure, so a new leaf moves every box above it', () => {
    // The defect this replaces: adding Ward F under Ward D changed Ward F and NOTHING
    // else, because the API's peopleCount was a groupBy on unitId and the map printed it
    // raw. The walk is the server's now (DEC-082, `test/units.test.ts`); what the map owes
    // is reading `peopleTotal` rather than `peopleCount`, which these two numbers separate.
    render(<UnitMap nodes={TREE} subjectWord={COURSES} unitWord="Departments" />);

    // Five units at 2 people each. Northfield holds all of them, Engineering three.
    expect(screen.getByText('10 people')).toBeTruthy();
    expect(screen.getByText('6 people')).toBeTruthy();
    // And a leaf is still just itself — three of them, so this one is ambiguous by name.
    expect(screen.getAllByText('2 people')).toHaveLength(3);
  });

  it('discloses the split on a parent, because the box only has room for one number', () => {
    // A parent that reads "10 people" while two of them are placed ON the parent owes the
    // reader that sentence somewhere. <title> costs no layout and is the accessible name.
    const { container } = render(<UnitMap nodes={TREE} subjectWord={COURSES} unitWord="Departments" />);
    const titles = [...container.querySelectorAll('title')].map((t) => t.textContent);

    expect(titles).toContain(
      'Northfield — 10 people, counting everything inside it. 2 people placed here directly.',
    );
    // A leaf has no branch to distinguish, so it says one thing and stops.
    expect(titles).toContain('Computer Science — 2 people');
  });

  it('leaves a parent whose children are empty saying it once, not twice', () => {
    const barren = [
      node('p', 'Parent', [node('c', 'Child', [], { peopleCount: 0, peopleTotal: 0 })]),
    ];
    const { container } = render(<UnitMap nodes={barren} subjectWord={COURSES} unitWord="Departments" />);
    const titles = [...container.querySelectorAll('title')].map((t) => t.textContent);
    expect(titles).toContain('Parent — 2 people, counting everything inside it.');
  });
});
