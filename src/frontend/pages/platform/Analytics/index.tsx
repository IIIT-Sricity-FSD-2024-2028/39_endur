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
              {/* TRIALS STARTED AND CONVERSION RATE ARE GONE — DEC-102. Not moved, not
                  reworded: removed, because neither could ever move. `DEC-048` made
                  registration write `status: 'active'`, so nothing is ever trialing, and
                  `converted` was a hardcoded 0 under a comment saying it had no source. The
                  honest thing to do with a metric that has no source is not to print it, and
                  two of six headline cards that cannot change teach a reader to stop
                  believing the other four. */}
              <StatCard
                kicker="Gone quiet"
                value={data.adoption.orgsQuiet30d}
                context={`of ${data.orgs.total} organisations · no response in the last 30 days`}
              />
            </div>

            <section className="card">
              {/* THE ONE SECTION THE DATES GOVERN, AND IT SAYS SO — DEC-103. Every other
                  figure on this page is a count of the whole estate as of today, so moving
                  the window left five of six sections unchanged, which is indistinguishable
                  from a broken control. That was half of the owner's report; the other half
                  was `D-044`, and it was real — `to` excluded the day it named. */}
              <h3>Movement · in this window</h3>
              <p className="text-muted">
                Four counts, never netted — an honest total has no single number. This is the
                only section the dates above change; everything else on this page is as of
                today.
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
              {/* AS OF TODAY, AND IT CANNOT BE OTHERWISE — DEC-103. `subscriptions` holds one
                  row per organisation with NO HISTORY, so "the tier mix on 12 August" is not a
                  question this database can answer. Saying so is the honest label;
                  reconstructing it from `payments` is a different feature. */}
              <h3>Tier mix · as of today</h3>
              <p className="text-muted">
                {data.byTier.reduce((sum, row) => sum + row.orgs, 0)} organisations · excludes{' '}
                {data.orgs.trialing} trialing
              </p>
              {/* NO SEAT COUNT ON THE LABEL — DEC-102. Nothing is billed per seat, so a seat
                  figure on the revenue owner's page measured something no invoice reads. */}
              {TIERS.map((tier) => {
                const row = data.byTier.find((entry) => entry.tier === tier);
                return (
                  <BarRow
                    key={tier}
                    label={TIER_LABEL[tier] ?? tier}
                    value={row?.orgs ?? 0}
                    total={data.orgs.total}
                    showPercent
                  />
                );
              })}
            </section>

            <section className="card">
              <h3>Adoption · as of today</h3>
              <p className="text-muted">
                {data.adoption.orgsWithACampaign} of {data.orgs.total} organisations have a
                campaign · {data.adoption.orgsWithAResponse} have at least one response
              </p>
              <Link className="btn btn-secondary" to="/ops">
                Open the estate list
              </Link>
            </section>

            <section className="card">
              <h3>Totals · as of today</h3>
              {/* "— never read" IS GONE. It was INV-011 stated as a boast, and a boast on a
                  page about numbers reads as a disclaimer somebody felt was needed. The
                  invariant is enforced by the SHAPE of `PlatformAnalytics`, which has no field
                  that could carry a response — a sentence here protects nothing. */}
              <p className="text-muted">
                {data.totals.campaigns} campaigns · {data.totals.responses} responses
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
