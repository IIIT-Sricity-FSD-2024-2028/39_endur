// T-038 — /app/campaigns. 38, design_specs/design/06 §6.1.
//
// **Share is a top-level action on the card, never inside a `⋯` menu.** On demo day, going
// from this list to a projected QR code must be ONE click, and a menu is a second one plus
// a hunt.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CampaignStatus, CampaignSummary } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ShareSheet } from '../../../components/feedback/ShareSheet.js';
import { Icon } from '../../../components/Icon.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { ApiError } from '../../../lib/api.js';
import { formatDate, pluralise } from '../../../lib/format.js';
import { useCampaignList } from '../../../lib/campaigns.js';

/** The four values the derivation can produce (DEC-016), plus "everything". */
const FILTERS: Array<{ key: CampaignStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Collecting' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'draft', label: 'Draft' },
  { key: 'closed', label: 'Closed' },
];

/** Status is DATA, derived on read — so the tag is a lookup, never a computation here. */
export const STATUS_TAG: Record<CampaignStatus, { label: string; className: string }> = {
  open: { label: 'Collecting', className: 'tag tag-accent-2' },
  scheduled: { label: 'Scheduled', className: 'tag tag-neutral' },
  draft: { label: 'Draft', className: 'tag tag-neutral is-draft' },
  closed: { label: 'Closed', className: 'tag tag-outline' },
};

/** "ends in 6 days" / "starts 1 Sep". The line that makes a card feel live. */
export function timing(campaign: CampaignSummary, now = Date.now()): string | null {
  if (campaign.status === 'closed') {
    return campaign.closedAt ? `closed ${formatDate(campaign.closedAt)}` : 'closed';
  }
  if (campaign.status === 'scheduled' && campaign.startsAt) {
    return `starts ${formatDate(campaign.startsAt)}`;
  }
  if (campaign.status === 'open' && campaign.endsAt) {
    // FLOOR, not ceil. With ceil, a campaign closing in six hours reads "ends in 1 day" —
    // it rounds AWAY from the deadline, which is the one direction that misleads. Floor
    // says "ends today" for anything inside twenty-four hours, which is what is true.
    const remaining = new Date(campaign.endsAt).getTime() - now;
    if (remaining < 0) return 'ending';
    const days = Math.floor(remaining / 86_400_000);
    if (days === 0) return 'ends today';
    return `ends in ${pluralise(days, 'day', 'days')}`;
  }
  return null;
}

export default function Campaigns(): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') as CampaignStatus | null;

  const list = useCampaignList({ ...(status ? { status } : {}) });
  const [sharing, setSharing] = useState<CampaignSummary | null>(null);

  const rows = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  const setFilter = (key: CampaignStatus | 'all'): void => {
    const next = new URLSearchParams(params);
    if (key === 'all') next.delete('status');
    else next.set('status', key);
    next.delete('cursor');
    setParams(next);
  };

  return (
    <>
      <PageHeader
        title={labels.campaign.many}
        subtitle={total > 0 ? pluralise(total, labels.campaign.one, labels.campaign.many) : undefined}
        action={
          can('campaign.create') && !(rows.length === 0 && !status) ? (
            <Link className="btn btn-primary" to="/app/campaigns/new">
              <Icon name="add" size={18} /> New {labels.campaign.one.toLowerCase()}
            </Link>
          ) : undefined
        }
      />

      <div className="segmented" role="radiogroup" aria-label="Status">
        {FILTERS.map((filter) => (
          <label className={`segment${(status ?? 'all') === filter.key ? ' is-active' : ''}`} key={filter.key}>
            <input
              type="radio"
              name="status"
              checked={(status ?? 'all') === filter.key}
              onChange={() => setFilter(filter.key)}
            />
            <span>{filter.label}</span>
          </label>
        ))}
      </div>

      {list.error && (
        <p className="form-error" role="alert">
          {list.error instanceof ApiError ? list.error.message : 'Could not load those.'}{' '}
          <button type="button" className="btn btn-ghost" onClick={() => void list.reload()}>
            Try again
          </button>
        </p>
      )}

      {list.loading && !list.data ? (
        <div className="cgrid" aria-hidden="true">
          {[0, 1].map((index) => (
            <div className="card ccard" key={index}>
              <span className="skeleton-row" />
              <span className="skeleton-row wide" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="campaign"
          title={status ? `No ${labels.campaign.many} there` : `No ${labels.campaign.many} yet`}
          body={
            status
              ? 'Nothing has that status yet. Clearing the filter brings the rest back.'
              : `A ${labels.campaign.one.toLowerCase()} is a form, some ${labels.subject.many.toLowerCase()}, an audience and a window. Creating one takes three steps and ends with a code people can scan.`
          }
          action={
            status ? (
              <button type="button" className="btn btn-secondary" onClick={() => setFilter('all')}>
                Clear filter
              </button>
            ) : can('campaign.create') ? (
              <Link className="btn btn-primary" to="/app/campaigns/new">
                Create a {labels.campaign.one.toLowerCase()}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="cgrid">
          {rows.map((campaign) => {
            const tag = STATUS_TAG[campaign.status];
            const when = timing(campaign);
            return (
              <article className="card ccard" key={campaign.id}>
                <div className="ccard-top">
                  <span className={tag.className}>{tag.label}</span>
                  {when && <span className="text-meta">{when}</span>}
                </div>
                <h4 className="ccard-name">
                  <Link to={`/app/campaigns/${campaign.id}`}>{campaign.name}</Link>
                </h4>
                <p className="ccard-meta text-meta">
                  {campaign.templateName} · {pluralise(campaign.subjectCount, labels.subject.one, labels.subject.many)}
                  {campaign.anonymous && ' · anonymous'}
                </p>
                <p className="ccard-count">
                  {pluralise(campaign.responseCount, 'response', 'responses')}
                </p>
                <div className="ccard-actions">
                  {/* One click from list to projected QR. A draft has no token and no
                      reachable URL, so it has nothing to share yet (38 § States). */}
                  {campaign.url && (
                    <button type="button" className="btn btn-primary" onClick={() => setSharing(campaign)}>
                      <Icon name="share" size={16} /> Share
                    </button>
                  )}
                  {campaign.status !== 'draft' && (
                    <Link className="btn btn-secondary" to={`/app/campaigns/${campaign.id}/results`}>
                      Results
                    </Link>
                  )}
                  <Link className="btn btn-ghost" to={`/app/campaigns/${campaign.id}`}>Open</Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {sharing?.url && (
        <ShareSheet
          url={sharing.url}
          campaignName={sharing.name}
          status={sharing.status}
          endsAt={sharing.endsAt}
          anonymous={sharing.anonymous}
          access={sharing.access}
          onClose={() => setSharing(null)}
        />
      )}
    </>
  );
}
