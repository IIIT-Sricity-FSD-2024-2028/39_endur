// `/ops/login`. Its state is `state.operator.login` (store/screens/operator.ts) and signing in
// is the `operatorSignedIn` thunk. The password is NOT in the store (DEC-014): its box is
// uncontrolled and read from the form on submit.
import type { FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import '../../design-system/ops.css';
import { Icon } from '../../components/Icon.js';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { useClearOnLeave } from '../../store/screens/common.js';
import {
  operatorLoginEdited,
  operatorLoginLeft,
  operatorRevealToggled,
  operatorSignedIn,
  opsMessageOf,
  selectOperator,
} from '../../store/screens/operator.js';

export default function Login(): JSX.Element {
  const status = useAppSelector((s) => s.ops.status);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { email, code, reveal, submitting, error: failure } = useAppSelector(selectOperator).login;
  useClearOnLeave(operatorLoginLeft());
  const error = opsMessageOf(failure, 'Something went wrong. Please try again.');
  const from = (location.state as { from?: string } | null)?.from ?? '/ops';

  if (status === 'authenticated') {
    return <Navigate to={from} replace />;
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    void dispatch(operatorSignedIn({
      email,
      password: typeof password === 'string' ? password : '',
      code,
    })).then((result) => {
      if (operatorSignedIn.fulfilled.match(result)) navigate(from, { replace: true });
    });
  };

  return (
    <div className="ops-login-wrap">
      <form className="ops-login-card card elev-md" onSubmit={onSubmit}>
        <div className="ops-login-mark">
          <span className="nav-mark" aria-hidden="true" />
          <strong>Endur</strong>
          <span className="ops-brand-tag">Operator</span>
        </div>
        <h1>Operator sign in</h1>
        <p className="text-muted">Restricted to Endur staff. Every sign-in is audited.</p>
        {error && <p className="field-error" role="alert">{error}</p>}

        <label className="field">
          <span className="field-label">Email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => dispatch(operatorLoginEdited({ email: event.target.value }))}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <div className="input-reveal">
            <input
              className="input"
              type={reveal ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="btn btn-icon reveal-toggle"
              onClick={() => dispatch(operatorRevealToggled())}
            >
              <Icon name={reveal ? 'hide' : 'show'} size={18} label={reveal ? 'Hide password' : 'Show password'} />
            </button>
          </div>
        </label>

        <label className="field">
          <span className="field-label">Six-digit code</span>
          <input
            className="input"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(event) => dispatch(operatorLoginEdited({ code: event.target.value }))}
            autoComplete="one-time-code"
            required
          />
        </label>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting && <span className="spinner" aria-hidden="true" />}
          Sign in
        </button>
        <p className="ops-login-foot">
          <Icon name="operator" size={16} />
          Two factors, always: the code comes from the authenticator you scanned when your account was made.
        </p>
      </form>
    </div>
  );
}
