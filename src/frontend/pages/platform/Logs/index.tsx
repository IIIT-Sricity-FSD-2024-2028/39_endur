// `/ops/logs`: the rotating log files (`72`). R-716.
//
// The file being read and its filters are `state.operator.logs` (store/screens/operator.ts),
// so they survive a look elsewhere and back. Before anything is picked, `selectLogFile`
// works out the default (the newest error stream) from the cached list: no effect writes a
// default anywhere. The lines are RTK Query's cache (`getLogLines`); the export is the
// `logExported` thunk, with the same filters as the view.
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { LogViewer } from '../../../components/platform/LogViewer.js';
import { Icon } from '../../../components/Icon.js';
import { Denied, OpsError, OpsHeader } from '../../../components/platform/OpsUi.js';
import { logSearch, useLogFiles, useLogLines } from '../../../lib/oplogs.js';
import { useOpsCan } from '../../../lib/opsCapabilities.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { useClearOnLeave } from '../../../store/screens/common.js';
import {
  logExported,
  logFileChosen,
  logFilterChanged,
  logFiltersCleared,
  logFormatChosen,
  logsLeft,
  opsMessageOf,
  selectLogFile,
  selectLogFiltered,
  selectOperator,
} from '../../../store/screens/operator.js';

export default function Logs(): JSX.Element {
  const dispatch = useAppDispatch();
  const can = useOpsCan();
  const files = useLogFiles();
  const selected = useAppSelector(selectLogFile);
  const filtered = useAppSelector(selectLogFiltered);
  const { filter, format, exporting, exportError, last } = useAppSelector(selectOperator).logs;
  const lines = useLogLines(selected, filter);
  useClearOnLeave(logsLeft());

  const store = files.store;
  const subtitle = store
    ? `Written automatically to ${store.dir}, rotated daily and at ${store.maxSizeMb} MB, kept ${store.retentionDays} days. Reading a file is itself audited.`
    : 'The rotating log files, across the estate.';
  const header = <OpsHeader kicker="Platform" title="Logs" subtitle={subtitle} />;

  if (files.forbidden) {
    return <Denied capability="platform.logs.read" what="Reading logs" />;
  }

  if (!files.loading && files.data && files.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState icon="log" title="Nothing has been written yet" body="No log files exist on this machine yet." />
      </>
    );
  }

  return (
    <>
      {header}

      <section className="ops-card card" aria-label="Log file">
        {lines.notFound && <OpsError>That file has rotated away.</OpsError>}
        {lines.error && <OpsError>{lines.error.message}</OpsError>}

        {/* DEC-074: the export takes the SAME filters as the view, so the file that lands on
            disk is the one on screen, and every export is written to the audit trail. */}
        {selected && can('platform.logs.export') && (
          <div className="ops-toolbar">
            <label className="ops-actions">
              <span className="field-label">Export as</span>
              <select
                className="input"
                value={format}
                onChange={(event) =>
                  dispatch(logFormatChosen({ format: event.target.value === 'csv' ? 'csv' : 'ndjson' }))}
              >
                <option value="ndjson">NDJSON: every field</option>
                <option value="csv">CSV: fixed columns</option>
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={exporting}
              onClick={() => void dispatch(logExported({ file: selected, search: logSearch(filter) }))}
            >
              <Icon name="download" size={16} />
              {exporting ? 'Preparing…' : 'Export this file'}
            </button>
            {last && (
              <span className="ops-toolbar-note" role="status">
                {last.lines.toLocaleString()} lines saved as {last.name}
                {last.truncated ? ', truncated at the export limit' : ''}
              </span>
            )}
          </div>
        )}
        {exportError && <OpsError>{opsMessageOf(exportError, exportError.message)}</OpsError>}

        {selected && !lines.loading && lines.rows.length === 0 && !lines.notFound && filtered && (
          <EmptyState
            icon="log"
            title="No lines match these filters"
            body="Nothing in this file matches the current filter."
            action={
              <button type="button" className="btn btn-secondary" onClick={() => dispatch(logFiltersCleared())}>
                Clear filters
              </button>
            }
          />
        )}

        <LogViewer
          files={files.data ?? []}
          selected={selected ?? ''}
          lines={lines.rows}
          filter={filter}
          onSelect={(file) => dispatch(logFileChosen({ file }))}
          onFilter={(next) => dispatch(logFilterChanged(next))}
          loading={files.loading || lines.loading}
        />

        {lines.data?.page.hasMore && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={lines.loadingMore}
            onClick={() => void lines.loadMore()}
          >
            {lines.loadingMore ? 'Loading…' : 'Load older'}
          </button>
        )}
      </section>
    </>
  );
}
