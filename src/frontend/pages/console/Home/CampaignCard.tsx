// One collecting campaign. 46 § Interactions, design_specs/design/04 §4.1.
//
// The card links to results and carries Share directly, because during a demo the most
// common thing anybody wants from this screen is the QR code — and making that one click
// instead of four is the whole reason the URL travels in the home payload.
import type { HomeView } from '@endur/shared';
import { Link } from 'react-router-dom';
import { Icon } from '../../../components/Icon.js';
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

  return (
    <li className="card home-campaign">
      <Link className="home-campaign-name" to={`/app/campaigns/${campaign.id}/results`}>
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
