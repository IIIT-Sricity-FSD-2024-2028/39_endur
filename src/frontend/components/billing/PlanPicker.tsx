// <PlanPicker> — 24 §6b, 49 § Interactions, DEC-048, DEC-080.
//
// ONE COMPONENT, THREE WORLDS. The catalogue specifies two — a customer joining a plan in
// `49` and an operator overriding one in `70` — and `DEC-048` adds the third: a founder
// choosing a tier at sign-up. Same information, three verbs, and `mode` is the only thing
// that differs. Three implementations would drift within a month; this is INV-008's argument
// applied to a third caller.
//
// WHAT SEPARATES `signup` FROM THE OTHER TWO. On `/start` there is no organisation yet, so
// there is nothing to change and nothing to confirm — the tier is part of the registration
// the page is about to POST. The card is therefore a RADIO and the page's own submit button
// commits it. In `join` and `override` the organisation already exists and each card carries
// its own action, because the click IS the write.
//
// IT PRINTS A PRICE AND IT DOES NOT TAKE A PAYMENT — DEC-080. `onSelect` still only means
// "this one", exactly as it did before: the payment dialog is opened by the CALLER. That
// split is what keeps this component usable in `override` mode, where an operator moves
// somebody else's plan and must never be shown a Pay button.
//
// ENTERPRISE PRINTS NO AMOUNT. Its `priceMinor` is 0 and 0 is not a price — `16` §4 prices
// it individually, so the card says who to ask instead of quoting a number nobody honoured.
import { formatMoney, type PlanOption, type Tier } from '@endur/shared';
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
  disabled = false,
}: {
  plans: readonly PlanOption[];
  /**
   * `null` IS A REAL STATE AND IT IS THE SIGN-UP DEFAULT (DEC-048). The owner's instruction
   * was *"pick the option and you get assigned that"*, so nothing is pre-selected: a
   * pre-selected card is a choice the product made and then attributed to the customer, which
   * is how `D-012` looked from the inside. In `join`/`override` this is the tier they are on.
   */
  current: Tier | null;
  onSelect: (tier: Tier) => void;
  mode: PlanPickerMode;
  busyTier?: Tier | null;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div
      className={`plan-grid${mode === 'signup' ? ' is-signup' : ''}`}
      role={mode === 'signup' ? 'radiogroup' : 'group'}
      aria-label="Plan"
    >
      {plans.map((plan) => {
        const selected = current === plan.tier;
        // `selectable: false` is Enterprise, and it is SHOWN rather than hidden (16 §4). A
        // customer should be able to see the tier above the one they can reach; what they
        // cannot do is assign themselves it. Hiding it would make an operator setting it
        // later look like an error rather than a sale.
        const unavailable = disabled || !plan.selectable;

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
            {plan.selectable ? (
              <span className="plan-price">
                {formatMoney(plan.priceMinor, plan.currency)}
                <span className="plan-price-period text-meta"> / year</span>
              </span>
            ) : (
              <span className="plan-price plan-price-quoted text-meta">Priced with you</span>
            )}

            <span className="plan-sells">{plan.sells}</span>
            <span className="plan-adds text-meta">{plan.adds}</span>
            {!plan.selectable && (
              <span className="plan-note text-meta">Arranged with us — talk to sales</span>
            )}

            {mode === 'signup' && plan.features && plan.features.length > 0 && (
              <ul className="plan-features">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="plan-feature-item">
                    <Icon name="check" size={16} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        );

        // The tier's own metal (DEC-080). One class, three ramps, and every card carries
        // one — gold reads as the top of a ladder rather than as the only decorated card.
        const cardClass =
          `plan-card is-${plan.tier}` +
          `${selected ? ' is-selected' : ''}${unavailable ? ' is-unavailable' : ''}`;

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
            <button
              type="button"
              className="btn btn-secondary plan-action"
              disabled={unavailable || selected || busyTier !== null}
              onClick={() => onSelect(plan.tier)}
            >
              {busyTier === plan.tier && <span className="spinner" aria-hidden="true" />}
              {selected ? 'Current plan' : VERB[mode]}
            </button>
          </div>
        );
      })}
    </div>
  );
}
