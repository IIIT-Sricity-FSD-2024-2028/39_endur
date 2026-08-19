// Create / edit a subject. 35 § Interactions.
//
// Three fields, and the third one is the interesting one: linking a person is what turns
// "review the thing" into "review the person" with no second code path. The form says what
// that means for the bill rather than hiding it — and says it CORRECTLY, which is not what
// a first reading of 35 suggests: per `16` §5 a linked subject is already a user and costs
// nothing extra, while an unlinked one is a seat.
//
// The unit is chosen from `<UnitTree>` in `mode="select"` — the third placement of the one
// tree (INV-009), and the reason that mode exists.
import { useState } from 'react';
import type { PersonSummary, ResolvedLabels, UnitNode } from '@endur/shared';
import { UnitTree } from '../../../components/org/UnitTree.js';
import { usePeopleSearch } from '../../../lib/people.js';

export type SubjectDraft = {
  name: string;
  unitId: string;
  linkedUserId: string | null;
  linkedUserName: string | null;
};

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
  /** Without `person.read` the picker is absent rather than empty (INV-003). */
  canLinkPeople: boolean;
  onSubmit: (draft: SubjectDraft) => void;
  onCancel: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState<SubjectDraft>(
    initial ?? { name: '', unitId: units[0]?.id ?? '', linkedUserId: null, linkedUserName: null },
  );
  const [term, setTerm] = useState('');
  const people = usePeopleSearch(term);

  const unitName = findUnit(units, draft.unitId)?.name ?? '';
  const ready = draft.name.trim().length > 0 && draft.unitId !== '';

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
              autoFocus
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>

          <fieldset className="field">
            <legend>{labels.unit.one}</legend>
            <div className="card subject-unit-picker">
              <UnitTree
                nodes={units}
                mode="select"
                selectedId={draft.unitId}
                onSelect={(id) => setDraft({ ...draft, unitId: id })}
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
                    onClick={() => setDraft({ ...draft, linkedUserId: null, linkedUserName: null })}
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
                    onChange={(event) => setTerm(event.target.value)}
                  />
                  {people.loading && <p className="text-meta">Searching…</p>}
                  <ul className="person-results">
                    {people.data?.data.map((person: PersonSummary) => (
                      <li key={person.id}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => {
                            setDraft({
                              ...draft,
                              linkedUserId: person.userId ?? person.id,
                              linkedUserName: person.name,
                            });
                            setTerm('');
                          }}
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
