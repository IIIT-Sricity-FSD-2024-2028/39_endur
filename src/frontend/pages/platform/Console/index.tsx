// `/ops`: the estate, every organisation on the platform as numbers (`70`). R-716.
//
// WHERE EVERYTHING ON THIS PAGE LIVES:
// - the filters and the sort: `state.opsReports.estate` (they survive a look at one
//   organisation and back, because they are in the store, not in this component);
// - the search box's text while it is being typed: `state.operator.estate.term`;
// - the organisations and the estate's numbers: RTK Query's cache (`getEstate`,
//   `getOpsStats`), subscribed to by `useEstate` / `useEstateStats`;
// - every count, share, flag and the order of the rows: `selectEstateView` and
//   `selectEstateStatsView` (store/screens/opsReports.ts). This page computes nothing.
import { Link } from 'react-router-dom';
import type { Tier } from '@endur/shared';
import { EnterpriseQueue } from '../../../components/platform/EnterpriseQueue.js';
import { Icon } from '../../../components/Icon.js';
import {
  Denied,
  Empty,
  Kpi,
  OpsError,
  OpsHeader,
  Pill,
  TierPill,
} from '../../../components/platform/OpsUi.js';
import { formatRelative } from '../../../lib/format.js';
import { useEnterpriseQueue, useEstate, useEstateStats } from '../../../lib/estate.js';
import { useOpsCan } from '../../../lib/opsCapabilities.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { useClearOnLeave } from '../../../store/screens/common.js';
import {
  enterpriseRequestApproved,
  enterpriseRequestMoved,
  estateLeft,
  estateSearchTyped,
  opsMessageOf,
  selectOperator,
} from '../../../store/screens/operator.js';
import {
  estateFilterChanged,
  estateFiltersCleared,
  estateSorted,
  selectEstateFiltered,
  selectEstateFilters,
  selectEstateSearch,
  selectEstateSort,
  selectEstateStatsView,
  selectEstateView,
  TIER_LABEL,
  type EstateRow,
  type EstateSort,
  type OrgChip,
} from '../../../store/screens/opsReports.js';

const SORTS: Array<{ value: EstateSort; label: string }> = [
  { value: 'attention', label: 'Needs attention first' },
  { value: 'name', label: 'Name' },
  { value: 'newest', label: 'Newest' },
  { value: 'responses', label: 'Most responses (30 days)' },
  { value: 'seats', label: 'Most seats' },
];

const CHIP: Record<OrgChip, { label: string; tone: 'good' | 'warn' | 'bad' | 'accent' | undefined }> = {
  suspended: { label: 'Suspended', tone: 'bad' },
  overSeats: { label: 'Over seats', tone: 'bad' },
  lapsed: { label: 'Lapsed', tone: 'warn' },
  endingSoon: { label: 'Ending soon', tone: 'warn' },
  quiet: { label: 'Quiet', tone: undefined },
};

const FLAG_ORDER: OrgChip[] = ['suspended', 'overSeats', 'lapsed', 'endingSoon', 'quiet'];

const SUBSCRIPTION: Record<string, { label: string; tone: 'good' | 'warn' | 'accent' | undefined }> = {
  active: { label: 'Active', tone: 'good' },
  trialing: { label: 'Trial', tone: 'accent' },
  cancelled: { label: 'Cancelled', tone: 'warn' },
  none: { label: 'No subscription', tone: undefined },
};

const FILL: Record<Tier, string> = {
  bronze: 'ops-fill-bronze',
  silver: 'ops-fill-silver',
  gold: 'ops-fill-gold',
  enterprise: 'ops-fill-enterprise',
};

/** Today as `YYYY-MM-DD` (UTC): the day the "ending soon" flags are counted from. */
const todayKey = (): string => new Date().toISOString().slice(0, 10);

function PlanCell({ row }: { row: EstateRow }): JSX.Element {
  const { org } = row;
  return (
    <div className="ops-table-org">
      <TierPill tier={org.tier} label={row.tierLabel} />
      {org.lapsedFrom ? (
        <span>{TIER_LABEL[org.lapsedFrom]} ran out</span>
      ) : row.daysLeft !== null && org.tier !== 'bronze' ? (
        <span>{row.daysLeft === 0 ? 'ends today' : `ends in ${row.daysLeft} day${row.daysLeft === 1 ? '' : 's'}`}</span>
      ) : null}
    </div>
  );
}

export default function Console(): JSX.Element {
  const can = useOpsCan();
  const dispatch = useAppDispatch();

  const search = useAppSelector(selectEstateSearch);
  const filters = useAppSelector(selectEstateFilters);
  const sort = useAppSelector(selectEstateSort);
  const filtered = useAppSelector(selectEstateFiltered);
  const estate = useEstate(search);
  const statsStatus = useEstateStats(can('platform.usage.read'));
  const stats = useAppSelector(selectEstateStatsView);
  const today = todayKey();
  const view = useAppSelector((state) => selectEstateView(state, today));

  const queue = useEnterpriseQueue(can('platform.enterprise.read'));
  const { term: typed, queueBusyId, queueError } = useAppSelector(selectOperator).estate;
  useClearOnLeave(estateLeft());
  // The box shows what is being typed, else the search in force. It is sent on Enter or when
  // the box loses focus, not per keystroke.
  const term = typed ?? filters.q ?? '';
  const commitSearch = (): void => {
    dispatch(estateFilterChanged({ key: 'q', value: term }));
  };

  if (estate.forbidden) {
    return <Denied capability="platform.org.read" what="The estate list" />;
  }

  const flags = FLAG_ORDER.filter((chip) => view.flagged[chip] > 0);
  const requestId = estate.error && 'requestId' in estate.error ? String(estate.error.requestId) : null;

  return (
    <>
      <OpsHeader
        kicker="Estate"
        title="Organizations"
        subtitle="Every organization on the platform, as numbers. Never their responses, their answers or who gave them."
      />

      {stats && (
        <section className="ops-kpis" aria-label="The estate in numbers">
          <Kpi
            icon="organization"
            label="Organizations"
            value={stats.organizations.toLocaleString()}
            detail={
              <>
                <strong>{stats.active.percent}%</strong> active · {stats.suspended.count} suspended
              </>
            }
          />
          <Kpi
            icon="people"
            label="Seats"
            value={stats.seats.toLocaleString()}
            detail={stats.seatsPerOrg === null ? 'No organizations yet' : <><strong>{stats.seatsPerOrg}</strong> per organization</>}
          />
          <Kpi icon="campaign" label="Live campaigns" value={stats.campaigns.toLocaleString()} detail="Collecting right now" />
          <Kpi
            icon="results"
            label="Responses"
            value={stats.responses.toLocaleString()}
            detail="All time, counted and never read"
          />
        </section>
      )}
      {statsStatus.error && <OpsError>{statsStatus.error.message}</OpsError>}

      {stats && (
        <section className="ops-card card" aria-labelledby="plan-mix">
          <div className="ops-card-head">
            <h2 id="plan-mix">Plan mix</h2>
            <p className="ops-card-note">
              Organizations on each plan now. The shares add up to 100% of {stats.organizations.toLocaleString()}.
            </p>
          </div>
          <div className="ops-strip" aria-hidden="true">
            {stats.tiers.map((tier) => (
              <span key={tier.tier} className={FILL[tier.tier]} style={{ width: `${tier.percent}%` }} />
            ))}
          </div>
          <ul className="ops-strip-legend">
            {stats.tiers.map((tier) => (
              <li key={tier.tier}>
                <span className={`ops-key ${FILL[tier.tier]}`} aria-hidden="true" />
                {tier.label} <strong>{tier.count.toLocaleString()}</strong>
                <span className="ops-how">{tier.percent}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ABOVE THE LIST, because it is the one thing here WAITING on somebody. It renders
          nothing at all when the queue is empty. */}
      <EnterpriseQueue
        rows={queue.rows}
        busyId={queueBusyId}
        error={opsMessageOf(queueError, 'That did not go through.') ?? queue.error}
        onUpdate={(id, status) => void dispatch(enterpriseRequestMoved({ id, status }))}
        onApprove={(id) => void dispatch(enterpriseRequestApproved(id))}
      />

      <section className="ops-card card" aria-labelledby="estate-list">
        <div className="ops-card-head">
          <h2 id="estate-list">All organizations</h2>
          <p className="ops-card-note">
            {view.rows.length.toLocaleString()} shown of {view.total.toLocaleString()}
            {filtered ? ' matching' : ''}
          </p>
        </div>

        <div className="ops-toolbar">
          <input
            className="input ops-search"
            placeholder="Search by name"
            aria-label="Search organizations by name"
            value={term}
            onChange={(event) => dispatch(estateSearchTyped({ term: event.target.value }))}
            onBlur={commitSearch}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitSearch();
            }}
          />
          <select
            className="input"
            aria-label="Plan"
            value={filters.tier ?? ''}
            onChange={(event) => dispatch(estateFilterChanged({ key: 'tier', value: event.target.value }))}
          >
            <option value="">Any plan</option>
            <option value="bronze">Bronze</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <select
            className="input"
            aria-label="Subscription"
            value={filters.status ?? ''}
            onChange={(event) => dispatch(estateFilterChanged({ key: 'status', value: event.target.value }))}
          >
            <option value="">Any subscription</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="none">None</option>
          </select>
          <select
            className="input"
            aria-label="Order"
            value={sort}
            onChange={(event) => dispatch(estateSorted({ sort: event.target.value as EstateSort }))}
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {filtered && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                dispatch(estateFiltersCleared());
                dispatch(estateSearchTyped({ term: '' }));
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {flags.length > 0 && (
          <p className="ops-pills" aria-label="Flags in this list">
            {flags.map((chip) => (
              <Pill key={chip} tone={CHIP[chip].tone}>
                {view.flagged[chip]} {CHIP[chip].label.toLowerCase()}
              </Pill>
            ))}
            <span className="ops-how">among the {view.rows.length} loaded</span>
          </p>
        )}

        {estate.error && (
          <OpsError
            action={
              requestId && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void navigator.clipboard.writeText(requestId)}
                >
                  Copy request id
                </button>
              )
            }
          >
            {estate.error.message}
          </OpsError>
        )}

        <div className={`ops-table-wrap${estate.loading ? ' ops-loading' : ''}`}>
          {view.rows.length === 0 && !estate.loading ? (
            <Empty title={filtered ? 'No organizations match those filters' : 'No organizations yet'}>
              {filtered ? 'Try clearing a filter.' : 'They appear here as soon as one signs up.'}
            </Empty>
          ) : (
            <table className="ops-table">
              <caption className="sr-only">Organizations</caption>
              <thead>
                <tr>
                  <th scope="col">Organization</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="is-num">Seats</th>
                  <th scope="col" className="is-num">Live campaigns</th>
                  <th scope="col" className="is-num">Responses (30 days)</th>
                  <th scope="col">Last active</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => {
                  const subscription = SUBSCRIPTION[row.org.subscriptionStatus] ?? {
                    label: row.org.subscriptionStatus,
                    tone: undefined,
                  };
                  return (
                    <tr key={row.org.id}>
                      <td>
                        <div className="ops-table-org">
                          <Link to={`/ops/orgs/${row.org.id}`}>{row.org.name}</Link>
                          <span>{row.org.industry} · {row.org.slug}</span>
                        </div>
                      </td>
                      <td><PlanCell row={row} /></td>
                      <td>
                        <span className="ops-pills">
                          <Pill tone={subscription.tone}>{subscription.label}</Pill>
                          {row.chips.map((chip) => (
                            <Pill key={chip} tone={CHIP[chip].tone}>{CHIP[chip].label}</Pill>
                          ))}
                        </span>
                      </td>
                      <td className="is-num">{row.seatsLabel}</td>
                      <td className="is-num">{row.org.activeCampaigns}</td>
                      <td className="is-num">{row.org.responsesLast30d.toLocaleString()}</td>
                      <td className="is-muted">
                        {row.org.lastActivityAt ? formatRelative(row.org.lastActivityAt) : 'No activity yet'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {view.hasMore && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void estate.loadMore()}
            disabled={estate.loadingMore}
          >
            <Icon name="chevron" size={16} />
            {estate.loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>
    </>
  );
}
