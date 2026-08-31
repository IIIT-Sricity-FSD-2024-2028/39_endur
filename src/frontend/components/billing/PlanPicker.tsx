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
// ENTERPRISE PRINTS ITS PRICE LIKE EVERY OTHER CARD — DEC-099. It used to print "Priced with
// you", because `priceMinor` was 0 and 0 was a sentinel rather than an amount. The sentinel
// forced `selectable` to be consulted before a price could be rendered, and that special case
// leaked out of the data and into the copy. It has a number now (Rs 4,999), the branch is
// gone, and `selectable: false` is back to meaning ONE thing: the customer cannot assign this
// tier to themselves.
//
// WHICH IS WHY `unavailable` ASKS ABOUT THE MODE. It read `disabled || !plan.selectable` in
// ALL THREE modes — including `override`, which is the OPERATOR assigning somebody else's
// plan, the path `DEC-048` routes Enterprise through on purpose. So the one tier the product
// calls operator-assigned was unassignable in the only UI that can assign it, disabled by a
// flag that means "a customer may not choose this" (DEC-099).
//
// THE LADDER IS ONE-WAY IN `join` MODE — DEC-096. A card BELOW the tier the customer is on
// renders as CONTEXT rather than as an action: the name, the price, what it sells, and no
// button. The rule that refuses a downgrade is the SERVER'S (`POST /billing/tier` answers
// 409); this is only what stops offering one, and the distinction matters because INV-003
// says a policy the client enforces is a policy that is not enforced.
//
// THE CARD IS NOT HIDDEN. A customer on Gold should still be able to read what Bronze costs —
// they can schedule a move down to it (`DEC-098`), and a plan you cannot see is a plan you
// cannot ask about.
//
// AND THE SCHEDULING CONTROL IS STILL NOT HERE. `DEC-098` shipped and this card did not grow a
// button: `49` § Interactions puts the affordance under the CURRENT PLAN, above, and that is
// the right side of a line worth keeping — this component's rule is that a lower card carries
// no action, and "no action, except this one" is how the rule stops being one. The sentence
// below points at where the action lives instead.
//
// `override` MODE IS EXEMPT. An operator moving somebody else's plan may move it in either
// direction; `platform.plan.override` is a support action and `19` §4 grants it deliberately.
//
// A THIRD VERB: REQUEST — DEC-100. In `join` mode a tier the customer cannot assign themselves
// is not a dead card, it is a card with a different action. `onSelect` still only means "this
// one"; what the CALLER does with Enterprise is open a request dialog rather than a checkout,
// which is the same split that already lets this component work in `override` mode without
// ever showing a Pay button.
//
// AT SIGN-UP IT STAYS INERT. `/start` filters Enterprise out of the list entirely
// (`SIGNUP_PLAN_OPTIONS`), and there is no organisation yet for a request to be about.
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
  /**
   * A tier this organisation has already ASKED for and not yet been given — `DEC-100`. Its
   * card reads "Requested" and is inert, because a second ask changes nothing: the server
   * answers 409 on a second open request (a partial unique index makes that true under two
   * simultaneous clicks), and a button that can only produce an error is not an action.
   */
  requestedTier?: Tier | null;
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
        // DEC-099. `override` IS THE OPERATOR, and `selectable` is a statement about what the
        // CUSTOMER may do. Reusing one flag for both is what made Enterprise unassignable.
        //
        // AND SINCE DEC-100 IT DOES NOT DISABLE THE `join` CARD EITHER — it changes the verb.
        // What is left of "unavailable" is the sign-up radio, where there is no organisation
        // yet for a request to be about, and the page-level `disabled` flag.
        const unavailable = disabled || (mode === 'signup' && !plan.selectable);
        // DEC-096. `join` only: at sign-up there is nothing to be below, and an operator may
        // move a plan in either direction.
        const below =
          mode === 'join' && current !== null && tierRank(plan.tier) < tierRank(current);
        // DEC-100. A customer cannot ASSIGN this tier; they can ASK for it.
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
                disabled={unavailable || selected || requested || busyTier !== null}
                onClick={() => onSelect(plan.tier)}
              >
                {busyTier === plan.tier && <span className="spinner" aria-hidden="true" />}
                {selected ? 'Current plan' : requested ? 'Requested' : requestable ? 'Request' : VERB[mode]}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
