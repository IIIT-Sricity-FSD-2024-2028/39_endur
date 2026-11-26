// The ladder. Its dialogs and commands are `state.roles.ladder` (store/screens/roles.ts);
// adding, renaming, moving and deleting a role are thunks there.
import { InlineName } from '../../../components/org/InlineName.js';
import { RoleRow } from '../../../components/org/RoleRow.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { Icon } from '../../../components/Icon.js';
import { pluralise } from '../../../lib/format.js';
import type { RoleLadderController } from '../../../lib/roles.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { messageOf } from '../../../store/screens/common.js';
import {
  reassignChosen,
  roleAddClosed,
  roleAddOpened,
  roleAdded,
  roleDeleteAsked,
  roleDeleteDismissed,
  roleDeleted,
  roleRenamed,
  rolesReordered,
  selectLadder,
} from '../../../store/screens/roles.js';

export function RoleLadder({
  ladder,
  editable,
}: {
  ladder: RoleLadderController;
  editable: boolean;
}): JSX.Element {
  const roles = ladder.data ?? [];
  const dispatch = useAppDispatch();
  const { adding, busy, deletingId, reassignTo, ...rest } = useAppSelector(selectLadder);
  const error = messageOf(rest.error, 'That did not go through. Try again.');
  const pending = roles.find((role) => role.id === deletingId) ?? null;

  const move = (index: number, delta: number): void => {
    const next = [...roles];
    const from = next[index];
    const to = next[index + delta];
    if (!from || !to) return;
    next[index] = to;
    next[index + delta] = from;
    void dispatch(rolesReordered(next.map((role) => role.id)));
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
            onRename={(name) => void dispatch(roleRenamed({ roleId: role.id, name }))}
            onMove={(direction) => move(index, direction)}
            onDelete={
              index === roles.length - 1
                ? undefined
                : () => dispatch(roleDeleteAsked({ roleId: role.id }))
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
            onCancel={() => dispatch(roleAddClosed())}
            onCommit={(name) => void dispatch(roleAdded(name))}
          />
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => dispatch(roleAddOpened())}>
            <Icon name="add" size={16} /> Add a role
          </button>
        )
      )}

      {pending && (
        <ConfirmDialog
          title={`Delete ${pending.name}?`}
          consequence={
            pending.peopleCount === 0
              ? 'Nobody holds this role, so nothing moves.'
              : `${pluralise(pending.peopleCount, 'person', 'people')} hold this role and ` +
                'must be moved to another one. Their powers become that role’s powers.'
          }
          verb="Delete"
          destructive
          confirmDisabled={pending.peopleCount > 0 && reassignTo === ''}
          onCancel={() => dispatch(roleDeleteDismissed())}
          onConfirm={() =>
            void dispatch(roleDeleted({ roleId: pending.id, reassignTo: reassignTo || undefined }))
          }
        />
      )}

      {pending && pending.peopleCount > 0 && (
        <div className="role-reassign">
          <label htmlFor="role-reassign">Move them to</label>
          <select
            id="role-reassign"
            className="input"
            value={reassignTo}
            onChange={(event) => dispatch(reassignChosen({ roleId: event.target.value }))}
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
