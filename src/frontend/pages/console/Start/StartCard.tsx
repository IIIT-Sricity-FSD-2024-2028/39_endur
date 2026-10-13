import { Link } from 'react-router-dom';
import type { Tier } from '@endur/shared';
import { Icon, type IconName } from '../../../components/Icon.js';

export type StartState = 'ready' | 'capability' | 'tier' | 'soon';

export type StartCardProps = {
  title: string;
  body: string;
  icon: IconName;
  estimate: string | null;
  state: StartState;
  reason?: string;
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
  reason,
  tier,
  actionLabel,
  to,
  onStart,
}: StartCardProps): JSX.Element {
  return (
    <article className={`card start-card${state === 'capability' ? ' is-blocked' : ''}`}>
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
        {state === 'capability' && (
          <>
            <button type="button" className="btn btn-secondary" disabled>
              {actionLabel}
            </button>
            <p className="text-meta start-card-reason">{reason}</p>
          </>
        )}
        {/* A tier is a thing somebody can buy. The card that names it must reach the page
            that sells it, or the chip is a locked door with no handle (49). */}
        {state === 'tier' && (
          <Link className="btn btn-secondary" to="/app/plan">
            See the plan
          </Link>
        )}
        {state === 'soon' && (
          <p className="text-meta start-card-reason">Not built yet.</p>
        )}
      </div>
    </article>
  );
}
