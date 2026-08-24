// Three error boundaries, one per world (20 §1). NOT one boundary with conditionals.
//
// The point is containment: a crash in the console cannot take down the respondent flow.
// That matters on demo day — an evaluator scanning the QR must reach the form even if an
// admin screen is throwing in another tab's bundle.
//
// The respondent boundary deliberately shows LESS. A stranger's phone gets an apology and
// nothing else: no request id to quote, no navigation into a product they have no account
// for, no hint that an admin console exists.
//
// T-051 built these. T-089 taught them the one failure that ROUTE-LEVEL CODE SPLITTING
// creates, which is DEC-054 and is the reason this file changed at all — see below.
import { isRouteErrorResponse, useLocation, useRouteError, Link } from 'react-router-dom';

/**
 * A FAILED MODULE IMPORT IS A STALE-APP FAILURE, NOT A BROKEN PAGE. DEC-054.
 *
 * Every route in `router/index.tsx` is lazy (20 §2, 20 §8), so the browser fetches a route's
 * chunk at CLICK TIME — minutes or hours after the document loaded. If the module graph moved
 * underneath the tab in between, the already-running app keeps working perfectly and the
 * NEXT lazy route is the thing that dies. Three different causes do it:
 *
 *   - a deploy replaced the hashed chunk the old document was pointing at
 *   - a dev server restarted
 *   - Vite re-optimised its dependency cache and the `?v=` hash moved
 *
 * We CANNOT TELL WHICH ONE FIRED, and it does not matter: all three want the same remedy, so
 * this predicate identifies the CLASS and the boundary never has to diagnose. That is the
 * whole design — reported 24 Aug, and by the time it was investigated the module graph
 * crawled clean, so a remedy that needed a diagnosis would have had nothing to work with.
 *
 * The message wording is the browser's, not ours, and the three disagree:
 *   Chrome/Edge  "Failed to fetch dynamically imported module: <url>"
 *   Firefox      "error loading dynamically imported module: <url>"
 *   Safari       "Importing a module script failed."
 * Matching on all three is why this is a regex rather than a comparison.
 */
const IMPORT_FAILURE =
  /dynamically imported module|Importing a module script failed|failed to load module/i;

function isStaleModuleGraph(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // `ChunkLoadError` is not ours — no bundler here emits it — but it costs one comparison
  // and is what this class is called everywhere else, so a future bundler swap is covered.
  return error.name === 'ChunkLoadError' || IMPORT_FAILURE.test(error.message);
}

/** What we can say about a thrown value without guessing. */
function describe(error: unknown): { title: string; detail: string; stale: boolean } {
  // Checked BEFORE the route-response branch on purpose: a lazy import rejects with a real
  // Error, never with a Response, so this can never shadow a genuine 404.
  if (isStaleModuleGraph(error)) {
    return {
      // "The app updated" and not "something went wrong" — the reader did nothing wrong and
      // the page is not broken. Naming the cause is also what makes the button make sense;
      // "reload" attached to "something went wrong" reads like a shrug.
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

/**
 * The address to hard-load. THE ONE THE READER ASKED FOR, not the root.
 *
 * By the time an errorElement renders, the router has already moved the location — so on a
 * failed `/login` chunk this is `/login`, and a full document load fetches a fresh graph and
 * lands the reader exactly where they were going. Sending them home instead would make them
 * click the same button a second time.
 *
 * FROM THE ROUTER, NOT FROM `window.location`, and the two are the same value in a browser.
 * The router's copy is the one that can be asserted: a `MemoryRouter` moves it and jsdom's
 * `window.location` stays at `/`, so reading the global would have made "reload the page they
 * asked for" the one claim in this file that no test could check. An error boundary is
 * exactly the code that never runs in development, so untestable is close to unwritten.
 */
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
          // A FULL DOCUMENT LOAD, never a <Link> — DEC-054. A router navigation re-renders
          // inside the same dead module graph and fails identically, which turns one failure
          // into a loop the reader escapes only by knowing to hard-refresh. ConsoleBoundary
          // has always used <a href> for the neighbouring reason; this is the half that had
          // not caught up, and /login is what the landing page's one call to action points at.
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

export function RespondBoundary(): JSX.Element {
  const here = useHere();
  // Still shows LESS than the other two, and still says nothing about versions, consoles or
  // request ids — a stranger's phone is owed an apology and a way forward, not a changelog.
  // What it gains at T-089 is the way forward: "open the link again" is useless advice to
  // someone who reached this from a printed QR code and no longer has the link. A reload of
  // the current address is the same remedy the other two boundaries give, said in the only
  // register this screen has.
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
