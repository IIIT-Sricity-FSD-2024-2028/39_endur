import { useState } from 'react';
import { formatRelative } from '../../lib/format.js';

const COPIED_MS = 1500;

export function InviteLink({
  url,
  expiresAt,
  label,
  onRegenerate,
  onClose,
}: {
  url: string;
  expiresAt: string;
  label: string;
  onRegenerate?: (() => Promise<void>) | undefined;
  onClose: () => void;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const copy = (): void => {
    void navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), COPIED_MS);
      },
      () => setFailed(true),
    );
  };

  const regenerate = (): void => {
    if (!onRegenerate) return;
    setRegenerating(true);
    setCopied(false);
    void onRegenerate().finally(() => setRegenerating(false));
  };

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog invite-link"
        role="dialog"
        aria-modal="true"
        aria-label={`Sign-in link for ${label}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="dialog-title">Sign-in link for {label}</h2>
        <p className="dialog-body">
          Copy this and send it however you already talk to them. It will not be shown again
          — expires {formatRelative(expiresAt)}.
        </p>

        <div className="field">
          <label htmlFor="invite-url" className="sr-only">Sign-in link</label>
          <input id="invite-url" className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        </div>

        {failed && (
          <p className="field-error" role="alert">
            Copying was refused by the browser. The link above can be selected by hand.
          </p>
        )}

        <div className="dialog-actions">
          {onRegenerate && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={regenerating}
              onClick={regenerate}
            >
              {regenerating ? 'Regenerating…' : 'Regenerate'}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={copy}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
