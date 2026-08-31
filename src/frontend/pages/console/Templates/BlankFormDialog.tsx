// The blank-form escape hatch. 36 § Interactions.
//
// Deliberately a SECONDARY action behind a small dialog, never the empty state's primary
// one. A blank form is where a customer either gives up or writes forty questions, and
// both are the problem the library exists to prevent — but refusing it outright would be
// the product telling somebody who knows exactly what they want that they may not have it.
import { useState } from 'react';
import { nameField } from '@endur/shared';
import type { CreateTemplateBody } from '@endur/shared';
import { isValid } from '../../../lib/validate.js';

export function BlankFormDialog({
  onCreate,
  onCancel,
}: {
  onCreate: (body: CreateTemplateBody) => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('General');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = isValid(nameField(120), name) && isValid(nameField(60), category);

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Blank form"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="dialog-title">Blank form</h2>

        <form
          className="subject-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready || saving) return;
            setSaving(true);
            setError(null);
            void onCreate({ name: name.trim(), category: category.trim() })
              .catch((cause: unknown) => {
                setError(cause instanceof Error ? cause.message : 'That could not be created.');
                setSaving(false);
              });
          }}
        >
          <div className="field">
            <label htmlFor="blank-name">Name</label>
            <input
              id="blank-name"
              className="input"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="blank-category">Category</label>
            <input
              id="blank-category"
              className="input"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
            <p className="field-help">
              What the card groups under in the library — Teaching, Facilities, Care. Your own
              word; nothing else reads it.
            </p>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!ready || saving}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
