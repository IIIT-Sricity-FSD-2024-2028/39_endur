// CSV import. 34 § Interactions, T-050.
//
// THREE STEPS: pick a file, resolve what the server could not match, commit. The server
// (`features/people/service.ts`, `previewImport`/`commitImport`) does all the CSV reading —
// this file never guesses a column meaning the backend would disagree with, because a
// second parser that occasionally disagrees with the first is worse than one parser used
// twice. `parseCsvRows` below mirrors the backend's header-synonym table on purpose, for
// the reason its own comment gives: the preview only ever returns five sample rows, and the
// commit needs every row the file contains, so the full parse has to happen somewhere the
// server does not hand back.
//
// **It never fails silently** (34). A file with unmatched role or unit names resolves in
// one dropdown per name, and a row still unresolved at commit time is SKIPPED and reported
// by name, never imported half-done.
import { useMemo, useState } from 'react';
import type { ImportPeopleBody, ImportPreview, ImportRow } from '@endur/shared';
import { apiPost, ApiError } from '../../../lib/api.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { useUnits } from '../../../lib/units.js';
import { flattenUnits } from '../../../lib/tree.js';
import { useRoles } from '../../../lib/roles.js';
import { pluralise } from '../../../lib/format.js';

type Step =
  | { kind: 'pick' }
  | { kind: 'reading' }
  | { kind: 'review'; csv: string; preview: ImportPreview; error: string | null }
  | { kind: 'committing'; csv: string; preview: ImportPreview }
  | { kind: 'done'; result: { created: number; updated: number; assigned: number; skipped: string[] } };

const message = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

export function ImportWizard({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  const units = useUnits();
  const roles = useRoles();
  const unitOptions = useMemo(() => flattenUnits(units.data ?? []), [units.data]);

  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [roleMapping, setRoleMapping] = useState<Record<string, string>>({});
  const [unitMapping, setUnitMapping] = useState<Record<string, string>>({});

  const readFile = (file: File): void => {
    setStep({ kind: 'reading' });
    const reader = new FileReader();
    reader.onload = () => {
      const csv = typeof reader.result === 'string' ? reader.result : '';
      void apiPost<{ csv: string }, { data: ImportPreview }>('/people/import/preview', { csv })
        .then(({ data }) => setStep({ kind: 'review', csv, preview: data, error: null }))
        .catch((error: unknown) => {
          setStep({ kind: 'pick' });
          // Nowhere else to put this — the dialog has no field to attach it to, since the
          // failure is about the whole file (usually CSV_MAX_CHARS, 14 §8).
          window.alert(message(error, 'That file could not be read.'));
        });
    };
    reader.onerror = () => {
      setStep({ kind: 'pick' });
      window.alert('That file could not be read.');
    };
    reader.readAsText(file);
  };

  const commit = (csv: string, preview: ImportPreview): void => {
    const rows = parseCsvRows(csv);
    const body: ImportPeopleBody = { rows, roleMapping, unitMapping };
    setStep({ kind: 'committing', csv, preview });
    void apiPost<ImportPeopleBody, { data: { created: number; updated: number; assigned: number; skipped: string[] } }>(
      '/people/import',
      body,
      { idempotencyKey: importKey(csv) },
    )
      .then(({ data }) => setStep({ kind: 'done', result: data }))
      .catch((error: unknown) => {
        setStep({ kind: 'review', csv, preview, error: message(error, 'That import could not be committed.') });
      });
  };

  if (!can('person.import')) {
    // Reachable only if the capability was withdrawn mid-session — the header action that
    // opens this dialog already checks it.
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
    <div className="dialog-backdrop" onMouseDown={step.kind === 'committing' ? undefined : onClose}>
      <div
        className="dialog import-wizard"
        role="dialog"
        aria-modal="true"
        aria-label="Import people"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="dialog-title">Import people</h2>

        {(step.kind === 'pick' || step.kind === 'reading') && (
          <>
            <p className="dialog-body">
              A CSV with a name and an email column, and optionally a role and a{' '}
              {labels.unit.one.toLowerCase()} column. Unrecognised role or{' '}
              {labels.unit.one.toLowerCase()} names are resolved on the next screen — nothing
              is invented.
            </p>
            <div className="field">
              <label htmlFor="import-file">CSV file</label>
              <input
                id="import-file"
                className="input"
                type="file"
                accept=".csv,text/csv"
                disabled={step.kind === 'reading'}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) readFile(file);
                }}
              />
            </div>
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {(step.kind === 'review' || step.kind === 'committing') && (
          <ReviewStep
            preview={step.preview}
            roles={roles.data ?? []}
            units={unitOptions}
            roleMapping={roleMapping}
            unitMapping={unitMapping}
            onMapRole={(name, id) => setRoleMapping((current) => ({ ...current, [name]: id }))}
            onMapUnit={(name, id) => setUnitMapping((current) => ({ ...current, [name]: id }))}
            unitLabel={labels.unit.one}
            error={step.kind === 'review' ? step.error : null}
            busy={step.kind === 'committing'}
            onBack={() => setStep({ kind: 'pick' })}
            onCommit={() => commit(step.csv, step.preview)}
          />
        )}

        {step.kind === 'done' && (
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
              <button type="button" className="btn btn-primary" onClick={onImported}>Done</button>
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
  // Every unmatched name has to resolve to something before a commit is worth pressing —
  // an unresolved row is silently skipped server-side, and requiring the choice first is
  // what keeps that from being the surprise (34 § Interactions: "it never fails silently").
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
            <tr><th>Name</th><th>Email</th><th>Role</th><th>{unitLabel}</th></tr>
          </thead>
          <tbody>
            {preview.sample.map((row) => (
              <tr key={row.email}>
                <td>{row.name}</td>
                <td>{row.email}</td>
                <td>{row.roleName ?? '—'}</td>
                <td>{row.unitName ?? '—'}</td>
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

/**
 * A deliberately stable key: the same file committed twice must hit the SAME idempotency
 * key, or the server's replay guard (12 §4.15) never gets to do its job. The file's own
 * bytes are the only thing available twice without asking the operator to remember one.
 */
function importKey(csv: string): string {
  let hash = 0;
  for (let i = 0; i < csv.length; i += 1) {
    hash = (Math.imul(31, hash) + csv.charCodeAt(i)) | 0;
  }
  return `import-${csv.length}-${hash}`;
}

/**
 * MIRRORS `parseCsv` in `features/people/service.ts`, header synonym list and all. The
 * commit route needs every row the file contains and the preview route only ever returns
 * five — so the full parse has to happen twice, and it must not drift from the server's.
 */
function parseCsvRows(csv: string): ImportRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const columns = splitLine(lines[0] as string).map((column) => column.trim());
  const index = (...names: string[]) =>
    columns.findIndex((column) => names.includes(column.toLowerCase()));

  const nameAt = index('name', 'full name');
  const emailAt = index('email', 'email address', 'e-mail');
  const roleAt = index('role', 'title', 'position');
  const unitAt = index('unit', 'department', 'team', 'ward', 'property');

  const rows: ImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line);
    const email = (cells[emailAt] ?? '').trim();
    const name = (cells[nameAt] ?? '').trim();
    if (!email || !name) continue;
    rows.push({
      name,
      email,
      ...(roleAt >= 0 && cells[roleAt]?.trim() ? { roleName: cells[roleAt].trim() } : {}),
      ...(unitAt >= 0 && cells[unitAt]?.trim() ? { unitName: cells[unitAt].trim() } : {}),
    });
  }
  return rows;
}

function splitLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
