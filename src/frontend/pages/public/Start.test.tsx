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

const advance = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

const radio = (tier: string): HTMLInputElement =>
  screen
    .getAllByRole<HTMLInputElement>('radio')
    .find((input) => input.value === tier) as HTMLInputElement;

const pick = (tier = 'gold') => fireEvent.click(radio(tier));

const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));

const pay = () => fireEvent.click(screen.getByRole('button', { name: /^Pay ₹/ }));

const PAID = { timeout: 12_000 };

const register = (email?: string, tier?: string) => {
  fill(email);
  advance();
  pick(tier);
  submit();
  pay();
};

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
    await waitFor(() => expect(registerOrg).toHaveBeenCalled(), PAID);
    expect(registerOrg.mock.calls[0]?.[0]).toEqual({
      orgName: 'Northfield University',
      name: 'Amara Rao',
      email: 'amara@northfield.test',
      password: 'a-long-enough-one',
      industry: 'custom',
      tier: 'gold',
      paymentRef: expect.stringMatching(/^endur_/) as string,
      trial: false,
    });
  });

  it('never drops a new org at an empty console — it always lands on the wizard', async () => {
    registerOrg.mockResolvedValue('/app/setup');
    mount();
    register();
    await waitFor(() => expect(screen.getByText('WIZARD')).toBeTruthy(), PAID);
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

    await waitFor(() => expect(screen.getByText(/already registered/)).toBeTruthy(), PAID);
    expect(screen.getByLabelText('Work email').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('link', { name: 'Sign in instead' })).toBeTruthy();
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
    await waitFor(() => expect(screen.getByText('Too short.')).toBeTruthy(), PAID);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows anything else once, above the button', async () => {
    registerOrg.mockRejectedValue(
      new ApiError({ code: 'INTERNAL', status: 500, requestId: 'r1', message: 'Server exploded.' }),
    );
    mount();
    register();
    expect((await screen.findByRole('alert', {}, PAID)).textContent).toBe('Server exploded.');
  });
});

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

  it('pre-selects nothing and will not submit until something is chosen', () => {
    mount();
    fill();
    advance();
    expect(screen.getAllByRole<HTMLInputElement>('radio').some((radio) => radio.checked)).toBe(false);
    expect(screen.getByRole('button', { name: 'Continue to payment' }).hasAttribute('disabled')).toBe(true);
    pick('bronze');
    expect(screen.getByRole('button', { name: 'Continue to payment' }).hasAttribute('disabled')).toBe(false);
  });

  it('sends the tier that was pressed, not the first one', async () => {
    registerOrg.mockResolvedValue('/app/setup');
    mount();
    register(undefined, 'silver');
    await waitFor(() => expect(registerOrg).toHaveBeenCalled(), PAID);
    expect((registerOrg.mock.calls[0]?.[0] as { tier: string }).tier).toBe('silver');
    expect((registerOrg.mock.calls[0]?.[0] as { paymentRef?: string }).paymentRef)
      .toMatch(/^endur_/);
  });

  it('prices every tier it offers', () => {
    mount();
    fill();
    advance();
    expect(document.body.textContent).toContain('₹99');
    expect(document.body.textContent).toContain('₹499');
    expect(document.body.textContent).toContain('₹999');
    expect(document.body.textContent).not.toMatch(/[$£€]|\/mo|per month/i);
  });

  // Billing is monthly everywhere (BILLING_PERIOD_MONTHS = 1); this heading said one year.
  it('says a plan is one month, not one year', () => {
    mount();
    fill();
    advance();
    expect(document.body.textContent).toMatch(/One month, billed once/);
    expect(document.body.textContent).not.toMatch(/one year|per year|\/ year/i);
  });

  it('registers before it ever says Payment successful', async () => {
    let celebratedFirst: boolean | null = null;
    registerOrg.mockImplementation(() => {
      celebratedFirst = document.body.textContent?.includes('Payment successful') ?? false;
      return Promise.resolve('/app/setup');
    });
    mount();
    register();
    await waitFor(() => expect(registerOrg).toHaveBeenCalled(), PAID);
    expect(celebratedFirst).toBe(false);
  });

  it('offers a 14-day trial that registers with no payment captured', async () => {
    registerOrg.mockResolvedValue('/app/setup');
    mount();
    fill();
    advance();
    pick('gold');
    fireEvent.click(screen.getByRole('button', { name: /start 14-day trial instead/i }));

    await waitFor(() => expect(registerOrg).toHaveBeenCalled());
    expect(registerOrg.mock.calls[0]?.[0]).toMatchObject({ tier: 'gold', trial: true });
    expect(
      (registerOrg.mock.calls[0]?.[0] as { paymentRef?: string }).paymentRef,
    ).toBeUndefined();
    expect(screen.queryByText(/endur demo checkout/i)).toBeNull();
  });

  it('opens the checkout without registering anything', () => {
    mount();
    fill();
    advance();
    pick('gold');
    submit();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(registerOrg).not.toHaveBeenCalled();
  });

  it('lets the checkout be cancelled with the tier still chosen', () => {
    mount();
    fill();
    advance();
    pick('gold');
    submit();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(radio('gold').checked).toBe(true);
    expect(registerOrg).not.toHaveBeenCalled();
  });

  it('goes back without losing the answers', () => {
    mount();
    fill();
    advance();
    pick('gold');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText<HTMLInputElement>('Work email').value).toBe('amara@northfield.test');
    advance();
    expect(radio('gold').checked).toBe(true);
  });

  it('returns to the details when the server rejects one of them', async () => {
    registerOrg.mockRejectedValue(
      new ApiError({
        code: 'CONFLICT', status: 409, requestId: 'r1',
        message: 'That email address is already registered.',
      }),
    );
    mount();
    register();
    await waitFor(() => expect(screen.getByLabelText('Work email')).toBeTruthy(), PAID);
    expect(screen.getByLabelText('Work email').getAttribute('aria-invalid')).toBe('true');
    advance();
    expect(radio('gold').checked).toBe(true);
  });
});

describe('the details are checked before the plan step — DEC-110', () => {
  const badDetails = (name: string, orgName = 'Northfield') => {
    fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: orgName } });
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: name } });
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'a@b.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-enough-one' } });
  };

  it('refuses a digits-only name and stays on step 1', () => {
    mount();
    badDetails('12345');
    advance();

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByLabelText('Your name')).toBeTruthy();
    expect(screen.getByText(/at least one letter/i)).toBeTruthy();
  });

  it('refuses a whitespace-only organisation name', () => {
    mount();
    badDetails('Anitha Rao', '   ');
    advance();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('refuses a short password and a malformed address before any money question', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: 'Northfield' } });
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Anitha Rao' } });
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'not-an-address' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    advance();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('clears the message on the next keystroke, and then lets them through', () => {
    mount();
    badDetails('12345');
    advance();
    expect(screen.getByText(/at least one letter/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Anitha Rao' } });
    expect(screen.queryByText(/at least one letter/i)).toBeNull();

    advance();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('still lets a good registration reach the checkout', () => {
    mount();
    fill();
    advance();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});

