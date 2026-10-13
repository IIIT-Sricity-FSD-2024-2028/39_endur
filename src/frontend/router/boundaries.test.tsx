import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ConsoleBoundary, PublicBoundary, RespondBoundary } from './boundaries.js';

function Throws({ error }: { error: unknown }): JSX.Element {
  throw error;
}

function boundaryFor(error: unknown, element: JSX.Element, path = '/login') {
  const router = createMemoryRouter(
    [{ path, element: <Throws error={error} />, errorElement: element }],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

function boundaryForStatus(status: number, element: JSX.Element, path = '/login') {
  const router = createMemoryRouter(
    [{
      path,
      element: <p>never rendered</p>,
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- react-router's loader contract
      loader: () => { throw new Response(null, { status, statusText: 'Not Found' }); },
      errorElement: element,
    }],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

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

      const reload = screen.getByRole('link', { name: /reload this page/i });
      expect(reload.getAttribute('href')).toBe('/login');

      expect(screen.queryByRole('link', { name: /back to the start/i })).toBeNull();
    },
  );

  it('IS A DOCUMENT LOAD AND NOT A ROUTER LINK — the whole point of D-029', () => {
    boundaryFor(new TypeError(MESSAGES.firefox), <PublicBoundary />);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    screen.getByRole('link', { name: /reload this page/i }).dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it('and the ordinary branch really is a router link, so the check above means something', () => {
    boundaryFor(new Error('boom'), <PublicBoundary />);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    screen.getByRole('link', { name: /back to the start/i }).dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  it('says the app updated rather than that something went wrong', () => {
    boundaryFor(new TypeError(MESSAGES.firefox), <PublicBoundary />);

    expect(screen.getByText(/updated while this tab was open/i)).toBeTruthy();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });

  it('never shows the reader the raw error message', () => {
    boundaryFor(new TypeError(MESSAGES.firefox), <PublicBoundary />);
    expect(screen.queryByText(/Login\.tsx/)).toBeNull();
    expect(screen.queryByText(/localhost:5173/)).toBeNull();
  });

  it('reloads THE ADDRESS THE READER ASKED FOR, not the root', () => {
    boundaryFor(new TypeError(MESSAGES.chrome), <PublicBoundary />, '/start');
    expect(screen.getByRole('link', { name: /reload this page/i }).getAttribute('href')).toBe('/start');
  });

  it('leaves every OTHER error exactly as it was', () => {
    boundaryFor(new Error('Cannot read properties of undefined'), <PublicBoundary />);

    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
    expect(screen.getByText(/cannot read properties of undefined/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /back to the start/i }).getAttribute('href')).toBe('/');
    expect(screen.queryByRole('link', { name: /reload this page/i })).toBeNull();
  });

  it('does not mistake a thrown Response for a stale graph', async () => {
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
    boundaryFor(new Error('boom'), <ConsoleBoundary />, '/app/people');
    expect(screen.getByRole('link', { name: /reload the console/i }).getAttribute('href')).toBe('/app');
  });
});

describe('the respondent boundary', () => {
  it('offers a way forward and still says nothing about the console', () => {
    boundaryFor(new TypeError(MESSAGES.safari), <RespondBoundary />, '/r/abc123');

    expect(screen.getByRole('link', { name: /try again/i }).getAttribute('href')).toBe('/r/abc123');
    expect(screen.queryByText(/endur/i)).toBeNull();
    expect(screen.queryByText(/console/i)).toBeNull();
    expect(screen.queryByText(/sign in/i)).toBeNull();
  });
});
