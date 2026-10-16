import { PLAN_OPTIONS, type Tier } from '@endur/shared';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../Icon.js';
import { useCan } from '../../lib/capabilities.js';

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
  const can = useCan();
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

      {/* The way to the plan page, for whoever may change the plan. Everybody else is told who
          can, rather than shown a button that would open a page where every action is disabled. */}
      {can('billing.update') ? (
        <Link className="btn btn-primary" to="/app/plan">
          See plans
        </Link>
      ) : (
        <p className="text-meta">
          Whoever manages billing for your organisation can change the plan.
        </p>
      )}
    </section>
  );
}
