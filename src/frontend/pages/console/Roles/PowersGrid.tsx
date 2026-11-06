import { useMemo, useState } from 'react';
import type {
  CapabilityMeta, GrantCell, GrantChoice, GrantWarning, RoleView,
} from '@endur/shared';
import { GRANT_CHOICES, choiceWord, describeCell, describeChoice } from '@endur/shared';
import { Icon } from '../../../components/Icon.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { useLabels } from '../../../lib/labels.js';
import { cellKey, choiceOf, type GridController } from '../../../lib/roles.js';

const WEIGHT: Record<string, number> = { self: 1, own_unit: 2, subtree: 3, all: 4 };

const weightOf = (choice: GrantChoice): number =>
  choice === null || choice === 'blocked' ? 0 : (WEIGHT[choice] ?? 0);

/** A power with no route behind it yet: listed, never grantable. */
const isSoon = (entry: CapabilityMeta): boolean => entry.phase === 'P3';

export function PowersGrid({ grid, editable, myRoleIds }: {
  grid: GridController;
  editable: boolean;
  myRoleIds: string[];
}): JSX.Element {
  const labels = useLabels();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
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

  const losingOwnGrid =
    myRoleIds.length > 0 &&
    myRoleIds.some((id) => grid.savedCells.get(cellKey(id, 'grant.update'))?.effect === 'allow') &&
    !myRoleIds.some((id) => state?.cells.get(cellKey(id, 'grant.update'))?.effect === 'allow');

  if (grid.loading && !state) return <p className="text-muted">Loading the grid…</p>;
  if (grid.error) return <p className="field-error" role="alert">{grid.error.message}</p>;
  if (!state) return <p className="text-muted">Nothing to show.</p>;

  // Each heading opens and closes ITS OWN group. It used to be "open = nothing chosen, or
  // chosen", so the first click on a heading that looked open closed every OTHER group.
  const toggleModule = (name: string): void => {
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const allClosed = modules.length > 0 && modules.every(([name]) => closed.has(name));

  // A search shows every matching power, whatever is collapsed. A group whose own name
  // matches shows all of its powers.
  const needle = query.trim().toLowerCase();
  const shown = modules
    .map(([name, entries]) => ({
      name,
      entries,
      matching: needle === '' || name.toLowerCase().includes(needle)
        ? entries
        : entries.filter((entry) => entry.label.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.matching.length > 0);

  const cellCh = Math.max(...GRANT_CHOICES.map((choice) => choiceWord(choice, labels).length));

  const grantedBy = new Map<string, number>();
  for (const role of state.roles) {
    let held = 0;
    for (const entry of state.catalogue) {
      const cell = state.cells.get(cellKey(role.id, entry.key));
      if (cell && cell.effect === 'allow') held += 1;
    }
    grantedBy.set(role.id, held);
  }

  return (
    <div className="powers">
      <h2 className="panel-title">Who may do what</h2>
      <div className="powers-bar">
        <p className="text-muted powers-hint">
          {editable ? (
            <>
              Every box is a dropdown: pick <strong>how far</strong> that role may take that
              power. Point at a row for <strong>Set all…</strong> to give every role the same.
              Nothing is saved until you press <strong>Save changes</strong>.
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
                className={`powers-chip${tone(choice)}`}
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
        <p className="field-error powers-error" role="alert">{grid.saveError}</p>
      )}

      <div className="powers-tools">
        <label className="sr-only" htmlFor="powers-search">Find a power</label>
        <input
          id="powers-search"
          type="search"
          className="input powers-search"
          placeholder="Find a power…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="btn btn-ghost"
          disabled={needle !== ''}
          onClick={() => setClosed(allClosed ? new Set() : new Set(modules.map(([name]) => name)))}
        >
          {allClosed ? 'Expand all' : 'Collapse all'}
        </button>
      </div>

      {/* Its OWN scrolling container, so the page body never scrolls sideways. 64 rows by
          n roles does not fit a phone and is not meant to — 33 asks for a grid that scrolls,
          not a grid that collapses, because a matrix with its columns stacked is a list. */}
      <div className="powers-scroll">
        <table className="powers-table" style={{ ['--cell-ch' as string]: cellCh }}>
          <thead>
            <tr>
              <th scope="col" className="powers-corner">Power</th>
              {state.roles.map((role) => (
                <th
                  key={role.id}
                  scope="col"
                  className="powers-role"
                  title={`${role.name} is ${ordinal(role.level)} in the list of roles. The order decides who is shown above whom — it never decides what a role can do. That is this grid.`}
                >
                  <span className="powers-role-name">{role.name}</span>
                  <span className="powers-role-level text-muted">
                    {ordinal(role.level)} in the list
                  </span>
                  <span className="powers-role-count text-muted">
                    {grantedBy.get(role.id) ?? 0} of {state.catalogue.length} powers
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          {shown.map(({ name: moduleName, entries, matching }) => {
            const open = needle !== '' || !closed.has(moduleName);
            return (
              <tbody key={moduleName}>
                <tr className="powers-group">
                  <th scope="rowgroup" className="powers-group-head">
                    <button
                      type="button"
                      className="powers-group-toggle"
                      aria-expanded={open}
                      disabled={needle !== ''}
                      onClick={() => toggleModule(moduleName)}
                    >
                      <Icon name="chevron" size={16} className={open ? '' : 'flip-right'} />
                      {moduleName}
                      {' · '}
                      {entries.length} power{entries.length === 1 ? '' : 's'}
                    </button>
                  </th>
                  {/* THE GROUP IN ONE LINE PER ROLE. Open or closed, the heading says how
                      much of this group each role holds, so the grid can be read a group at
                      a time instead of a power at a time. */}
                  {state.roles.map((role) => (
                    <GroupSummary
                      key={role.id}
                      role={role}
                      moduleName={moduleName}
                      entries={entries}
                      cells={state.cells}
                    />
                  ))}
                </tr>

                {open && matching.map((entry) => (
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

          {shown.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={state.roles.length + 1} className="powers-empty text-muted">
                  No power matches “{query.trim()}”.
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}

function GroupSummary({ role, moduleName, entries, cells }: {
  role: RoleView;
  moduleName: string;
  entries: CapabilityMeta[];
  cells: Map<string, GrantCell>;
}): JSX.Element {
  const grantable = entries.filter((entry) => !isSoon(entry));
  let held = 0;
  let blocked = 0;
  for (const entry of grantable) {
    const effect = cells.get(cellKey(role.id, entry.key))?.effect;
    if (effect === 'allow') held += 1;
    else if (effect === 'deny') blocked += 1;
  }

  const of = grantable.length;
  const level = of === 0 ? 'soon' : held === of ? 'all' : held === 0 ? 'none' : 'some';
  const word = { soon: 'Soon', all: 'All', none: 'None', some: `${held} of ${of}` }[level];
  const title = of === 0
    ? `Nothing in ${moduleName} can be given to anybody yet.`
    : `${role.name} holds ${held} of the ${of} powers in ${moduleName}` +
      `${blocked > 0 ? `, and is blocked from ${blocked}` : ''}.`;

  return (
    <td className="powers-group-sum" data-level={level} title={title}>
      {word}
      {blocked > 0 && <span className="powers-group-blocked"> · {blocked} blocked</span>}
    </td>
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

  const orphan = roles.every((role) => {
    const cell = cells.get(cellKey(role.id, entry.key));
    return !cell || cell.effect === 'deny';
  });

  const soon = isSoon(entry);

  return (
    <tr className={`powers-row${orphan ? ' is-orphan' : ''}${soon ? ' is-soon' : ''}`}>
      <th scope="row" className="powers-capability">
        <span className="powers-capability-inner">
          <span className="powers-capability-label">
            {entry.label}
            {soon && (
              <span
                className="tag tag-neutral powers-soon"
                title={`“${entry.label}” is not built yet. It is listed so you can see what is coming and where it will sit; it cannot be given to anybody until it exists.`}
              >
                Soon
              </span>
            )}
          </span>
          {editable && !soon && (
            <ChoicePicker
              className="powers-all"
              value={null}
              placeholder="Set all…"
              ariaLabel={`Set “${entry.label}” for every role at once`}
              onChoose={(choice) => grid.fillRow(entry.key, choice)}
            />
          )}
        </span>
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
            {editable && !soon ? (
              <ChoicePicker
                className={`powers-cell${tone(choice)}${warnings.length ? ' has-warning' : ''}`}
                style={{ ['--weight' as string]: weightOf(choice) }}
                value={choice}
                ariaLabel={sentence}
                title={sentence}
                onChoose={(next) => grid.setCell(role.id, entry.key, next)}
              />
            ) : (
              <span
                className={`powers-chip${tone(choice)}${warnings.length ? ' has-warning' : ''}`}
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

function ChoicePicker({
  value, onChoose, ariaLabel, className, style, title, placeholder,
}: {
  value: GrantChoice;
  onChoose: (choice: GrantChoice) => void;
  ariaLabel: string;
  className: string;
  style?: Record<string, string | number>;
  title?: string;
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

const keyOf = (choice: GrantChoice): string => (choice === null ? 'none' : choice);

/** "No" recedes so the powers a role DOES hold are what the eye lands on; a block stands out. */
const tone = (choice: GrantChoice): string =>
  choice === null ? ' is-none' : choice === 'blocked' ? ' is-denied' : '';
