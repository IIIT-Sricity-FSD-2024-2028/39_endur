// Step 2 — roles. 31 § Interactions, design_specs/design/03 §3.4.
//
// Two things carry this screen. The level number is DERIVED from row order and renumbers
// live. The "Sees…" column is GENERATED, and it is the answer to "how do permissions
// work?" — the visibility rule in plain English, per row, moving as the rows move.
import { useState } from 'react';
import { RoleRow } from '../../../../components/org/RoleRow.js';
import { Icon } from '../../../../components/Icon.js';
import type { RoleDraft } from '../useWizard.js';

export function RolesStep({
  roles,
  onRename,
  onDelete,
  onAdd,
  onMove,
  onReorder,
}: {
  roles: RoleDraft[];
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => string;
  onMove: (id: string, direction: -1 | 1) => void;
  onReorder: (fromId: string, toId: string) => void;
}): JSX.Element {
  const [dragId, setDragId] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  return (
    <div className="step">
      <h2 className="step-title">Who&rsquo;s in this organization?</h2>
      <p className="step-lede">
        Level 1 is the top. People see data for anyone below their level, inside their part
        of the organization.
      </p>

      <ul className="role-list">
        {roles.map((role, index) => (
          <li
            key={role.id}
            draggable
            onDragStart={() => setDragId(role.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragId && dragId !== role.id) onReorder(dragId, role.id);
              setDragId(null);
            }}
            className={dragId === role.id ? 'is-dragging' : undefined}
          >
            <RoleRow
              name={role.name}
              level={index + 1}
              total={roles.length}
              autoFocus={lastAdded === role.id}
              onRename={(name) => onRename(role.id, name)}
              // Two roles is the floor, and the bottom row is never removable: somebody
              // has to be at the bottom, and an org whose most junior role can be deleted
              // has nobody left to answer a form.
              onDelete={
                roles.length > 2 && index !== roles.length - 1
                  ? () => onDelete(role.id)
                  : undefined
              }
              onMove={(direction) => onMove(role.id, direction)}
            />
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn btn-ghost role-add"
        disabled={roles.length >= 12}
        // The new row goes second-from-bottom and focus follows it, so the next keystroke
        // is the name. `RoleRow` selects the placeholder text, so typing replaces it.
        onClick={() => setLastAdded(onAdd())}
      >
        <Icon name="add" size={16} /> Add a role
      </button>
    </div>
  );
}
