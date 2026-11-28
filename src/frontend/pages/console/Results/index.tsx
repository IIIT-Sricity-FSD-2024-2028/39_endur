// One campaign's results. The numbers are the cache's; what is open here, the export, and
// the "just landed" maths are `state.results.pages[id]` (store/screens/results.ts).
// docs/REDUX-PLAN.md §6.10.
import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { StatCard } from '../../../components/data/StatCard.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ShareSheet } from '../../../components/feedback/ShareSheet.js';
import { Icon } from '../../../components/Icon.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { ApiError } from '../../../lib/api.js';
import { formatDate } from '../../../lib/format.js';
import { useCampaign } from '../../../lib/campaigns.js';
import { useUnits } from '../../../lib/units.js';
import { flattenUnits } from '../../../lib/tree.js';
import { resultsSearch, useResponses, useResults } from '../../../lib/results.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { messageOf } from '../../../store/screens/common.js';
import {
  commentsExpanded,
  resultsExported,
  resultsShareClosed,
  resultsShareOpened,
  selectResultsFigures,
  selectResultsPage,
} from '../../../store/screens/results.js';
import { STATUS_TAG } from '../Campaigns/card.js';
import { statCards } from './stats.js';
import { QuestionResult } from './QuestionResult.js';
import { Comments } from './Comments.js';

export default function Results(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const labels = useLabels();
  const can = useCan();
  const [params, setParams] = useSearchParams();

  const subjectId = params.get('subjectId') ?? undefined;
  const unitId = params.get('unitId') ?? undefined;

  const campaign = useCampaign(id);
  const filters = {
    ...(subjectId ? { subjectId } : {}),
    ...(unitId ? { unitId } : {}),
  };
  const results = useResults(id, filters);
  const responses = useResponses(id, can('response.read'));
  const units = useUnits();

  const campaignId = id ?? '';
  const dispatch = useAppDispatch();
  const page = useAppSelector((state) => selectResultsPage(state, campaignId));
  // Every figure on the stat cards, worked out from the cached counts (R-717, §6.12).
  const search = resultsSearch(filters);
  const figures = useAppSelector((state) => selectResultsFigures(state, campaignId, search));
  // Opened and left by `useResults`, which owns the page's lifetime in the store.
  const { sharing, exporting } = page;
  const exportError = messageOf(page.exportError, 'That did not download.');

  const unitOptions = useMemo(() => flattenUnits(units.data ?? []), [units.data]);
  const view = results.data;

  const setFilter = (key: 'subjectId' | 'unitId', value: string): void => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const runExport = (): void => {
    if (!id) return;
    void dispatch(
      resultsExported({ campaignId: id, filename: `${campaign.data?.name ?? 'campaign'}-results.csv` }),
    );
  };

  if (results.loading && !view) return <p className="text-muted">Loading…</p>;

  if (!view) {
    return (
      <div className="fullpage">
        <div>
          <h3>That is not here</h3>
          <p className="text-muted">
            {results.error instanceof ApiError ? results.error.message : 'It may have been deleted.'}
          </p>
          <Link className="btn btn-secondary" to="/app/campaigns">Back</Link>
        </div>
      </div>
    );
  }

  const detail = campaign.data;
  const tag = detail ? STATUS_TAG[detail.status] : null;
  const cards = figures ? statCards(figures, results.arrived) : [];

  return (
    <>
      <PageHeader
        title={detail?.name ?? 'Results'}
        action={
          <div className="header-actions">
            {detail?.url && (
              <button type="button" className="btn btn-secondary" onClick={() => dispatch(resultsShareOpened({ campaignId }))}>
                <Icon name="share" size={16} /> Share
              </button>
            )}
            {can('results.export') && (
              <button type="button" className="btn btn-secondary" onClick={runExport} disabled={exporting}>
                {exporting && <span className="spinner" aria-hidden="true" />}
                Export CSV
              </button>
            )}
          </div>
        }
      />

      <div className="results-status">
        {tag && <span className={tag.className}>{tag.label}</span>}
        <span className="text-meta">
          {view.responseCount} response{view.responseCount === 1 ? '' : 's'}
        </span>
        {detail?.status === 'closed' && detail.closedAt && (
          <span className="text-meta">· closed {formatDate(detail.closedAt)}</span>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void results.reload()}
          disabled={results.refreshing}
        >
          Refresh
        </button>
        {/* aria-live on the counter (40 § Interactions). It is a separate node rather than
            the visible number because the visible one lives inside <StatCard>, and a live
            region that also carries a kicker and a context line announces all three every
            time one response lands. */}
        <p className="sr-only" aria-live="polite">
          {view.responseCount} responses
        </p>
      </div>

      {exportError && <p className="form-error" role="alert">{exportError}</p>}
      {results.error && view && (
        <p className="form-error" role="alert">
          Could not refresh just now. These numbers are from the last successful check.
        </p>
      )}

      {(detail?.subjects.length ?? 0) > 1 || unitOptions.length > 1 ? (
        <div className="results-filters">
          <label className="filter-field">
            <span className="text-meta">{labels.subject.one}</span>
            <select
              className="input"
              value={subjectId ?? ''}
              onChange={(event) => setFilter('subjectId', event.target.value)}
            >
              <option value="">All</option>
              {detail?.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span className="text-meta">{labels.unit.one}</span>
            {/* Both lists are scope-filtered by the API (INV-003): a head of department's
                dropdowns contain only their own unit, so a filter cannot reach past a scope
                the page already applied. */}
            <select
              className="input"
              value={unitId ?? ''}
              onChange={(event) => setFilter('unitId', event.target.value)}
            >
              <option value="">All</option>
              {unitOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {view.responseCount === 0 ? (
        <EmptyState
          icon="inbox"
          title="No responses yet"
          body={`Nobody has answered this ${labels.campaign.one.toLowerCase()} yet. Share the link or the code and they will land here.`}
          action={
            detail?.url ? (
              <button type="button" className="btn btn-primary" onClick={() => dispatch(resultsShareOpened({ campaignId }))}>
                <Icon name="qr" size={16} /> Share the link
              </button>
            ) : undefined
          }
        />
      ) : view.suppressed ? (
        <div className="card results-suppressed">
          <h3>Not enough responses yet</h3>
          {/* NOT AN ERROR, and worded so it does not read as one. This is the anonymity
              promise being kept when it is inconvenient, which is the only time a privacy
              promise means anything (52 §2). */}
          <p className="text-muted">
            Results appear once {view.threshold} people have responded. {view.responseCount} so far.
          </p>
          <p className="text-meta">
            With fewer than that, an average and a comment together can identify who wrote it.
          </p>
        </div>
      ) : (
        <>
          <div className="stat-row">
            {cards.map((card) => (
              <StatCard key={card.kicker} kicker={card.kicker} value={card.value} context={card.context} />
            ))}
          </div>

          <div className="results-questions">
            {(view.questions ?? []).map((question, index) => (
              <QuestionResult
                key={question.questionId}
                question={question}
                index={index}
                responseCount={view.responseCount}
              />
            ))}
          </div>

          {/* ABSENT without response.read, not greyed (40 § States). The aggregates above
              still render, which is the whole point of the two capabilities being two. */}
          {can('response.read') && !responses.forbidden && !responses.suppressed && (
            <Comments
              items={responses.data?.data ?? []}
              total={responses.data?.meta.total ?? 0}
              hasMore={responses.data?.page.hasMore ?? false}
              onMore={() => void responses.loadMore()}
              seenBefore={page.seenBefore ?? null}
              expanded={page.commentsExpanded}
              onExpand={() => dispatch(commentsExpanded({ campaignId }))}
              subjectWord={labels.subject.one}
            />
          )}
        </>
      )}

      {sharing && detail?.url && (
        <ShareSheet
          url={detail.url}
          campaignName={detail.name}
          status={detail.status}
          endsAt={detail.endsAt}
          anonymous={detail.anonymous}
          access={detail.access}
          onClose={() => dispatch(resultsShareClosed({ campaignId }))}
        />
      )}
    </>
  );
}
