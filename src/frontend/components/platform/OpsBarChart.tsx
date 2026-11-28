// A period-by-period bar chart for the operator console (R-716): revenue, plan purchases,
// organisation movement.
//
// THE POINT UNDER THE POINTER IS IN THE STORE (`state.opsReports.focus`): resting on a bar,
// or tabbing to it, dispatches `chartFocused`, and the tooltip is drawn from that. Every
// bar's height is the selector's `ratio` (a share of the busiest period), so this component
// scales nothing itself. Each column is a button, so the chart can be read by keyboard, and
// a hidden table carries the same numbers for a screen reader.
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { chartFocused, chartLeft, selectChartFocus, type ChartId } from '../../store/screens/opsReports.js';

export type ChartSeries = { key: string; label: string; fill: string };

export type ChartColumn = {
  label: string;
  /** Per series, 0–1, from the selector. */
  ratios: Record<string, number>;
  /** Per series, the figure as it should read. */
  values: Record<string, string>;
  /** Extra lines for the tooltip ("vs last period +12%"). */
  notes?: Array<{ label: string; value: string }>;
};

/** At most about eight labels under the axis, however many periods there are. */
const labelStep = (count: number): number => Math.max(1, Math.ceil(count / 8));

export function OpsBarChart({
  chart,
  series,
  columns,
  caption,
  totals,
}: {
  chart: ChartId;
  series: ChartSeries[];
  columns: ChartColumn[];
  caption: string;
  /** Per series, what the legend prints beside its name (the window's total). */
  totals?: Record<string, string>;
}): JSX.Element {
  const dispatch = useAppDispatch();
  const focus = useAppSelector((state) => selectChartFocus(state, chart));

  if (columns.length === 0) {
    return <p className="ops-chart-empty">No periods in this window.</p>;
  }

  const step = labelStep(columns.length);
  const focused = focus === null ? undefined : columns[focus];
  const tipLeft = focus === null ? 0 : Math.min(88, Math.max(12, ((focus + 0.5) / columns.length) * 100));

  return (
    <div className="ops-chart">
      {series.length > 1 && (
        <ul className="ops-chart-legend">
          {series.map((line) => (
            <li key={line.key}>
              <span className={`ops-key ${line.fill}`} aria-hidden="true" />
              {line.label}
              {totals?.[line.key] !== undefined && <strong>{totals[line.key]}</strong>}
            </li>
          ))}
        </ul>
      )}

      <div className="ops-chart-plot" onMouseLeave={() => dispatch(chartLeft({ chart }))}>
        {columns.map((column, index) => (
          <button
            key={column.label}
            type="button"
            className={`ops-chart-col${focus === index ? ' is-focused' : ''}`}
            aria-label={`${column.label}: ${series.map((line) => `${line.label} ${column.values[line.key] ?? ''}`).join(', ')}`}
            onMouseEnter={() => dispatch(chartFocused({ chart, index }))}
            onFocus={() => dispatch(chartFocused({ chart, index }))}
            onBlur={() => dispatch(chartLeft({ chart }))}
          >
            {series.map((line) => {
              const ratio = column.ratios[line.key] ?? 0;
              return (
                <span
                  key={line.key}
                  className={`ops-chart-bar ${line.fill}${ratio === 0 ? ' is-zero' : ''}`}
                  style={{ height: `${Math.max(ratio * 100, 1)}%` }}
                />
              );
            })}
          </button>
        ))}

        {focused && (
          <div className="ops-chart-tip" style={{ left: `${tipLeft}%` }} role="status">
            <strong>{focused.label}</strong>
            <dl>
              {series.map((line) => (
                <div key={line.key}>
                  <dt>{line.label}</dt>
                  <dd>{focused.values[line.key]}</dd>
                </div>
              ))}
              {focused.notes?.map((note) => (
                <div key={note.label}>
                  <dt>{note.label}</dt>
                  <dd>{note.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      <div className="ops-chart-axis" aria-hidden="true">
        {columns.map((column, index) => (
          <span key={column.label}>{index % step === 0 || index === columns.length - 1 ? column.label : ''}</span>
        ))}
      </div>

      {/* Hidden by a wrapper, not on the <table>: a table's caption is drawn outside the
          table's own box, so `sr-only` on the table clips the grid and leaves the caption
          printed over the legend. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              {series.map((line) => (
                <th key={line.key} scope="col">{line.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => (
              <tr key={column.label}>
                <th scope="row">{column.label}</th>
                {series.map((line) => (
                  <td key={line.key}>{column.values[line.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
