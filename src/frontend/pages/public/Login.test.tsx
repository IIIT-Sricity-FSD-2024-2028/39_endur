// T-031 — sign in. 30 § States, § Acceptance.
//
// The interesting assertions here are all about what the page REFUSES to say. A form that
// helpfully distinguishes "no such account" from "wrong password" hands an attacker a way
// to enumerate real addresses, and the server's uniform failure is worthless if the client
// decorates it back into two messages.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { makeStore, renderWithProviders } from '../../test-utils.js';
import { ApiError } from '../../lib/api.js';
import Login from './Login.js';

const signIn = vi.fn();
vi.mock('../../lib/auth.js', () => ({
  useSignIn: () => signIn,
  useRegister: () => vi.fn(),
}));

const apiError = (status: number, extra: Record<string, unknown> = {}) =>
  new ApiError({
    code: status === 429 ? 'RATE_LIMITED' : 'UNAUTHENTICATED',
    status,
    message: 'server wording that the page must not repeat verbatim',
    requestId: 'req-1',
    ...extra,
  });

/** For the two cases that need `location.state`, which a bare path cannot carry. */
const mountAt = (entry: { pathname: string; state?: unknown }) =>
  render(
    <Provider store={makeStore({ signedOut: true })}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/app" element={<p>CONSOLE</p>} />
          <Route path="/app/setup" element={<p>WIZARD</p>} />
          <Route path="/app/people" element={<p>PEOPLE</p>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

const mount = () =>
  renderWithProviders(
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/app" element={<p>CONSOLE</p>} />
      <Route path="/app/setup" element={<p>WIZARD</p>} />
      <Route path="/app/people" element={<p>PEOPLE</p>} />
    </Routes>,
    { signedOut: true, path: '/login' },
  );

const fill = (email = 'admin@northfield.endur.test', password = 'endur-demo-password') => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
};

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

beforeEach(() => {
  signIn.mockReset();
});

describe('sign in — 30 §3.2', () => {
  it('sends what was typed and goes where the session says to go', async () => {
    signIn.mockResolvedValue('/app');
    mount();
    fill();
    submit();

    await waitFor(() => expect(screen.getByText('CONSOLE')).toBeTruthy());
    expect(signIn).toHaveBeenCalledWith({
      email: 'admin@northfield.endur.test',
      password: 'endur-demo-password',
    });
  });

  it('trims the email but never the password — a trailing space is part of a password', async () => {
    signIn.mockResolvedValue('/app');
    mount();
    fill('  admin@northfield.endur.test  ', 'endur-demo-password ');
    submit();

    await waitFor(() => expect(signIn).toHaveBeenCalled());
    expect(signIn.mock.calls[0]?.[0]).toEqual({
      email: 'admin@northfield.endur.test',
      password: 'endur-demo-password ',
    });
  });

  it('lands on the wizard, not the console, when the organisation is unconfigured', async () => {
    signIn.mockResolvedValue('/app/setup');
    mount();
    fill();
    submit();
    await waitFor(() => expect(screen.getByText('WIZARD')).toBeTruthy());
  });

  it('returns to the deep link RequireSession bounced them from', async () => {
    signIn.mockResolvedValue('/app');
    mountAt({ pathname: '/login', state: { from: '/app/people' } });
    fill();
    submit();
    await waitFor(() => expect(screen.getByText('PEOPLE')).toBeTruthy());
  });

  it('sends them to the wizard even when a deep link was pending', async () => {
    // The org has no roles yet, so `/app/people` would render an empty page and look
    // broken. Losing their place is the lesser harm (30 § Interactions).
    signIn.mockResolvedValue('/app/setup');
    mountAt({ pathname: '/login', state: { from: '/app/people' } });
    fill();
    submit();
    await waitFor(() => expect(screen.getByText('WIZARD')).toBeTruthy());
  });

  it('says one thing for a bad password, and does not blame a field', async () => {
    signIn.mockRejectedValue(apiError(401));
    mount();
    fill();
    submit();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("That email and password don't match.");
    // The two fields must be indistinguishable in the DOM as well as in the copy.
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBeNull();
    expect(document.body.textContent).not.toContain('server wording');
  });

  it('turns a 429 into a wait the user can act on', async () => {
    signIn.mockRejectedValue(apiError(429, { retryAfter: 120 }));
    mount();
    fill();
    submit();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Too many attempts. Try again in 2 minutes.',
    );
  });

  it('falls back to vague wording when the server sent no Retry-After', async () => {
    signIn.mockRejectedValue(apiError(429));
    mount();
    fill();
    submit();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Too many attempts. Try again in a few minutes.',
    );
  });

  it('puts a 422 under its field and does NOT also shout it above the button', async () => {
    signIn.mockRejectedValue(
      apiError(422, {
        code: 'VALIDATION_FAILED',
        details: { fields: [{ path: 'body.email', message: 'Enter a valid email address.' }] },
      }),
    );
    mount();
    fill('nope', 'endur-demo-password');
    submit();

    await waitFor(() => expect(screen.getByText('Enter a valid email address.')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
  });

  it('reports a network failure as a network failure, not as bad credentials', async () => {
    signIn.mockRejectedValue(new TypeError('Failed to fetch'));
    mount();
    fill();
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain('Could not reach the server');
  });

  it('keeps the label "Sign in" while submitting — a relabelled button reflows mid-click', async () => {
    let release: (value: string) => void = () => undefined;
    signIn.mockReturnValue(new Promise<string>((resolve) => { release = resolve; }));
    mount();
    fill();
    submit();

    const button = screen.getByRole('button', { name: 'Sign in' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(true));
    expect(button.textContent).toBe('Sign in');
    // Settle inside act() — leaving a promise resolving after the test ends is what
    // produces the "update not wrapped in act" warning, and a warning nobody can silence
    // is a warning everybody stops reading.
    await act(async () => {
      release('/app');
      await Promise.resolve();
    });
  });

  it('reveals and re-hides the password, and the button says which it will do', () => {
    mount();
    const password = screen.getByLabelText('Password');
    expect(password.getAttribute('type')).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.getAttribute('type')).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password.getAttribute('type')).toBe('password');
  });
});

/**
 * DEC-049 — one address, two organisations. The narrowest question the product asks.
 *
 * It can only be reached by somebody who holds an activated account in more than one
 * organisation AND uses the same password for them: with different passwords the server
 * signs them straight in, and with one account it never comes up. No seeded organisation
 * shares an address, so this screen is rarely reached.
 */
const AMBIGUOUS = () =>
  new ApiError({
    code: 'ACCOUNT_AMBIGUOUS',
    status: 409,
    message: 'That sign-in works for more than one organization.',
    requestId: 'req-1',
    details: {
      organizations: [
        { id: 'org-a', name: 'Aster Health Partners' },
        { id: 'org-b', name: 'Borden Institute' },
      ],
    },
  });

describe('one address, two organisations — DEC-049', () => {
  it('asks which, naming them, instead of failing', async () => {
    signIn.mockRejectedValueOnce(AMBIGUOUS());
    mount();
    fill();
    submit();

    await waitFor(() => expect(screen.getByText('Which organization?')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Aster Health Partners' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Borden Institute' })).toBeTruthy();
    // NOT an error. The credentials were right; one more fact is missing.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('answers with the org and does not make them retype anything', async () => {
    signIn.mockRejectedValueOnce(AMBIGUOUS()).mockResolvedValueOnce('/app');
    mount();
    fill();
    submit();

    await waitFor(() => expect(screen.getByText('Which organization?')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Borden Institute' }));

    await waitFor(() => expect(screen.getByText('CONSOLE')).toBeTruthy());
    expect(signIn).toHaveBeenCalledTimes(2);
    // The SAME credentials, plus the answer. The password never left component state.
    expect(signIn.mock.calls[1]?.[0]).toEqual({
      email: 'admin@northfield.endur.test',
      password: 'endur-demo-password',
      orgId: 'org-b',
    });
  });

  /** `orgId` is an answer, never an unprompted hint — an ordinary sign-in sends two fields. */
  it('never sends an orgId on the first attempt', async () => {
    signIn.mockResolvedValue('/app');
    mount();
    fill();
    submit();
    await waitFor(() => expect(signIn).toHaveBeenCalled());
    expect(signIn.mock.calls[0]?.[0]).not.toHaveProperty('orgId');
  });

  it('goes back to the form with everything still filled in', async () => {
    signIn.mockRejectedValueOnce(AMBIGUOUS());
    mount();
    fill();
    submit();

    await waitFor(() => expect(screen.getByText('Which organization?')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe('admin@northfield.endur.test');
    expect(screen.getByLabelText<HTMLInputElement>('Password').value).toBe('endur-demo-password');
  });
});
