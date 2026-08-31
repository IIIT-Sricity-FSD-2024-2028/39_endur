// T-093 — /app/start. The screen that makes five surfaces look like one product.
//
// Endur has always been ONE ENGINE: a template of typed questions, a campaign with an
// audience and a gate, a public token, a k-anonymised results page. What it lacked was a
// place that PRESENTS that engine as more than feedback. Every lane below runs on the same
// machinery — a poll and a suggestion box are campaigns with a different category and one
// question (`DEC-088`), and nothing here adds a table.
//
// The lane titles are STRUCTURAL PRODUCT WORDS and stay literal (`DEC-087`): "Poll" and
// "Booking" name Endur's own furniture the way Save and Settings do. Every noun that
// belongs to the CUSTOMER — what they call a round of feedback, what they review — still
// comes from useLabels(), and `npm run audit:vocab` walks this directory with no exclusion.
//
// ALL FIVE LANES ARE LIVE SINCE `T-096`. Announcements (`T-094`) and Booking (`T-095`)
// spent two tasks on this page as `soon` cards wearing the tier that would buy them, which
// was the point: a customer who cannot see a feature cannot want it, and the gallery is the
// only screen where the whole product is visible at once.
//
// The two paid lanes keep their tier chip, and the ORDER of the two gates is the middleware
// chain's own (`DEC-091`): capability first, tier second. Somebody who may not write an
// announcement is told so and the card is disabled; somebody who may, on an organisation
// below Silver, is sent to `/app/plan`. Telling the first person to buy an upgrade for
// something they would not be allowed to use anyway is the wrong answer twice.
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

/**
 * Does this organisation's tier reach the one a lane needs?
 *
 * Client-side, and USABILITY ONLY. The entitlement map is deliberately not shipped to the
 * browser (`packages/shared/src/tiers.ts` says why), so this compares the ladder's ORDER —
 * which is public, advertised on `/app/plan`, and enough to decide whether to draw a chip.
 * `requireEntitlement` decides the 402 regardless (INV-003).
 */
export const tierReaches = (held: Tier | null, needed: Tier): boolean =>
  held !== null && TIERS.indexOf(held) >= TIERS.indexOf(needed);

/**
 * The state of a lane that is BUILT and gated on a capability, or one that is not built
 * yet. Exported because the four branches are the whole of what this page decides, and a
 * branch that can only be checked by rendering a card is a branch nobody checks.
 *
 * Order matters and it is the middleware chain's order, restated in the UI: capability
 * first, tier second (`app.ts:108-113`). Telling somebody to buy an upgrade for something
 * they would not be allowed to use anyway is the wrong answer twice.
 */
export function laneState(options: {
  allowed: boolean;
  built: boolean;
  needsTier?: Tier;
  heldTier: Tier | null;
}): StartState {
  if (!options.allowed) return 'capability';
  // An UNKNOWN tier — still loading, or the request failed — sells nothing. Falling through
  // to `tier` here would show an upgrade card to a Gold customer for a second or two, and
  // an upgrade prompt for something already paid for is worse than a moment's silence.
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

  // Null while it loads, and null if the request failed. A lane then reads as `soon`
  // rather than as an upgrade prompt: guessing that a customer is on Bronze and selling
  // them what they already own is worse than saying nothing yet.
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
          // No single honest number — a form is as long as its questions, and the template
          // gallery prints each one's own estimate.
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
          // Straight to the detail page, which already shows the QR code and the public
          // link (`T-089`, `DEC-086`) — the same landing the Campaigns list uses, because
          // there is only one right screen to be on afterwards.
          onCreated={(campaign) => {
            setQuick(null);
            navigate(`/app/campaigns/${campaign.id}`);
          }}
        />
      )}
    </>
  );
}
