// A one-time sign-in link, shown once. Its copy answer and "Regenerating…" are its own entry
// in `state.widgets` (store/screens/widgets.ts). Regenerating is the page's command
// (`onRegenerate`, a thunk there); this only says it is in flight.
import { useId } from 'react';
import { formatRelative } from '../../lib/format.js';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { useClearOnLeave } from '../../store/screens/common.js';
import {
  copiedFaded,
  instanceLeft,
  linkCopied,
  linkRegenerating,
  selectCopy,
  selectRegenerating,
} from '../../store/screens/widgets.js';

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
  const id = useId();
  const dispatch = useAppDispatch();
  const copyState = useAppSelector((state) => selectCopy(state, id));
  const regenerating = useAppSelector((state) => selectRegenerating(state, id));
  useClearOnLeave(instanceLeft({ id }));
  const copied = copyState === 'copied';
  const failed = copyState === 'failed';

  const copy = (): void => {
    void navigator.clipboard?.writeText(url).then(
      () => {
        dispatch(linkCopied({ id, ok: true }));
        window.setTimeout(() => dispatch(copiedFaded({ id })), COPIED_MS);
      },
      () => dispatch(linkCopied({ id, ok: false })),
    );
  };

  const regenerate = (): void => {
    if (!onRegenerate || regenerating) return;
    dispatch(linkRegenerating({ id, busy: true }));
    void onRegenerate().finally(() => dispatch(linkRegenerating({ id, busy: false })));
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
