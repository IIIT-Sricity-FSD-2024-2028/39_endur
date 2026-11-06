import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { estimateSeconds, TIERS, type Tier } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { useCan } from '../../../lib/capabilities.js';
import { useLabels } from '../../../lib/labels.js';
import { usePlanSummary } from '../../../lib/billing.js';
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
  /**
   * False when the reader may not see the plan (no `billing.read`). Then there is no tier to
   * wait for and none to sell them: the lane is offered, and if the organisation's plan does
   * not include it, the page it opens says so (and says who can change that).
   */
  planVisible?: boolean;
}): StartState {
  if (!options.allowed) return 'capability';
  if (options.needsTier && options.planVisible !== false) {
    if (options.heldTier === null) return 'soon';
    if (!tierReaches(options.heldTier, options.needsTier)) return 'tier';
  }
  return options.built ? 'ready' : 'soon';
}

const WAYS = ['', 'One', 'Two', 'Three', 'Four', 'Five'];

export default function Start(): JSX.Element {
  const can = useCan();
  const labels = useLabels();
  const navigate = useNavigate();
  const [quick, setQuick] = useState<QuickCampaignPurpose | null>(null);

  // The plan matters only to the two paid lanes, and only a reader who may see the plan is
  // asked about it: anybody else got a 403 here on every visit, for a card they never had.
  const planVisible = can('billing.read');
  const paidLanes = can('announcement.create') || can('booking.create');
  const heldTier = usePlanSummary(planVisible && paidLanes)?.tier ?? null;

  const launch = can('campaign.launch');
  const round = labels.campaign.one.toLowerCase();

  const lanes = {
    quick: laneState({ allowed: launch, built: true, heldTier }),
    // The wizard, not the template page: picking a form is its first step, and it lists the
    // library too, so this card works for whoever may run a campaign.
    full: laneState({ allowed: can('campaign.create'), built: true, heldTier }),
    announcement: laneState({
      allowed: can('announcement.create'), built: true, needsTier: 'silver', heldTier, planVisible,
    }),
    booking: laneState({
      allowed: can('booking.create'), built: true, needsTier: 'gold', heldTier, planVisible,
    }),
  };
  // The poll and the box share a lane, so they count twice.
  const shown =
    (lanes.quick === 'capability' ? 0 : 2) +
    [lanes.full, lanes.announcement, lanes.booking].filter((state) => state !== 'capability').length;

  if (shown === 0) {
    // Reachable only by typing the address: the sidebar item needs one of these powers.
    return (
      <>
        <PageHeader title="Start something" />
        <EmptyState
          icon="start"
          title="Nothing to start here"
          body="Your role answers and reads here rather than starting things. Anything waiting for your answer is on your home page."
          action={<Link className="btn btn-primary" to="/app">Go to your home page</Link>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Start something"
        subtitle={`${WAYS[shown] ?? shown} way${shown === 1 ? '' : 's'} to ask.`}
      />

      <div className="start-grid">
        <StartCard
          title="Poll"
          icon="results"
          body="One question, a few options. Ask a room that is already sitting in front of you and watch the bars move."
          estimate={approxDuration(estimateSeconds(['single']))}
          state={lanes.quick}
          actionLabel="New poll"
          onStart={() => setQuick('poll')}
        />

        <StartCard
          title="Suggestion box"
          icon="inbox"
          body="One open question, answered anonymously. Replies arrive in the Inbox, over the same gate as everything else."
          estimate={approxDuration(estimateSeconds(['text']))}
          state={lanes.quick}
          actionLabel="Open a box"
          onStart={() => setQuick('suggestion')}
        />

        <StartCard
          title="Feedback"
          icon="form"
          body={`A full ${round}: pick a form, choose who answers, set the window.`}
          estimate={null}
          state={lanes.full}
          actionLabel={`New ${round}`}
          to="/app/campaigns/new"
        />

        {/* T-096 — LIVE. Both lanes were `soon` from T-093 until the features behind them
            landed, which is the rule 02 §7 states: an item that navigates to a half-built
            page is worse than one that visibly does not navigate. */}
        <StartCard
          title="Announcement"
          icon="announcement"
          body="Say something to a group and see who has read it. In-product only — there is no mail transport here."
          estimate={null}
          state={lanes.announcement}
          tier="silver"
          actionLabel="Compose"
          to="/app/announcements"
        />

        <StartCard
          title="Booking"
          icon="booking"
          body="Publish slots and let people take them. Capacity is enforced on the server, so two phones cannot take the last one."
          estimate={null}
          state={lanes.booking}
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
