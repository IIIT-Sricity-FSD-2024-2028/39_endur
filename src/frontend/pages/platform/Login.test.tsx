// `/ops/login` through the real store: signing in is the `operatorSignedIn` thunk
// (store/screens/operator.ts), which posts the credentials and reads `/me` into `opsSlice`.
// `stubApi` is the operator API.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { errorReply, renderWithProviders, stubApi, type StubCall } from '../../test-utils.js';
import Login from './Login.js';

const ME = {
  operator: { id: 'op1', name: 'Mithil', email: 'ops@endur.test', role: 'owner' },
  capabilities: ['platform.org.read'],
};

const mount = () =>
  renderWithProviders(
    <Routes>
      <Route path="/ops/login" element={<Login />} />
      <Route path="/ops" element={<p>ESTATE</p>} />
    </Routes>,
    { path: '/ops/login' },
  );

const fill = () => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ops@endur.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'operator-password' } });
  fireEvent.change(screen.getByLabelText('Six-digit code'), { target: { value: '123456' } });
};

afterEach(() => vi.unstubAllGlobals());

describe('operator sign in', () => {
  it('sends the three things, reads who it is, and goes to the estate', async () => {
    const calls: StubCall[] = stubApi({
      'POST /platform/auth/login': { body: { ok: true } },
      'GET /platform/me': { body: ME },
    });
    const { store } = mount();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('ESTATE')).toBeTruthy();
    expect(calls[0]?.body).toEqual({ email: 'ops@endur.test', password: 'operator-password', code: '123456' });
    expect(store.getState().ops.status).toBe('authenticated');
    // DEC-014: the operator's password reaches the server and nothing else.
    expect(JSON.stringify(store.getState())).not.toContain('operator-password');
  });

  it('says why it was refused, keeps what was typed, and stays', async () => {
    stubApi({ 'POST /platform/auth/login': errorReply(401, 'UNAUTHENTICATED', 'Those details do not match.') });
    mount();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Those details do not match.');
    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe('ops@endur.test');
    expect(screen.getByLabelText<HTMLInputElement>('Password').value).toBe('operator-password');
    expect(screen.queryByText('ESTATE')).toBeNull();
  });

  it('shows and hides the password', () => {
    stubApi({});
    mount();
    const password = screen.getByLabelText('Password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.getAttribute('type')).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password.getAttribute('type')).toBe('password');
  });

  it('signs in once on a double press', async () => {
    const calls = stubApi({
      'POST /platform/auth/login': { body: { ok: true } },
      'GET /platform/me': { body: ME },
    });
    mount();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('ESTATE');
    await waitFor(() => expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1));
  });
});
