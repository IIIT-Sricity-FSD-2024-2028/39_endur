// <ConfirmDialog> — 24 §6.
//
// `consequence` is REQUIRED, and that is a copy rule enforced by the type system on
// purpose: "Are you sure?" tells the reader nothing they did not already know, and it is
// what reappears the moment the rule lives only in a style guide. The prop is the only
// thing that reliably keeps real numbers in the sentence.
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
  /**
   * Added by T-033. The delete dialog opens while `GET /units/:id/impact` is still in
   * flight, and 32 requires that confirming a destructive action whose consequence is
   * unknown be IMPOSSIBLE — not merely discouraged. So the sentence above can say "still
   * checking" or "could not check", and this keeps the button from being pressable in
   * either case.
   */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus the CONFIRM button, not the dialog: the reader has already decided, and the
    // sentence above is what changes their mind, not where the focus ring sits. When it is
    // disabled, focus Cancel instead — `focus()` on a disabled button is a no-op, and a
    // modal that opens with focus still on the page behind it traps nobody.
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
