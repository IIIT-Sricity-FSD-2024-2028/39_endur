// The powers grid. 33 § "Interactions — the powers grid", rewritten for plain language by
// `DEC-076`.
//
// THE ARGUMENT FOR A GRID OVER A LIST OF PERMISSIONS is that mistakes become VISIBLE rather
// than discoverable. An over-granted role is a visibly dark column; a capability nobody
// holds is a visibly empty row. Neither is something you go looking for — they are things
// you cannot help seeing, and that is the whole design.
//
// WHAT `DEC-076` CHANGED, and why it is the same argument: a grid can only make a mistake
// visible if the reader can read it. The cells said `self`, `unit`, `tree`, `all` — `tree`
// being the shape of the data structure the scope walks, which is not a word anybody outside
// this repository has ever used for "and everything under it" — and the only way to change
// one was to click it repeatedly and watch what happened. Now a cell is a phrase in the
// organisation's own words (`scope-labels.ts`), and changing one is picking from a list of
// six named choices. Nothing about what the grid MEANS moved; the whole change is that it
// says it out loud.
//
// Colour intensity still tracks SCOPE WIDTH, not "is there a grant here". A grid where every
// filled cell looked the same would answer "who has this" and lose "how far", which is the
// half that actually decides what somebody can reach (INV-005).
import { useMemo, useState } from 'react';
import type {
  CapabilityMeta, GrantCell, GrantChoice, GrantWarning, RoleView,
} from '@endur/shared';
import { GRANT_CHOICES, choiceWord, describeCell, describeChoice } from '@endur/shared';
import { Icon } from '../../../components/Icon.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { useLabels } from '../../../lib/labels.js';
import { cellKey, choiceOf, type GridController } from '../../../lib/roles.js';

/** Width, not identity — 0 is an empty cell and 4 is `all`. Drives the CSS custom property. */
const WEIGHT: Record<string, number> = { self: 1, own_unit: 2, subtree: 3, all: 4 };

const weightOf = (choice: GrantChoice): number =>
  choice === null || choice === 'blocked' ? 0 : (WEIGHT[choice] ?? 0);

export function PowersGrid({ grid, editable, myRoleIds }: {
  grid: GridController;
  editable: boolean;
  /** The roles the READER holds, for the self-lockout prompt below. */
  myRoleIds: string[];
}): JSX.Element {
  const labels = useLabels();
  const [openModules, setOpenModules] = useState<Set<string>>(new Set());
  const [copyFrom, setCopyFrom] = useState('');
  const [copyTo, setCopyTo] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
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

  const roleName = (id: string): string =>
    state.roles.find((role) => role.id === id)?.name ?? 'that role';

  return (
    <div className="powers">
      <div className="powers-bar">
        <p className="text-muted powers-hint">
          {editable ? (
            <>
              Every box is a dropdown: pick <strong>how far</strong> that role may take that
              power. Nothing is saved until you press <strong>Save changes</strong>.
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

      {/* THE LEGEND IS NOT DECORATION (`DEC-076`). Six words carry every cell on the screen,
          and one of them — a block — behaves unlike the other five. Somebody meeting this
          page for the first time should not have to hover over a cell to find that out. */}
      <dl className="powers-legend">
        {GRANT_CHOICES.map((choice) => (
          <div key={String(choice)} className="powers-legend-item">
            <dt>
              <span
                className={`powers-chip${choice === 'blocked' ? ' is-denied' : ''}`}
                style={{ ['--weight' as string]: weightOf(choice) }}
              >
                {choiceWord(choice, labels)}
              </span>
            </dt>
            <dd>{describeChoice(choice, labels)}</dd>
          </div>
        ))}
      </dl>

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
        // TWO DROPDOWNS AND A BUTTON, not a sentence made of buttons. What stood here was
        // "Copy a whole role's powers · From… · onto · [Manager] [Staff] [Guest]", where the
        // role buttons WERE the action — a row of things that look like navigation and
        // rewrite a whole column when pressed.
        <div className="powers-copy">
          <label htmlFor="powers-copy-from">Copy every power from</label>
          <select
            id="powers-copy-from"
            className="input"
            value={copyFrom}
            onChange={(event) => {
              setCopyFrom(event.target.value);
              setCopied(null);
            }}
          >
            <option value="">Choose a role…</option>
            {state.roles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
          <label htmlFor="powers-copy-to">onto</label>
          <select
            id="powers-copy-to"
            className="input"
            value={copyTo}
            onChange={(event) => {
              setCopyTo(event.target.value);
              setCopied(null);
            }}
          >
            <option value="">Choose a role…</option>
            {state.roles.map((role) => (
              <option key={role.id} value={role.id} disabled={role.id === copyFrom}>
                {role.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            disabled={copyFrom === '' || copyTo === '' || copyFrom === copyTo}
            onClick={() => {
              grid.copyColumn(copyFrom, copyTo);
              setCopied(`Copied ${roleName(copyFrom)}’s powers onto ${roleName(copyTo)}. Nothing is saved yet — press Save changes, or Undo.`);
            }}
          >
            Copy
          </button>
          {copied && <span className="powers-copied" role="status">{copied}</span>}
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
                <th
                  key={role.id}
                  scope="col"
                  className="powers-role"
                  // THE MISCONCEPTION THIS TITLE EXISTS TO KILL: that a lower number means
                  // more power. It does not, and never has (DEC-002) — the number is the
                  // role's place in the list, and THIS GRID is where power comes from.
                  title={`${role.name} is ${ordinal(role.level)} in the list of roles. The order decides who is shown above whom — it never decides what a role can do. That is this grid.`}
                >
                  <span className="powers-role-name">{role.name}</span>
                  <span className="powers-role-level text-muted">
                    {ordinal(role.level)} in the list
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          {modules.map(([moduleName, entries]) => {
            const open = openModules.size === 0 || openModules.has(moduleName);
            return (
              <tbody key={moduleName}>
                <tr className="powers-group">
                  <th scope="colgroup" colSpan={state.roles.length + 1}>
                    <button
                      type="button"
                      className="powers-group-toggle"
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

const ordinal = (n: number): string => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th'
    : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
};

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
  const labels = useLabels();

  // An ORPHAN ROW — nobody at all can do this — is a state you should not have to look for.
  const orphan = roles.every((role) => {
    const cell = cells.get(cellKey(role.id, entry.key));
    return !cell || cell.effect === 'deny';
  });

  return (
    <tr className={`powers-row${orphan ? ' is-orphan' : ''}`}>
      <th scope="row" className="powers-capability">
        <span className="powers-capability-label">{entry.label}</span>
        {entry.phase === 'P3' && <span className="tag tag-neutral powers-soon">Soon</span>}
        {editable && (
          // WAS A HIDDEN ACTION ON THE ROW LABEL — clicking the words "delete the entire
          // organisation" granted it to every role at once, with nothing on screen saying so.
          // Now it is the same dropdown as a cell, visibly labelled, sitting where a "set all
          // of these at once" control belongs.
          <ChoicePicker
            className="powers-all"
            value={null}
            placeholder="Set all…"
            ariaLabel={`Set “${entry.label}” for every role at once`}
            onChoose={(choice) => grid.fillRow(entry.key, choice)}
          />
        )}
        {rowWarnings.map((warning) => (
          <span key={warning.message} className="powers-warning" role="note">
            {warning.message}
          </span>
        ))}
      </th>

      {roles.map((role) => {
        const key = cellKey(role.id, entry.key);
        const choice = choiceOf(cells.get(key));
        const warnings = cellWarnings.get(key) ?? [];
        const sentence = describeCell(role.name, entry.label, choice, labels);

        return (
          <td key={role.id} className="powers-cell-wrap">
            {editable ? (
              <ChoicePicker
                className={`powers-cell${choice === 'blocked' ? ' is-denied' : ''}${warnings.length ? ' has-warning' : ''}`}
                style={{ ['--weight' as string]: weightOf(choice) }}
                value={choice}
                ariaLabel={sentence}
                title={sentence}
                onChoose={(next) => grid.setCell(role.id, entry.key, next)}
              />
            ) : (
              // Read-only is a FACT, not a disabled control (33 § States). A greyed-out
              // dropdown reads as "you are doing this wrong"; a plain chip reads as the rule
              // it is, which is what somebody without `grant.update` came here to see.
              <span
                className={`powers-chip${choice === 'blocked' ? ' is-denied' : ''}${warnings.length ? ' has-warning' : ''}`}
                style={{ ['--weight' as string]: weightOf(choice) }}
                title={sentence}
                aria-label={sentence}
              >
                {choiceWord(choice, labels)}
              </span>
            )}
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

/**
 * One cell, as a NATIVE SELECT. `DEC-076`.
 *
 * A custom popover would have needed its own focus trap, its own keyboard map and its own
 * escape from the grid's horizontal scroll container — which clips anything absolutely
 * positioned inside it. A `<select>` is rendered by the browser outside the page entirely:
 * it cannot be clipped, it works on a phone, it is already keyboard- and screen-reader-
 * correct, and every administrator alive has used one. The most intuitive control here is
 * the one nobody had to invent.
 */
function ChoicePicker({
  value, onChoose, ariaLabel, className, style, title, placeholder,
}: {
  value: GrantChoice;
  onChoose: (choice: GrantChoice) => void;
  ariaLabel: string;
  className: string;
  style?: Record<string, string | number>;
  title?: string;
  /** Only the row control has one: it shows an instruction rather than a current value. */
  placeholder?: string;
}): JSX.Element {
  const labels = useLabels();
  return (
    <select
      className={className}
      style={style}
      value={placeholder ? '' : keyOf(value)}
      aria-label={ariaLabel}
      {...(title ? { title } : {})}
      onChange={(event) => {
        const chosen = GRANT_CHOICES.find((choice) => keyOf(choice) === event.target.value);
        if (chosen !== undefined) onChoose(chosen);
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {GRANT_CHOICES.map((choice) => (
        <option key={keyOf(choice)} value={keyOf(choice)}>
          {choiceWord(choice, labels)}
        </option>
      ))}
    </select>
  );
}

/** `null` cannot be an option value, so the absent grant travels as the word it reads as. */
const keyOf = (choice: GrantChoice): string => (choice === null ? 'none' : choice);
