// The poll and suggestion-box dialog. Everything it shows comes from the store
// (`store/screens/campaigns.ts`, `state.campaigns.quick`), and everything typed is an action:
// docs/REDUX-PLAN.md §6.10, the reference conversion. The page that renders it opens it
// (`quickDialogOpened`) and decides what happens once it is created.
import { useEffect } from 'react';
import type { CampaignDetail, QuickCampaignPurpose } from '@endur/shared';
import { Icon } from '../../../components/Icon.js';
import { useLabels } from '../../../lib/labels.js';
import { PAST_CLOSE, toLocalInput } from '../../../lib/when.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { messageOf } from '../../../store/screens/common.js';
import {
  MAX_OPTIONS,
  quickCampaignSubmitted,
  quickClosingTimeEdited,
  quickDialogClosed,
  quickNameEdited,
  quickOptionAdded,
  quickOptionEdited,
  quickOptionRemoved,
  quickSubmitAttempted,
  selectQuick,
  selectQuickClosesInPast,
  selectQuickReady,
} from '../../../store/screens/campaigns.js';

export const COPY: Record<
  QuickCampaignPurpose,
  { title: string; question: string; help: string; verb: string }
> = {
  poll: {
    title: 'New poll',
    question: 'What are you asking?',
    help: 'One question, a few options, answerable from a phone.',
    verb: 'Create and share',
  },
  suggestion: {
    title: 'New suggestion box',
    question: 'What are you asking for?',
    help: 'One open question. Answers are anonymous and arrive in the Inbox.',
    verb: 'Open the box',
  },
};

/** Rendered by the page while `state.campaigns.quick` is set. */
export function QuickDialog({
  onCreated,
}: {
  onCreated: (campaign: CampaignDetail) => void;
}): JSX.Element | null {
  const labels = useLabels();
  const dispatch = useAppDispatch();
  const draft = useAppSelector(selectQuick);
  const closesInPast = useAppSelector(selectQuickClosesInPast);
  const ready = useAppSelector(selectQuickReady);
  const sending = draft?.sending ?? false;

  // Escape closes it, unless a create is in flight. A key listener, not state.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !sending) dispatch(quickDialogClosed());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, sending]);

  if (!draft) return null;
  const copy = COPY[draft.purpose];
  const error = messageOf(draft.error, 'That could not be created.');
  const close = (): void => {
    if (!sending) dispatch(quickDialogClosed());
  };

  return (
    <div className="dialog-backdrop" onMouseDown={close}>
      <div
        className="dialog dialog-wide dialog-tall"
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-head">
          <h2 className="dialog-title">{copy.title}</h2>
          <p className="dialog-body">{copy.help}</p>
        </header>

        <form
          className="subject-form dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            // Judge the closing time again first: the thunk's `condition` then refuses a
            // draft whose time went by while the dialog sat open.
            dispatch(quickSubmitAttempted());
            void dispatch(quickCampaignSubmitted()).then((result) => {
              if (quickCampaignSubmitted.fulfilled.match(result)) onCreated(result.payload);
            });
          }}
        >
          {/* Adding a tenth option must not push "Create and share" off the panel. */}
          <div className="dialog-scroll">
            <div className="field">
              <label htmlFor="quick-name">{copy.question}</label>
              <input
                id="quick-name"
                className="input"
                autoFocus
                value={draft.name}
                maxLength={120}
                onChange={(event) => dispatch(quickNameEdited({ name: event.target.value }))}
              />
              <p className="field-help">
                Both the question and the name {labels.respondent.many.toLowerCase()} see.
              </p>
            </div>

            {draft.purpose === 'poll' && (
              <fieldset className="field">
                <legend>Options</legend>
                {draft.options.map((option, index) => (
                  <div className="quick-option" key={index}>
                    <input
                      className="input"
                      value={option}
                      maxLength={120}
                      aria-label={`Option ${index + 1}`}
                      onChange={(event) =>
                        dispatch(quickOptionEdited({ index, value: event.target.value }))
                      }
                    />
                    {draft.options.length > 2 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        aria-label={`Remove option ${index + 1}`}
                        onClick={() => dispatch(quickOptionRemoved({ index }))}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </div>
                ))}
                {draft.options.length < MAX_OPTIONS && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => dispatch(quickOptionAdded())}
                  >
                    <Icon name="add" size={16} /> Add option
                  </button>
                )}
              </fieldset>
            )}

            <div className="field">
              <label htmlFor="quick-ends">Close it automatically (optional)</label>
              <input
                id="quick-ends"
                className="input"
                type="datetime-local"
                min={toLocalInput(draft.judgedAt)}
                value={draft.endsAt}
                aria-invalid={closesInPast || undefined}
                aria-describedby={closesInPast ? 'quick-ends-error' : undefined}
                onChange={(event) => dispatch(quickClosingTimeEdited(event.target.value))}
              />
              {closesInPast && (
                <p className="field-error" id="quick-ends-error" role="alert">{PAST_CLOSE}</p>
              )}
              {/* Said BEFORE the button rather than discovered after it: this creates a live,
                  public link, and both properties are fixed once it exists (10 §4.3). */}
              <p className="field-help">
                Anyone with the link can answer, and answers are anonymous. Neither can be
                changed afterwards.
              </p>
            </div>

            {error && <p className="form-error" role="alert">{error}</p>}
          </div>

          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" disabled={sending} onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!ready}>
              {sending ? 'Creating…' : copy.verb}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
