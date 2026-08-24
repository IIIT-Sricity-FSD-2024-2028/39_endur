// /app/people/:id — one person. 34 § Interactions, design_specs/design/04 §4.4.
//
// Three blocks, in this order and for this reason: **identity, positions, then what those
// positions actually confer.** The third is the payload. Everywhere else in the product the
// scoping model is a paragraph of documentation; here it is a rendered fact — the same
// person, two units, different powers, which is INV-005 without the paragraph.
//
// It shares that block with `/app/profile` (47) rather than owning a copy: `<PowersByPlace>`,
// one implementation, two placements (24 §4). What differs is who is reading. Here it is an
// administrator looking at somebody else, and the read is scope-filtered by the API — a
// person outside the caller's scope 404s rather than 403ing, so ids cannot be probed to map
// the org chart (13 §5).
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CreateAssignmentBody } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { InlineName } from '../../../components/org/InlineName.js';
import { PowersByPlace } from '../../../components/org/PowersByPlace.js';
import { Icon } from '../../../components/Icon.js';
import { ApiError } from '../../../lib/api.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { usePerson, useRoles } from '../../../lib/people.js';
import { useUnits } from '../../../lib/units.js';
import { flattenUnits } from '../../../lib/tree.js';
import { formatDate } from '../../../lib/format.js';
import { PositionChip, PositionEditor, type PositionDraft } from './PositionEditor.js';

export default function PersonDetail(): JSX.Element {
  const { id = '' } = useParams();
  const labels = useLabels();
  const can = useCan();

  const person = usePerson(id);
  const units = useUnits();
  const roles = useRoles();
  const unitOptions = useMemo(() => flattenUnits(units.data ?? []), [units.data]);

  const [assigning, setAssigning] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ edgeId: string; label: string } | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);

  const message = (caught: unknown, fallback: string): string =>
    caught instanceof ApiError ? caught.message : fallback;

  // A 404 here is out-of-scope OR nonexistent, deliberately indistinguishable (13 §5). The
  // copy has to be true for both, so it says neither.
  if (person.error instanceof ApiError && person.error.status === 404) {
    return (
      <>
        <PageHeader title="Not found" />
        <EmptyState
          icon="person"
          title="No such person here"
          body="Either nobody with that link exists, or they sit somewhere you cannot see. Both look the same from here, on purpose."
          action={<Link className="btn btn-secondary" to="/app/people">Back to People</Link>}
        />
      </>
    );
  }

  const data = person.data;
  const positions = data?.positions ?? [];

  const addPosition = (draft: PositionDraft): void => {
    setAssignBusy(true);
    setAssignError(null);
    const body: CreateAssignmentBody = {
      roleId: draft.roleId, unitId: draft.unitId, isPrimary: draft.isPrimary,
    };
    void person
      .assign(body)
      .then(() => setAssigning(false))
      .catch((caught: unknown) => {
        // Usually INV-012's `WOULD_ESCALATE`, and its message names the capability that
        // would have been handed out. Verbatim and inline: the server's sentence is the
        // actionable one, and a generic replacement throws away the only useful part.
        setAssignError(message(caught, 'That position could not be added.'));
      })
      .finally(() => setAssignBusy(false));
  };

  return (
    <>
      <PageHeader
        title={data?.name ?? 'Person'}
        subtitle={data?.email ?? undefined}
        action={<Link className="btn btn-ghost" to="/app/people">All people</Link>}
      />

      {person.error && !(person.error instanceof ApiError && person.error.status === 404) && (
        <p className="form-error" role="alert">
          {message(person.error, 'Could not load this person.')}{' '}
          <button type="button" className="btn btn-ghost" onClick={() => void person.reload()}>
            Try again
          </button>
        </p>
      )}

      {person.loading && !data ? (
        <div className="card" aria-hidden="true">
          <div className="tree-skeleton">
            {[0, 1, 2, 3].map((row) => <span key={row} className="skeleton-row wide" />)}
          </div>
        </div>
      ) : (
        <div className="settings-page">
          <section className="settings-card" aria-labelledby="person-identity">
            <h3 className="utility" id="person-identity">Identity</h3>
            <div className="card">
              <div className="field">
                <label htmlFor="person-name">Name</label>
                {can('person.update') ? (
                  <InlineName
                    value={data?.name ?? ''}
                    ariaLabel="Name"
                    onCommit={(name) => {
                      setError(null);
                      void person.rename(name).catch((caught: unknown) => {
                        setError(message(caught, 'That name could not be saved.'));
                      });
                    }}
                  />
                ) : (
                  <p className="person-name-text">{data?.name}</p>
                )}
              </div>

              <div className="field">
                <label htmlFor="person-email">Email</label>
                {/* THE ONE PLACE AN ADDRESS CAN CHANGE. `/app/profile` refuses it on purpose
                    — a self-service email change is an account-takeover path — so it happens
                    here, behind `person.update`, with an audit row naming who did it (47). */}
                {can('person.update') && editingEmail ? (
                  <InlineName
                    value={data?.email ?? ''}
                    ariaLabel="Email"
                    autoFocus
                    onCancel={() => setEditingEmail(false)}
                    onCommit={(email) => {
                      setError(null);
                      setEditingEmail(false);
                      void person.setEmail(email).catch((caught: unknown) => {
                        setError(message(caught, 'That address could not be saved.'));
                      });
                    }}
                  />
                ) : (
                  <p className="person-email-row">
                    <span>{data?.email ?? <span className="text-meta">No address</span>}</span>
                    {can('person.update') && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-tiny"
                        onClick={() => setEditingEmail(true)}
                      >
                        <Icon name="edit" size={16} /> Change
                      </button>
                    )}
                  </p>
                )}
                <p className="field-help">
                  Changing this changes where a sign-in link lands. It is recorded against
                  your name.
                </p>
              </div>

              {data?.status && data.status !== 'active' && (
                <p className="field-help">
                  Account status: <span className="tag tag-neutral">{data.status}</span>
                </p>
              )}
              {data?.createdAt && (
                <p className="field-help">Added {formatDate(data.createdAt)}.</p>
              )}
              {error && <p className="field-error" role="alert">{error}</p>}
            </div>
          </section>

          <section className="settings-card" aria-labelledby="person-positions">
            <h3 className="utility" id="person-positions">Positions</h3>
            <div className="card">
              {positions.length === 0 && !assigning && (
                // Not an empty area. Somebody with no position can do nothing at all, and
                // that is the single most likely reason anyone is on this page (34).
                <p className="text-muted">
                  No position — they cannot sign in to anything yet. A position is a role at
                  a {labels.unit.one.toLowerCase()}, and it is what grants every power below.
                </p>
              )}

              <div className="person-positions">
                {positions.map((position) => (
                  <PositionChip
                    key={position.edgeId}
                    roleName={position.roleName}
                    roleLevel={position.roleLevel}
                    unitName={position.unitName}
                    isPrimary={position.isPrimary}
                    validTo={position.validTo}
                    onRemove={
                      can('assignment.delete')
                        ? () =>
                            setPending({
                              edgeId: position.edgeId,
                              label: `${position.roleName} — ${position.unitName}`,
                            })
                        : undefined
                    }
                  />
                ))}
              </div>

              {assigning ? (
                <PositionEditor
                  roles={roles.data ?? []}
                  units={unitOptions}
                  labels={labels}
                  busy={assignBusy}
                  error={assignError}
                  hasPositions={positions.length > 0}
                  onAdd={addPosition}
                  onCancel={() => { setAssigning(false); setAssignError(null); }}
                />
              ) : (
                can('assignment.create') && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-tiny"
                    onClick={() => { setAssignError(null); setAssigning(true); }}
                  >
                    <Icon name="add" size={16} /> Position
                  </button>
                )
              )}

              {assignError && !assigning && (
                <p className="field-error" role="alert">{assignError}</p>
              )}
            </div>
          </section>

          <section className="settings-card" aria-labelledby="person-powers">
            <h3 className="utility" id="person-powers">What they can do, and where</h3>
            <div className="card">
              <PowersByPlace
                places={data?.powersByPlace ?? []}
                emptyHint={
                  positions.length === 0
                    ? 'Nothing anywhere, because they hold no position.'
                    : 'Anywhere else: nothing. Powers stop at the place the position sits.'
                }
              />
            </div>
          </section>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={`Remove ${pending.label}?`}
          // `<ConfirmDialog>` requires a consequence (24 §6), and the honest one is about
          // POWERS rather than about a chip disappearing: the powers below this position
          // go with it, and they are listed on this very page.
          consequence={`Everything ${data?.name ?? 'they'} could do at ${pending.label.split(' — ')[1] ?? 'that place'} goes with it. They keep their account and any other positions.`}
          verb="Remove"
          destructive
          onConfirm={() => {
            const target = pending;
            setPending(null);
            void person.unassign(target.edgeId).catch((caught: unknown) => {
              setError(message(caught, 'That position could not be removed.'));
            });
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
