// T-031 — create an organization. 30 § Create organization, CONF-011.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test-utils.js';
import { ApiError } from '../../lib/api.js';
import Start from './Start.js';

const registerOrg = vi.fn();
vi.mock('../../lib/auth.js', () => ({
  useRegister: () => registerOrg,
  useSignIn: () => vi.fn(),
}));

const mount = () =>
  renderWithProviders(
    <Routes>
      <Route path="/start" element={<Start />} />
      <Route path="/app/setup" element={<p>WIZARD</p>} />
      <Route path="/login" element={<p>SIGN IN</p>} />
    </Routes>,
    { signedOut: true, path: '/start' },
  );

const fill = (email = 'amara@northfield.test') => {
  fireEvent.change(screen.getByLabelText('Organization name'), {
    target: { value: '  Northfield University  ' },
  });
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Amara Rao' } });
  fireEvent.change(screen.getByLabelText('Work email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-enough-one' } });
};

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Continue to setup' }));

// Braces are load-bearing. `mockReset()` returns the mock, and vitest treats a function
// returned from a hook as a teardown callback — so the concise-arrow form registers the
// rejecting mock itself to be CALLED after every test, and the unhandled rejection is
// reported against whichever test created the error. Cost an hour on 19 Aug.
beforeEach(() => {
  registerOrg.mockReset();
});

describe('create organization — 30 §3.3', () => {
  it('asks for four things and nothing else — no industry picker (CONF-011)', () => {
    mount();
    expect(screen.getAllByRole('textbox')).toHaveLength(3); // org, name, email
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(document.body.textContent).not.toContain('Industry');
  });

  it('defaults industry to custom, because step 1 of the wizard asks properly', async () => {
    registerOrg.mockResolvedValue('/app/setup');
    mount();
    fill();
    submit();
    await waitFor(() => expect(registerOrg).toHaveBeenCalled());
    expect(registerOrg.mock.calls[0]?.[0]).toEqual({
      orgName: 'Northfield University',
      name: 'Amara Rao',
      email: 'amara@northfield.test',
      password: 'a-long-enough-one',
      industry: 'custom',
    });
  });

  it('never drops a new org at an empty console — it always lands on the wizard', async () => {
    registerOrg.mockResolvedValue('/app/setup');
    mount();
    fill();
    submit();
    await waitFor(() => expect(screen.getByText('WIZARD')).toBeTruthy());
  });

  it('states the real minimum, 10, and states it before the server has to', () => {
    mount();
    expect(screen.getByText(/At least 10 characters/)).toBeTruthy();
    expect(screen.getByLabelText('Password').getAttribute('minLength')).toBe('10');
  });

  it('names the field on 409 — choosing an identity is not the same as proving one', async () => {
    registerOrg.mockRejectedValue(
      new ApiError({
        code: 'CONFLICT', status: 409, requestId: 'r1',
        message: 'That email address is already registered.',
      }),
    );
    mount();
    fill();
    submit();

    await waitFor(() => expect(screen.getByText(/already registered/)).toBeTruthy());
    expect(screen.getByLabelText('Work email').getAttribute('aria-invalid')).toBe('true');
    // Offered a way out, not just a wall.
    expect(screen.getByRole('link', { name: 'Sign in instead' })).toBeTruthy();
    // And not ALSO shouted above the button.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('puts a 422 under the field it belongs to', async () => {
    registerOrg.mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_FAILED', status: 422, requestId: 'r1', message: 'Invalid',
        details: { fields: [{ path: 'body.password', message: 'Too short.' }] },
      }),
    );
    mount();
    fill();
    submit();
    await waitFor(() => expect(screen.getByText('Too short.')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows anything else once, above the button', async () => {
    registerOrg.mockRejectedValue(
      new ApiError({ code: 'INTERNAL', status: 500, requestId: 'r1', message: 'Server exploded.' }),
    );
    mount();
    fill();
    submit();
    expect((await screen.findByRole('alert')).textContent).toBe('Server exploded.');
  });
});
