// <ResponsiveTable> — 24 §3.
//
// **Built once.** There are four tables in the app, and doing the mobile collapse four
// times is exactly where the mobile experience rots (design_specs/design/09 §3.1).
//
// One DOM in both shapes, not two: below 640px the table's rows become stacked cards, with
// each cell labelled by its header through `data-label` and CSS `::before`. Rendering a
// second markup tree for small screens is how the two versions start disagreeing about
// which columns exist.
import type { ReactNode } from 'react';

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** The card title when the table collapses. Exactly one column should carry it. */
  primary?: boolean;
  /** Dropped entirely below this width — for columns that are context, not content. */
  hideBelow?: 'sm' | 'md';
};

export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: ((row: T) => void) | undefined;
  /** Rendered instead of the table when there is nothing — an <EmptyState>, usually. */
  empty: ReactNode;
  /** Screen-reader name for the table. Sighted readers have the page header. */
  caption?: string | undefined;
}): JSX.Element {
  if (rows.length === 0) return <>{empty}</>;

  const classOf = (column: Column<T>): string =>
    [
      column.primary ? 'cell-primary' : '',
      column.hideBelow ? `hide-below-${column.hideBelow}` : '',
    ].filter(Boolean).join(' ');

  return (
    <div className="table-wrap">
      <table className="rtable">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={classOf(column)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? 'is-clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} className={classOf(column)} data-label={column.header}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
