// One campaign. What is open on the page and what is in flight is `state.campaigns.pages[id]`
// (store/screens/campaigns.ts); Launch and Close are thunks there. docs/REDUX-PLAN.md §6.10.
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { StatCard } from '../../../components/data/StatCard.js';
import { ShareSheet } from '../../../components/feedback/ShareSheet.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { Icon } from '../../../components/Icon.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { ApiError } from '../../../lib/api.js';
import { formatDateTime } from '../../../lib/format.js';
import { useCampaign } from '../../../lib/campaigns.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { messageOf, useClearOnLeave } from '../../../store/screens/common.js';
import {
  campaignPageClosed,
  campaignPageLaunched,
  campaignPageLeft,
  campaignShareClosed,
  campaignShareOpened,
  closeConfirmDismissed,
  closeConfirmOpened,
  selectCampaignPage,
} from '../../../store/screens/campaigns.js';
import { STATUS_TAG, timing } from './card.js';
import { CANCEL_SCHEDULED, closeConsequence } from './summary-close.js';

export default function CampaignDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const labels = useLabels();
  const can = useCan();
  const campaign = useCampaign(id);
  const campaignId = id ?? '';
  const dispatch = useAppDispatch();
  const page = useAppSelector((state) => selectCampaignPage(state, campaignId));
  useClearOnLeave(campaignPageLeft({ campaignId }));
  const { sharing, launchedUrl, confirmingClose: closing } = page;
  const busy = page.launching;
  const error = messageOf(page.error, 'That could not be done. Try again.');

  const detail = campaign.data;

  if (campaign.loading && !detail) return <p className="text-muted">Loading…</p>;

  if (!detail) {
    return (
      <div className="fullpage">
        <div>
          <h3>That is not here</h3>
          <p className="text-muted">
            {campaign.error instanceof ApiError ? campaign.error.message : 'It may have been deleted.'}
          </p>
          <Link className="btn btn-secondary" to="/app/campaigns">Back</Link>
        </div>
      </div>
    );
  }

  const shareUrl = launchedUrl ?? detail.url;
  const tag = STATUS_TAG[detail.status];
  const when = timing(detail);
  const launch = (): void => {
    void dispatch(campaignPageLaunched({ campaignId: detail.id }));
  };

  return (
    <>
      <PageHeader
        title={detail.name}
        subtitle={[
          tag.label,
          when,
          detail.anonymous ? 'anonymous' : null,
        ].filter(Boolean).join(' · ')}
        action={
          <span className="page-actions">
            {shareUrl && (
              <button type="button" className="btn btn-primary" onClick={() => dispatch(campaignShareOpened({ campaignId: detail.id }))}>
                <Icon name="share" size={16} /> Share
              </button>
            )}
            {detail.status === 'draft' && can('campaign.launch') && (
              <button type="button" className="btn btn-primary" onClick={launch} disabled={busy}>
                {busy ? 'Launching…' : `Launch ${labels.campaign.one.toLowerCase()}`}
              </button>
            )}
            {detail.status !== 'draft' && can('results.read') && (
              <Link className="btn btn-secondary" to={`/app/campaigns/${detail.id}/results`}>
                Results
              </Link>
            )}
            {detail.status === 'open' && can('campaign.close') && (
              <button type="button" className="btn btn-secondary" onClick={() => dispatch(closeConfirmOpened({ campaignId: detail.id }))}>
                Close early
              </button>
            )}
            {/* R-805: a scheduled campaign could not be called off at all. Same command as
                Close early (`campaignPageClosed`), said for what it is here. */}
            {detail.status === 'scheduled' && can('campaign.close') && (
              <button type="button" className="btn btn-secondary" onClick={() => dispatch(closeConfirmOpened({ campaignId: detail.id }))}>
                Call it off
              </button>
            )}
          </span>
        }
      />

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="stat-row">
        <StatCard kicker="Responses" value={String(detail.responseCount)} />
        <StatCard kicker={labels.subject.many} value={String(detail.subjectCount)} />
        <StatCard
          kicker="Opens"
          value={detail.startsAt ? formatDateTime(detail.startsAt) : 'On launch'}
        />
        <StatCard
          kicker="Closes"
          value={
            detail.closedAt
              ? formatDateTime(detail.closedAt)
              : detail.endsAt
                ? formatDateTime(detail.endsAt)
                : 'When closed'
          }
        />
      </div>

      <section className="tsection">
        <h3 className="tsection-head">{labels.subject.many} being reviewed</h3>
        <ul className="subject-list">
          {detail.subjects.map((subject) => (
            <li key={subject.id}>
              <Link to={`/app/subjects/${subject.id}`}>{subject.name}</Link>
              {subject.unitName && <span className="text-meta"> {subject.unitName}</span>}
            </li>
          ))}
        </ul>
        <p className="text-meta">
          Per-{labels.subject.one.toLowerCase()} numbers are on the results screen, where the
          suppression threshold is applied.
        </p>
      </section>

      {sharing && shareUrl && (
        <ShareSheet
          url={shareUrl}
          campaignName={detail.name}
          status={detail.status}
          endsAt={detail.endsAt}
          anonymous={detail.anonymous}
          access={detail.access}
          onClose={() => dispatch(campaignShareClosed({ campaignId: detail.id }))}
        />
      )}

      {closing && (
        <ConfirmDialog
          title={detail.status === 'scheduled' ? `Call off ${detail.name}?` : `Close ${detail.name}?`}
          consequence={detail.status === 'scheduled' ? CANCEL_SCHEDULED : closeConsequence(detail.responseCount)}
          verb={detail.status === 'scheduled' ? 'Call it off' : 'Close'}
          destructive
          onConfirm={() => void dispatch(campaignPageClosed({ campaignId: detail.id }))}
          onCancel={() => dispatch(closeConfirmDismissed({ campaignId: detail.id }))}
        />
      )}
    </>
  );
}
