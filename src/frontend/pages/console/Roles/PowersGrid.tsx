// The powers grid. 33 § "Interactions — the powers grid".
//
// THE ARGUMENT FOR A GRID OVER A LIST OF PERMISSIONS is that mistakes become VISIBLE rather
// than discoverable. An over-granted role is a visibly dark column; a capability nobody
// holds is a visibly empty row. Neither is something you go looking for — they are things
// you cannot help seeing, and that is the whole design.
//
// Colour intensity therefore tracks SCOPE WIDTH, not "is there a grant here". A grid where
// every filled cell looked the same would answer "who has this" and lose "how far", which is
// the half that actually decides what somebody can reach (INV-005).
import { useMemo, useState } from 'react';
import type { CapabilityMeta, GrantCell, GrantWarning, RoleView, Scope } from '@endur/shared';
import { Icon } from '../../../components/Icon.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { cellKey, type GridController } from '../../../lib/roles.js';

/** Width, not identity — 0 is an empty cell and 4 is `all`. Drives the CSS custom property. */
const WEIGHT: Record<Scope, number> = { self: 1, own_unit: 2, subtree: 3, all: 4 };

/** What a cell says when it is not empty. Short, because there are 64 rows of them. */
const SHORT: Record<Scope, string> = {
  self: 'self', own_unit: 'unit', subtree: 'tree', all: 'all',
};

const LONG: Record<Scope, string> = {
  self: 'only their own',
  own_unit: 'their own unit',
  subtree: 'their unit and everything under it',
  all: 'the whole organisation',
};

export function PowersGrid({ grid, editable, myRoleIds }: {
  grid: GridController;
  editable: boolean;
  /** The roles the READER holds, for the self-lockout prompt below. */
  myRoleIds: string[];
}): JSX.Element {
  const [openModules, setOpenModules] = useState<Set<string>>(new Set());
  const [copyFrom, setCopyFrom] = useState('');
  const [confirming, setConfirming] = useState(false);

  const state = grid.state;

  const modules = useMemo(() => {
    const groups = new Map<string, CapabilityMeta[]>();
    for (const entry of state?.catalogue ?? []) {
      const list = groups.get(entry.module) ?? [];
      list.push(entry);
      groups.set(entry.module, list);
    }
    return [...groups];
  }, [state?.catalogue]);

  /** Warnings are rendered AT THE SITE OF THE PROBLEM, never as a list at the bottom (33). */
  const warningsFor = useMemo(() => {
    const byCell = new Map<string, GrantWarning[]>();
    const byRow = new Map<string, GrantWarning[]>();
    for (const warning of state?.warnings ?? []) {
      if (warning.roleId && warning.capability) {
        const key = cellKey(warning.roleId, warning.capability);
        byCell.set(key, [...(byCell.get(key) ?? []), warning]);
      } else if (warning.capability) {
        byRow.set(warning.capability, [...(byRow.get(warning.capability) ?? []), warning]);
      }
    }
    return { byCell, byRow };
  }, [state?.warnings]);

  /**
   * THE SECOND HALF OF 33 § "The lockout guard", and the half the server cannot do.
   *
   * The server refuses a matrix where NOBODY holds `grant.update` — that is unrecoverable
   * and gets a `409`. Handing the grid to somebody else and keeping none for yourself is a
   * different thing: perfectly legal, occasionally exactly what you meant, and still a
   * one-way door for the person pressing the button. Only the client knows which roles the
   * reader holds, so only the client can ask.
   *
   * Asked BEFORE the request, not after a failure, because there is no failure to react to.
   */
  const losingOwnGrid =
    myRoleIds.length > 0 &&
    myRoleIds.some((id) => grid.savedCells.get(cellKey(id, 'grant.update'))?.effect === 'allow') &&
    !myRoleIds.some((id) => state?.cells.get(cellKey(id, 'grant.update'))?.effect === 'allow');

  if (grid.loading && !state) return <p className="text-muted">Loading the grid…</p>;
  if (grid.error) return <p className="field-error" role="alert">{grid.error.message}</p>;
  if (!state) return <p className="text-muted">Nothing to show.</p>;

  const toggleModule = (name: string): void => {
    setOpenModules((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="powers">
      <div className="powers-bar">
        <p className="text-muted powers-hint">
          {editable ? (
            <>
              Click a cell to widen how far it reaches. <strong>Shift-click</strong> to block
              it outright — a block beats every allow, from any role, group or stand-in.
            </>
          ) : (
            'You can read this grid but not change it. Nothing here is hidden from you.'
          )}
        </p>

        {editable && (
          <div className="powers-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!grid.canUndo || grid.saving}
              onClick={grid.undo}
            >
              Undo
            </button>
            <button
              type="button"
              className="btn btn-primary"
              // AN EXPLICIT SAVE, NOT AUTOSAVE (33 § State). Every other editable surface in
              // the product writes on blur; this is the one screen where the cost of an
              // accidental change is an organisation nobody can administer.
              disabled={!grid.dirty || grid.saving}
              onClick={() => {
                if (losingOwnGrid) setConfirming(true);
                else void grid.save();
              }}
            >
              {grid.saving ? 'Saving…' : grid.dirty ? 'Save changes' : 'Saved'}
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title="You will not be able to edit powers after this"
          consequence={
            'This save takes “change what every role is allowed to do” away from the role ' +
            'you hold. Somebody with another role will have to give it back, and you cannot ' +
            'undo it yourself.'
          }
          verb="Save anyway"
          destructive
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void grid.save();
          }}
        />
      )}

      {grid.saveError && (
        // ONE LINE ABOVE THE GRID, and the working copy is still on screen behind it
        // (33 § States). A refusal here is the lockout guard or WOULD_ESCALATE, and both are
        // sentences the administrator has to act on — clearing their edits would make the
        // message unusable.
        <p className="field-error powers-error" role="alert">{grid.saveError}</p>
      )}

      {editable && (
        <div className="powers-copy">
          <label htmlFor="powers-copy-from">Copy a whole role’s powers</label>
          <select
            id="powers-copy-from"
            className="input"
            value={copyFrom}
            onChange={(event) => setCopyFrom(event.target.value)}
          >
            <option value="">From…</option>
            {state.roles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
          <span className="text-muted">onto</span>
          {state.roles.map((role) => (
            <button
              key={role.id}
              type="button"
              className="btn btn-ghost btn-small"
              disabled={copyFrom === '' || copyFrom === role.id}
              onClick={() => grid.copyColumn(copyFrom, role.id)}
            >
              {role.name}
            </button>
          ))}
        </div>
      )}

      {/* Its OWN scrolling container, so the page body never scrolls sideways. 64 rows by
          n roles does not fit a phone and is not meant to — 33 asks for a grid that scrolls,
          not a grid that collapses, because a matrix with its columns stacked is a list. */}
      <div className="powers-scroll">
        <table className="powers-table">
          <thead>
            <tr>
              <th scope="col" className="powers-corner">Power</th>
              {state.roles.map((role) => (
                <th key={role.id} scope="col" className="powers-role">
                  <span className="powers-role-name">{role.name}</span>
                  <span className="powers-role-level text-muted">L{role.level}</span>
                </th>
              ))}
            </tr>
          </thead>

          {modules.map(([moduleName, entries]) => {
            const open = openModules.size === 0 || openModules.has(moduleName);
            return (
              <tbody key={moduleName}>
                <tr className="powers-module">
                  <th scope="colgroup" colSpan={state.roles.length + 1}>
                    <button
                      type="button"
                      className="powers-module-toggle"
                      aria-expanded={open}
                      onClick={() => toggleModule(moduleName)}
                    >
                      <Icon name="chevron" size={16} className={open ? '' : 'flip-right'} />
                      {moduleName}
                    </button>
                  </th>
                </tr>

                {open && entries.map((entry) => (
                  <Row
                    key={entry.key}
                    entry={entry}
                    roles={state.roles}
                    cells={state.cells}
                    editable={editable}
                    grid={grid}
                    rowWarnings={warningsFor.byRow.get(entry.key) ?? []}
                    cellWarnings={warningsFor.byCell}
                  />
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </div>
  );
}

function Row({
  entry, roles, cells, editable, grid, rowWarnings, cellWarnings,
}: {
  entry: CapabilityMeta;
  roles: RoleView[];
  cells: Map<string, GrantCell>;
  editable: boolean;
  grid: GridController;
  rowWarnings: GrantWarning[];
  cellWarnings: Map<string, GrantWarning[]>;
}): JSX.Element {
  // An ORPHAN ROW — nobody at all can do this — is a state you should not have to look for.
  const orphan = roles.every((role) => {
    const cell = cells.get(cellKey(role.id, entry.key));
    return !cell || cell.effect === 'deny';
  });

  return (
    <tr className={`powers-row${orphan ? ' is-orphan' : ''}`}>
      <th scope="row" className="powers-capability">
        {editable ? (
          <button
            type="button"
            className="powers-row-fill"
            // Grant to everyone, or take it from everyone (33 § Interactions). One click,
            // because the alternative on a 64-row grid is n clicks and a missed column.
            title={orphan ? 'Give this to every role' : 'Take this from every role'}
            onClick={() => grid.fillRow(entry.key, orphan ? 'own_unit' : null)}
          >
            {entry.label}
          </button>
        ) : (
          entry.label
        )}
        {entry.phase === 'P3' && <span className="tag tag-neutral powers-soon">Soon</span>}
        {rowWarnings.map((warning) => (
          <span key={warning.message} className="powers-warning" role="note">
            {warning.message}
          </span>
        ))}
      </th>

      {roles.map((role) => {
        const key = cellKey(role.id, entry.key);
        const cell = cells.get(key);
        const denied = cell?.effect === 'deny';
        const scope = cell?.scope ?? null;
        const warnings = cellWarnings.get(key) ?? [];

        const label = denied
          ? `${role.name}: blocked from “${entry.label}”`
          : scope
            ? `${role.name}: may ${entry.label} across ${LONG[scope]}`
            : `${role.name}: cannot ${entry.label}`;

        return (
          <td key={role.id} className="powers-cell-wrap">
            <button
              type="button"
              className={`powers-cell${denied ? ' is-denied' : ''}${warnings.length ? ' has-warning' : ''}`}
              style={{ ['--weight' as string]: denied ? 0 : scope ? WEIGHT[scope] : 0 }}
              aria-label={label}
              // The DENY tooltip carries the one resolution rule an administrator genuinely
              // benefits from knowing (33, INV-004). It is what makes a block on external
              // vendors safe even after somebody adds them to a committee.
              title={denied ? 'Blocked. A block always beats an allow, wherever the allow comes from.' : label}
              disabled={!editable}
              onClick={(event) => {
                if (event.shiftKey) grid.block(role.id, entry.key);
                else grid.cycle(role.id, entry.key);
              }}
            >
              {denied ? <Icon name="close" size={16} /> : scope ? SHORT[scope] : '—'}
            </button>
            {warnings.map((warning) => (
              <span key={warning.message} className="powers-warning" role="note">
                {warning.message}
              </span>
            ))}
          </td>
        );
      })}
    </tr>
  );
}
