import { Link } from 'react-router-dom';
import type { PersonCampaign } from '@endur/shared';
import { Icon } from '../Icon.js';
import { STATUS_TAG, timing } from '../../pages/console/Campaigns/card.js';

const GROUPS: Array<{ reason: PersonCampaign['reason']; heading: (subject: string) => string }> = [
  { reason: 'subject', heading: (who) => `About ${who}` },
  { reason: 'audience', heading: (who) => `${who === 'you' ? 'You are' : 'They are'} asked to answer` },
  { reason: 'everyone', heading: () => 'Open to everyone' },
];

export function Involvement({
  items,
  who,
  emptyHint,
  canOpenCampaign = false,
}: {
  items: PersonCampaign[];
  who: 'them' | 'you';
  emptyHint: string;
  canOpenCampaign?: boolean;
}): JSX.Element {
  if (items.length === 0) {
    return <p className="text-muted involve-none">{emptyHint}</p>;
  }

  return (
    <div className="involve">
      {GROUPS.map(({ reason, heading }) => {
        const group = items.filter((item) => item.reason === reason);
        if (group.length === 0) return null;
        return (
          <section className="involve-group" key={reason}>
            <h4 className="utility involve-heading">{heading(who)}</h4>
            <ul className="involve-list">
              {group.map((item) => (
                <Row key={item.id} item={item} canOpenCampaign={canOpenCampaign} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Row({
  item,
  canOpenCampaign,
}: {
  item: PersonCampaign;
  canOpenCampaign: boolean;
}): JSX.Element {
  const tag = STATUS_TAG[item.status];
  const when = timing(item);

  return (
    <li className="involve-row">
      <div className="involve-main">
        {/* A LINK ONLY WHEN THE READER MAY FOLLOW IT. `/app/campaigns/:id` needs
            `campaign.read`, which is an administrative capability — the people this block
            was built for do not hold it, and a link that 403s is worse than a name. */}
        {canOpenCampaign ? (
          <Link className="involve-name" to={`/app/campaigns/${item.id}`}>{item.name}</Link>
        ) : (
          <span className="involve-name">{item.name}</span>
        )}
        <span className={tag.className}>{tag.label}</span>
      </div>

      <p className="text-meta involve-meta">
        {/* The position that put them here, when the audience named one. `via` is null for
            "open to everyone" precisely because there is no position to name. */}
        {item.via && <span className="involve-via">{item.via}</span>}
        {when && <span>{when}</span>}
        {item.anonymous && <span>anonymous</span>}
      </p>

      {/* The respondent link, which is the whole point on `/profile` and the useful thing to
          copy on somebody else's page. It leaves the app, so it is an anchor rather than a
          <Link>, and it is the same public URL the share sheet hands out. */}
      {item.url && (
        <a
          className="btn btn-secondary btn-tiny involve-open"
          href={item.url}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="share" size={16} /> Open
        </a>
      )}
    </li>
  );
}
