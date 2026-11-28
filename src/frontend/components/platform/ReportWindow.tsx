// The date window Analytics and Earnings share (R-716). It is `state.opsReports.window`:
// choose a range on one page and the other opens at it, because both read the same state.
// Each window's search string is its own cache key, so going back to a window already seen
// draws at once from the cache while it is re-read.
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import {
  reportWindowChanged,
  reportWindowReset,
  selectReportWindow,
} from '../../store/screens/opsReports.js';

export function ReportWindow({ label }: { label?: string | undefined }): JSX.Element {
  const dispatch = useAppDispatch();
  const window = useAppSelector(selectReportWindow);
  const custom = window.from !== null || window.to !== null || window.granularity !== 'month';

  return (
    <div className="ops-toolbar" role="group" aria-label="Report window">
      <input
        type="date"
        className="input"
        aria-label="From"
        value={window.from ?? ''}
        max={window.to ?? undefined}
        onChange={(event) => dispatch(reportWindowChanged({ from: event.target.value }))}
      />
      <input
        type="date"
        className="input"
        aria-label="To"
        value={window.to ?? ''}
        min={window.from ?? undefined}
        onChange={(event) => dispatch(reportWindowChanged({ to: event.target.value }))}
      />
      <div className="ops-segmented" role="group" aria-label="Periods">
        {(['month', 'quarter'] as const).map((granularity) => (
          <button
            key={granularity}
            type="button"
            aria-pressed={window.granularity === granularity}
            onClick={() => dispatch(reportWindowChanged({ granularity }))}
          >
            {granularity === 'month' ? 'Monthly' : 'Quarterly'}
          </button>
        ))}
      </div>
      {custom && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch(reportWindowReset())}>
          Reset
        </button>
      )}
      {label && <span className="ops-toolbar-note">{label}</span>}
    </div>
  );
}
