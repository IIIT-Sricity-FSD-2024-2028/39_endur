// <PlanPicker> — 24 §6b, 49 § Interactions, DEC-048.
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
// NO PRICES, in any mode, in any phase — DEC-035. `PlanOption` has no field for one.
import type { PlanOption, Tier } from '@endur/shared';
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

        if (mode === 'signup') {
          return (
            <label
              className={`plan-card${selected ? ' is-selected' : ''}${unavailable ? ' is-unavailable' : ''}`}
              key={plan.tier}
            >
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
          <div
            className={`plan-card${selected ? ' is-selected' : ''}${unavailable ? ' is-unavailable' : ''}`}
            key={plan.tier}
          >
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
