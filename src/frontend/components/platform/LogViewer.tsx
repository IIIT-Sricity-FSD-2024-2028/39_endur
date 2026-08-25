// `<LogViewer>` — `24` §6c, `72`. Internal-only, like `<GrowthChart>`.
//
// A file picker, a level/status/path filter, and a monospace pane of PARSED JSON lines with
// the `requestId` clickable to collapse to that one request — `18` §6's workflow made into a
// screen instead of a `grep` to remember.
//
// It renders parsed fields into columns, never a raw blob (`24` §6c). A viewer that printed
// whatever is on the line would render a line that should never have been written as though
// it were fine; mapping known fields is what makes an unexpected key visible AS an unexpected
// key — `extra` is rendered explicitly, below the line, rather than folded into the row.
import { useState } from 'react';
import type { LogFileMeta, LogLine } from '@endur/shared';
import { formatDateTime } from '../../lib/format.js';
import type { LogFilter } from '../../lib/oplogs.js';

const LEVEL_NAME: Record<number, string> = {
  10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal',
};

function levelName(level: number): string {
  return LEVEL_NAME[level] ?? String(level);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilePicker({
  files,
  selected,
  onSelect,
}: {
  files: LogFileMeta[];
  selected: string;
  onSelect: (file: string) => void;
}): JSX.Element {
  // `error-*.log` first (`72` § Interactions) — finding an error must not mean grepping
  // megabytes of `200 OK`.
  const errors = files.filter((f) => f.stream === 'error');
  const apps = files.filter((f) => f.stream === 'app');

  const row = (file: LogFileMeta): JSX.Element => (
    <button
      key={file.name}
      type="button"
      className={`log-file-row${file.name === selected ? ' is-selected' : ''}`}
      onClick={() => onSelect(file.name)}
    >
      <span className="log-file-name">{file.name}</span>
      <span className="text-meta">
        {formatBytes(file.bytes)} · {file.lines ?? '—'} lines
      </span>
    </button>
  );

  return (
    <div className="log-file-picker">
      {errors.length > 0 && (
        <div className="log-file-group">
          <h4 className="text-meta">Errors</h4>
          {errors.map(row)}
        </div>
      )}
      {apps.length > 0 && (
        <div className="log-file-group">
          <h4 className="text-meta">App</h4>
          {apps.map(row)}
        </div>
      )}
    </div>
  );
}

function FilterBar({
  filter,
  onFilter,
}: {
  filter: LogFilter;
  onFilter: (f: LogFilter) => void;
}): JSX.Element {
  return (
    <div className="log-filter-bar">
      <select
        className="input"
        aria-label="Level"
        value={filter.level ?? ''}
        onChange={(e) => onFilter({ ...filter, level: e.target.value ? Number(e.target.value) : undefined })}
      >
        <option value="">Any level</option>
        {[10, 20, 30, 40, 50, 60].map((level) => (
          <option key={level} value={level}>{levelName(level)}</option>
        ))}
      </select>
      <input
        className="input"
        aria-label="Status"
        placeholder="Status"
        inputMode="numeric"
        value={filter.status ?? ''}
        onChange={(e) => onFilter({ ...filter, status: e.target.value ? Number(e.target.value) : undefined })}
      />
      <input
        className="input"
        aria-label="Path"
        placeholder="Path prefix"
        value={filter.path ?? ''}
        onChange={(e) => onFilter({ ...filter, path: e.target.value || undefined })}
      />
      <input
        className="input"
        aria-label="Free text"
        placeholder="Search"
        value={filter.q ?? ''}
        onChange={(e) => onFilter({ ...filter, q: e.target.value || undefined })}
      />
      {filter.requestId && (
        // The requestId collapse, undone. Distinct control so "clear filters" and "leave
        // this one request" stay two different actions (`72` § States: filter-matches-
        // nothing gets its own clear action, and this is the same idea one level up).
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onFilter({ ...filter, requestId: undefined })}
        >
          Clear requestId {filter.requestId}
        </button>
      )}
    </div>
  );
}

function LineRow({ line, onRequestId }: { line: LogLine; onRequestId: (id: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const is5xx = typeof line.status === 'number' && line.status >= 500;

  return (
    <div className={`log-line log-level-${levelName(line.level)}`}>
      <div className="log-line-main">
        <span className="text-meta log-line-at">{formatDateTime(line.at)}</span>
        <span className="log-line-level">{levelName(line.level)}</span>
        {line.method && <span className="log-line-method">{line.method}</span>}
        {line.path && <span className="log-line-path">{line.path}</span>}
        {typeof line.status === 'number' && <span className="log-line-status">{line.status}</span>}
        {typeof line.durationMs === 'number' && <span className="text-meta">{line.durationMs}ms</span>}
        {line.requestId && (
          <button type="button" className="log-line-requestid" onClick={() => onRequestId(line.requestId as string)}>
            {line.requestId}
          </button>
        )}
        <span className="log-line-msg">{line.msg}</span>
        {/* `12` §4.16 — stacks go to the file and never to a client. An operator is not a
            client, and this is where a stack becomes readable. */}
        {is5xx && line.err?.stack && (
          <button type="button" className="btn btn-secondary log-line-expand" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide trace' : 'Show trace'}
          </button>
        )}
      </div>
      {open && line.err?.stack && <pre className="log-line-stack">{line.err.stack}</pre>}
      {line.extra && Object.keys(line.extra).length > 0 && (
        // Rendered explicitly, never folded into the row — an unexpected field must look
        // unexpected, not like it always belonged (`72` § Data contract).
        <div className="log-line-extra">
          {Object.entries(line.extra).map(([key, value]) => (
            <span key={key} className="log-line-extra-field">
              <strong>{key}</strong>: {typeof value === 'string' ? value : JSON.stringify(value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function LogViewer({
  files,
  selected,
  lines,
  filter,
  onSelect,
  onFilter,
  loading,
}: {
  files: LogFileMeta[];
  selected: string;
  lines: LogLine[];
  filter: LogFilter;
  onSelect: (file: string) => void;
  onFilter: (f: LogFilter) => void;
  loading?: boolean;
}): JSX.Element {
  return (
    <div className="log-viewer">
      <FilePicker files={files} selected={selected} onSelect={onSelect} />
      <div className="log-viewer-main">
        <FilterBar filter={filter} onFilter={onFilter} />
        <div className={`log-lines${loading ? ' is-dimmed' : ''}`}>
          {lines.map((line, i) => (
            // No stable id on a log line — `at` plus its position on this page is enough,
            // and the list never reorders under the reader (no polling, `72` § Out of scope).
            <LineRow key={`${line.at}-${i}`} line={line} onRequestId={(id) => onFilter({ ...filter, requestId: id })} />
          ))}
        </div>
      </div>
    </div>
  );
}
