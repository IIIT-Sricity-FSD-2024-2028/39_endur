// T-089 — what a boundary does with a failed module import. DEC-054, repaying D-029.
//
// THE BUG THIS FILE EXISTS FOR was reported by the owner on 24 Aug: the landing page's Sign
// in button failed with `error loading dynamically imported module: .../Login.tsx`, and the
// page's only offer was a client-side <Link> back to the start — which re-renders inside the
// same dead module graph and fails identically. One failure became a loop.
//
// These tests assert the REMEDY, not the diagnosis. By the time the report was investigated
// the module graph crawled clean (44 modules, all 200), so nothing here tries to reproduce a
// stale graph; it feeds each boundary the error the browser actually throws and asserts that
// what comes back is a full document load pointed at the address the reader asked for.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ConsoleBoundary, PublicBoundary, RespondBoundary } from './boundaries.js';

/**
 * Renders a boundary by making the route element throw, which is exactly how a failed
 * `React.lazy` import reaches an `errorElement`. Mounting the boundary directly would need
 * `useRouteError` mocked, and a mocked hook proves the component renders rather than that the
 * ROUTER hands it what we think it does.
 */
function Throws({ error }: { error: unknown }): JSX.Element {
  // Thrown during RENDER, not while the route table is being built — that distinction is the
  // whole point of the helper. React Router only routes an error to an `errorElement` if it
  // escaped a render, which is where a rejected lazy import lands.
  throw error;
}

function boundaryFor(error: unknown, element: JSX.Element, path = '/login') {
  const router = createMemoryRouter(
    [{ path, element: <Throws error={error} />, errorElement: element }],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

/**
 * The OTHER way an error reaches a boundary: a loader throwing a `Response`, which the router
 * unwraps into the `ErrorResponse` that `isRouteErrorResponse` recognises. A `Response` thrown
 * from render is not unwrapped — it arrives as a bare thrown value — so the 404 branch can
 * only be exercised from here.
 */
function boundaryForStatus(status: number, element: JSX.Element, path = '/login') {
  const router = createMemoryRouter(
    [{
      path,
      element: <p>never rendered</p>,
      // Throwing a Response IS react-router's loader contract — it is what the router
      // unwraps into an ErrorResponse. The rule is right about application code.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      loader: () => { throw new Response(null, { status, statusText: 'Not Found' }); },
      errorElement: element,
    }],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

/** The three browsers word this differently and the predicate has to match all three. */
const MESSAGES = {
  firefox: 'error loading dynamically imported module: http://localhost:5173/pages/public/Login.tsx',
  chrome: 'Failed to fetch dynamically imported module: https://app.endur.test/assets/Login-a1b2c3.js',
  safari: 'Importing a module script failed.',
};

describe('a failed module import, on the public boundary', () => {
  it.each(Object.entries(MESSAGES))(
    'is recognised from the %s wording and offers a hard reload',
    (_browser, message) => {
      boundaryFor(new TypeError(message), <PublicBoundary />);

      // A full document load. `<Link>` renders an anchor too, so asserting "an anchor exists"
      // would pass against the broken version — the test has to be that this is NOT a router
      // link, and the only observable difference is that the router did not handle the click.
      const reload = screen.getByRole('link', { name: /reload this page/i });
      expect(reload.getAttribute('href')).toBe('/login');

      // ...and NOT the old affordance, which is the half that made this a loop.
      expect(screen.queryByRole('link', { name: /back to the start/i })).toBeNull();
    },
  );

  it('IS A DOCUMENT LOAD AND NOT A ROUTER LINK — the whole point of D-029', () => {
    // THE ASSERTION THIS FILE EXISTS FOR, and the one that is easy to get wrong: `<Link>`
    // renders an `<a href>` too, so every attribute check above would pass against the broken
    // version. The only observable difference is at click time — react-router calls
    // `preventDefault()` on a plain left click it intends to handle in memory, and a plain
    // anchor leaves the event alone so the browser performs a full document load.
    //
    // Swap the `<a href>` in PublicBoundary's stale branch back to `<Link to>` and this is
    // the test that goes red. Nothing else does.
    // jsdom prints `Not implemented: navigation (except hash changes)` when this runs. That
    // is not a failure — it is jsdom confirming the click really did reach the browser's
    // navigation path, which is the behaviour being asserted.
    boundaryFor(new TypeError(MESSAGES.firefox), <PublicBoundary />);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    screen.getByRole('link', { name: /reload this page/i }).dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it('and the ordinary branch really is a router link, so the check above means something', () => {
    // The control. Without it, "defaultPrevented is false" could be true because the
    // dispatch never reached a handler at all.
    boundaryFor(new Error('boom'), <PublicBoundary />);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    screen.getByRole('link', { name: /back to the start/i }).dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  it('says the app updated rather than that something went wrong', () => {
    boundaryFor(new TypeError(MESSAGES.firefox), <PublicBoundary />);

    // The copy carries the whole explanation: the reader did nothing wrong and the page is
    // not broken. "Something went wrong" beside a reload button reads as a shrug.
    expect(screen.getByText(/updated while this tab was open/i)).toBeTruthy();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });

  it('never shows the reader the raw error message', () => {
    // The message names a .tsx file at a localhost URL. It is the single most useless
    // sentence we could put in front of somebody trying to sign in, and it is what shipped.
    boundaryFor(new TypeError(MESSAGES.firefox), <PublicBoundary />);
    expect(screen.queryByText(/Login\.tsx/)).toBeNull();
    expect(screen.queryByText(/localhost:5173/)).toBeNull();
  });

  it('reloads THE ADDRESS THE READER ASKED FOR, not the root', () => {
    // Sending them home would make them click the same button a second time. By the time an
    // errorElement renders the router has already moved the location, so this is reachable.
    boundaryFor(new TypeError(MESSAGES.chrome), <PublicBoundary />, '/start');
    expect(screen.getByRole('link', { name: /reload this page/i }).getAttribute('href')).toBe('/start');
  });

  it('leaves every OTHER error exactly as it was', () => {
    // The added branch must be an addition. A render bug is still a render bug, still says
    // so, and still offers the route home.
    boundaryFor(new Error('Cannot read properties of undefined'), <PublicBoundary />);

    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
    expect(screen.getByText(/cannot read properties of undefined/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /back to the start/i }).getAttribute('href')).toBe('/');
    expect(screen.queryByRole('link', { name: /reload this page/i })).toBeNull();
  });

  it('does not mistake a thrown Response for a stale graph', async () => {
    // The predicate runs FIRST in describe(), so this is the ordering it could have broken:
    // a genuine 404 must still read as a 404. Awaited because a loader resolves a tick later
    // than a render throw does.
    boundaryForStatus(404, <PublicBoundary />);
    expect(await screen.findByText(/page not found/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /reload this page/i })).toBeNull();
  });
});

describe('the console boundary', () => {
  it('sends a stale tab to the page it was opening, not to /app', () => {
    boundaryFor(new TypeError(MESSAGES.chrome), <ConsoleBoundary />, '/app/people');
    expect(screen.getByRole('link', { name: /reload this page/i }).getAttribute('href')).toBe('/app/people');
  });

  it('keeps its own reload for a genuine crash', () => {
    // This half was already right — an <a href>, because "whatever state caused the crash is
    // in memory". T-089 must not have quietly changed it.
    boundaryFor(new Error('boom'), <ConsoleBoundary />, '/app/people');
    expect(screen.getByRole('link', { name: /reload the console/i }).getAttribute('href')).toBe('/app');
  });
});

describe('the respondent boundary', () => {
  it('offers a way forward and still says nothing about the console', () => {
    // It deliberately shows LESS (20 §1): no request id, no version talk, no hint that an
    // admin product exists. What it gains here is the remedy — "open the link again" is
    // useless advice to somebody who arrived from a printed QR code.
    boundaryFor(new TypeError(MESSAGES.safari), <RespondBoundary />, '/r/abc123');

    expect(screen.getByRole('link', { name: /try again/i }).getAttribute('href')).toBe('/r/abc123');
    expect(screen.queryByText(/endur/i)).toBeNull();
    expect(screen.queryByText(/console/i)).toBeNull();
    expect(screen.queryByText(/sign in/i)).toBeNull();
  });
});
