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

const mintReference = (): string =>
  `endur_${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 6)}`;

export function PaymentDialog({
  plan,
  mode,
  fromTier = null,
  onPaid,
  onCancel,
}: {
  plan: PlanOption;
  mode: 'signup' | 'change';
  fromTier?: Tier | null;
  onPaid: (reference: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [phase, setPhase] = useState<'idle' | 'paying' | 'done'>('idle');
  const payRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);

  const dismissable = phase === 'idle';

  useEffect(() => {
    payRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && dismissable) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, dismissable]);

  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    [],
  );

  function pay(): void {
    if (phase !== 'idle') return;
    setPhase('paying');
    const reference = mintReference();
    timers.current.push(
      window.setTimeout(() => {
        setPhase('done');
        timers.current.push(window.setTimeout(() => onPaid(reference), SUCCESS_MS));
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
              <span className="pay-period text-meta"> / month</span>
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
