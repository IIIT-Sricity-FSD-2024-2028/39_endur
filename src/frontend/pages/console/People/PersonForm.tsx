// Add a person. 34 § Interactions, 14 §8.
//
// **Two fields, and deliberately no role.** `CreatePersonBody` does not accept a role, a
// level or a capability, and this form must not pretend otherwise — granting a position is
// a permission change and gets its own audited call. The person is created here and given
// a position on the row afterwards, which is two steps and is meant to be.
//
// It is worth saying WHY on the screen rather than only in the DTO, because an
// administrator's expectation from every other product is that "add user" asks for a role.
// A form that silently omits the question reads as unfinished; one that says the position
// comes next reads as deliberate.
import { useState } from 'react';

export type PersonDraft = { name: string; email: string };

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
  const [draft, setDraft] = useState<PersonDraft>({ name: '', email: '' });
  const ready = draft.name.trim().length > 0 && draft.email.trim().length > 0;

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
              autoFocus
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="person-email">Email</label>
            <input
              id="person-email"
              className="input"
              type="email"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
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
