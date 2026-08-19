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
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { ApiError } from '../../lib/api.js';
import { useRegister } from '../../lib/auth.js';

/** `Credentials` in packages/shared says min(10). Mirrored, never trusted — the server
 *  rejects a short password whatever this form believes (30 § Acceptance). */
const MIN_PASSWORD = 10;

export default function Start(): JSX.Element {
  const navigate = useNavigate();
  const registerOrg = useRegister();

  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
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
      });
      navigate(landing, { replace: true });
    } catch (caught) {
      setError(caught as Error);
      setBusy(false);
    }
  }

  const apiError = error instanceof ApiError ? error : null;
  const fieldError = (path: string): string | undefined =>
    apiError?.status === 422 ? apiError.fieldError(path) : undefined;
  // 409 is the ONE case where naming the field is right. Registration is choosing an
  // identity, so "already registered" is information the person needs; login is proving
  // one, so the same fact there would be an enumeration oracle (auth/router.ts).
  const emailTaken = apiError?.status === 409;
  const banner =
    error && !emailTaken && apiError?.status !== 422
      ? (apiError?.message ?? 'Could not reach the server. Check your connection and try again.')
      : null;

  return (
    <div className="auth">
      <div className="card elev-md auth-card">
        <h1 className="auth-title">Create your organization</h1>
        <p className="text-meta auth-sub">Takes about two minutes.</p>

        <form onSubmit={(event) => void submit(event)} noValidate>
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
              onChange={(event) => setOrgName(event.target.value)}
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
              onChange={(event) => setName(event.target.value)}
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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

          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            Continue to setup
          </button>
        </form>

        <p className="auth-alt">
          Already have an account? <Link className="btn btn-ghost" to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
