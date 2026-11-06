import { Link } from 'react-router-dom';
import type { Tier } from '@endur/shared';
import { Icon, type IconName } from '../../../components/Icon.js';
import { useCan } from '../../../lib/capabilities.js';

export type StartState = 'ready' | 'capability' | 'tier' | 'soon';

export type StartCardProps = {
  title: string;
  body: string;
  icon: IconName;
  estimate: string | null;
  state: StartState;
  tier?: Tier;
  actionLabel: string;
  to?: string;
  onStart?: () => void;
};

export function StartCard({
  title,
  body,
  icon,
  estimate,
  state,
  tier,
  actionLabel,
  to,
  onStart,
}: StartCardProps): JSX.Element | null {
  const can = useCan();
  // ABSENT, NOT LOCKED. A card for something the reader's role cannot do is not drawn at
  // all: a greyed button with "You cannot launch here" under it was a page of things
  // somebody could not do, which is exactly what the owner asked to go (02 §5's rule).
  if (state === 'capability') return null;

  return (
    <article className="card start-card">
      <div className="start-card-top">
        <span className="start-card-icon" aria-hidden="true">
          <Icon name={icon} size={20} />
        </span>
        {/* Capitalised product word, deliberately literal — DEC-087. */}
        <h3 className="start-card-title">{title}</h3>
        {tier && <span className="tag tag-outline start-card-tier">{tier}</span>}
        {state === 'soon' && <span className="tag tag-neutral">Soon</span>}
      </div>

      <p className="start-card-body">{body}</p>
      {estimate && <p className="text-meta start-card-time">{estimate} to answer</p>}

      <div className="start-card-actions">
        {state === 'ready' && to && (
          <Link className="btn btn-primary" to={to}>
            {actionLabel}
          </Link>
        )}
        {state === 'ready' && onStart && (
          <button type="button" className="btn btn-primary" onClick={onStart}>
            {actionLabel}
          </button>
        )}
        {/* A tier is a thing somebody can buy. The card that names it must reach the page
            that sells it, or the chip is a locked door with no handle (49) — for whoever
            may buy it. Everybody else is told who can, as <UpgradeCard> does. */}
        {state === 'tier' && (can('billing.update') ? (
          <Link className="btn btn-secondary" to="/app/plan">
            See the plan
          </Link>
        ) : (
          <p className="text-meta start-card-reason">
            Part of a higher plan. Whoever manages billing for your organisation can change it.
          </p>
        ))}
        {state === 'soon' && (
          <p className="text-meta start-card-reason">Not built yet.</p>
        )}
      </div>
    </article>
  );
}
