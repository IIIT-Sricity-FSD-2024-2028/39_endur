// The roles tab. 33 § "Interactions — the roles tab".
//
// A ROLE'S LEVEL IS ITS POSITION IN THIS LIST AND NOTHING ELSE. The order is what is sent;
// the number is what comes back. Nothing here computes a level, and nothing anywhere
// compares two of them to decide anything — that is `DEC-002`/`CONF-002`, and the reason the
// reorder DTO refuses a `level` field outright.
import { useState } from 'react';
import type { RoleView } from '@endur/shared';
import { InlineName } from '../../../components/org/InlineName.js';
import { RoleRow } from '../../../components/org/RoleRow.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { Icon } from '../../../components/Icon.js';
import { pluralise } from '../../../lib/format.js';
import type { RoleLadderController } from '../../../lib/roles.js';

export function RoleLadder({
  ladder,
  editable,
}: {
  ladder: RoleLadderController;
  editable: boolean;
}): JSX.Element {
  const roles = ladder.data ?? [];
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<RoleView | null>(null);
  const [reassignTo, setReassignTo] = useState('');

  const run = (work: Promise<void>): void => {
    setBusy(true);
    setError(null);
    void work
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setBusy(false));
  };

  /**
   * Buttons rather than drag. `33` says "drag to reorder" and this is a deliberate,
   * recorded shortfall rather than an oversight: a keyboard-reachable move is what `26`
   * requires anyway, a drag surface would need it as a fallback, and two move buttons are
   * the fallback. The drag affordance is what is missing, not the capability.
   */
  const move = (index: number, delta: number): void => {
    const next = [...roles];
    const from = next[index];
    const to = next[index + delta];
    if (!from || !to) return;
    next[index] = to;
    next[index + delta] = from;
    run(ladder.reorder(next.map((role) => role.id)));
  };

  if (ladder.loading && roles.length === 0) {
    return <p className="text-muted">Loading roles…</p>;
  }

  return (
    <div className="role-ladder">
      <h2 className="panel-title">The ladder</h2>
      <p className="text-muted role-ladder-hint">
        The order is the ladder. A role’s level is simply where it sits here — moving a row
        renumbers it, and nothing in the product decides anything by comparing two numbers.
      </p>

      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="role-rows">
        {roles.map((role, index) => (
          <RoleRow
            key={role.id}
            name={role.name}
            level={role.level}
            total={roles.length}
            peopleCount={role.peopleCount}
            grantCount={role.grantCount}
            editable={editable}
            busy={busy}
            onRename={(name) => run(ladder.rename(role.id, name))}
            onMove={(direction) => move(index, direction)}
            // THE LOWEST ROLE CANNOT BE DELETED (33). Everyone who is not given a specific
            // role lands on it, so an org without one has "no role at all" as its floor,
            // which grants nothing and looks like a bug. Expressed as `undefined` rather
            // than a flag — 24 §4's rule: a disabled state the type system hands you.
            onDelete={
              index === roles.length - 1
                ? undefined
                : () => {
                    setReassignTo('');
                    setPending(role);
                  }
            }
          />
        ))}
      </div>

      {editable && (
        adding ? (
          <InlineName
            value=""
            autoFocus
            placeholder="Role name"
            ariaLabel="New role name"
            onCancel={() => setAdding(false)}
            onCommit={(name) => {
              setAdding(false);
              // A NEW ROLE HOLDS NOTHING. It arrives at the bottom of the ladder with an
              // empty column in the grid, because a role that silently inherited powers
              // would be the one thing this screen exists to make impossible.
              run(ladder.create(name));
            }}
          />
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
            <Icon name="add" size={16} /> Add a role
          </button>
        )
      )}

      {pending && (
        <ConfirmDialog
          title={`Delete ${pending.name}?`}
          // The consequence is about PEOPLE, not about a row. Deleting a held role moves
          // everybody who holds it, and how many is the number that decides the answer.
          consequence={
            pending.peopleCount === 0
              ? 'Nobody holds this role, so nothing moves.'
              : `${pluralise(pending.peopleCount, 'person', 'people')} hold this role and ` +
                'must be moved to another one. Their powers become that role’s powers.'
          }
          verb="Delete"
          destructive
          confirmDisabled={pending.peopleCount > 0 && reassignTo === ''}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const role = pending;
            setPending(null);
            run(ladder.remove(role.id, reassignTo || undefined));
          }}
        />
      )}

      {pending && pending.peopleCount > 0 && (
        <div className="role-reassign">
          <label htmlFor="role-reassign">Move them to</label>
          <select
            id="role-reassign"
            className="input"
            value={reassignTo}
            onChange={(event) => setReassignTo(event.target.value)}
          >
            <option value="">Choose a role…</option>
            {roles
              .filter((role) => role.id !== pending.id)
              .map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
          </select>
        </div>
      )}
    </div>
  );
}
