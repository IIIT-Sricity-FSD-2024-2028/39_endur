// <PaymentDialog> — DEC-080, 49 § Interactions.
//
// THE CHECKOUT DEC-035 DELETED, REBUILT AND HONEST ABOUT ITSELF. There is no gateway, no
// card field and no secret key: the dialog runs a short, deliberate wait, mints a reference,
// and hands it to whichever caller opened it. It says so on screen — "Endur demo checkout ·
// no card details are collected" — because a fake checkout that pretends to be a real one is
// the one version of this that would be dishonest.
//
// IT DECIDES NOTHING. `onPaid` is what the caller does next, and the server does that thing
// whether or not a reference arrives (`JoinTierBody.paymentRef` is optional and is a label,
// not a proof). Gating a tier on a value React invented would be INV-003 inverted.
//
// TWO CALLERS, ONE COMPONENT: `/start`'s plan step, where the organisation does not exist
// yet, and `/app/plan`, where it does. `mode` changes one sentence — what is being bought
// versus what it is being changed FROM — and, since DEC-097, THE AMOUNT.
//
// IN `change` MODE THE PRICE IS THE DIFFERENCE. The customer has already paid for this
// period; charging the full new price bills the overlap twice. `fromTier` was already a prop
// and was only feeding a sentence — it feeds the number now, through `changeCostMinor`, which
// is the SAME function `recordPayment` prices the ledger row with.
//
// WHAT THIS DIALOG PRINTS IS NOT WHAT THE LEDGER RECORDS, and that is deliberate rather than
// sloppy: the server subtracts again, server-side, inside the transaction that writes the tier
// (DEC-080). A client that renders the wrong figure renders a wrong figure and nothing more.
//
// MOTION. Rare-tier interaction: a person sees this once at sign-up and rarely again, which
// is the tier where a delight budget is allowed to exist at all. The panel rises 8px and
// scales from .97 on `--ease` over `--dur-base`; the value bullets stagger by `--stagger`,
// clamped at five beats so a long plan does not trail. The success overlay is the one
// flourish and it is spent in one place. Reduced motion is honoured GLOBALLY (endur.css
// top), and the advance to `onPaid` is a TIMER rather than an `animationend`, so a reader
// whose animations are collapsed to nothing still gets moved on.
import { useEffect, useRef, useState } from 'react';
import { changeCostMinor, formatMoney, type PlanOption, type Tier } from '@endur/shared';
import { Icon } from '../Icon.js';

/** The simulated capture, and then the overlay. Both are deliberate, both are visible. */
const CAPTURE_MS = 700;
const SUCCESS_MS = 1500;

const TIER_LABEL: Record<Tier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  enterprise: 'Enterprise',
};

/** Ours, and it looks like ours. Nothing here impersonates a gateway's id format. */
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
  /** What they are on now. `null` at sign-up — there is no plan to move from. */
  fromTier?: Tier | null;
  onPaid: (reference: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [phase, setPhase] = useState<'idle' | 'paying' | 'done'>('idle');
  const payRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);

  // Escape and backdrop dismissal stop the moment the capture starts. A dialog that can be
  // dismissed mid-write is a dialog that leaves the reader unsure whether it happened.
  const dismissable = phase === 'idle';

  useEffect(() => {
    payRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && dismissable) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, dismissable]);

  // Every timer is cleared on unmount. A caller that navigates away on `onPaid` unmounts
  // this component mid-sequence, and a stray callback afterwards would fire a second join.
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

  // DEC-097. `fromTier` is null at sign-up, and `changeCostMinor` answers the full price for
  // that case — the branch lives in the formula rather than here, so the client and the server
  // cannot come to different conclusions about what a signup costs.
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
                  // Clamped at five beats, the same rule `.page-enter` uses: past that the
                  // last bullet arrives after the reader has finished reading the first.
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
