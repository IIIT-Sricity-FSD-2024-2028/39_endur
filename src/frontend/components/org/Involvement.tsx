// "What is this person actually being asked for?" — 24 §4, one implementation, two
// placements, exactly like its neighbour `<PowersByPlace>`.
//
// **WHY IT EXISTS.** `/app/people/:id` answered three questions about a person — who they
// are, where they sit, what they can do — and every one of them is about POWER. A
// respondent holds none: no account, no grants (DEC-009), so the page for the thirty
// students in an organisation of forty-five was the emptiest page in it, while five polls
// addressed to them by role sat one screen away. This block is the fourth question, and for
// most of an organisation it is the only one with an answer.
//
// It renders `/profile`'s copy too, and the two differ in one word — "them" or "you" —
// which is why the headings are props rather than literals.
import { Link } from 'react-router-dom';
import type { PersonCampaign } from '@endur/shared';
import { Icon } from '../Icon.js';
import { STATUS_TAG, timing } from '../../pages/console/Campaigns/card.js';

/**
 * The three groups, in this order, and the order is an argument about importance.
 *
 * "About them" first because being reviewed is the thing somebody most needs to know is
 * happening. "Asked" second because the organisation named them. "Open to everyone" last
 * because it is true of every member of staff and says nothing about this person — it is
 * on the page so the list is complete, not because it is about them.
 */
const GROUPS: Array<{ reason: PersonCampaign['reason']; heading: (subject: string) => string }> = [
  { reason: 'subject', heading: (who) => `About ${who}` },
  { reason: 'audience', heading: (who) => `${who === 'you' ? 'You are' : 'They are'} asked to answer` },
  { reason: 'everyone', heading: () => 'Open to everyone' },
];

export function Involvement({
  items,
  /** "them" or "you" — the only thing the two placements disagree about. */
  who,
  emptyHint,
  canOpenCampaign = false,
}: {
  items: PersonCampaign[];
  who: 'them' | 'you';
  emptyHint: string;
  /** Whether the name links to the campaign's own page. See the row below. */
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
