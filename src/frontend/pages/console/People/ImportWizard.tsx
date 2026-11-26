// The CSV import. Its steps, the mappings and the server's answers are `state.people.import`
// (store/screens/people.ts); reading the file and committing it are thunks there. The `File`
// itself never enters the store: it is the read thunk's argument, and only its text is kept.
import { useMemo } from 'react';
import type { ImportPreview } from '@endur/shared';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { useUnits } from '../../../lib/units.js';
import { flattenUnits } from '../../../lib/tree.js';
import { useRoles } from '../../../lib/roles.js';
import { pluralise } from '../../../lib/format.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { messageOf } from '../../../store/screens/common.js';
import {
  importCommitted,
  importFileRead,
  importRestarted,
  importRoleMapped,
  importUnitMapped,
  selectImport,
} from '../../../store/screens/people.js';

export function ImportWizard({ onClose }: { onClose: () => void }): JSX.Element | null {
  const labels = useLabels();
  const can = useCan();
  const units = useUnits();
  const roles = useRoles();
  const unitOptions = useMemo(() => flattenUnits(units.data ?? []), [units.data]);
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectImport);

  if (!state) return null;
  const step = state;
  const { roleMapping, unitMapping } = state;
  const readFile = (file: File): void => {
    void dispatch(importFileRead(file));
  };

  if (!can('person.import')) {
    return (
      <div className="dialog-backdrop" onMouseDown={onClose}>
        <div className="dialog" role="dialog" aria-modal="true" aria-label="Import" onMouseDown={(e) => e.stopPropagation()}>
          <h2 className="dialog-title">Import</h2>
          <p className="dialog-body">You no longer hold the capability to import people.</p>
          <div className="dialog-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-backdrop" onMouseDown={step.step === 'committing' ? undefined : onClose}>
      <div
        className="dialog import-wizard"
        role="dialog"
        aria-modal="true"
        aria-label="Import people"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="dialog-title">Import people</h2>

        {(step.step === 'pick' || step.step === 'reading') && (
          <>
            <p className="dialog-body">
              A CSV with a name and an email column, and optionally a role and a{' '}
              {labels.unit.one.toLowerCase()} column. Unrecognised role or{' '}
              {labels.unit.one.toLowerCase()} names are resolved on the next screen — nothing
              is invented.
            </p>
            <p className="dialog-body">
              An <strong>Also in</strong> column puts the same person in a second{' '}
              {labels.unit.one.toLowerCase()} as well — someone who belongs in two places at
              once, which is what makes both of their audiences reach them.
            </p>
            <div className="field">
              <label htmlFor="import-file">CSV file</label>
              <input
                id="import-file"
                className="input"
                type="file"
                accept=".csv,text/csv"
                disabled={step.step === 'reading'}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) readFile(file);
                }}
              />
            </div>
            {/* Said here, beside the picker, rather than in a browser alert box. */}
            {step.readError && <p className="form-error" role="alert">{step.readError}</p>}
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {(step.step === 'review' || step.step === 'committing') && step.preview && (
          <ReviewStep
            preview={step.preview}
            roles={roles.data ?? []}
            units={unitOptions}
            roleMapping={roleMapping}
            unitMapping={unitMapping}
            onMapRole={(name, id) => dispatch(importRoleMapped({ name, roleId: id }))}
            onMapUnit={(name, id) => dispatch(importUnitMapped({ name, unitId: id }))}
            unitLabel={labels.unit.one}
            error={step.step === 'review' ? messageOf(step.error, 'That import could not be committed.') : null}
            busy={step.step === 'committing'}
            onBack={() => dispatch(importRestarted())}
            onCommit={() => void dispatch(importCommitted())}
          />
        )}

        {step.step === 'done' && step.result && (
          <>
            <p className="dialog-body">
              {pluralise(step.result.created, 'person', 'people')} added,{' '}
              {step.result.updated} updated, {step.result.assigned} given a position.
            </p>
            {step.result.skipped.length > 0 && (
              <p className="field-error" role="alert">
                {pluralise(step.result.skipped.length, 'row', 'rows')} skipped — no role or{' '}
                {labels.unit.one.toLowerCase()} could be resolved for:{' '}
                {step.result.skipped.join(', ')}
              </p>
            )}
            <div className="dialog-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReviewStep({
  preview,
  roles,
  units,
  roleMapping,
  unitMapping,
  onMapRole,
  onMapUnit,
  unitLabel,
  error,
  busy,
  onBack,
  onCommit,
}: {
  preview: ImportPreview;
  roles: Array<{ id: string; name: string }>;
  units: Array<{ id: string; label: string }>;
  roleMapping: Record<string, string>;
  unitMapping: Record<string, string>;
  onMapRole: (name: string, id: string) => void;
  onMapUnit: (name: string, id: string) => void;
  unitLabel: string;
  error: string | null;
  busy: boolean;
  onBack: () => void;
  onCommit: () => void;
}): JSX.Element {
  const unresolved =
    preview.unmatchedRoles.some((name) => !roleMapping[name]) ||
    preview.unmatchedUnits.some((name) => !unitMapping[name]);

  return (
    <>
      <p className="dialog-body">
        {pluralise(preview.rowCount, 'row', 'rows')} found, columns:{' '}
        {preview.columns.join(', ') || '—'}.
      </p>

      {preview.sample.length > 0 && (
        <table className="import-sample">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>{unitLabel}</th><th>Also in</th></tr>
          </thead>
          <tbody>
            {preview.sample.map((row) => (
              <tr key={row.email}>
                <td>{row.name}</td>
                <td>{row.email}</td>
                <td>{row.roleName ?? '—'}</td>
                <td>{row.unitName ?? '—'}</td>
                <td>{row.alsoUnitName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {preview.unmatchedRoles.length > 0 && (
        <div className="field">
          <label>Roles this organization does not have</label>
          {preview.unmatchedRoles.map((name) => (
            <div className="import-mapping-row" key={name}>
              <span>{name}</span>
              <select
                className="input"
                value={roleMapping[name] ?? ''}
                onChange={(event) => onMapRole(name, event.target.value)}
              >
                <option value="">Skip this role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {preview.unmatchedUnits.length > 0 && (
        <div className="field">
          <label>{unitLabel} names this organization does not have</label>
          {preview.unmatchedUnits.map((name) => (
            <div className="import-mapping-row" key={name}>
              <span>{name}</span>
              <select
                className="input"
                value={unitMapping[name] ?? ''}
                onChange={(event) => onMapUnit(name, event.target.value)}
              >
                <option value="">{`Skip this ${unitLabel.toLowerCase()}`}</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {preview.existingEmails.length > 0 && (
        <p className="field-help">
          {pluralise(preview.existingEmails.length, 'address', 'addresses')} already exist —
          those rows update the existing person rather than duplicating them.
        </p>
      )}

      {unresolved && (preview.unmatchedRoles.length > 0 || preview.unmatchedUnits.length > 0) && (
        <p className="field-help">
          A name left as "Skip" is imported with no position for that row.
        </p>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack} disabled={busy}>Back</button>
        <button type="button" className="btn btn-primary" onClick={onCommit} disabled={busy}>
          {busy ? 'Importing…' : `Import ${pluralise(preview.rowCount, 'person', 'people')}`}
        </button>
      </div>
    </>
  );
}
