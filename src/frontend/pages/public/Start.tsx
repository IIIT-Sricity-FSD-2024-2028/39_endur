import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RegisterBody, SIGNUP_PLAN_OPTIONS, type SignupTier } from '@endur/shared';
import { Icon } from '../../components/Icon.js';
import { PlanPicker } from '../../components/billing/PlanPicker.js';
import { PaymentDialog } from '../../components/billing/PaymentDialog.js';
import { useFormValidation } from '../../lib/validate.js';
import { ApiError } from '../../lib/api.js';
import { useRegister } from '../../lib/auth.js';
import { AuthAside } from './AuthAside.js';

const MIN_PASSWORD = 10;

const DETAILS_SCHEMA = RegisterBody.pick({
  orgName: true,
  name: true,
  email: true,
  password: true,
});

export default function Start(): JSX.Element {
  const navigate = useNavigate();
  const registerOrg = useRegister();

  const [step, setStep] = useState<'details' | 'plan'>('details');
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tier, setTier] = useState<SignupTier | null>(null);
  const [paying, setPaying] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  const details = useFormValidation(DETAILS_SCHEMA);

  const detailValues = (): Record<string, string> => ({
    orgName: orgName.trim(),
    name: name.trim(),
    email: email.trim(),
    password,
  });

  function onFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (step === 'details') {
      if (!details.check(detailValues())) return;
      setStep('plan');
      return;
    }
    if (!tier || busy) return;
    setPaying(true);
  }

  // Resolves true once registered (and on the way into the app), false when refused. The checkout
  // waits on it, so "Payment successful" is never shown for a registration the server turned down.
  async function submit(options: { paymentRef?: string; trial?: boolean } = {}): Promise<boolean> {
    if (busy || !tier) return false;
    setBusy(true);
    setError(null);
    try {
      const landing = await registerOrg({
        orgName: orgName.trim(),
        name: name.trim(),
        email: email.trim(),
        password,
        industry: 'custom',
        tier,
        paymentRef: options.paymentRef,
        trial: options.trial ?? false,
      });
      navigate(landing, { replace: true });
      return true;
    } catch (caught) {
      setPaying(false);
      setError(caught as Error);
      setBusy(false);
      const status = (caught as ApiError).status;
      if (status === 409 || status === 422) setStep('details');
      return false;
    }
  }

  const chosenPlan = SIGNUP_PLAN_OPTIONS.find((plan) => plan.tier === tier) ?? null;

  const apiError = error instanceof ApiError ? error : null;
  const fieldError = (path: string): string | undefined =>
    details.errors[path] ??
    (apiError?.status === 422 ? apiError.fieldError(path) : undefined);
  const emailTaken = apiError?.status === 409;
  const banner =
    error && !emailTaken && apiError?.status !== 422
      ? (apiError?.message ?? 'Could not reach the server. Check your connection and try again.')
      : null;

  return (
    <div className={`auth ${step === 'plan' ? 'is-plan-mode' : ''}`}>
      <div className="auth-main">
        <form onSubmit={onFormSubmit} noValidate>
          {step === 'details' ? (
            <div className="card elev-lg auth-card">
              <h1 className="auth-title">Create your organization</h1>
              <p className="auth-sub">Takes about two minutes.</p>
              
              <div className="field">
                <label htmlFor="orgName">Organization name</label>
                <input
                  id="orgName"
                  className="input"
                  name="organization"
                  autoComplete="organization"
                  autoFocus
                  required
                  maxLength={120}
                  value={orgName}
                  onChange={(event) => { setOrgName(event.target.value); details.clear('orgName'); }}
                  aria-describedby={fieldError('orgName') ? 'orgName-error' : undefined}
                />
                {fieldError('orgName') && (
                  <p className="field-error" id="orgName-error">{fieldError('orgName')}</p>
                )}
              </div>

          <div className="field">
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              className="input"
              name="name"
              autoComplete="name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => { setName(event.target.value); details.clear('name'); }}
              aria-describedby={fieldError('name') ? 'name-error' : undefined}
            />
            {fieldError('name') && (
              <p className="field-error" id="name-error">{fieldError('name')}</p>
            )}
          </div>

          <div className="field">
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              className="input"
              type="email"
              name="email"
              autoComplete="username"
              required
              maxLength={200}
              value={email}
              onChange={(event) => { setEmail(event.target.value); details.clear('email'); }}
              aria-invalid={emailTaken || fieldError('email') ? true : undefined}
              aria-describedby={emailTaken || fieldError('email') ? 'email-error' : undefined}
            />
            {emailTaken ? (
              <p className="field-error" id="email-error">
                That address is already registered. <Link to="/login">Sign in instead</Link>.
              </p>
            ) : (
              fieldError('email') && (
                <p className="field-error" id="email-error">{fieldError('email')}</p>
              )
            )}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="input-reveal">
              <input
                id="password"
                className="input"
                type={reveal ? 'text' : 'password'}
                name="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD}
                maxLength={200}
                value={password}
                onChange={(event) => { setPassword(event.target.value); details.clear('password'); }}
                aria-describedby={fieldError('password') ? 'password-error' : 'password-help'}
              />
              <button
                type="button"
                className="btn btn-icon reveal-toggle"
                onClick={() => setReveal((shown) => !shown)}
              >
                <Icon name={reveal ? 'hide' : 'show'} size={18} label={reveal ? 'Hide password' : 'Show password'} />
              </button>
            </div>
            {fieldError('password') ? (
              <p className="field-error" id="password-error">{fieldError('password')}</p>
            ) : (
              <p className="field-help" id="password-help">
                At least {MIN_PASSWORD} characters. Length beats symbols.
              </p>
            )}
          </div>

          {banner && <p className="form-error" role="alert">{banner}</p>}

          <button className="btn btn-primary btn-block" type="submit">
            Continue
          </button>
          
          <p className="auth-alt">
            Already have an account? <Link className="btn btn-ghost" to="/login">Sign in</Link>
          </p>
          </div>
          ) : (
            <div className="auth-plan-wrapper">
              <div className="auth-plan-header">
                <h1 className="auth-title">Choose a plan</h1>
                <p className="auth-sub">One month, billed once. Change plan any time from Plan in the console.</p>
              </div>

              <PlanPicker
                plans={SIGNUP_PLAN_OPTIONS}
                current={tier}
                mode="signup"
                onSelect={(chosen) => setTier(chosen as SignupTier)}
                disabled={busy}
              />

              {banner && <p className="form-error" role="alert">{banner}</p>}

              <div className="auth-plan-actions">
                <button
                  className="btn btn-primary btn-block"
                  type="submit"
                  disabled={busy || !tier}
                >
                  {busy && <span className="spinner" aria-hidden="true" />}
                  Continue to payment
                </button>
                {/* NO CHECKOUT FOR THIS PATH — DEC-116. A trial captures nothing, so there is
                    nothing for <PaymentDialog> to simulate; the button submits directly, with
                    `trial: true` and no paymentRef. */}
                <button
                  className="btn btn-secondary btn-block"
                  type="button"
                  disabled={busy || !tier}
                  onClick={() => void submit({ trial: true })}
                >
                  {busy && <span className="spinner" aria-hidden="true" />}
                  Start 14-day trial instead
                </button>
                <button
                  className="btn btn-ghost btn-block"
                  type="button"
                  disabled={busy}
                  onClick={() => setStep('details')}
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      {step === 'details' && <AuthAside />}

      {paying && chosenPlan && (
        <PaymentDialog
          plan={chosenPlan}
          mode="signup"
          // No onDone: registering signs the founder in, and the /start guard moves them into the
          // app straight away, so landing on the setup wizard is the confirmation here.
          onPaid={(reference) =>
            submit({ paymentRef: reference }).then((registered) => {
              if (!registered) throw new Error('Registration was refused.');
            })
          }
          onCancel={() => setPaying(false)}
        />
      )}
    </div>
  );
}

