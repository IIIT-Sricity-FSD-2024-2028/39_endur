// `/ops/analytics` — `71` § Interactions. The whole estate at once, for the owner.
//
// OWNER ONLY (`71` § Route & access): the nav item is absent for `staff` (`OpsLayout`), and a
// direct visit here still gets a full-page 403 naming the capability rather than an empty
// screen that looks broken — the route itself refuses with `platform.analytics.read` in the
// message (`router.ts`).
import { Link, useSearchParams } from 'react-router-dom';
import { TIERS } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { StatCard } from '../../../components/data/StatCard.js';
import { BarRow } from '../../../components/data/BarRow.js';
import { ResponsiveTable, type Column } from '../../../components/data/ResponsiveTable.js';
import { GrowthChart } from '../../../components/platform/GrowthChart.js';
import { useAnalytics, type AnalyticsWindow } from '../../../lib/analytics-ops.js';

const TIER_LABEL: Record<string, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  enterprise: 'Enterprise',
};

type MovementRow = { period: string; new: number; upgraded: number; downgraded: number; churned: number };

function readWindow(params: URLSearchParams): AnalyticsWindow {
  const granularity = params.get('granularity');
  return {
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    granularity: granularity === 'quarter' ? 'quarter' : 'month',
  };
}

export default function Analytics(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const window = readWindow(params);
  const analytics = useAnalytics(window);

  const setWindow = (patch: Partial<AnalyticsWindow>): void => {
    const next = new URLSearchParams(params);
    const merged = { ...window, ...patch };
    if (merged.from) next.set('from', merged.from); else next.delete('from');
    if (merged.to) next.set('to', merged.to); else next.delete('to');
    next.set('granularity', merged.granularity);
    setParams(next);
  };

  if (analytics.forbidden) {
    return (
      <div className="fullpage">
        <div>
          <h3>You do not have access to this</h3>
          <p className="text-muted">
            Analytics needs the <code>platform.analytics.read</code> capability, which only the
            owner role holds.
          </p>
        </div>
      </div>
    );
  }

  const data = analytics.data;
  const movementColumns: Column<MovementRow>[] = [
    { key: 'period', header: 'Period', primary: true, render: (row) => row.period },
    { key: 'new', header: 'New', render: (row) => row.new },
    { key: 'upgraded', header: 'Upgraded', render: (row) => row.upgraded },
    { key: 'downgraded', header: 'Downgraded', render: (row) => row.downgraded },
    { key: 'churned', header: 'Churned', render: (row) => row.churned },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Analytics"
        subtitle="Is this working? — the whole estate at once, in aggregate."
        vocabulary={false}
        action={
          <div className="ops-filters">
            <input
              type="date"
              className="input"
              aria-label="From"
              value={window.from?.slice(0, 10) ?? ''}
              onChange={(event) => setWindow({ from: event.target.value || undefined })}
            />
            <input
              type="date"
              className="input"
              aria-label="To"
              value={window.to?.slice(0, 10) ?? ''}
              onChange={(event) => setWindow({ to: event.target.value || undefined })}
            />
            <select
              className="input"
              value={window.granularity}
              onChange={(event) => setWindow({ granularity: event.target.value === 'quarter' ? 'quarter' : 'month' })}
            >
              <option value="month">Monthly</option>
              <option value="quarter">Quarterly</option>
            </select>
          </div>
        }
      />

      {analytics.error && (
        <p className="field-error" role="alert">{analytics.error.message}</p>
      )}

      <div className={analytics.loading ? 'is-dimmed' : undefined}>
        {!data ? (
          <p className="text-muted" aria-live="polite">Loading…</p>
        ) : (
          <div className="ops-sections">
            <div className="stat-row">
              <StatCard
                kicker="Organisations"
                value={data.orgs.joined}
                context={`${data.orgs.total} total · excludes ${data.orgs.trialing} trialing and ${data.orgs.cancelled} cancelled`}
              />
              <StatCard
                kicker="Trials started"
                value={data.trials.started}
                context={`${data.trials.converted} converted · ${data.trials.expired} expired, in this window`}
              />
              <StatCard
                kicker="Conversion rate"
                // A dash, never `0%` — decision 3: no trial has completed is not a measured zero.
                value={data.trials.conversionRate === null ? '—' : `${Math.round(data.trials.conversionRate * 100)}%`}
                context={
                  data.trials.conversionRate === null
                    ? 'No trial has completed in this window yet'
                    : `${data.trials.converted} of ${data.trials.converted + data.trials.expired} completed trials`
                }
              />
              <StatCard
                kicker="Quiet 30 days"
                value={data.adoption.orgsQuiet30d}
                context={`of ${data.orgs.total} organisations · no response in the last 30 days`}
              />
            </div>

            <section className="card">
              <h3>Movement</h3>
              <p className="text-muted">
                Four counts, never netted — an honest total has no single number.
              </p>
              <GrowthChart series={data.movement} granularity={data.window.granularity} />
              <ResponsiveTable
                columns={movementColumns}
                rows={data.movement}
                rowKey={(row) => row.period}
                caption="Organisation movement by period"
                empty={<p className="text-muted">No movement in this window.</p>}
              />
            </section>

            <section className="card">
              <h3>Tier mix</h3>
              <p className="text-muted">
                {data.byTier.reduce((sum, row) => sum + row.orgs, 0)} organisations · excludes{' '}
                {data.orgs.trialing} trialing
              </p>
              {TIERS.map((tier) => {
                const row = data.byTier.find((entry) => entry.tier === tier);
                return (
                  <BarRow
                    key={tier}
                    label={`${TIER_LABEL[tier]} · ${row?.seats ?? 0} seats`}
                    value={row?.orgs ?? 0}
                    total={data.orgs.total}
                    showPercent
                  />
                );
              })}
            </section>

            <section className="card">
              <h3>Adoption</h3>
              <p className="text-muted">
                {data.adoption.orgsWithACampaign} of {data.orgs.total} organisations have a
                campaign · {data.adoption.orgsWithAResponse} have at least one response
              </p>
              <Link className="btn btn-secondary" to="/ops">
                Open the estate list
              </Link>
            </section>

            <section className="card">
              <h3>Totals</h3>
              <p className="text-muted">
                {data.totals.seats} seats · {data.totals.campaigns} campaigns ·{' '}
                {data.totals.responses} responses, counted — never read
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
