// <ResponsiveTable> — 24 §3, §9.
//
// The acceptance item is "collapses correctly for all four tables at 390px", and jsdom has
// no layout, so what can honestly be tested here is the CONTRACT the collapse rests on: one
// DOM, every cell labelled by its header, the primary column marked, and the hide-below
// columns carrying the class the media query keys on. The pixel behaviour is a device
// check, and it is listed as one.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ResponsiveTable, type Column } from './ResponsiveTable.js';

type Row = { id: string; name: string; unit: string; count: number };

const rows: Row[] = [
  { id: 'a', name: 'Data Structures', unit: 'Engineering', count: 612 },
  { id: 'b', name: 'Thermodynamics', unit: 'Engineering', count: 4 },
];

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', primary: true, render: (row) => row.name },
  { key: 'unit', header: 'Zblorn', render: (row) => row.unit, hideBelow: 'md' },
  { key: 'count', header: 'Responses', render: (row) => row.count, hideBelow: 'sm' },
];

const mount = (over: Partial<Parameters<typeof ResponsiveTable<Row>>[0]> = {}) =>
  render(
    <ResponsiveTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      empty={<p>NOTHING</p>}
      caption="Quaxels"
      {...over}
    />,
  );

describe('<ResponsiveTable>', () => {
  it('renders a real table with headers', () => {
    mount();
    expect(screen.getByRole('table', { name: 'Quaxels' })).toBeTruthy();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Name', 'Zblorn', 'Responses',
    ]);
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('labels every cell with its header — that is what the card view reads', () => {
    const { container } = mount();
    const first = container.querySelectorAll('tbody tr')[0];
    const labels = Array.from(first?.querySelectorAll('td') ?? []).map((cell) =>
      cell.getAttribute('data-label'),
    );
    expect(labels).toEqual(['Name', 'Zblorn', 'Responses']);
  });

  it('marks the primary column and the ones that drop at each width', () => {
    const { container } = mount();
    expect(container.querySelectorAll('td.cell-primary')).toHaveLength(2);
    expect(container.querySelectorAll('td.hide-below-md')).toHaveLength(2);
    expect(container.querySelectorAll('td.hide-below-sm')).toHaveLength(2);
  });

  it('renders the empty node INSTEAD of an empty table', () => {
    mount({ rows: [] });
    expect(screen.getByText('NOTHING')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('calls back with the row that was clicked, when a caller wants that', () => {
    const onRowClick = vi.fn();
    mount({ onRowClick });
    fireEvent.click(within(screen.getByText('Thermodynamics').closest('tr') as HTMLElement)
      .getByText('Thermodynamics'));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it('is inert when no row handler was given — no phantom cursor, no phantom click', () => {
    const { container } = mount();
    expect(container.querySelectorAll('tr.is-clickable')).toHaveLength(0);
  });
});
