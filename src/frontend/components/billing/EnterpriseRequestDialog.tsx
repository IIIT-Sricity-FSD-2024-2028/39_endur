import { useEffect, useRef, useState } from 'react';
import { formatMoney, type PlanOption } from '@endur/shared';

export function EnterpriseRequestDialog({
  plan,
  sending,
  onSend,
  onCancel,
}: {
  plan: PlanOption;
  sending: boolean;
  onSend: (note: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [note, setNote] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    noteRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !sending) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, sending]);

  return (
    <div className="dialog-backdrop" onMouseDown={() => !sending && onCancel()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enterprise-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="dialog-title" id="enterprise-title">Ask about {plan.name}</h2>
        <p className="dialog-body">
          {formatMoney(plan.priceMinor, plan.currency)} a month. Nothing is charged now and your
          plan does not change — we will get in touch to arrange it.
        </p>

        <label className="field">
          <span className="field-label">Anything we should know? (optional)</span>
          <textarea
            ref={noteRef}
            className="input"
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What you are hoping to do with it, roughly when, anything else."
          />
        </label>

        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" disabled={sending} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={sending}
            onClick={() => onSend(note)}
          >
            {sending && <span className="spinner" aria-hidden="true" />}
            {sending ? 'Sending' : 'Send request'}
          </button>
        </div>
      </div>
    </div>
  );
}
