import { PLAN_OPTIONS, type Tier } from '@endur/shared';
import { Icon, type IconName } from '../Icon.js';

export function UpgradeCard({
  requiredTier,
  currentTier,
  icon = 'results',
  sells = 'the layer that says why the numbers moved, not just what they are',
}: {
  requiredTier: Tier | null;
  currentTier: Tier | null;
  icon?: IconName;
  sells?: string;
}): JSX.Element {
  const plan = PLAN_OPTIONS.find((option) => option.tier === requiredTier);
  const current = PLAN_OPTIONS.find((option) => option.tier === currentTier);

  return (
    <section className="card analysis-upgrade">
      <Icon name={icon} size={24} className="analysis-upgrade-icon" />
      <h3>{plan ? plan.name : 'A higher plan'} includes this</h3>
      <p className="text-muted">{plan?.adds ?? 'More of the product'} — {sells}.</p>

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
