// `/start`: create an organisation, choose a plan, pay or start a trial. Its state is
// `state.entry.signup` (store/screens/entry.ts) and registering is the `signupSubmitted` thunk.
//
// The password is NOT in the store (DEC-014). Its box is uncontrolled and read from the form
// when it is needed: to check the details, and to register. The details are hidden, not
// unmounted, while the plans are up, so the password is still in its box at that point and
// "Back" finds everything as it was left.
import { useRef } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SIGNUP_PLAN_OPTIONS, type SignupTier } from '@endur/shared';
import { Icon } from '../../components/Icon.js';
import { PlanPicker } from '../../components/billing/PlanPicker.js';
import { PaymentDialog } from '../../components/billing/PaymentDialog.js';
import { unwrapApi } from '../../lib/query.js';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { fieldErrorOf, useClearOnLeave } from '../../store/screens/common.js';
import {
  MIN_PASSWORD,
  selectEntry,
  signupBackToDetails,
  signupCheckoutClosed,
  signupCheckoutOpened,
  signupDetailsContinued,
  signupEdited,
  signupFinished,
  signupLeft,
  signupPasswordTyped,
  signupRevealToggled,
  signupSubmitted,
  signupTierChosen,
} from '../../store/screens/entry.js';
import { AuthAside } from './AuthAside.js';

export default function Start(): JSX.Element {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const {
    step, orgName, name, email, tier, reveal, paying, busy, error, detailErrors,
  } = useAppSelector(selectEntry).signup;
  useClearOnLeave(signupLeft());
  const formRef = useRef<HTMLFormElement>(null);

  /** What is in the password box right now. Read when needed, never kept. */
  const password = (): string => {
    const value = formRef.current ? new FormData(formRef.current).get('password') : null;
    return typeof value === 'string' ? value : '';
  };

  function onFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (step === 'details') {
      dispatch(signupDetailsContinued(password()));
      return;
    }
    dispatch(signupCheckoutOpened());
  }

  // A trial captures nothing, so it registers and goes straight in.
  const startTrial = (): void => {
    void dispatch(signupSubmitted({ password: password(), trial: true, holdSession: false }))
      .then((result) => {
        if (signupSubmitted.fulfilled.match(result)) navigate(result.payload, { replace: true });
      });
  };

  const chosenPlan = SIGNUP_PLAN_OPTIONS.find((plan) => plan.tier === tier) ?? null;

  const apiError = error?.kind === 'api' ? error : null;
  const fieldError = (path: string): string | undefined =>
    detailErrors[path] ?? (apiError?.status === 422 ? fieldErrorOf(apiError, path) : undefined);
  const emailTaken = apiError?.status === 409;
  const banner =
    error && !emailTaken && apiError?.status !== 422
      ? (apiError?.message ?? 'Could not reach the server. Check your connection and try again.')
      : null;

  return (
    <div className={`auth ${step === 'plan' ? 'is-plan-mode' : ''}`}>
      <div className="auth-main">
        <form ref={formRef} onSubmit={onFormSubmit} noValidate>
          <div hidden={step !== 'details'}>
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
                  onChange={(event) => dispatch(signupEdited({ field: 'orgName', value: event.target.value }))}
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
              onChange={(event) => dispatch(signupEdited({ field: 'name', value: event.target.value }))}
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
              onChange={(event) => dispatch(signupEdited({ field: 'email', value: event.target.value }))}
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
                onChange={() => dispatch(signupPasswordTyped())}
                aria-describedby={fieldError('password') ? 'password-error' : 'password-help'}
              />
              <button
                type="button"
                className="btn btn-icon reveal-toggle"
                onClick={() => dispatch(signupRevealToggled())}
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
          </div>
          {step === 'plan' && (
            <div className="auth-plan-wrapper">
              <div className="auth-plan-header">
                <h1 className="auth-title">Choose a plan</h1>
                <p className="auth-sub">One month, billed once. Change plan any time from Plan in the console.</p>
              </div>

              <PlanPicker
                plans={SIGNUP_PLAN_OPTIONS}
                current={tier}
                mode="signup"
                onSelect={(chosen) => dispatch(signupTierChosen({ tier: chosen as SignupTier }))}
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
                  onClick={startTrial}
                >
                  {busy && <span className="spinner" aria-hidden="true" />}
                  Start 14-day trial instead
                </button>
                <button
                  className="btn btn-ghost btn-block"
                  type="button"
                  disabled={busy}
                  onClick={() => dispatch(signupBackToDetails())}
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
          // Navigation is held until onDone, so the dialog's "Payment successful" screen has a
          // chance to show before the page changes out from under it.
          onPaid={(paymentRef) =>
            unwrapApi(dispatch(signupSubmitted({
              password: password(), paymentRef, trial: false, holdSession: true,
            })))
          }
          onDone={() => {
            void dispatch(signupFinished()).then((result) => {
              if (signupFinished.fulfilled.match(result) && result.payload) {
                navigate(result.payload, { replace: true });
              }
            });
          }}
          onCancel={() => dispatch(signupCheckoutClosed())}
        />
      )}
    </div>
  );
}

