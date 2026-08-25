// `/ops/login` — Step 0.7, `Mithil/plan.md`. `19` §9, `70` § Route & access.
//
// Three fields, ONE error message for all three failures — the server already refuses with
// one message (`REFUSED` in `features/platform/router.ts`) and the client must not add a
// second, more specific one; that would be the user-enumeration oracle the server just
// avoided, reintroduced one layer up.
//
// Development aid, not on screen: `npm run ops:code -w @endur/api` prints the current TOTP
// code for each seeded operator.
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { PlatformMeResponse } from '@endur/shared';
import { opsGet, opsPost, OpsError } from '../../lib/ops.js';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { opsSignedIn } from '../../store/opsSlice.js';

export default function Login(): JSX.Element {
  const status = useAppSelector((s) => s.ops.status);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The mirror of `RedirectIfSignedIn` (30 § Acceptance): declarative, so an already-signed-
  // -in operator never sees the form flash before leaving. `navigate()` mid-render is the
  // thing to avoid here — this is the `<Navigate>` element instead.
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from ?? '/ops';
    return <Navigate to={from} replace />;
  }

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    void (async () => {
      try {
        await opsPost('/auth/login', { email, password, code });
        const me = await opsGet<PlatformMeResponse>('/me');
        dispatch(opsSignedIn({ operator: me.operator, capabilities: me.capabilities }));
        const from = (location.state as { from?: string } | null)?.from ?? '/ops';
        navigate(from, { replace: true });
      } catch (err) {
        // One message for every failure — bad email, bad password, bad code alike.
        setError(
          err instanceof OpsError ? err.message : 'Something went wrong. Please try again.',
        );
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <div className="fullpage">
      <form className="ops-login card" onSubmit={onSubmit}>
        <h2>Endur operator sign in</h2>
        {error && <p className="field-error" role="alert">{error}</p>}

        <label className="field">
          <span className="field-label">Email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Six-digit code</span>
          <input
            className="input"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="one-time-code"
            required
          />
        </label>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting && <span className="spinner" aria-hidden="true" />}
          Sign in
        </button>
      </form>
    </div>
  );
}
