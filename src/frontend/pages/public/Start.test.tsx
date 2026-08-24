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

/** Step 1 → step 2. The button says `Continue`; only the last one says `Continue to setup`. */
const advance = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

/** Pick a tier on step 2. Matched by role rather than by label text, because the card's
 *  accessible name is its whole contents — name, pitch and what it adds. */
const pick = (tier: RegExp = /Gold/) =>
  fireEvent.click(screen.getByRole('radio', { name: tier }));

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Continue to setup' }));

/** The whole happy path: fill the fields, advance, pick a tier, submit. */
const register = (email?: string, tier?: RegExp) => {
  fill(email);
  advance();
  pick(tier);
  submit();
};

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
    register();
    await waitFor(() => expect(registerOrg).toHaveBeenCalled());
    expect(registerOrg.mock.calls[0]?.[0]).toEqual({
      orgName: 'Northfield University',
      name: 'Amara Rao',
      email: 'amara@northfield.test',
      password: 'a-long-enough-one',
      industry: 'custom',
      tier: 'gold',
    });
  });

  it('never drops a new org at an empty console — it always lands on the wizard', async () => {
    registerOrg.mockResolvedValue('/app/setup');
    mount();
    register();
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
    register();

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
    register();
    await waitFor(() => expect(screen.getByText('Too short.')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows anything else once, above the button', async () => {
    registerOrg.mockRejectedValue(
      new ApiError({ code: 'INTERNAL', status: 500, requestId: 'r1', message: 'Server exploded.' }),
    );
    mount();
    register();
    expect((await screen.findByRole('alert')).textContent).toBe('Server exploded.');
  });
});

/**
 * T-088 — the tier picker. DEC-048, 49 § Interactions.
 *
 * The owner asked for this one by name: *"pick between option / rn, no pricing, just pick the
 * option (bronze, silver and gold) and you get assigned that."* Every assertion below is one
 * clause of that sentence.
 */
describe('choose a plan — DEC-048', () => {
  it('does not ask until the details are in', () => {
    mount();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    fill();
    advance();
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getByText('Choose a plan')).toBeTruthy();
  });

  it('offers three tiers and not four — Enterprise is a sales conversation (16 §4)', () => {
    mount();
    fill();
    advance();
    const names = screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'));
    expect(names).toEqual(['bronze', 'silver', 'gold']);
    expect(document.body.textContent).not.toContain('Enterprise');
  });

  /** NO PRE-SELECTED DEFAULT. A default here is D-012 wearing a nicer coat. */
  it('pre-selects nothing and will not submit until something is chosen', () => {
    mount();
    fill();
    advance();
    expect(screen.getAllByRole<HTMLInputElement>('radio').some((radio) => radio.checked)).toBe(false);
    expect(screen.getByRole('button', { name: 'Continue to setup' }).hasAttribute('disabled')).toBe(true);
    pick(/Bronze/);
    expect(screen.getByRole('button', { name: 'Continue to setup' }).hasAttribute('disabled')).toBe(false);
  });

  it('sends the tier that was pressed, not the first one', async () => {
    registerOrg.mockResolvedValue('/app/setup');
    mount();
    register(undefined, /Silver/);
    await waitFor(() => expect(registerOrg).toHaveBeenCalled());
    expect((registerOrg.mock.calls[0]?.[0] as { tier: string }).tier).toBe('silver');
  });

  /** DEC-035, and it is asserted rather than assumed because a price is the sort of thing a
   *  well-meaning copy edit adds back. */
  it('shows no prices anywhere', () => {
    mount();
    fill();
    advance();
    expect(document.body.textContent).not.toMatch(/[$£€]|\/mo|per month|free trial|14 days/i);
  });

  it('goes back without losing the answers', () => {
    mount();
    fill();
    advance();
    pick(/Gold/);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText<HTMLInputElement>('Work email').value).toBe('amara@northfield.test');
    advance();
    expect(screen.getByRole<HTMLInputElement>('radio', { name: /Gold/ }).checked).toBe(true);
  });

  /**
   * THE ERROR HAS TO REACH THE FIELD IT IS ABOUT. Every failure this POST can return names a
   * field on step 1 — 409 the address, 422 a field — and the POST happens from step 2. Left
   * alone, the person reads "that address is already registered" beside three tier cards with
   * no input in sight.
   */
  it('returns to the details when the server rejects one of them', async () => {
    registerOrg.mockRejectedValue(
      new ApiError({
        code: 'CONFLICT', status: 409, requestId: 'r1',
        message: 'That email address is already registered.',
      }),
    );
    mount();
    register();
    await waitFor(() => expect(screen.getByLabelText('Work email')).toBeTruthy());
    expect(screen.getByLabelText('Work email').getAttribute('aria-invalid')).toBe('true');
    // The tier survives the trip. Being told your address is taken is not a reason to
    // re-answer a question you already answered.
    advance();
    expect(screen.getByRole<HTMLInputElement>('radio', { name: /Gold/ }).checked).toBe(true);
  });
});
