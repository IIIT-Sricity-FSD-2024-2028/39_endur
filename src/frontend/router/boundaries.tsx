import { isRouteErrorResponse, useLocation, useRouteError, Link } from 'react-router-dom';

const IMPORT_FAILURE =
  /dynamically imported module|Importing a module script failed|failed to load module/i;

function isStaleModuleGraph(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'ChunkLoadError' || IMPORT_FAILURE.test(error.message);
}

function describe(error: unknown): { title: string; detail: string; stale: boolean } {
  if (isStaleModuleGraph(error)) {
    return {
      title: 'Endur updated while this tab was open',
      detail: 'This page is running an older version. Reloading picks up the new one.',
      stale: true,
    };
  }
  if (isRouteErrorResponse(error)) {
    return error.status === 404
      ? { title: 'Page not found', detail: 'That address does not match anything here.', stale: false }
      : { title: 'Something went wrong', detail: error.statusText || 'The page could not load.', stale: false };
  }
  if (error instanceof Error) {
    return { title: 'Something went wrong', detail: error.message, stale: false };
  }
  return { title: 'Something went wrong', detail: 'The page could not load.', stale: false };
}

function useHere(): string {
  const { pathname, search } = useLocation();
  return `${pathname}${search}`;
}

export function PublicBoundary(): JSX.Element {
  const { title, detail, stale } = describe(useRouteError());
  const here = useHere();
  return (
    <div className="fullpage">
      <div>
        <h3>{title}</h3>
        <p className="text-muted">{detail}</p>
        {stale ? (
          <a className="btn btn-primary" href={here}>Reload this page</a>
        ) : (
          <Link className="btn btn-secondary" to="/">Back to the start</Link>
        )}
      </div>
    </div>
  );
}

export function ConsoleBoundary(): JSX.Element {
  const { title, detail, stale } = describe(useRouteError());
  const here = useHere();
  return (
    <div className="fullpage">
      <div>
        <h3>{title}</h3>
        <p className="text-muted">{detail}</p>
        {/* A hard reload, not a client-side link: whatever state caused the crash is in
            memory, and navigating within the same app carries it along. On a stale graph the
            reason is different — the graph itself is gone — but the remedy is the same one,
            which is why this branch changes only WHERE it lands and what it is called. */}
        {stale ? (
          <a className="btn btn-primary" href={here}>Reload this page</a>
        ) : (
          <a className="btn btn-secondary" href="/app">Reload the console</a>
        )}
      </div>
    </div>
  );
}

export function OpsBoundary(): JSX.Element {
  const { title, detail, stale } = describe(useRouteError());
  const here = useHere();
  return (
    <div className="fullpage">
      <div>
        <h3>{title}</h3>
        <p className="text-muted">{detail}</p>
        {stale ? (
          <a className="btn btn-primary" href={here}>Reload this page</a>
        ) : (
          <a className="btn btn-secondary" href="/ops">Reload the console</a>
        )}
      </div>
    </div>
  );
}

export function RespondBoundary(): JSX.Element {
  const here = useHere();
  return (
    <div className="fullpage">
      <div>
        <h3>This form could not load</h3>
        <p className="text-muted">
          Try again. If it still does not work, ask whoever shared it for a new link.
        </p>
        <a className="btn btn-secondary" href={here}>Try again</a>
      </div>
    </div>
  );
}
