// `/activate/:token` through the real store: the link's preview is an RTK Query read, and
// setting the password is the `activationSubmitted` thunk (store/screens/entry.ts), which
// consumes the link, reads `/auth/me` and asks `/home` where to land. `stubApi` is the server.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { ActivationPreview } from '@endur/shared';
import { errorReply, meFixture, renderWithProviders, stubApi, type StubCall } from '../../test-utils.js';
import Activate from './Activate.js';

const PREVIEW: ActivationPreview = {
  personName: 'Amara Rao',
  organizationName: 'Northfield',
  organizationLogoUrl: null,
  expiresAt: '2099-01-01T00:00:00.000Z',
};

let calls: StubCall[] = [];
const server = (activate: Parameters<typeof stubApi>[0][string] = { body: { ok: true } }, configured = true) => {
  calls = stubApi({
    'GET /auth/activate/TOK1': { body: { data: PREVIEW } },
    'POST /auth/activate/TOK1': activate,
    'GET /auth/me': () => ({ body: meFixture() }),
    'GET /home': { body: { data: { configured } } },
  });
};

const mount = () =>
  renderWithProviders(
    <Routes>
      <Route path="/activate/:token" element={<Activate />} />
      <Route path="/app" element={<p>CONSOLE</p>} />
      <Route path="/app/setup" element={<p>WIZARD</p>} />
    </Routes>,
    { signedOut: true, path: '/activate/TOK1' },
  );

const button = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Set password and sign in' });
const type = (password: string) =>
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });

beforeEach(() => server());
afterEach(() => vi.unstubAllGlobals());

describe('activating an account — 57', () => {
  it('greets the person by name, and waits for a long enough password', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Welcome, Amara Rao' })).toBeTruthy();
    expect(button().disabled).toBe(true);
    type('short');
    expect(button().disabled).toBe(true);
    type('a-long-enough-one');
    expect(button().disabled).toBe(false);
  });

  it('sets the password, reads the session and lands in the console', async () => {
    const { store } = mount();
    await screen.findByRole('heading', { name: 'Welcome, Amara Rao' });
    type('a-long-enough-one');
    fireEvent.click(button());

    await waitFor(() => expect(screen.getByText('CONSOLE')).toBeTruthy());
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ password: 'a-long-enough-one' });
    expect(store.getState().auth.user?.id).toBe('u1');
    // DEC-014: the password went to the server and nowhere else.
    expect(JSON.stringify(store.getState())).not.toContain('a-long-enough-one');
  });

  it('lands on the wizard when the organization is not set up yet', async () => {
    server({ body: { ok: true } }, false);
    mount();
    await screen.findByRole('heading', { name: 'Welcome, Amara Rao' });
    type('a-long-enough-one');
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByText('WIZARD')).toBeTruthy());
  });

  it("puts the server's word on the password above the button, and lets them try again", async () => {
    server(errorReply(422, 'VALIDATION_FAILED', 'Invalid', {
      fields: [{ path: 'body.password', message: 'That password is on a list of leaked ones.' }],
    }));
    mount();
    await screen.findByRole('heading', { name: 'Welcome, Amara Rao' });
    type('a-long-enough-one');
    fireEvent.click(button());

    expect((await screen.findByRole('alert')).textContent).toBe('That password is on a list of leaked ones.');
    expect(button().disabled).toBe(false);
  });

  it('says something went wrong when the server cannot be reached', async () => {
    server(new TypeError('offline'));
    mount();
    await screen.findByRole('heading', { name: 'Welcome, Amara Rao' });
    type('a-long-enough-one');
    fireEvent.click(button());
    expect((await screen.findByRole('alert')).textContent).toBe('Something went wrong. Please try again.');
  });

  it('a double press sets the password once', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Welcome, Amara Rao' });
    type('a-long-enough-one');
    fireEvent.click(button());
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByText('CONSOLE')).toBeTruthy());
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });

  it('a dead link says so, and offers no form', async () => {
    calls = stubApi({ 'GET /auth/activate/TOK1': errorReply(404, 'NOT_FOUND', 'x') });
    mount();
    expect(await screen.findByRole('heading', { name: 'That link is not active' })).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });
});
