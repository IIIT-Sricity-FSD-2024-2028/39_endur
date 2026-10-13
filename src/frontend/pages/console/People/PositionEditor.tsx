import { useState } from 'react';
import type { ResolvedLabels, RoleView } from '@endur/shared';
import { Icon } from '../../../components/Icon.js';
import { formatDate } from '../../../lib/format.js';

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
  hasPositions: boolean;
  onAdd: (draft: PositionDraft) => void;
  onCancel: () => void;
}): JSX.Element {
  const [roleId, setRoleId] = useState('');
  const [unitId, setUnitId] = useState('');
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
        <p className="field-error position-error" role="alert">{error}</p>
      )}
    </form>
  );
}

export function PositionChip({
  roleName,
  roleLevel,
  unitName,
  isPrimary,
  validTo,
  onRemove,
}: {
  roleName: string;
  roleLevel?: number | null | undefined;
  unitName: string;
  isPrimary: boolean;
  validTo?: string | null | undefined;
  onRemove?: (() => void) | undefined;
}): JSX.Element {
  return (
    <span className={`position-chip${isPrimary ? ' is-primary' : ''}`}>
      <span className="position-role">{roleName}</span>
      {roleLevel !== null && roleLevel !== undefined && (
        <span className="position-level" title={`Level ${roleLevel}`}>L{roleLevel}</span>
      )}
      <span className="position-dash" aria-hidden="true">—</span>
      <span className="position-unit">{unitName}</span>
      {isPrimary && <span className="tag tag-neutral">Primary</span>}
      {validTo && (
        <span className="tag tag-neutral position-until">Until {formatDate(validTo)}</span>
      )}
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
