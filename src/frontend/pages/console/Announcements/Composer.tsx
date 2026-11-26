// The announcement composer. Its draft is `state.announcements.composer`
// (store/screens/announcements.ts) and "Save draft" is the `announcementSaved` thunk. The
// page opens and closes it; this only edits what is there.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { AudienceRule } from '@endur/shared';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { useUnits } from '../../../lib/units.js';
import { flattenUnits } from '../../../lib/tree.js';
import { pluralise } from '../../../lib/format.js';
import { useRecipientCount } from '../../../lib/announcements.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { messageOf } from '../../../store/screens/common.js';
import {
  announcementSaved,
  composerAudienceChosen,
  composerAudienceSettled,
  composerClosed,
  composerEdited,
  selectAnnouncementsScreen,
} from '../../../store/screens/announcements.js';

/** How long the audience must sit still before it is counted. */
const SETTLE_MS = 250;

const EMPTY: AudienceRule = { kind: 'anyone' };

export function Composer(): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  const units = useUnits();
  const dispatch = useAppDispatch();
  const draft = useAppSelector(selectAnnouncementsScreen).composer;

  const editing = draft?.editingId != null;
  const title = draft?.title ?? '';
  const body = draft?.body ?? '';
  const audience = draft?.audience ?? EMPTY;
  const busy = draft?.saving ?? false;
  const error = messageOf(draft?.error, 'That could not be saved.');
  const upgrade = draft?.error?.status === 402;
  const onCancel = (): void => {
    dispatch(composerClosed());
  };

  // The debounce is a timer (a resource); what it decides goes into the store. A CHANGE of
  // rule restarts it, compared as JSON because every edit makes a new object.
  const audienceKey = JSON.stringify(audience);
  useEffect(() => {
    const timer = setTimeout(() => dispatch(composerAudienceSettled()), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [dispatch, audienceKey]);
  const counted = useRecipientCount(draft?.settledAudience ?? null);
  // Until the rule on screen has settled and been answered, the count is "not known yet".
  const recipients = draft?.settledAudience === audienceKey ? counted : null;

  // Effect (DOM): Escape closes the composer, unless it is saving.

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) dispatch(composerClosed());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, busy]);

  const ready = title.trim() !== '' && body.trim() !== '';
  const setAudience = (next: AudienceRule): void => {
    dispatch(composerAudienceChosen({ audience: next }));
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
            void dispatch(announcementSaved());
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
                onChange={(event) => dispatch(composerEdited({ title: event.target.value }))}
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
                onChange={(event) => dispatch(composerEdited({ body: event.target.value }))}
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
                  <span className="text-meta">Every account in the organization</span>
                </label>
                <label className="q-option">
                  <input
                    type="radio"
                    name="ann-audience"
                    checked={audience.kind === 'unit'}
                    // Not until there is a unit to choose: an empty `unitId` is a 422 later.
                    disabled={!units.data?.length}
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
                {upgrade && can('billing.update') && <Link to="/app/plan">See the plans</Link>}
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
