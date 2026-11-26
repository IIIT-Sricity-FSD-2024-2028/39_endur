// "Add a person". What is typed is `state.people.list.adding.draft` (store/screens/people.ts);
// the page renders this while that is set and sends it with the `personAdded` thunk.
import { isValid } from '../../../lib/validate.js';
import { nameField } from '@endur/shared';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { addPersonEdited, selectPeopleList, type PersonDraft } from '../../../store/screens/people.js';

export type { PersonDraft } from '../../../store/screens/people.js';

export function PersonForm({
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  saving: boolean;
  error: string | null;
  onSubmit: (draft: PersonDraft) => void;
  onCancel: () => void;
}): JSX.Element {
  const dispatch = useAppDispatch();
  const draft = useAppSelector(selectPeopleList).adding?.draft ?? { name: '', email: '' };
  const ready = isValid(nameField(120), draft.name) && draft.email.trim().length > 0;

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add a person"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="dialog-title">Add a person</h2>

        <form
          className="person-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready && !saving) {
              onSubmit({ name: draft.name.trim(), email: draft.email.trim() });
            }
          }}
        >
          <div className="field">
            <label htmlFor="person-name">Name</label>
            <input
              id="person-name"
              className="input"
              maxLength={120}
              autoFocus
              value={draft.name}
              onChange={(event) => dispatch(addPersonEdited({ name: event.target.value }))}
            />
          </div>

          <div className="field">
            <label htmlFor="person-email">Email</label>
            <input
              id="person-email"
              className="input"
              type="email"
              maxLength={254}
              value={draft.email}
              onChange={(event) => dispatch(addPersonEdited({ email: event.target.value }))}
            />
            <p className="field-help">
              How they will sign in, once somebody gives them an account. Adding them here
              does not send anything.
            </p>
          </div>

          <p className="field-help person-form-note">
            You will give them a role and a place on the next screen. Adding somebody grants
            them nothing on its own — a person with no position can do nothing at all.
          </p>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!ready || saving}>
              {saving ? 'Adding…' : 'Add person'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
