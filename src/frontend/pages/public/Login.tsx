// T-031 — sign in. 30 § Sign in, design_specs/design/03 §3.2.
//
// Deliberately plain, and deliberately unhelpful about what went wrong: wrong address and
// wrong password produce the same sentence, because any difference between them is a free
// tool for working out which addresses are real (15 §2). The server already guarantees
// this; the job here is not to undo it by being friendly.
//
// No password is stored, echoed or logged. It lives in component state until submit and
// nowhere after — the session is an httpOnly cookie the browser owns (DEC-014).
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { ApiError } from '../../lib/api.js';
import { useSignIn } from '../../lib/auth.js';
import { DEMO_ORGS, isDemoBuild } from '../../lib/demo.js';
import { AuthAside } from './AuthAside.js';

/** Mirrors `Credentials` in packages/shared. The server is the authority; this only saves
 *  a round trip on an obviously short password (30 § Acceptance). */
const MIN_PASSWORD = 10;

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) {
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
  // One sentence for 401, whatever the server chose to say. Never name the field.
  if (error.status === 401) return "That email and password don't match.";
  return error.message;
}

export default function Login(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const signIn = useSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  // Where they were headed before RequireSession bounced them here (router/guards.tsx).
  const from = (location.state as { from?: string } | null)?.from;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const landing = await signIn({ email: email.trim(), password });
      // An unconfigured organisation wins over the deep link — sending someone back to a
      // page that cannot render yet is worse than losing their place (30 § Interactions).
      navigate(landing === '/app' ? (from ?? '/app') : landing, { replace: true });
    } catch (caught) {
      setError(caught as Error);
      setBusy(false);
    }
  }

  const fieldError = (path: string): string | undefined =>
    error instanceof ApiError && error.status === 422 ? error.fieldError(path) : undefined;
  // A 422 is already shown under the field it belongs to. Repeating it above the button
  // says the same thing twice and makes the form look angrier than it is.
  const banner = error && !(error instanceof ApiError && error.status === 422)
    ? messageFor(error)
    : null;

  return (
    <div className="auth">
      <div className="auth-main">
      <div className="card elev-lg auth-card">
        <h1 className="auth-title">Sign in</h1>
        <p className="auth-sub">Welcome back.</p>

        <form onSubmit={(event) => void submit(event)} noValidate>
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
              onChange={(event) => setEmail(event.target.value)}
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
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={fieldError('password') ? true : undefined}
                aria-describedby={fieldError('password') ? 'password-error' : undefined}
              />
              <button
                type="button"
                className="btn btn-icon reveal-toggle"
                onClick={() => setReveal((shown) => !shown)}
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

        <p className="auth-alt">
          New here? <Link className="btn btn-ghost" to="/start">Create your organization</Link>
        </p>
      </div>

      {isDemoBuild() && (
        <div className="auth-demo">
          <p className="text-meta" id="demo-hint">
            Development build — click to fill:
          </p>
          <div className="auth-demo-row">
            {DEMO_ORGS.map((org) => (
              <button
                type="button"
                key={org.slug}
                className="tag tag-neutral"
                onClick={() => {
                  setEmail(org.email);
                  setPassword(org.password);
                  setError(null);
                }}
              >
                {org.name}
              </button>
            ))}
          </div>
        </div>
      )}
      </div>

      <AuthAside />
    </div>
  );
}
