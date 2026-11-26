// `/login`. Its state is `state.entry.login` (store/screens/entry.ts); signing in is the
// `loginSubmitted` thunk. The password is NOT in the store (DEC-014): the box is uncontrolled
// and read from the form on submit. The form is hidden, not unmounted, while the
// organisation picker is up, so "Back" costs nothing and a pick signs in with what was typed.
import { useRef } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { fieldErrorOf, useClearOnLeave, type SerializedApiError } from '../../store/screens/common.js';
import {
  MIN_PASSWORD,
  loginChoiceDismissed,
  loginEmailEdited,
  loginLeft,
  loginRevealToggled,
  loginSubmitted,
  selectEntry,
} from '../../store/screens/entry.js';
import { AuthAside } from './AuthAside.js';

function messageFor(error: SerializedApiError): string {
  if (error.kind !== 'api') {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (error.status === 429) {
    const wait = error.retryAfter;
    return wait
      ? `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute${
          Math.ceil(wait / 60) === 1 ? '' : 's'
        }.`
      : 'Too many attempts. Try again in a few minutes.';
  }
  if (error.status === 401) return "That email and password don't match.";
  return error.message;
}

export default function Login(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { email, reveal, busy, error, choices } = useAppSelector(selectEntry).login;
  useClearOnLeave(loginLeft());
  const formRef = useRef<HTMLFormElement>(null);

  const from = (location.state as { from?: string } | null)?.from;

  function attempt(orgId?: string): void {
    const form = formRef.current;
    if (!form) return;
    const password = new FormData(form).get('password');
    void dispatch(loginSubmitted({
      email,
      password: typeof password === 'string' ? password : '',
      orgId,
    })).then((result) => {
      if (!loginSubmitted.fulfilled.match(result)) return;
      const landing = result.payload;
      navigate(landing === '/app' ? (from ?? '/app') : landing, { replace: true });
    });
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    attempt();
  }

  const invalid = error?.status === 422;
  const fieldError = (path: string): string | undefined =>
    invalid ? fieldErrorOf(error, path) : undefined;
  const banner = error && !invalid ? messageFor(error) : null;

  return (
    <div className="auth">
      <div className="auth-main">
      <div className="card elev-lg auth-card">
        <h1 className="auth-title">{choices ? 'Which organization?' : 'Sign in'}</h1>
        <p className="auth-sub">
          {choices
            ? 'That sign-in works for more than one. Pick the one you want.'
            : 'Welcome back.'}
        </p>

        {choices && (
          <div className="org-choice">
            {choices.map((org) => (
              <button
                key={org.id}
                type="button"
                className="btn btn-secondary btn-block org-choice-item"
                disabled={busy}
                onClick={() => attempt(org.id)}
              >
                {org.name}
              </button>
            ))}
            {/* Not "Cancel" — the form below is only hidden, its fields still filled, so
                going back costs nothing and re-typing would be the only alternative. */}
            <button
              type="button"
              className="btn btn-ghost btn-block"
              disabled={busy}
              onClick={() => dispatch(loginChoiceDismissed())}
            >
              Back
            </button>
          </div>
        )}
        <div hidden={choices !== null}>
        <form ref={formRef} onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              name="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(event) => dispatch(loginEmailEdited({ email: event.target.value }))}
              aria-invalid={fieldError('email') ? true : undefined}
              aria-describedby={fieldError('email') ? 'email-error' : undefined}
            />
            {fieldError('email') && (
              <p className="field-error" id="email-error">{fieldError('email')}</p>
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
                autoComplete="current-password"
                required
                minLength={MIN_PASSWORD}
                aria-invalid={fieldError('password') ? true : undefined}
                aria-describedby={fieldError('password') ? 'password-error' : undefined}
              />
              <button
                type="button"
                className="btn btn-icon reveal-toggle"
                onClick={() => dispatch(loginRevealToggled())}
              >
                <Icon name={reveal ? 'hide' : 'show'} size={18} label={reveal ? 'Hide password' : 'Show password'} />
              </button>
            </div>
            {fieldError('password') && (
              <p className="field-error" id="password-error">{fieldError('password')}</p>
            )}
          </div>

          {/* Above the button, where the eye already is at submit time — not in a toast
              (design_specs/design/10 §4). `role="alert"` so it is announced, not just seen. */}
          {banner && <p className="form-error" role="alert">{banner}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {/* The label does NOT change to "Signing in…". Swapping it reflows the button
                width mid-click, which reads as the page glitching. */}
            {busy && <span className="spinner" aria-hidden="true" />}
            Sign in
          </button>
        </form>
        </div>

        <p className="auth-alt">
          New here? <Link className="btn btn-ghost" to="/start">Create your organization</Link>
        </p>
      </div>
      </div>

      <AuthAside />
    </div>
  );
}
