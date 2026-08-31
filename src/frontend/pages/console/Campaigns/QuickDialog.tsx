// <QuickDialog> — T-091, 24 §6. A poll or a suggestion box, in one dialog and one call.
//
// The three-step wizard next door (`New.tsx`) is right for a feedback round: the form, the
// subjects and the dates are all real decisions there. A poll has none of them. It is one
// question asked of a room already sitting in front of you, so everything the wizard asks
// is either implied (anyone with the link, anonymous, public) or composed by the server in
// one transaction (`DEC-088`, `DEC-089`).
//
// "Poll" and "Suggestion box" are STRUCTURAL words and stay literal (`DEC-087`, INV-001 §
// exempt) — they name Endur's own furniture the way Save and Settings do. The nouns inside
// still come from useLabels().
import { useEffect, useState } from 'react';
import type { CampaignDetail, QuickCampaignPurpose } from '@endur/shared';
import { Icon } from '../../../components/Icon.js';
import { ApiError } from '../../../lib/api.js';
import { quickCreate } from '../../../lib/campaigns.js';
import { useLabels } from '../../../lib/labels.js';

const MAX_OPTIONS = 10;

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

export function QuickDialog({
  purpose,
  onCreated,
  onCancel,
}: {
  purpose: QuickCampaignPurpose;
  onCreated: (campaign: CampaignDetail) => void;
  onCancel: () => void;
}): JSX.Element {
  const labels = useLabels();
  const copy = COPY[purpose];

  const [name, setName] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // Not while it is in flight: this request mints a public token, and dismissing the
      // dialog mid-write would hide a campaign that is about to exist.
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  const filled = options.map((option) => option.trim()).filter(Boolean);
  // The same bound the server enforces, restated only so the button can explain itself
  // before it is pressed. The gate is the API's (INV-003).
  const ready = name.trim() !== '' && (purpose === 'suggestion' || filled.length >= 2);

  const setOption = (index: number, value: string): void =>
    setOptions((current) => current.map((option, at) => (at === index ? value : option)));

  const submit = (): void => {
    setBusy(true);
    setError(null);
    void quickCreate({
      purpose,
      name: name.trim(),
      ...(purpose === 'poll' ? { options: filled } : {}),
      ...(endsAt ? { endsAt: new Date(endsAt) } : {}),
    })
      .then(onCreated)
      .catch((cause: unknown) => {
        // Nothing was created — one transaction, so there is no half-made poll to clear up
        // and the reader can fix the sentence and press again (`DEC-089`).
        setError(cause instanceof ApiError ? cause.message : 'That could not be created.');
        setBusy(false);
      });
  };

  return (
    <div className="dialog-backdrop" onMouseDown={() => !busy && onCancel()}>
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
            if (!ready || busy) return;
            submit();
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
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
              />
              <p className="field-help">
                Both the question and the name {labels.respondent.many.toLowerCase()} see.
              </p>
            </div>

            {purpose === 'poll' && (
              <fieldset className="field">
                <legend>Options</legend>
                {options.map((option, index) => (
                  // Index as key, deliberately: these rows have no identity until they are
                  // saved, and nothing here reorders them.
                  <div className="quick-option" key={index}>
                    <input
                      className="input"
                      value={option}
                      maxLength={120}
                      aria-label={`Option ${index + 1}`}
                      onChange={(event) => setOption(index, event.target.value)}
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        aria-label={`Remove option ${index + 1}`}
                        onClick={() =>
                          setOptions((current) => current.filter((_, at) => at !== index))
                        }
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </div>
                ))}
                {options.length < MAX_OPTIONS && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setOptions((current) => [...current, ''])}
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
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
              />
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
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
              {busy ? 'Creating…' : copy.verb}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
