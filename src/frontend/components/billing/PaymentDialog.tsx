import { useEffect, useRef, useState } from 'react';
import { changeCostMinor, formatMoney, type PlanOption, type Tier } from '@endur/shared';
import { Icon } from '../Icon.js';

const CAPTURE_MS = 700;
const SUCCESS_MS = 1500;

const TIER_LABEL: Record<Tier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  enterprise: 'Enterprise',
};

// Same shape as the server's own references (endur_ + 18 hex characters), from the browser's
// cryptographic generator. Math.random could repeat, and a repeat hits the UNIQUE constraint on
// payments.reference.
const mintReference = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return `endur_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

export function PaymentDialog({
  plan,
  mode,
  fromTier = null,
  onPaid,
  onDone,
  onCancel,
}: {
  plan: PlanOption;
  mode: 'signup' | 'change';
  fromTier?: Tier | null;
  // The server's answer. "Payment successful" is shown only once this resolves; if it rejects,
  // the parent has the error and the dialog goes back to idle.
  onPaid: (reference: string) => Promise<unknown>;
  // After the success screen has been seen.
  onDone?: () => void;
  onCancel: () => void;
}): JSX.Element {
  const [phase, setPhase] = useState<'idle' | 'paying' | 'done'>('idle');
  const payRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);
  const alive = useRef(true);

  const dismissable = phase === 'idle';

  // Focus once, on open. Kept out of the effect below, which re-runs whenever the parent passes
  // a new onCancel, and would pull focus back to Pay on every parent render.
  useEffect(() => {
    payRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && dismissable) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, dismissable]);

  useEffect(() => {
    alive.current = true;
    // The same array for the dialog's whole life (ids are pushed into it, it is never replaced),
    // so holding it here still sees every timer started after this ran.
    const pending = timers.current;
    return () => {
      alive.current = false;
      for (const id of pending) window.clearTimeout(id);
    };
  }, []);

  function pay(): void {
    if (phase !== 'idle') return;
    setPhase('paying');
    const reference = mintReference();
    timers.current.push(
      window.setTimeout(() => {
        onPaid(reference).then(
          () => {
            if (!alive.current) return;
            setPhase('done');
            timers.current.push(window.setTimeout(() => onDone?.(), SUCCESS_MS));
          },
          () => {
            if (alive.current) setPhase('idle');
          },
        );
      }, CAPTURE_MS),
    );
  }

  const chargeMinor = changeCostMinor(mode === 'change' ? fromTier : null, plan.tier);
  const amount = formatMoney(chargeMinor, plan.currency);
  const fullAmount = formatMoney(plan.priceMinor, plan.currency);
  const isDifference = chargeMinor !== plan.priceMinor;
  const features = plan.features ?? [];

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={() => {
        if (dismissable) onCancel();
      }}
    >
      <div
        className={`dialog dialog-wide pay-dialog is-${plan.tier}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="pay-grid">
          <div className="pay-rail">
            <p className="pay-kicker text-meta">
              {mode === 'change' && fromTier
                ? `${TIER_LABEL[fromTier]} → ${TIER_LABEL[plan.tier]}`
                : 'New plan'}
            </p>
            <h2 className="pay-title" id="pay-title">{plan.name}</h2>

            <p className="pay-amount">
              {amount}
              {/* A difference is a one-off for the period already running, not a monthly price. */}
              <span className="pay-period text-meta">
                {isDifference ? ' for the rest of this period' : ' / month'}
              </span>
            </p>

            {/* THE SUBTRACTION, SHOWN. An amount that is neither of the two prices on the
                previous screen is the kind of surprise that produces a support email, so the
                arithmetic is on the page rather than in a tooltip. */}
            {isDifference && fromTier && (
              <p className="pay-difference text-meta">
                {fullAmount} {TIER_LABEL[plan.tier]} − {formatMoney(
                  plan.priceMinor - chargeMinor,
                  plan.currency,
                )}{' '}
                already on {TIER_LABEL[fromTier]}
              </p>
            )}

            <p className="pay-method text-meta">
              Endur demo checkout · no card details are collected
            </p>

            <div className="pay-actions">
              <button
                type="button"
                ref={payRef}
                className="btn btn-primary btn-block pay-button"
                disabled={phase !== 'idle'}
                onClick={pay}
              >
                {phase === 'paying' && <span className="spinner" aria-hidden="true" />}
                {phase === 'idle' ? `Pay ${amount}` : 'Paying'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                disabled={!dismissable}
                onClick={onCancel}
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="pay-value">
            <h3 className="pay-value-title">What you get</h3>
            <ul className="pay-features">
              {features.map((feature, index) => (
                <li
                  className="pay-feature"
                  key={feature}
                  style={{ animationDelay: `calc(var(--stagger) * ${Math.min(index, 4)})` }}
                >
                  <Icon name="check" size={16} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <p className="pay-terms text-meta">
              Move up any time from Plan in the sidebar. One month, billed once. Moving down
              happens at the end of a period — there are no refunds part-way through one.
            </p>
          </div>
        </div>

        {phase === 'done' && (
          <div className="pay-success" role="status" aria-live="polite">
            <span className="pay-tick" aria-hidden="true">
              <svg viewBox="0 0 48 48" focusable="false" role="presentation" aria-hidden="true">
                <path d="M13 24.5 L21 32 L35 17" />
              </svg>
            </span>
            <p className="pay-success-word">Payment successful</p>
            <p className="pay-success-sub">{amount} · {plan.name}</p>
          </div>
        )}
      </div>
    </div>
  );
}
