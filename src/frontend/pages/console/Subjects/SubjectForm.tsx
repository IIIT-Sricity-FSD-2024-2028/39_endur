// The add or edit dialog for a subject. What is typed, picked and searched is
// `state.subjects.form` (store/screens/subjects.ts); the page opens it with its starting
// draft (`subjectFormOpened`) and sends it with a thunk.
import { nameField } from '@endur/shared';
import type { PersonSummary, ResolvedLabels, UnitNode } from '@endur/shared';
import { UnitTree } from '../../../components/org/UnitTree.js';
import { usePeopleSearch } from '../../../lib/people.js';
import { isValid } from '../../../lib/validate.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import {
  selectSubjectForm,
  subjectFormEdited,
  subjectPersonLinked,
  subjectPersonSearchTyped,
  type SubjectDraft,
} from '../../../store/screens/subjects.js';

export type { SubjectDraft } from '../../../store/screens/subjects.js';

export function SubjectForm({
  title,
  verb,
  units,
  labels,
  initial,
  saving,
  error,
  canLinkPeople,
  onSubmit,
  onCancel,
}: {
  title: string;
  verb: string;
  units: UnitNode[];
  labels: ResolvedLabels;
  initial?: SubjectDraft | undefined;
  saving: boolean;
  error: string | null;
  canLinkPeople: boolean;
  onSubmit: (draft: SubjectDraft) => void;
  onCancel: () => void;
}): JSX.Element {
  const dispatch = useAppDispatch();
  const form = useAppSelector(selectSubjectForm);
  const draft: SubjectDraft =
    form?.draft ?? initial ?? { name: '', unitId: units[0]?.id ?? '', linkedUserId: null, linkedUserName: null };
  const term = form?.personTerm ?? '';
  const people = usePeopleSearch(term);

  const unitName = findUnit(units, draft.unitId)?.name ?? '';
  const ready = isValid(nameField(120), draft.name) && draft.unitId !== '';

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="dialog-title">{title}</h2>

        <form
          className="subject-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready && !saving) onSubmit({ ...draft, name: draft.name.trim() });
          }}
        >
          <div className="field">
            <label htmlFor="subject-name">Name</label>
            <input
              id="subject-name"
              className="input"
              maxLength={120}
              autoFocus
              value={draft.name}
              onChange={(event) => dispatch(subjectFormEdited({ name: event.target.value }))}
            />
          </div>

          <fieldset className="field">
            <legend>{labels.unit.one}</legend>
            <div className="card subject-unit-picker">
              <UnitTree
                nodes={units}
                mode="select"
                selectedId={draft.unitId}
                onSelect={(id) => dispatch(subjectFormEdited({ unitId: id }))}
              />
            </div>
            <p className="field-help">
              {unitName ? `In ${unitName}.` : `Choose a ${labels.unit.one.toLowerCase()}.`} This
              is what decides who can see it.
            </p>
          </fieldset>

          {canLinkPeople && (
            <div className="field">
              <label htmlFor="subject-person">Linked person (optional)</label>
              {draft.linkedUserId ? (
                <p className="linked-person">
                  <span>{draft.linkedUserName}</span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => dispatch(subjectPersonLinked(null))}
                  >
                    Remove link
                  </button>
                </p>
              ) : (
                <>
                  <input
                    id="subject-person"
                    className="input"
                    placeholder="Search by name"
                    value={term}
                    onChange={(event) => dispatch(subjectPersonSearchTyped({ term: event.target.value }))}
                  />
                  {people.loading && <p className="text-meta">Searching…</p>}
                  <ul className="person-results">
                    {people.data?.data.map((person: PersonSummary) => (
                      <li key={person.id}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            dispatch(subjectPersonLinked({ personId: person.userId ?? person.id, name: person.name }))
                          }
                        >
                          {person.name}
                          <span className="text-meta"> {person.positions[0]?.roleName ?? ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="field-help">
                Linked, this {labels.subject.one.toLowerCase()} <em>is</em> that person for
                reviews — and they already hold a seat, so it adds nothing to your plan. An
                unlinked one counts as a seat of its own.
              </p>
            </div>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!ready || saving}>
              {verb}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function findUnit(nodes: UnitNode[], id: string): UnitNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findUnit(node.children, id);
    if (found) return found;
  }
  return undefined;
}
