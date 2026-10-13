import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { StatCard } from '../../../components/data/StatCard.js';
import { ThemeTable } from '../../../components/data/ThemeTable.js';
import { TrendLine, type TrendSeries } from '../../../components/data/TrendLine.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { formatDate } from '../../../lib/format.js';
import { useAnalysis, useThemeDetail } from '../../../lib/analysis.js';
import { useCampaignList } from '../../../lib/campaigns.js';
import { useSubjectList } from '../../../lib/subjects.js';
import { useUnits } from '../../../lib/units.js';
import { flattenUnits } from '../../../lib/tree.js';
import { ConfidenceTag, ReliabilityStrip } from './Confidence.js';
import { Sentiment } from './Sentiment.js';
import { Drivers } from './Drivers.js';
import { ThemePanel } from './ThemePanel.js';
import { UpgradeCard } from '../../../components/billing/UpgradeCard.js';

const FILTER_KEYS = ['from', 'to', 'campaignId', 'unitId', 'subjectId'] as const;

export default function Analysis(): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  const [params, setParams] = useSearchParams();

  const filters = useMemo(
    () =>
      Object.fromEntries(
        FILTER_KEYS.flatMap((key) => {
          const value = params.get(key);
          return value ? [[key, value] as const] : [];
        }),
      ),
    [params],
  );
  const filtered = FILTER_KEYS.some((key) => params.get(key));
  const openTheme = params.get('theme');

  const analysis = useAnalysis(filters, can('analysis.read'));
  const theme = useThemeDetail(openTheme, filters);

  const campaigns = useCampaignList();
  const subjects = useSubjectList({});
  const units = useUnits();
  const unitOptions = useMemo(() => flattenUnits(units.data ?? []), [units.data]);

  const setFilter = (key: string, value: string | undefined): void => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('theme');
    setParams(next, { replace: true });
  };

  const clearFilters = (): void => {
    const next = new URLSearchParams(params);
    for (const key of [...FILTER_KEYS, 'theme']) next.delete(key);
    setParams(next, { replace: true });
  };

  const openThemeId = (id: string): void => {
    const next = new URLSearchParams(params);
    if (params.get('theme') === id) next.delete('theme');
    else next.set('theme', id);
    setParams(next, { replace: true });
  };

  const header = (
    <PageHeader
      title="Analysis"
      subtitle="What people wrote, read as themes rather than one comment at a time."
      {...(filtered ? { filters: [{ label: 'Filtered', onClear: clearFilters }] } : {})}
      action={
        analysis.data ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void analysis.reload()}
            disabled={analysis.refreshing}
          >
            {analysis.refreshing && <span className="spinner" aria-hidden="true" />}
            Refresh
          </button>
        ) : undefined
      }
    />
  );

  if (!can('analysis.read') || analysis.forbidden) {
    return (
      <div className="page">
        {header}
        <EmptyState
          icon="results"
          title="You do not have access to this"
          body="Your account cannot open the analysis. Whoever administers your organisation can change that."
        />
      </div>
    );
  }

  if (analysis.upgrade) {
    return (
      <div className="page">
        {header}
        <UpgradeCard
          requiredTier={analysis.upgrade.requiredTier}
          currentTier={analysis.upgrade.currentTier}
          icon="results"
          sells="the layer that says why the numbers moved, not just what they are"
        />
      </div>
    );
  }

  const view = analysis.data;

  if (analysis.loading && !view) {
    return (
      <div className="page">
        {header}
        {/* Skeletons rather than a word, because analysis is slow and the wait has to be
            legible (43 § States). "Loading…" on a screen that takes two seconds reads as a
            page that has stopped. */}
        <div className="analysis-skeletons" aria-busy="true">
          <div className="skeleton-card is-tall" />
          <div className="skeleton-card is-tall" />
          <div className="skeleton-card is-tall" />
        </div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="page">
        {header}
        <p className="form-error" role="alert">
          That did not load. {analysis.error?.message ?? 'Try again in a moment.'}
        </p>
      </div>
    );
  }

  const { reliability } = view;

  return (
    <div className="page">
      {header}

      <div className="analysis-filters">
        <label className="field-inline">
          <span className="text-muted">{labels.campaign.one}</span>
          <select
            className="input"
            value={params.get('campaignId') ?? ''}
            onChange={(event) => setFilter('campaignId', event.target.value || undefined)}
          >
            <option value="">All</option>
            {(campaigns.data?.data ?? []).map((campaign) => (
              <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          <span className="text-muted">{labels.unit.one}</span>
          <select
            className="input"
            value={params.get('unitId') ?? ''}
            onChange={(event) => setFilter('unitId', event.target.value || undefined)}
          >
            <option value="">All</option>
            {unitOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          <span className="text-muted">{labels.subject.one}</span>
          <select
            className="input"
            value={params.get('subjectId') ?? ''}
            onChange={(event) => setFilter('subjectId', event.target.value || undefined)}
          >
            <option value="">All</option>
            {(subjects.data?.data ?? []).map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
        </label>
        {/* BOTH OR NEITHER, and the hint says why: `delta` is measured against the window
            immediately before this one, so a window with no start has nothing to compare
            with (43 § Data contract). */}
        <label className="field-inline">
          <span className="text-muted">From</span>
          <input
            type="date"
            className="input"
            value={params.get('from') ?? ''}
            onChange={(event) => setFilter('from', event.target.value || undefined)}
          />
        </label>
        <label className="field-inline">
          <span className="text-muted">To</span>
          <input
            type="date"
            className="input"
            value={params.get('to') ?? ''}
            onChange={(event) => setFilter('to', event.target.value || undefined)}
          />
        </label>
      </div>

      <ReliabilityStrip
        responseCount={reliability.responseCount}
        audienceEstimate={reliability.audienceEstimate}
        responseRate={reliability.responseRate}
        confidence={reliability.confidence}
      />

      {analysis.error && (
        <p className="form-error" role="alert">
          Could not refresh just now. These numbers are from the last successful read.
        </p>
      )}

      {reliability.responseCount === 0 ? (
        <EmptyState
          icon="results"
          title="Nothing to analyse yet"
          body={`Analysis appears once a ${labels.campaign.one.toLowerCase()} has collected written answers.`}
          action={
            <Link className="btn btn-primary" to="/app/campaigns">
              Go to {labels.campaign.many.toLowerCase()}
            </Link>
          }
        />
      ) : view.suppressed ? (
        <div className="card results-suppressed">
          <h3>Not enough responses yet</h3>
          <p className="text-muted">
            Analysis appears once {view.threshold} people have responded.{' '}
            {reliability.responseCount} so far.
          </p>
          <p className="text-meta">
            With fewer than that, a theme and a comment together can identify who wrote it.
          </p>
        </div>
      ) : (
        <>
          <div className="stat-row">
            <StatCard
              kicker="Responses"
              value={reliability.responseCount}
              context={
                reliability.audienceEstimate === null
                  ? 'no fixed list to compare against'
                  : `of ${reliability.audienceEstimate} asked`
              }
            />
            <StatCard
              kicker="Written answers"
              value={view.commentCount ?? 0}
              context="what the themes were read from"
            />
            {/* "Themes found", not "Themes" — the section heading below is already that
                word, and two different things on one page answering to the same name is a
                screen reader announcing them identically and a reader asking which one the
                number belongs to. */}
            <StatCard
              kicker="Themes found"
              value={(view.themes ?? []).length}
              context="recurring across those answers"
            />
          </div>

          <div className="analysis-grid">
            {view.sentiment && (
              <Sentiment
                positive={view.sentiment.positive}
                neutral={view.sentiment.neutral}
                negative={view.sentiment.negative}
                commentCount={view.commentCount ?? 0}
                confidence={reliability.confidence}
              />
            )}

            <section className="card analysis-card analysis-trend">
              <div className="analysis-card-head">
                <h3 className="analysis-card-title">Sentiment over time</h3>
                <ConfidenceTag level={reliability.confidence} />
              </div>
              <TrendLine
                labels={(view.trend ?? []).map((point) => formatDate(point.date))}
                series={seriesOf(view.trend ?? [])}
                caption="Comments by sentiment, per day"
                empty={
                  <p className="text-muted">
                    Not enough days yet to draw a trend. One day of answers is a number, not
                    a direction.
                  </p>
                }
              />
            </section>
          </div>

          <section className="card analysis-card">
            <div className="analysis-card-head">
              <h3 className="analysis-card-title">Themes</h3>
              <ConfidenceTag level={reliability.confidence} />
            </div>
            <p className="text-meta analysis-card-lead">
              What people brought up, most-mentioned first. Open one to read the comments it
              came from.
            </p>
            <ThemeTable
              themes={view.themes ?? []}
              onOpen={openThemeId}
              openId={openTheme}
              caption="Themes by mentions"
              empty={
                <p className="text-muted">
                  No theme came up often enough to be worth naming. That is a real answer:
                  with this many answers, a word appearing twice is a coincidence.
                </p>
              }
            />
          </section>

          {/* THE DRILL-THROUGH, and it can 403 on its own — it carries `response.read` as
              well, because verbatim comments are what `40` already priced. The analysis
              above it stays on screen either way. */}
          {openTheme && (
            <ThemePanel
              detail={theme.data}
              loading={theme.loading}
              forbidden={theme.forbidden}
              error={theme.error}
              onClose={() => openThemeId(openTheme)}
              subjectWord={labels.subject.one}
              campaignWord={labels.campaign.one}
            />
          )}

          <Drivers drivers={view.drivers ?? []} confidence={reliability.confidence} />
        </>
      )}
    </div>
  );
}

function seriesOf(
  trend: Array<{ date: string; positive: number; neutral: number; negative: number }>,
): TrendSeries[] {
  return [
    { key: 'positive', label: 'Positive', tone: 'good', points: trend.map((p) => p.positive) },
    { key: 'neutral', label: 'Neutral', tone: 'neutral', points: trend.map((p) => p.neutral) },
    { key: 'negative', label: 'Negative', tone: 'bad', points: trend.map((p) => p.negative) },
  ];
}
