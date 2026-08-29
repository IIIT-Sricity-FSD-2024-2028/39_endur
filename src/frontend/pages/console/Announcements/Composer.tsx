// The announcement composer — T-094, 61, 24 § Announcements.
//
// THERE IS NO RECIPIENT FIELD, and there must not be one. The audience is an
// `AudienceRule` — the campaign's own — so "everyone in Housekeeping" is a question put to
// the org graph every time it is asked, rather than a list of names somebody has to keep in
// step by hand. The count under the picker comes from the server for the same reason: it is
// the number of receipts publishing will write, not an estimate computed a second way.
//
// "Announcement" is a STRUCTURAL product word and stays literal (`DEC-087`). The nouns
// inside it — the unit an announcement reaches — come from useLabels().
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnnouncementSummary, AudienceRule } from '@endur/shared';
import { ApiError } from '../../../lib/api.js';
import { useLabels } from '../../../lib/labels.js';
import { useUnits } from '../../../lib/units.js';
import { flattenUnits } from '../../../lib/tree.js';
import { pluralise } from '../../../lib/format.js';
import {
  createAnnouncement,
  updateAnnouncement,
  useRecipientPreview,
} from '../../../lib/announcements.js';

export function Composer({
  editing,
  onSaved,
  onCancel,
}: {
  /** A draft being edited, or null for a new one. A published row never reaches here. */
  editing: AnnouncementSummary | null;
  onSaved: (announcement: AnnouncementSummary) => void;
  onCancel: () => void;
}): JSX.Element {
  const labels = useLabels();
  const units = useUnits();

  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [audience, setAudience] = useState<AudienceRule>(editing?.audience ?? { kind: 'anyone' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * A 402 is a DIFFERENT ANSWER from a failure and gets a different sentence (DEC-011).
   * "That could not be saved" in front of a customer who simply has not bought the tier
   * hides the one thing they can do about it.
   */
  const [upgrade, setUpgrade] = useState(false);

  const recipients = useRecipientPreview(audience);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  const ready = title.trim() !== '' && body.trim() !== '';

  const submit = (): void => {
    setBusy(true);
    setError(null);
    const payload = { title: title.trim(), body: body.trim(), audience };
    void (editing ? updateAnnouncement(editing.id, payload) : createAnnouncement(payload))
      .then(onSaved)
      .catch((cause: unknown) => {
        setUpgrade(cause instanceof ApiError && cause.status === 402);
        setError(cause instanceof ApiError ? cause.message : 'That could not be saved.');
        setBusy(false);
      });
  };

  return (
    <div className="dialog-backdrop" onMouseDown={() => !busy && onCancel()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit announcement' : 'New announcement'}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="dialog-title">{editing ? 'Edit announcement' : 'New announcement'}</h2>
        {/* Said here rather than discovered afterwards. There is no mail transport in this
            product, and a composer that implies one is worse than one that admits what it
            did — `70`'s operator composer carries the same sentence. */}
        <p className="dialog-body">
          This is read inside Endur. Nothing is emailed, and nobody is texted.
        </p>

        <form
          className="subject-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready || busy) return;
            submit();
          }}
        >
          <div className="field">
            <label htmlFor="ann-title">Title</label>
            <input
              id="ann-title"
              className="input"
              autoFocus
              value={title}
              maxLength={140}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="ann-body">What do you want to say?</label>
            <textarea
              id="ann-body"
              className="input"
              rows={5}
              value={body}
              maxLength={5000}
              onChange={(event) => setBody(event.target.value)}
            />
            <p className="field-help">Plain text. Links are not made clickable.</p>
          </div>

          <fieldset className="field">
            <legend>Who reaches it?</legend>
            <div className="q-options">
              <label className="q-option">
                <input
                  type="radio"
                  name="ann-audience"
                  checked={audience.kind === 'anyone'}
                  onChange={() => setAudience({ kind: 'anyone' })}
                />
                <span className="q-dot" aria-hidden="true" />
                <span>Everyone here</span>
                <span className="text-meta">Every account in the organisation</span>
              </label>
              <label className="q-option">
                <input
                  type="radio"
                  name="ann-audience"
                  checked={audience.kind === 'unit'}
                  onChange={() =>
                    setAudience({
                      kind: 'unit',
                      unitId: units.data?.[0]?.id ?? '',
                      includeSubtree: true,
                    })
                  }
                />
                <span className="q-dot" aria-hidden="true" />
                <span>Everyone in a {labels.unit.one.toLowerCase()}</span>
              </label>
            </div>

            {audience.kind === 'unit' && (
              <label className="qe-field">
                <span>{labels.unit.one}</span>
                <select
                  className="input"
                  value={audience.unitId}
                  onChange={(event) =>
                    setAudience({
                      kind: 'unit',
                      unitId: event.target.value,
                      includeSubtree: true,
                    })
                  }
                >
                  {flattenUnits(units.data ?? []).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* The visible proof that the org graph is real. It is the SERVER's number, and
                it is what publishing will actually write. */}
            <p className="audience-count">
              {recipients === null
                ? 'Counting…'
                : `${pluralise(recipients, 'person', 'people')} will get this.`}
            </p>
            <p className="field-help">
              People with no sign-in are not counted — a notice nobody can open is not one
              that was read.
            </p>
          </fieldset>

          {error && (
            <p className="form-error" role="alert">
              {error}{' '}
              {upgrade && <Link to="/app/plan">See the plans</Link>}
            </p>
          )}

          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            {/* SAVING IS NOT SENDING. Publishing is a separate act, behind a separate
                capability and a confirmation that names the count (11 §3). */}
            <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
              {busy ? 'Saving…' : 'Save draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
