// T-031 — sign in. 30 § Sign in, design_specs/design/03 §3.2.
//
// Deliberately plain, and deliberately unhelpful about what went wrong: wrong address and
// wrong password produce the same sentence, because any difference between them is a free
// tool for working out which addresses are real (15 §2). The server already guarantees
// this; the job here is not to undo it by being friendly.
//
// No password is stored, echoed or logged. It lives in component state until submit and
// nowhere after — the session is an httpOnly cookie the browser owns (DEC-014).
//
// ONE ADDRESS CAN OPEN TWO ORGANISATIONS — DEC-049. `users` is unique on `(org_id, email)`,
// so a person may legitimately hold an account in more than one. The server answers a
// `409 ACCOUNT_AMBIGUOUS` if — and only if — the password opens several, and this page then
// asks which. It cannot happen to anybody with one account, it cannot happen to anybody who
// uses different passwords, and no seeded organisation shares an address, so the demo never
// sees it. It is the narrowest possible question, asked in the only case that needs it.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { ApiError } from '../../lib/api.js';
import { useSignIn } from '../../lib/auth.js';
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
  // A 409 is not a failure and is never bannered — the page renders the choice instead.
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
  /** Non-null only while the server is waiting for an answer to "which organization?". */
  const [choices, setChoices] = useState<Array<{ id: string; name: string }> | null>(null);

  // Where they were headed before RequireSession bounced them here (router/guards.tsx).
  const from = (location.state as { from?: string } | null)?.from;

  /**
   * `orgId` is present only on the second attempt, answering the server's own question. It
   * is never sent unprompted: the whole point of DEC-049 is that an ordinary sign-in still
   * takes an address and a password and nothing else.
   */
  async function attempt(orgId?: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const landing = await signIn({ email: email.trim(), password, ...(orgId ? { orgId } : {}) });
      // An unconfigured organisation wins over the deep link — sending someone back to a
      // page that cannot render yet is worse than losing their place (30 § Interactions).
      navigate(landing === '/app' ? (from ?? '/app') : landing, { replace: true });
    } catch (caught) {
      setBusy(false);
      if (caught instanceof ApiError && caught.code === 'ACCOUNT_AMBIGUOUS') {
        setChoices((caught.details['organizations'] as Array<{ id: string; name: string }>) ?? []);
        return;
      }
      // Any other failure puts the form back. A wrong password answered from the org list
      // cannot happen — the list is only ever shown to somebody whose password was right —
      // but a session that died between the two calls can, and the fields are the way out.
      setChoices(null);
      setError(caught as Error);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void attempt();
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
        <h1 className="auth-title">{choices ? 'Which organization?' : 'Sign in'}</h1>
        <p className="auth-sub">
          {choices
            ? 'That sign-in works for more than one. Pick the one you want.'
            : 'Welcome back.'}
        </p>

        {choices ? (
          <div className="org-choice">
            {choices.map((org) => (
              <button
                key={org.id}
                type="button"
                className="btn btn-secondary btn-block org-choice-item"
                disabled={busy}
                onClick={() => void attempt(org.id)}
              >
                {org.name}
              </button>
            ))}
            {/* Not "Cancel" — the password is still in state and the fields are still
                filled, so going back costs nothing and re-typing would be the only
                alternative. */}
            <button
              type="button"
              className="btn btn-ghost btn-block"
              disabled={busy}
              onClick={() => setChoices(null)}
            >
              Back
            </button>
          </div>
        ) : (
        <form onSubmit={submit} noValidate>
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
        )}

        <p className="auth-alt">
          New here? <Link className="btn btn-ghost" to="/start">Create your organization</Link>
        </p>
      </div>
      </div>

      <AuthAside />
    </div>
  );
}
