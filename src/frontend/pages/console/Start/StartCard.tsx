// <StartCard> — T-093, 24 §6. One lane of the start gallery.
//
// The card exists to make FIVE DIFFERENT REASONS a lane cannot be used look different from
// each other, because they are answered differently:
//
//   ready           press it.
//   capability      the reader may not do this. The card is DISABLED and says why — the
//                   same treatment the rest of the console gives a verb somebody lacks.
//   tier            the ORGANISATION may not do this yet. The card stays ENABLED, wears a
//                   tier chip and lands on /app/plan. Hiding it sells nothing, and greying
//                   it out tells a customer they are broken when they are merely on Bronze.
//   soon            the surface is not built yet (`T-094`, `T-095`). No action at all — a
//                   dead link that renders something is worse than one that visibly does
//                   not navigate (design_specs/design/02 §7).
//
// All of it is USABILITY. The server 403s on the capability and 402s on the tier whatever
// this renders (INV-003), so a card that got the state wrong would still refuse correctly.
import { Link } from 'react-router-dom';
import type { Tier } from '@endur/shared';
import { Icon, type IconName } from '../../../components/Icon.js';

export type StartState = 'ready' | 'capability' | 'tier' | 'soon';

export type StartCardProps = {
  title: string;
  body: string;
  icon: IconName;
  /** `~10 sec` — how long ANSWERING takes, from `estimateSeconds()`. Null when there is no
   *  single honest number, which is the case for anything with a form behind it. */
  estimate: string | null;
  state: StartState;
  /** Required when `state` is `capability` — a disabled card with no reason is a bug
   *  report waiting to be filed. */
  reason?: string;
  /** Shown as a chip on `tier` and `soon`, so a Bronze reader can see what buys it. */
  tier?: Tier;
  /** The action's own words: "New poll", "Browse templates". */
  actionLabel: string;
  /** Exactly one of these, and `state: 'ready'` is what decides which. */
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
