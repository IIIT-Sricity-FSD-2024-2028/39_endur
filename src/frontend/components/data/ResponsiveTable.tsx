import type { ReactNode } from 'react';

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  primary?: boolean;
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
  empty: ReactNode;
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
