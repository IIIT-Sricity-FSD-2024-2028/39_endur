// `/activate/:token`: an invited person sets a password and is signed in. The link's preview
// is an RTK Query read; setting the password is the `activationSubmitted` thunk, and what the
// page shows about it is `state.entry.activate`. The password is NOT in the store (DEC-014):
// the box is uncontrolled, and only whether it is long enough is kept.
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useActivationPreview } from '../../lib/accounts.js';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { fieldErrorOf, messageOf, useClearOnLeave } from '../../store/screens/common.js';
import {
  MIN_PASSWORD,
  activationLeft,
  activationSubmitted,
  activationTyped,
  selectEntry,
} from '../../store/screens/entry.js';
import { AuthAside } from './AuthAside.js';

export default function Activate(): JSX.Element {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const preview = useActivationPreview(token);
  const { longEnough, busy, error: failure } = useAppSelector(selectEntry).activate;
  useClearOnLeave(activationLeft());

  const error = failure
    ? fieldErrorOf(failure, 'body.password') ?? messageOf(failure, 'Something went wrong. Please try again.')
    : null;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    void dispatch(activationSubmitted({
      token,
      password: typeof password === 'string' ? password : '',
    })).then((result) => {
      if (activationSubmitted.fulfilled.match(result)) navigate(result.payload, { replace: true });
    });
  }

  return (
    <div className="auth">
      <div className="auth-main">
        <div className="card elev-lg auth-card">
          {preview.loading ? (
            <p className="text-muted">Checking your link…</p>
          ) : preview.error || !preview.data ? (
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
                    onChange={(event) =>
                      dispatch(activationTyped({ longEnough: event.target.value.length >= MIN_PASSWORD }))}
                  />
                  <p className="field-help">Use at least {MIN_PASSWORD} characters.</p>
                </div>

                {error && <p className="form-error" role="alert">{error}</p>}

                <button
                  className="btn btn-primary btn-block"
                  type="submit"
                  disabled={busy || !longEnough}
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
