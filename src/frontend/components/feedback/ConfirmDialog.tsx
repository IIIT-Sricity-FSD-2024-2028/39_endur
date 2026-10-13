import { useEffect, useRef } from 'react';

export function ConfirmDialog({
  title,
  consequence,
  verb,
  destructive = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  consequence: string;
  verb: string;
  destructive?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmDisabled) cancelRef.current?.focus();
    else confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, confirmDisabled]);

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="dialog-title" id="confirm-title">{title}</h2>
        <p className="dialog-body" id="confirm-body">{consequence}</p>
        <div className="dialog-actions">
          <button type="button" ref={cancelRef} className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {verb}
          </button>
        </div>
      </div>
    </div>
  );
}
