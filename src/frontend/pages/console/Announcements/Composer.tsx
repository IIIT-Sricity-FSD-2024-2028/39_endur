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
        className="dialog dialog-wide dialog-tall"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit announcement' : 'New announcement'}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head">
          <h2 className="dialog-title">{editing ? 'Edit announcement' : 'New announcement'}</h2>
          {/* Said here rather than discovered afterwards. There is no mail transport in this
              product, and a composer that implies one is worse than one that admits what it
              did — `70`'s operator composer carries the same sentence. */}
          <p className="dialog-body">
            This is read inside Endur. Nothing is emailed, and nobody is texted.
          </p>
        </header>

        <form
          className="subject-form dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready || busy) return;
            submit();
          }}
        >
          {/* Only the fields scroll. The title holds still and so does Save draft — a
              form long enough to need scrolling must not take its own button below the
              fold with it. */}
          <div className="dialog-scroll">
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
          </div>

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
