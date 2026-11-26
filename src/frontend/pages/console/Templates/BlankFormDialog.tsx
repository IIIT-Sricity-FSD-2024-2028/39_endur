// A new form from nothing. Its fields are `state.templates.blank` (store/screens/templates.ts),
// every keystroke an action; Create is the `blankFormCreated` thunk. The page renders it
// while that state is set, and opens the builder once it is created.
import type { TemplateSummary } from '@endur/shared';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { messageOf } from '../../../store/screens/common.js';
import {
  blankFormClosed,
  blankFormCreated,
  blankFormEdited,
  blankReady,
  selectBlankForm,
} from '../../../store/screens/templates.js';

export function BlankFormDialog({
  onCreated,
}: {
  onCreated: (created: TemplateSummary) => void;
}): JSX.Element | null {
  const dispatch = useAppDispatch();
  const draft = useAppSelector(selectBlankForm);
  if (!draft) return null;

  const { name, category, saving } = draft;
  const ready = blankReady(draft);
  const error = messageOf(draft.error, 'That could not be created.');
  const close = (): void => {
    dispatch(blankFormClosed());
  };

  return (
    <div className="dialog-backdrop" onMouseDown={close}>
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
            void dispatch(blankFormCreated()).then((result) => {
              if (blankFormCreated.fulfilled.match(result)) onCreated(result.payload);
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
              onChange={(event) => dispatch(blankFormEdited({ name: event.target.value }))}
            />
          </div>

          <div className="field">
            <label htmlFor="blank-category">Category</label>
            <input
              id="blank-category"
              className="input"
              value={category}
              onChange={(event) => dispatch(blankFormEdited({ category: event.target.value }))}
            />
            <p className="field-help">
              What the card groups under in the library — Teaching, Facilities, Care. Your own
              word; nothing else reads it.
            </p>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!ready || saving}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
