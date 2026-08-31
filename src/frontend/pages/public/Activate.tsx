// /activate/:token — 57 § Interactions, § Data contract.
//
// PUBLIC WORLD, beside `/login` and `/start`, not the console: whoever is here has no
// session, by definition — `<ConsoleLayout>` would bounce them to `/login` before this ever
// rendered. It also must not bounce a signed-in stranger away: 57's own acceptance list
// says the activation is filed under the INVITE's organisation even when a different
// tenant's session is live on the same browser, so this route carries no
// `<RedirectIfSignedIn>` the way `/login` and `/start` do.
//
// GET BEFORE POST (57 § The token): the screen greets the person by name and names the
// organisation before asking for a password, because a bare password box reached from a
// pasted link is indistinguishable from a phishing page.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../lib/api.js';
import { useActivationPreview } from '../../lib/accounts.js';
import { useActivate } from '../../lib/auth.js';
import { AuthAside } from './AuthAside.js';

const MIN_PASSWORD = 10;

export default function Activate(): JSX.Element {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const preview = useActivationPreview(token);
  const doActivate = useActivate();

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    void doActivate(token, password)
      .then((landing) => navigate(landing, { replace: true }))
      .catch((caught: unknown) => {
        setBusy(false);
        // 422 says the password rule; anything else is the uniform dead end — the token
        // was consumed or invalidated between the GET and this POST.
        setError(
          caught instanceof ApiError
            ? caught.fieldError('body.password') ?? caught.message
            : 'Something went wrong. Please try again.',
        );
      });
  }

  return (
    <div className="auth">
      <div className="auth-main">
        <div className="card elev-lg auth-card">
          {preview.loading ? (
            <p className="text-muted">Checking your link…</p>
          ) : preview.error || !preview.data ? (
            // ONE screen, ONE sentence — 57 § Interactions. It does not say which of
            // expired, used, or unknown happened, and it offers no self-serve resend: both
            // would answer questions for someone holding a token they should not have.
            <>
              <h1 className="auth-title">That link is not active</h1>
              <p className="auth-sub">Ask whoever invited you for a new link.</p>
            </>
          ) : (
            <>
              {preview.data.organizationLogoUrl && (
                <img
                  className="auth-org-logo"
                  src={preview.data.organizationLogoUrl}
                  alt=""
                  aria-hidden="true"
                />
              )}
              <h1 className="auth-title">Welcome, {preview.data.personName}</h1>
              <p className="auth-sub">
                Set a password to sign in to {preview.data.organizationName}.
              </p>

              <form onSubmit={submit} noValidate>
                <div className="field">
                  <label htmlFor="activate-password">Password</label>
                  <input
                    id="activate-password"
                    className="input"
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    autoFocus
                    required
                    minLength={MIN_PASSWORD}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <p className="field-help">Use at least {MIN_PASSWORD} characters.</p>
                </div>

                {error && <p className="form-error" role="alert">{error}</p>}

                <button
                  className="btn btn-primary btn-block"
                  type="submit"
                  disabled={busy || password.length < MIN_PASSWORD}
                >
                  {busy && <span className="spinner" aria-hidden="true" />}
                  Set password and sign in
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <AuthAside />
    </div>
  );
}
