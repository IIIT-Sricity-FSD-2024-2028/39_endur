// T-038 — /app/campaigns/:id. 38, design_specs/design/06 §6.4.
//
// **Share is reachable forever from here**, not only in the moment after launch. The share
// sheet is never a one-time screen (38 § The share sheet).
//
// design_specs §6.4 also draws a responses-over-time sparkline, an average completion time
// and a per-subject breakdown. NONE OF THOSE HAVE AN ENDPOINT: `CampaignDetail` carries a
// response count and its subjects, and `13` specifies nothing that would answer the other
// three. Per-subject numbers are `40`'s (the results page, behind the k-anonymity gate),
// which is where they belong — a second ungated path to per-subject aggregates is exactly
// what INV-007 exists to prevent. The stat cards here show what is true.
import { useState } from 'react';
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
import { useCampaign, launchKey } from '../../../lib/campaigns.js';
import { STATUS_TAG, timing } from './index.js';
import { closeConsequence } from './summary-close.js';

export default function CampaignDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const labels = useLabels();
  const can = useCan();
  const campaign = useCampaign(id);

  const [sharing, setSharing] = useState(false);
  /**
   * The URL the launch call itself returned.
   *
   * `launch()` also refetches, and the refetched campaign carries the same URL — but "the
   * share sheet appears within one second of launch" is an acceptance criterion, and
   * hanging it on a second round trip means a slow or failed refetch shows the reader
   * nothing at all after the one irreversible button on the page.
   */
  const [launchedUrl, setLaunchedUrl] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const message = (cause: unknown, fallback: string): string =>
    cause instanceof ApiError ? cause.message : fallback;

  const launch = (): void => {
    setBusy(true);
    setError(null);
    void campaign
      .launch(launchKey(detail.id))
      .then((result) => {
        setLaunchedUrl(result.url);
        setSharing(true);
      })
      .catch((cause: unknown) => setError(message(cause, 'That could not be launched.')))
      .finally(() => setBusy(false));
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
              <button type="button" className="btn btn-primary" onClick={() => setSharing(true)}>
                <Icon name="share" size={16} /> Share
              </button>
            )}
            {detail.status === 'draft' && can('campaign.launch') && (
              // The irreversible one. Disabled while in flight, and idempotent behind that.
              <button type="button" className="btn btn-primary" onClick={launch} disabled={busy}>
                {busy ? 'Launching…' : `Launch ${labels.campaign.one.toLowerCase()}`}
              </button>
            )}
            {detail.status !== 'draft' && (
              <Link className="btn btn-secondary" to={`/app/campaigns/${detail.id}/results`}>
                Results
              </Link>
            )}
            {detail.status === 'open' && can('campaign.close') && (
              <button type="button" className="btn btn-secondary" onClick={() => setClosing(true)}>
                Close early
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
          onClose={() => setSharing(false)}
        />
      )}

      {closing && (
        <ConfirmDialog
          title={`Close ${detail.name}?`}
          consequence={closeConsequence(detail.responseCount)}
          verb="Close"
          destructive
          onConfirm={() => {
            setClosing(false);
            void campaign.close().catch((cause: unknown) => {
              setError(message(cause, 'That could not be closed.'));
            });
          }}
          onCancel={() => setClosing(false)}
        />
      )}
    </>
  );
}
