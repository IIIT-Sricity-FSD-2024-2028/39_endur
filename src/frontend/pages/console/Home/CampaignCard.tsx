import type { HomeView } from '@endur/shared';
import { Link } from 'react-router-dom';
import { Icon } from '../../../components/Icon.js';
import { useCan } from '../../../lib/capabilities.js';
import { endsIn } from './cards.js';

type Campaign = NonNullable<HomeView['activeCampaigns']>[number];

export function CampaignCard({
  campaign,
  subjectWord,
  onShare,
}: {
  campaign: Campaign;
  subjectWord: string;
  onShare: () => void;
}): JSX.Element {
  const closing = endsIn(campaign.endsAt);
  // Its results for whoever may read them; the campaign itself for everybody else, rather
  // than a link to a page that would only say no.
  const can = useCan();
  const to = can('results.read')
    ? `/app/campaigns/${campaign.id}/results`
    : `/app/campaigns/${campaign.id}`;

  return (
    <li className="card home-campaign">
      <Link className="home-campaign-name" to={to}>
        {campaign.name}
      </Link>

      {/* design_specs/design/04 §4.1 draws a progress bar reading `612 / 800`, and it is
          NOT built — that denominator is the one T-040 and T-041 both had to remove. An
          open link has no roll, so the bar would be a fraction of a number that does not
          exist. The count is real and stands alone (N-046). */}
      <p className="home-campaign-count">
        <span className="home-campaign-number">{campaign.responseCount.toLocaleString()}</span>{' '}
        <span className="text-meta">
          response{campaign.responseCount === 1 ? '' : 's'} · {campaign.subjectCount}{' '}
          {subjectWord.toLowerCase()}
          {campaign.subjectCount === 1 ? '' : 's'}
        </span>
      </p>

      <div className="home-campaign-foot">
        {closing && <span className="text-meta">{closing}</span>}
        {campaign.url && (
          <button type="button" className="btn btn-ghost" onClick={onShare}>
            <Icon name="qr" size={16} /> Share
          </button>
        )}
      </div>
    </li>
  );
}
