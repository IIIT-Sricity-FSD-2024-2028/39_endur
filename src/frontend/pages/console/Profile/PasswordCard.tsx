// Change your own password. 47 § Interactions, 15 § Password handling.
//
// The current-password field is the whole reason this is a card rather than a link to a
// reset email. Three reasons, and the first is the one that matters: **an unattended
// logged-in session must not be enough to lock the real owner out.** Ninety seconds at
// somebody else's desk would otherwise take their account for good.
import { useState } from 'react';
import type { ChangePasswordBody } from '@endur/shared';
import { ApiError } from '../../../lib/api.js';

/** Kept in step with `ChangePasswordBody`'s floor. 15 § Password handling: length, no
 *  composition rules — a mandated symbol mostly produces "Password1!". */
const MIN = 10;

export function PasswordCard({
  onSubmit,
}: {
  onSubmit: (body: ChangePasswordBody) => Promise<void>;
}): JSX.Element {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  /** Keyed BY FIELD, because 47 § States says a mismatch is inline on the current-password
   *  field and not a toast — a toast takes the only actionable sentence away after four
   *  seconds, and the server's field path is what says which input it belongs under. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const ready = currentPassword.length > 0 && newPassword.length >= MIN;

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setDone(false);
    void onSubmit({ currentPassword, newPassword })
      .then(() => {
        setDone(true);
        // Both cleared. Leaving a password in an input after it has been used is leaving a
        // credential on screen for the next person who walks past.
        setCurrent('');
        setNew('');
      })
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.fields.length > 0) {
          const next: Record<string, string> = {};
          for (const field of caught.fields) next[field.path] = field.message;
          setFieldErrors(next);
        } else if (caught instanceof ApiError) {
          // Nothing landed on a field, so the summary is the only thing there is to show.
          setError(caught.message);
        } else {
          setError(caught instanceof Error ? caught.message : 'That did not work.');
        }
      })
      .finally(() => setBusy(false));
  };

  return (
    <section className="settings-card" aria-labelledby="profile-password">
      <h3 className="utility" id="profile-password">Password</h3>
      <form className="card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            disabled={busy}
            onChange={(event) => setCurrent(event.target.value)}
          />
          {fieldErrors['body.currentPassword'] && (
            <p className="field-error" role="alert">{fieldErrors['body.currentPassword']}</p>
          )}
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
            autoComplete="new-password"
            value={newPassword}
            disabled={busy}
            onChange={(event) => setNew(event.target.value)}
          />
          {fieldErrors['body.newPassword'] && (
            <p className="field-error" role="alert">{fieldErrors['body.newPassword']}</p>
          )}
          <p className="field-help">At least {MIN} characters. Length beats punctuation.</p>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
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
