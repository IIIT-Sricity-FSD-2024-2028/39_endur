import { useEffect } from 'react';

const DISMISS_MS = 4000;

export function Toast({
  message,
  undo,
  onDismiss,
}: {
  message: string;
  undo?: (() => void) | undefined;
  onDismiss: () => void;
}): JSX.Element {
  useEffect(() => {
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
