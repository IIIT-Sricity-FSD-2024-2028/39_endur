// Three error boundaries, one per world (20 §1). NOT one boundary with conditionals.
//
// The point is containment: a crash in the console cannot take down the respondent flow.
// That matters on demo day — an evaluator scanning the QR must reach the form even if an
// admin screen is throwing in another tab's bundle.
//
// The respondent boundary deliberately shows LESS. A stranger's phone gets an apology and
// nothing else: no request id to quote, no navigation into a product they have no account
// for, no hint that an admin console exists.
import { isRouteErrorResponse, useRouteError, Link } from 'react-router-dom';

/** What we can say about a thrown value without guessing. */
function describe(error: unknown): { title: string; detail: string } {
  if (isRouteErrorResponse(error)) {
    return error.status === 404
      ? { title: 'Page not found', detail: 'That address does not match anything here.' }
      : { title: 'Something went wrong', detail: error.statusText || 'The page could not load.' };
  }
  if (error instanceof Error) return { title: 'Something went wrong', detail: error.message };
  return { title: 'Something went wrong', detail: 'The page could not load.' };
}

export function PublicBoundary(): JSX.Element {
  const { title, detail } = describe(useRouteError());
  return (
    <div className="fullpage">
      <div>
        <h3>{title}</h3>
        <p className="text-muted">{detail}</p>
        <Link className="btn btn-secondary" to="/">Back to the start</Link>
      </div>
    </div>
  );
}

export function ConsoleBoundary(): JSX.Element {
  const { title, detail } = describe(useRouteError());
  return (
    <div className="fullpage">
      <div>
        <h3>{title}</h3>
        <p className="text-muted">{detail}</p>
        {/* A hard reload, not a client-side link: whatever state caused the crash is in
            memory, and navigating within the same app carries it along. */}
        <a className="btn btn-secondary" href="/app">Reload the console</a>
      </div>
    </div>
  );
}

export function RespondBoundary(): JSX.Element {
  return (
    <div className="fullpage">
      <div>
        <h3>This form could not load</h3>
        <p className="text-muted">
          Try opening the link again. If it still does not work, ask whoever shared it for a
          new one.
        </p>
      </div>
    </div>
  );
}
