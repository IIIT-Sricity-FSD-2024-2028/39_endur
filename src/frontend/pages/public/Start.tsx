// T-031 — create an organization. 30 § Create organization, design_specs/design/03 §3.3.
//
// FOUR FIELDS AND NO INDUSTRY PICKER, which is a deliberate departure from 30's field list
// and matches design_specs/design/03 §3.3 instead. Both documents are chasing the same
// sentence — "do not make the user pick it twice" — and the wizard's step 1 is the better
// place to lose the argument: it is the demo's centrepiece, it shows what each preset
// actually contains, and it can be changed with one click. Asking here would mean asking
// blind, and then asking again. Industry therefore defaults to `custom` on the wire and
// step 1 overwrites it. Recorded as CONF-011.
//
// It also removes a contradiction that could not have been implemented as written: 30's
// data contract has this page calling `GET /org/presets`, but that route is behind
// `authenticate` + `requireCapability('org.read')` and nobody on `/start` has a session.
//
// TWO STEPS SINCE T-088 — DETAILS, THEN PLAN. DEC-048, and the owner asked for it by name:
// *"when you login - pick between option / rn, no pricing, just pick the option (bronze,
// silver and gold) and you get assigned that."*
//
// Both steps commit in ONE POST, and that is the point rather than an economy. `register`
// writes the organisation and the `subscriptions` row in a single transaction (D-012), so an
// organisation cannot exist without a tier somebody chose. Asking on a second page after the
// account existed would recreate exactly the state D-012 describes: a live organisation with
// no row, silently bronze, for however long it takes them to answer.
//
// The tier question is asked HERE and the industry question is not (CONF-011), which looks
// inconsistent and is not: the wizard's step 1 asks about industry properly, with each
// preset's contents visible, so asking here would be asking twice. Nothing asks about the
// tier later, so this is the only place it can be asked once.
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

/** `Credentials` in packages/shared says min(10). Mirrored, never trusted — the server
 *  rejects a short password whatever this form believes (30 § Acceptance). */
const MIN_PASSWORD = 10;

/**
 * THE FIRST STEP'S FIELDS, TAKEN OFF THE REGISTRATION DTO RATHER THAN RESTATED.
 *
 * `.pick()` keeps this honest: when `RegisterBody` gains a rule — a longer password, a name
 * that must contain a letter — this screen enforces it the same day, with no second edit and
 * no chance of the two disagreeing. `tier` and `industry` are deliberately not here; the tier
 * belongs to step 2, and `industry` is answered properly by the setup wizard (CONF-011).
 */
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
  /** NOTHING IS PRE-SELECTED — DEC-048. There is no default tier to fall back to. */
  const [tier, setTier] = useState<SignupTier | null>(null);
  /**
   * The checkout, open or not — DEC-080. It is state on THIS page rather than a step of its
   * own because the tier is still not committed while it is open: cancelling puts the reader
   * back on three cards with their choice intact, and a third step would have put a back
   * button between them and the thing they were mid-decision about.
   */
  const [paying, setPaying] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  /**
   * THE DETAILS STEP IS CHECKED BEFORE IT IS LEFT — and this is the whole of the bug it fixes.
   *
   * It used to be `setStep('plan')`, unconditionally. So a person could type digits into every
   * field, press Continue, choose a plan, run the checkout, and only THEN meet a 422 telling
   * them to go back and fix a name. Registration and the capture are ONE transaction
   * (`features/auth/service.ts`), so nothing was created and nothing was charged — but the
   * reader had no way to know that, and the product had just walked them through a payment
   * screen in order to reject them.
   *
   * IT RUNS THE DTO, NOT A COPY OF IT. `RegisterBody.pick(...)` is literally the schema the
   * server parses; a second set of rules written here is how `packages/shared`'s one-source-of
   * -truth stops being true. `tier` is excluded because it has not been chosen yet — that is
   * what the next step is for, and the button there is disabled until it has been.
   *
   * IT IS NOT THE RULE. `validate(RegisterDto)` still refuses the same request server-side
   * (INV-003); this only decides whether to spend the reader's time.
   */
  const details = useFormValidation(DETAILS_SCHEMA);

  const detailValues = (): Record<string, string> => ({
    orgName: orgName.trim(),
    name: name.trim(),
    email: email.trim(),
    password,
  });

  /**
   * ONE `onSubmit` FOR BOTH STEPS, so Enter means the same thing as the button under the
   * cursor. A second `<form>` would be tidier to read and would break that: Enter in the
   * password field on step 1 would submit a registration with no tier, which the server
   * correctly refuses with a 422 the person cannot act on.
   */
  function onFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (step === 'details') {
      if (!details.check(detailValues())) return;
      setStep('plan');
      return;
    }
    // THE PLAN STEP NO LONGER SUBMITS DIRECTLY — DEC-080. It opens the checkout, and the
    // checkout submits. Registration and the capture are one transaction on the server
    // (`features/auth/service.ts`), so there is nothing to undo if the reader cancels: the
    // POST has not happened yet.
    if (!tier || busy) return;
    setPaying(true);
  }

  async function submit(paymentRef?: string): Promise<void> {
    if (busy || !tier) return;
    setBusy(true);
    setError(null);
    try {
      const landing = await registerOrg({
        orgName: orgName.trim(),
        name: name.trim(),
        email: email.trim(),
        password,
        // The wizard's step 1 asks properly, with the contents of each preset visible.
        industry: 'custom',
        tier,
        // A LABEL, not a proof (DEC-080). The server prices the tier itself and writes the
        // ledger row either way; this is what lets a human match that row to the dialog.
        paymentRef,
      });
      navigate(landing, { replace: true });
    } catch (caught) {
      // The checkout closes first. Leaving a success overlay on screen above an error the
      // reader cannot reach is the worst of both — and every error this POST returns is
      // about a FIELD, which is behind the dialog.
      setPaying(false);
      setError(caught as Error);
      setBusy(false);
      // BACK TO THE FIELDS, because every error this POST can return is about one of them —
      // 409 is the address, 422 is a field. Leaving the person on the plan step to read
      // "that address is already registered" next to three tier cards would show them the
      // message beside the one thing it is not about, with no way to reach the input it
      // names. The tier they picked survives the trip; nothing is re-chosen.
      const status = (caught as ApiError).status;
      if (status === 409 || status === 422) setStep('details');
    }
  }

  const chosenPlan = SIGNUP_PLAN_OPTIONS.find((plan) => plan.tier === tier) ?? null;

  const apiError = error instanceof ApiError ? error : null;
  /**
   * ONE MESSAGE PER FIELD, FROM EITHER SIDE. The client check runs first and catches almost
   * everything; a 422 that still arrives is the server saying something the client could not
   * know (`DEC-110`). They render identically on purpose — a reader does not care which half of
   * the product noticed, and two different-looking errors under one input would suggest they do.
   */
  const fieldError = (path: string): string | undefined =>
    details.errors[path] ??
    (apiError?.status === 422 ? apiError.fieldError(path) : undefined);
  // 409 is the ONE case where naming the field is right. Registration is choosing an
  // identity, so "already registered" is information the person needs; login is proving
  // one, so the same fact there would be an enumeration oracle (auth/router.ts).
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
                <p className="auth-sub">One year, billed once. Change plan any time from settings</p>
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
          onPaid={(reference) => void submit(reference)}
          onCancel={() => setPaying(false)}
        />
      )}
    </div>
  );
}


