// The two inline dropdowns. 34 § Interactions: "Adding a position is two inline dropdowns,
// never a modal."
//
// A position is `Role — Unit`, and the UNIT HALF IS NEVER ABBREVIATED AWAY. It is what
// boxes the powers to the right place (INV-005), so a chip reading just "Dean" would hide
// the single most important behavioural detail in the model on the screen where somebody
// is deciding it.
import { useState } from 'react';
import type { ResolvedLabels, RoleView } from '@endur/shared';
import { Icon } from '../../../components/Icon.js';

export type PositionDraft = { roleId: string; unitId: string; isPrimary: boolean };

export function PositionEditor({
  roles,
  units,
  labels,
  busy,
  error,
  hasPositions,
  onAdd,
  onCancel,
}: {
  roles: RoleView[];
  units: Array<{ id: string; label: string }>;
  labels: ResolvedLabels;
  busy: boolean;
  error: string | null;
  /** Drives the primary checkbox's default — the first position is primary by definition. */
  hasPositions: boolean;
  onAdd: (draft: PositionDraft) => void;
  onCancel: () => void;
}): JSX.Element {
  const [roleId, setRoleId] = useState('');
  const [unitId, setUnitId] = useState('');
  // DEC-044 made this consequential rather than cosmetic: a per-person grant anchors at the
  // primary position's unit, and with two positions and none flagged there is no anchor at
  // all. So the first position a person gets is primary by default, and the checkbox is
  // visible from the second onwards rather than hidden as an advanced option.
  const [isPrimary, setIsPrimary] = useState(!hasPositions);

  const ready = roleId !== '' && unitId !== '';

  return (
    <form
      className="position-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) onAdd({ roleId, unitId, isPrimary });
      }}
    >
      <label className="sr-only" htmlFor="position-role">Role</label>
      <select
        id="position-role"
        className="input"
        value={roleId}
        disabled={busy}
        onChange={(event) => setRoleId(event.target.value)}
      >
        <option value="">Role…</option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>{role.name}</option>
        ))}
      </select>

      <span className="position-dash" aria-hidden="true">—</span>

      <label className="sr-only" htmlFor="position-unit">{labels.unit.one}</label>
      <select
        id="position-unit"
        className="input"
        value={unitId}
        disabled={busy}
        onChange={(event) => setUnitId(event.target.value)}
      >
        <option value="">{labels.unit.one}…</option>
        {units.map((unit) => (
          <option key={unit.id} value={unit.id}>{unit.label}</option>
        ))}
      </select>

      {hasPositions && (
        <label className="position-primary">
          <input
            type="checkbox"
            checked={isPrimary}
            disabled={busy}
            onChange={(event) => setIsPrimary(event.target.checked)}
          />
          Primary
        </label>
      )}

      <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
        Cancel
      </button>

      {error && (
        // Inline, never a toast (24 §6). A refusal here is usually INV-012's
        // `WOULD_ESCALATE`, whose whole value is the sentence naming the capability — a
        // toast would take it away after four seconds.
        <p className="field-error position-error" role="alert">{error}</p>
      )}
    </form>
  );
}

/** `Role — Unit`, the only rendering of a position anywhere. 34 § Interactions. */
export function PositionChip({
  roleName,
  unitName,
  isPrimary,
  onRemove,
}: {
  roleName: string;
  unitName: string;
  isPrimary: boolean;
  onRemove?: (() => void) | undefined;
}): JSX.Element {
  return (
    <span className={`position-chip${isPrimary ? ' is-primary' : ''}`}>
      <span className="position-role">{roleName}</span>
      <span className="position-dash" aria-hidden="true">—</span>
      <span className="position-unit">{unitName}</span>
      {isPrimary && <span className="tag tag-neutral">Primary</span>}
      {onRemove && (
        <button
          type="button"
          className="position-remove"
          aria-label={`Remove ${roleName} — ${unitName}`}
          onClick={onRemove}
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </span>
  );
}
