import { formatMoney, tierRank, type PlanOption, type Tier } from '@endur/shared';
import { Icon } from '../Icon.js';

export type PlanPickerMode = 'signup' | 'join' | 'override';

const VERB: Record<PlanPickerMode, string> = {
  signup: 'Select',
  join: 'Join',
  override: 'Set plan',
};

export function PlanPicker({
  plans,
  current,
  onSelect,
  mode,
  busyTier = null,
  requestedTier = null,
  disabled = false,
  belowIsLive = false,
}: {
  plans: readonly PlanOption[];
  current: Tier | null;
  onSelect: (tier: Tier) => void;
  mode: PlanPickerMode;
  busyTier?: Tier | null;
  requestedTier?: Tier | null;
  disabled?: boolean;
  belowIsLive?: boolean;
}): JSX.Element {
  return (
    <div
      className={`plan-grid${mode === 'signup' ? ' is-signup' : ''}`}
      role={mode === 'signup' ? 'radiogroup' : 'group'}
      aria-label="Plan"
    >
      {plans.map((plan) => {
        const selected = current === plan.tier;
        const unavailable = disabled || (mode === 'signup' && !plan.selectable);
        const below =
          !belowIsLive &&
          mode === 'join' && current !== null && tierRank(plan.tier) < tierRank(current);
        const requestable = mode === 'join' && !plan.selectable;
        const requested = requestable && requestedTier === plan.tier;

        const body = (
          <>
            {selected && (
              <span className="plan-check" aria-hidden="true">
                <Icon name="check" size={16} />
              </span>
            )}
            <span className="plan-name">{plan.name}</span>

            {/* THE PRICE, ABOVE THE PITCH AND BELOW THE NAME. It is the second thing read
                on this screen and the first thing compared across the three cards, so it
                sits where the eye lands after the tier's name rather than at the bottom
                where a reader has to hunt back up the column to compare. */}
            {/* EVERY TIER, ONE BRANCH FEWER — DEC-099. There is no `selectable` test here any
                more: all four carry a real amount, so the card that used to apologise for not
                having one now just prints it. THE PERIOD IS PART OF THE PRICE, not a
                footnote — this is the one place a reader learns what they are agreeing to pay
                per, so it moves with `period_end` (DEC-096) rather than being left behind at
                "/ year". */}
            <span className="plan-price">
              {formatMoney(plan.priceMinor, plan.currency)}
              <span className="plan-price-period text-meta"> / month</span>
            </span>

            <span className="plan-sells">{plan.sells}</span>
            <span className="plan-adds text-meta">{plan.adds}</span>
            {/* THE COPY THAT WENT WITH THE SENTINEL, AND THE ONE SENTENCE THAT SURVIVES IT.
                "Priced with you" is gone because there is a price (DEC-099). This line stays
                because it is still true and is now the only thing explaining why one card's
                verb is Request: the tier is arranged, not bought (16 §2). */}
            {!plan.selectable && (
              <span className="plan-note text-meta">
                Arranged with us — ask and we will get in touch
              </span>
            )}

            {mode === 'signup' && plan.features && plan.features.length > 0 && (
              <ul className="plan-features">
                {plan.features.map((feature) => (
                  <li key={feature} className="plan-feature-item">
                    <Icon name="check" size={16} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        );

        const cardClass =
          `plan-card is-${plan.tier}` +
          `${selected ? ' is-selected' : ''}${unavailable ? ' is-unavailable' : ''}` +
          `${below ? ' is-below' : ''}`;

        if (mode === 'signup') {
          return (
            <label className={cardClass} key={plan.tier}>
              <input
                type="radio"
                name="tier"
                value={plan.tier}
                checked={selected}
                disabled={unavailable}
                onChange={() => onSelect(plan.tier)}
              />
              {body}
            </label>
          );
        }

        return (
          <div className={cardClass} key={plan.tier}>
            {body}
            {/* NO BUTTON BELOW THE CURRENT TIER, rather than a disabled one — DEC-096, and
                the same argument DEC-104 makes on `/ops`: a control that can never do
                anything teaches the reader to distrust every greyed control they meet. The
                sentence says WHY, because a card that simply lost its button reads as a
                rendering fault. */}
            {below ? (
              <p className="plan-note plan-below-note text-meta">
                Below your plan. There are no refunds part-way through a period, so a move down
                is scheduled from Current plan above and takes effect when this one ends.
              </p>
            ) : (
              <button
                type="button"
                className="btn btn-secondary plan-action"
                disabled={unavailable || (selected && !belowIsLive) || requested || busyTier !== null}
                onClick={() => onSelect(plan.tier)}
              >
                {busyTier === plan.tier && <span className="spinner" aria-hidden="true" />}
                {selected && !belowIsLive
                  ? 'Current plan'
                  : requested
                    ? 'Requested'
                    : requestable
                      ? 'Request'
                      : selected
                        ? 'Convert to paid'
                        : VERB[mode]}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
