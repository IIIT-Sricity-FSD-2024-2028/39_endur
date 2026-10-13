import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { UnitNode } from '@endur/shared';
import { UnitMap } from './UnitMap.js';

const COURSES = { one: 'Course', many: 'Courses' };

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

    expect(y('Engineering')).toBeCloseTo((y('Computer Science') + y('Mechanical')) / 2, 5);
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
    const long = [node('x', 'Department of Extremely Long Names and Related Studies')];
    render(<UnitMap nodes={long} subjectWord={COURSES} unitWord="Departments" />);
    expect(screen.getByText(/…$/)).toBeTruthy();
  });
});

describe('vocabulary and accessibility', () => {
  it('names the map in the ORGANISATION’s words — INV-001', () => {
    render(<UnitMap nodes={TREE} subjectWord={{ one: 'Ward', many: 'Wards' }} unitWord="Services" />);
    expect(screen.getByLabelText('Map of 5 Services')).toBeTruthy();
  });

  it('is a GROUP, not an image, once its nodes can be pressed', () => {
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
    const mixed = [node('a', 'Alpha'), node('b', 'Beta', [], { subjectCount: 3, subjectTotal: 3 })];
    render(<UnitMap nodes={mixed} subjectWord={COURSES} unitWord="Departments" />);
    expect(screen.getByText('2 people')).toBeTruthy();
    expect(screen.getByText('2 people · 3 Courses')).toBeTruthy();
  });

  it('counts ONE subject in the singular — the organisation stores both words', () => {
    const one = [node('a', 'Alpha', [], { subjectCount: 1, subjectTotal: 1 })];
    render(<UnitMap nodes={one} subjectWord={{ one: 'Service', many: 'Services' }} unitWord="Services" />);
    expect(screen.getByText('2 people · 1 Service')).toBeTruthy();
  });
});

describe('the numbers count the whole branch — DEC-081', () => {
  it('prints the branch figure, so a new leaf moves every box above it', () => {
    render(<UnitMap nodes={TREE} subjectWord={COURSES} unitWord="Departments" />);

    expect(screen.getByText('10 people')).toBeTruthy();
    expect(screen.getByText('6 people')).toBeTruthy();
    expect(screen.getAllByText('2 people')).toHaveLength(3);
  });

  it('discloses the split on a parent, because the box only has room for one number', () => {
    const { container } = render(<UnitMap nodes={TREE} subjectWord={COURSES} unitWord="Departments" />);
    const titles = [...container.querySelectorAll('title')].map((t) => t.textContent);

    expect(titles).toContain(
      'Northfield — 10 people, counting everything inside it. 2 people placed here directly.',
    );
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
