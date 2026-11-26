// The password card. DEC-014 and DEC-R03 together: its STATE is in Redux
// (`state.profile.password`: filled or not, busy, done, the refusal) and the PASSWORDS are
// not. The inputs are uncontrolled; the form is read with `FormData` on submit and handed to
// the `passwordChanged` thunk, so the text exists in the DOM and for one request only.
import type { FormEvent } from 'react';
import { ApiError } from '../../../lib/api.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { fieldErrorOf, messageOf, pageErrorOf } from '../../../store/screens/common.js';
import {
  PASSWORD_MIN,
  passwordChanged,
  passwordTyped,
  selectProfileScreen,
} from '../../../store/screens/profile.js';

const MIN = PASSWORD_MIN;

const valueOf = (form: HTMLFormElement, name: string): string => {
  const value = new FormData(form).get(name);
  return typeof value === 'string' ? value : '';
};

export function PasswordCard(): JSX.Element {
  const dispatch = useAppDispatch();
  const { currentGiven, nextLongEnough, busy, done, error } =
    useAppSelector(selectProfileScreen).password;

  const ready = currentGiven && nextLongEnough;
  // A 422 names its fields, and each goes under its own box; anything else is one line.
  const failed = pageErrorOf(error);
  const byField = failed instanceof ApiError && failed.fields.length > 0;
  const formError = byField ? null : messageOf(error, 'That did not work.');
  const currentError = fieldErrorOf(error, 'body.currentPassword');
  const newError = fieldErrorOf(error, 'body.newPassword');

  const typed = (event: FormEvent<HTMLFormElement>): void => {
    const form = event.currentTarget;
    dispatch(passwordTyped({
      currentGiven: valueOf(form, 'currentPassword').length > 0,
      nextLongEnough: valueOf(form, 'newPassword').length >= MIN,
    }));
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = event.currentTarget;
    void dispatch(passwordChanged({
      currentPassword: valueOf(form, 'currentPassword'),
      newPassword: valueOf(form, 'newPassword'),
    })).then((result) => {
      // Changed: both boxes are emptied, as the slice already says they are.
      if (passwordChanged.fulfilled.match(result)) form.reset();
    });
  };

  return (
    <section className="settings-card" aria-labelledby="profile-password">
      <h3 className="utility" id="profile-password">Password</h3>
      <form className="card" onSubmit={submit} onChange={typed}>
        <div className="field">
          <label htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            className="input"
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            disabled={busy}
          />
          {currentError && <p className="field-error" role="alert">{currentError}</p>}
          <p className="field-help">
            Asked for every time. It means a signed-in browser somebody left open is not
            enough to change your password.
          </p>
        </div>

        <div className="field">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            className="input"
            type="password"
            name="newPassword"
            autoComplete="new-password"
            disabled={busy}
          />
          {newError && <p className="field-error" role="alert">{newError}</p>}
          <p className="field-help">At least {MIN} characters. Length beats punctuation.</p>
        </div>

        {formError && <p className="form-error" role="alert">{formError}</p>}
        {done && (
          <p className="field-help" role="status">
            Changed. You are still signed in here — everywhere else will need the new one.
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </section>
  );
}
