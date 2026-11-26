// The leave guard on a real data router (the app's kind), and under a plain <MemoryRouter>
// (most page tests), where it must keep the tab half and not throw.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { LeaveGuard } from './LeaveGuard.js';

afterEach(cleanup);

const mount = (when: boolean) => {
  const router = createMemoryRouter(
    [
      {
        path: '/edit',
        element: (
          <>
            <LeaveGuard when={when} what="your changes" />
            <Link to="/elsewhere">Away</Link>
            <Link to="/edit#words">Same page</Link>
          </>
        ),
      },
      { path: '/elsewhere', element: <p>ELSEWHERE</p> },
    ],
    { initialEntries: ['/edit'] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

describe('<LeaveGuard>', () => {
  it('asks before leaving with something unsaved, and stays if told to', () => {
    const router = mount(true);
    fireEvent.click(screen.getByRole('link', { name: 'Away' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/You have not saved your changes/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe('/edit');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('leaves when the reader says so', async () => {
    mount(true);
    fireEvent.click(screen.getByRole('link', { name: 'Away' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(await screen.findByText('ELSEWHERE')).toBeTruthy();
  });

  it('does not ask for a hash on the same page, or when nothing is unsaved', async () => {
    const router = mount(true);
    fireEvent.click(screen.getByRole('link', { name: 'Same page' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(router.state.location.hash).toBe('#words');

    cleanup();
    mount(false);
    fireEvent.click(screen.getByRole('link', { name: 'Away' }));
    expect(await screen.findByText('ELSEWHERE')).toBeTruthy();
  });

  it('asks the browser before the TAB is closed or reloaded', () => {
    mount(true);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps the tab half under a plain router, and does not throw', () => {
    render(
      <MemoryRouter>
        <LeaveGuard when what="your changes" />
      </MemoryRouter>,
    );
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
