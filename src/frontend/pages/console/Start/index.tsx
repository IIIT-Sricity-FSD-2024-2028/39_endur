import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { estimateSeconds, TIERS, type Tier } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { useCan } from '../../../lib/capabilities.js';
import { useLabels } from '../../../lib/labels.js';
import { useBilling } from '../../../lib/billing.js';
import { approxDuration } from '../../../lib/format.js';
import { QuickDialog } from '../Campaigns/QuickDialog.js';
import { StartCard, type StartState } from './StartCard.js';
import type { QuickCampaignPurpose } from '@endur/shared';

export const tierReaches = (held: Tier | null, needed: Tier): boolean =>
  held !== null && TIERS.indexOf(held) >= TIERS.indexOf(needed);

export function laneState(options: {
  allowed: boolean;
  built: boolean;
  needsTier?: Tier;
  heldTier: Tier | null;
}): StartState {
  if (!options.allowed) return 'capability';
  if (options.needsTier && options.heldTier === null) return 'soon';
  if (options.needsTier && !tierReaches(options.heldTier, options.needsTier)) return 'tier';
  return options.built ? 'ready' : 'soon';
}

export default function Start(): JSX.Element {
  const can = useCan();
  const labels = useLabels();
  const navigate = useNavigate();
  const billing = useBilling();
  const [quick, setQuick] = useState<QuickCampaignPurpose | null>(null);

  const heldTier = billing.data?.tier ?? null;

  const launch = can('campaign.launch');
  const round = labels.campaign.one.toLowerCase();

  return (
    <>
      <PageHeader
        title="Start something"
        subtitle="Five ways to ask. All of them end in a code people can scan."
      />

      <div className="start-grid">
        <StartCard
          title="Poll"
          icon="results"
          body="One question, a few options. Ask a room that is already sitting in front of you and watch the bars move."
          estimate={approxDuration(estimateSeconds(['single']))}
          state={laneState({ allowed: launch, built: true, heldTier })}
          reason="You cannot launch here."
          actionLabel="New poll"
          onStart={() => setQuick('poll')}
        />

        <StartCard
          title="Suggestion box"
          icon="inbox"
          body="One open question, answered anonymously. Replies arrive in the Inbox, over the same gate as everything else."
          estimate={approxDuration(estimateSeconds(['text']))}
          state={laneState({ allowed: launch, built: true, heldTier })}
          reason="You cannot launch here."
          actionLabel="Open a box"
          onStart={() => setQuick('suggestion')}
        />

        <StartCard
          title="Feedback"
          icon="form"
          body={`A full ${round}: start from a template, choose who answers, set the window.`}
          estimate={null}
          state={laneState({ allowed: can('template.read'), built: true, heldTier })}
          reason="You cannot read templates."
          actionLabel="Browse templates"
          to="/app/templates"
        />

        {/* T-096 — LIVE. Both lanes were `soon` from T-093 until the features behind them
            landed, which is the rule 02 §7 states: an item that navigates to a half-built
            page is worse than one that visibly does not navigate. */}
        <StartCard
          title="Announcement"
          icon="announcement"
          body="Say something to a group and see who has read it. In-product only — there is no mail transport here."
          estimate={null}
          state={laneState({
            allowed: can('announcement.create'),
            built: true,
            needsTier: 'silver',
            heldTier,
          })}
          reason="You cannot write announcements here."
          tier="silver"
          actionLabel="Compose"
          to="/app/announcements"
        />

        <StartCard
          title="Booking"
          icon="booking"
          body="Publish slots and let people take them. Capacity is enforced on the server, so two phones cannot take the last one."
          estimate={null}
          state={laneState({
            allowed: can('booking.create'),
            built: true,
            needsTier: 'gold',
            heldTier,
          })}
          reason="You cannot publish bookable times here."
          tier="gold"
          actionLabel="Add slots"
          to="/app/booking"
        />
      </div>

      {quick && (
        <QuickDialog
          purpose={quick}
          onCancel={() => setQuick(null)}
          onCreated={(campaign) => {
            setQuick(null);
            navigate(`/app/campaigns/${campaign.id}`);
          }}
        />
      )}
    </>
  );
}
