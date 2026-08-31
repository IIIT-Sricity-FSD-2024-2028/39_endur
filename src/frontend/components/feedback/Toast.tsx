// <Toast> — 24 §6, design_specs/design/10 §4.
//
// SUCCESS ONLY. An error never arrives here: it appears where the problem is, next to the
// field or above the button that caused it, because a message that slides away after four
// seconds is the worst possible carrier for something the reader has to act on.
//
// `role="status"` rather than `alert`. An alert interrupts a screen reader mid-sentence,
// and interrupting somebody to tell them a thing went RIGHT is a strange thing to do.
import { useEffect } from 'react';

/** Long enough to read a short sentence, short enough not to sit over the next action. */
const DISMISS_MS = 4000;

export function Toast({
  message,
  undo,
  onDismiss,
}: {
  message: string;
  /**
   * Rendered only when given, and only give it when there is genuinely something to undo.
   * The template library does not: undoing a delete needs a restore endpoint, and an undo
   * button that cannot undo is worse than no undo at all.
   */
  undo?: (() => void) | undefined;
  onDismiss: () => void;
}): JSX.Element {
  useEffect(() => {
    // Timer keyed on the message, so a second success while the first is still up resets
    // the clock rather than inheriting the remainder of it.
    const timer = window.setTimeout(onDismiss, DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {undo && (
        <button type="button" className="btn btn-ghost" onClick={undo}>
          Undo
        </button>
      )}
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
