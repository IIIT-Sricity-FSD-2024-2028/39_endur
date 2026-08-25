// The 402. 43 § States: *"Upgrade card explaining what Silver adds — not an error page."*
//
// THIS IS THE SCREEN DEC-011 EXISTS FOR. Two failures reach this page and they are not the
// same failure:
//
//   403  the account may not open this. Remedy: an administrator. Nothing to buy.
//   402  the organisation is on a tier that does not include it. Remedy: a tier. The
//        account is fine, the permissions are fine, and nothing is broken.
//
// Conflating them would have made a Bronze customer with every permission in the product
// read "you do not have access to this" and go asking their administrator to fix a
// permission that was never wrong. `43` names this surface as the place worth demonstrating
// that on, and this card is the customer-facing half of the demonstration.
//
// THE TIER IS THE SERVER'S ANSWER, NOT A GUESS. `requiredTier` arrives in the 402 envelope.
// The entitlement map deliberately does not ship to the browser (`packages/shared/
// src/tiers.ts`), so this card can name the tier and can never re-decide the 402.
import { PLAN_OPTIONS, type Tier } from '@endur/shared';
import { Icon } from '../../../components/Icon.js';

export function Upgrade({
  requiredTier,
  currentTier,
}: {
  requiredTier: Tier | null;
  currentTier: Tier | null;
}): JSX.Element {
  const plan = PLAN_OPTIONS.find((option) => option.tier === requiredTier);
  const current = PLAN_OPTIONS.find((option) => option.tier === currentTier);

  return (
    <section className="card analysis-upgrade">
      <Icon name="results" size={24} className="analysis-upgrade-icon" />
      <h3>{plan ? plan.name : 'A higher plan'} includes this</h3>
      <p className="text-muted">
        {plan?.adds ?? 'Themes, sentiment, trends, reliability'} — the layer that says why
        the numbers moved, not just what they are.
      </p>

      {current && (
        <p className="text-meta">
          You are on {current.name}. Everything you already collect keeps running; nothing
          here is switched off.
        </p>
      )}

      {/* NO BUTTON, and its absence is deliberate rather than unfinished. The plan page and
          its per-tier Join action are `T-058` (`49` § Interactions), and there is no
          checkout at all in any phase (DEC-035). A primary button that navigates nowhere is
          precisely what `design_specs/design/02` §7 refuses in the sidebar, and it would be
          a worse offence here — on the one screen whose entire job is to make an upgrade
          path legible. When `T-058` lands, the button belongs here. */}
      <p className="text-meta">
        Whoever manages billing for your organisation can change the plan.
      </p>
    </section>
  );
}
