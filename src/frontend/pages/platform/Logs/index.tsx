// `/ops/logs` — `72` § Interactions, `T-078`. The rotating log files, on a screen, for the
// four people who run Endur. Filters and the selected file live in the URL (`72` § State) —
// an operator pastes a link into a support thread and the other person sees the same lines.
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { LogViewer } from '../../../components/platform/LogViewer.js';
import { useLogFiles, useLogLines, type LogFilter } from '../../../lib/oplogs.js';

const FILTER_KEYS = ['level', 'status', 'path', 'orgId', 'requestId', 'q'] as const;

function readFilter(params: URLSearchParams): LogFilter {
  return {
    level: params.get('level') ? Number(params.get('level')) : undefined,
    status: params.get('status') ? Number(params.get('status')) : undefined,
    path: params.get('path') ?? undefined,
    orgId: params.get('orgId') ?? undefined,
    requestId: params.get('requestId') ?? undefined,
    q: params.get('q') ?? undefined,
  };
}

export default function Logs(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const files = useLogFiles();
  const filter = useMemo(() => readFilter(params), [params]);
  const selected = params.get('file');

  const lines = useLogLines(selected, filter);

  const setFile = (file: string): void => {
    const next = new URLSearchParams();
    next.set('file', file);
    setParams(next);
  };

  const setFilter = (next: LogFilter): void => {
    const query = new URLSearchParams(params);
    for (const key of FILTER_KEYS) {
      const value = next[key];
      if (value !== undefined && value !== '') query.set(key, String(value));
      else query.delete(key);
    }
    setParams(query);
  };

  const filtered = FILTER_KEYS.some((key) => params.get(key));

  const header = <PageHeader title="Logs" subtitle="The rotating log files, across the estate." vocabulary={false} />;

  // `72` § States — a `platform.logs.read` refusal is a full-page refusal on direct
  // navigation; the nav item is already absent for anyone who lacks it (`OpsLayout`).
  if (files.forbidden) {
    return (
      <div className="page">
        {header}
        <EmptyState
          icon="log"
          title="You do not have access to this"
          body="Reading logs needs the platform.logs.read capability."
        />
      </div>
    );
  }

  if (!files.loading && files.data && files.data.length === 0) {
    return (
      <div className="page">
        {header}
        <EmptyState icon="log" title="Nothing has been written yet" body="No log files exist on this machine yet." />
      </div>
    );
  }

  if (!selected && files.data && files.data.length > 0) {
    // First real load with no `?file=` yet — pick the newest file rather than showing a
    // blank pane. `error-*.log` first, same ordering `<LogViewer>` groups by.
    const first = files.data.find((f) => f.stream === 'error') ?? files.data[0];
    if (first) setFile(first.name);
  }

  return (
    <div className="page">
      {header}

      {lines.notFound && (
        <p className="field-error" role="alert">That file has rotated away.</p>
      )}
      {lines.error && (
        <p className="field-error" role="alert">{lines.error.message}</p>
      )}

      {selected && !lines.loading && lines.rows.length === 0 && !lines.notFound && filtered && (
        <EmptyState
          icon="log"
          title="No lines match these filters"
          body="Nothing in this file matches the current filter."
          action={
            <button type="button" className="btn btn-secondary" onClick={() => setFilter({})}>
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
        onSelect={setFile}
        onFilter={setFilter}
        loading={files.loading || lines.loading}
      />

      {lines.data?.page.hasMore && (
        <button type="button" className="btn btn-secondary" disabled={lines.loadingMore} onClick={() => void lines.loadMore()}>
          {lines.loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
