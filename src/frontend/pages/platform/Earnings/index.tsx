// `/ops/earnings`: what the estate has paid, by period, by plan, and who paid it (DEC-080,
// `71` § Revenue). R-716.
//
// THE SERVER SENDS SUMS AND COUNTS; EVERYTHING ELSE IS A SELECTOR'S. The report is cached in
// `state.opsApi.queries['getEarnings("?granularity=month")']`, and `selectEarningsView`
// (store/screens/opsReports.ts) derives the average payment, this window's share of all
// revenue, each plan's share of organisations and of revenue (each adding up to 100), the
// ring's slices, each bar's height and the change from one period to the next.
//
// The window is `state.opsReports.window`, the same one Analytics reads.
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney, type Tier } from '@endur/shared';
import { OpsBarChart, type ChartSeries } from '../../../components/platform/OpsBarChart.js';
import { ReportWindow } from '../../../components/platform/ReportWindow.js';
import { Denied, Empty, Kpi, OpsError, OpsHeader, TierPill } from '../../../components/platform/OpsUi.js';
import { formatDate } from '../../../lib/format.js';
import { useEarnings } from '../../../lib/earnings.js';
import { useAppSelector } from '../../../store/index.js';
import { selectEarningsView, selectReportSearch, TIER_LABEL } from '../../../store/screens/opsReports.js';

const FILL: Record<Tier, string> = {
  bronze: 'ops-fill-bronze',
  silver: 'ops-fill-silver',
  gold: 'ops-fill-gold',
  enterprise: 'ops-fill-enterprise',
};

/** The ring's colours, by plan: the same tokens as the fills above. */
const RING: Record<Tier, string> = {
  bronze: 'var(--tier-bronze-500)',
  silver: 'var(--tier-silver-500)',
  gold: 'var(--tier-gold-500)',
  enterprise: 'var(--color-accent-500)',
};

const PURCHASES: ChartSeries[] = [
  { key: 'bronze', label: 'Bronze', fill: 'ops-fill-bronze' },
  { key: 'silver', label: 'Silver', fill: 'ops-fill-silver' },
  { key: 'gold', label: 'Gold', fill: 'ops-fill-gold' },
];

const REVENUE: ChartSeries[] = [{ key: 'revenue', label: 'Revenue', fill: 'ops-fill-accent' }];

const signed = (change: number | null): string => (change === null ? '—' : `${change > 0 ? '+' : ''}${change}%`);

/**
 * The window's revenue, counting up to its value when it arrives. An ANIMATION, so it is a
 * ref writing frames into its own text node, not state (DEC-R03's one exception): the
 * figure rendered is always the true one, and the count-up only runs between frames,
 * skipped for reduced motion.
 */
function CountedMoney({ minor, currency, ms = 600 }: {
  minor: number;
  currency: Parameters<typeof formatMoney>[1];
  ms?: number;
}): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);

  // Effect (animation): count up to the figure by writing frames to the element.
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || minor === 0) return undefined;

    let raf = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / ms);
      element.textContent = formatMoney(Math.round(minor * (1 - Math.pow(1 - t, 3))), currency);
      if (t < 1) raf = requestAnimationFrame(tick);
      else element.textContent = formatMoney(minor, currency);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      element.textContent = formatMoney(minor, currency);
    };
  }, [minor, currency, ms]);

  return <span ref={ref}>{formatMoney(minor, currency)}</span>;
}

export default function Earnings(): JSX.Element {
  const search = useAppSelector(selectReportSearch);
  const report = useEarnings(search);
  const view = useAppSelector(selectEarningsView);

  if (report.forbidden) {
    return <Denied capability="platform.revenue.read" what="Earnings" />;
  }

  return (
    <>
      <OpsHeader
        kicker="Business"
        title="Earnings"
        subtitle="What the estate has paid: by period, by plan, and who paid it."
      />
      <ReportWindow label={view?.window.label} />

      {report.error && <OpsError>{report.error.message}</OpsError>}

      {!view ? (
        <div className="ops-kpis" aria-live="polite">
          <div className="ops-skeleton" />
          <div className="ops-skeleton" />
          <div className="ops-skeleton" />
          <p className="sr-only">Loading…</p>
        </div>
      ) : (
        <div className={`ops-stack${report.loading ? ' ops-loading' : ''}`} aria-busy={report.loading}>
          <section className="ops-kpis" aria-label="This window in numbers">
            <Kpi
              icon="earnings"
              tone="gold"
              label="Revenue in this window"
              value={<CountedMoney minor={view.totals.revenueMinor} currency={view.currency} />}
              detail={
                <>
                  <strong>{view.totals.ofLifetime.percent}%</strong> of {formatMoney(view.totals.lifetimeRevenueMinor, view.currency)} taken in total, all time
                </>
              }
            />
            <Kpi
              icon="plan"
              label="Payments"
              value={view.totals.payments.toLocaleString()}
              detail={`${view.totals.orgsPaying} organization${view.totals.orgsPaying === 1 ? '' : 's'} paid in this window`}
            />
            <Kpi
              icon="results"
              label="Average payment"
              value={view.totals.averageMinor === null ? '—' : formatMoney(view.totals.averageMinor, view.currency)}
              detail={
                view.totals.averageMinor === null
                  ? 'Nothing was captured in this window'
                  : `Revenue ÷ ${view.totals.payments} payment${view.totals.payments === 1 ? '' : 's'}`
              }
            />
            <Kpi
              icon="organization"
              label="Organizations on a plan"
              value={view.plans.onPlan.toLocaleString()}
              detail={view.plans.rows.map((row) => `${row.orgsOnTier} ${row.label.toLowerCase()}`).join(' · ')}
            />
          </section>

          <section className="ops-card card" aria-labelledby="revenue">
            <div className="ops-card-head">
              <h2 id="revenue">Revenue over time</h2>
              <p className="ops-card-note">
                {view.periods.best
                  ? <>Best {view.window.granularity}: <strong>{view.periods.best.label}</strong>, {formatMoney(view.periods.best.revenueMinor, view.currency)}. Bars start at zero.</>
                  : 'Nothing was captured in this window.'}
              </p>
            </div>
            <OpsBarChart
              chart="revenue"
              series={REVENUE}
              caption="Revenue by period"
              columns={view.periods.rows.map((row) => ({
                label: row.label,
                ratios: { revenue: row.ratio },
                values: { revenue: formatMoney(row.revenueMinor, view.currency) },
                notes: [
                  { label: 'Payments', value: String(row.payments) },
                  { label: 'vs period before', value: signed(row.change) },
                ],
              }))}
            />
          </section>

          <div className="ops-grid-2">
            <section className="ops-card card" aria-labelledby="plan-mix">
              <div className="ops-card-head">
                <h2 id="plan-mix">Plan mix</h2>
                <p className="ops-card-note">
                  The ring is who is on each plan <strong>now</strong>; the money is what each plan earned <strong>in this window</strong>.
                </p>
              </div>
              <div className="ops-ring-row">
                <div
                  className="ops-ring"
                  aria-hidden="true"
                  style={
                    view.plans.onPlan > 0
                      ? {
                          background: `conic-gradient(${view.plans.rows
                            .map((row) => `${RING[row.tier]} ${row.arc.from}deg ${row.arc.to}deg`)
                            .join(', ')})`,
                        }
                      : undefined
                  }
                >
                  <div className="ops-ring-centre">
                    <strong>{view.plans.onPlan}</strong>
                    <span>on a plan</span>
                  </div>
                </div>
                <div className="ops-table-wrap">
                  <table className="ops-table">
                    <caption className="sr-only">
                      Plan mix: organizations on each plan now, and what each earned in this window
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Plan</th>
                        <th scope="col" className="is-num">On it now</th>
                        <th scope="col" className="is-num">Earned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.plans.rows.map((row) => (
                        <tr key={row.tier}>
                          <th scope="row">
                            <span className="ops-share-label">
                              <span className={`ops-key ${FILL[row.tier]}`} aria-hidden="true" />
                              {row.label}
                            </span>
                          </th>
                          <td className="is-num">
                            {row.orgsOnTier} <span className="ops-how">{row.orgPercent}%</span>
                          </td>
                          <td className="is-num">
                            {formatMoney(row.revenueMinor, view.currency)}{' '}
                            <span className="ops-how">{row.revenuePercent}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="ops-card card" aria-labelledby="purchases">
              <div className="ops-card-head">
                <h2 id="purchases">Plans bought over time</h2>
                <p className="ops-card-note">Purchases per period, not who sat on what: nothing records a past month's plan.</p>
              </div>
              <OpsBarChart
                chart="purchases"
                series={PURCHASES}
                caption="Plans purchased per period"
                totals={{
                  bronze: String(view.purchases.totals.bronze),
                  silver: String(view.purchases.totals.silver),
                  gold: String(view.purchases.totals.gold),
                }}
                columns={view.purchases.rows.map((row) => ({
                  label: row.label,
                  ratios: row.ratios,
                  values: { bronze: String(row.bronze), silver: String(row.silver), gold: String(row.gold) },
                }))}
              />
            </section>
          </div>

          <section className="ops-card card" aria-labelledby="recent">
            <div className="ops-card-head">
              <h2 id="recent">Recent payments</h2>
              <p className="ops-card-note">Newest first, in this window.</p>
            </div>
            {view.recent.length === 0 ? (
              <Empty title="Nothing has been paid in this window." />
            ) : (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <caption className="sr-only">The most recent payments in this window</caption>
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">Organization</th>
                      <th scope="col">Paid by</th>
                      <th scope="col">Plan</th>
                      <th scope="col">Reason</th>
                      <th scope="col" className="is-num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.recent.map((row) => (
                      <tr key={row.id}>
                        <td className="is-muted">{formatDate(row.at)}</td>
                        <td><Link className="ops-link" to={`/ops/orgs/${row.orgId}`}>{row.orgName}</Link></td>
                        <td>{row.payerName}</td>
                        <td><TierPill tier={row.tier} label={TIER_LABEL[row.tier]} /></td>
                        <td>{row.reason}</td>
                        <td className="is-num">{formatMoney(row.amountMinor, view.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="ops-card card" aria-labelledby="moves">
            <div className="ops-card-head">
              <h2 id="moves">Who moved plan</h2>
              <p className="ops-card-note">Changes only: a new organization choosing its first plan is above, not here.</p>
            </div>
            {view.changes.length === 0 ? (
              <Empty title="Nobody changed plan in this window." />
            ) : (
              <ul className="ops-timeline">
                {view.changes.map((row) => (
                  <li key={row.id}>
                    <span className={`ops-dot ${row.direction === 'up' ? 'is-team' : 'is-danger'}`} aria-hidden="true" />
                    <div>
                      <div className="ops-timeline-head">
                        <strong>{row.move}</strong>
                        <Link className="ops-link" to={`/ops/orgs/${row.orgId}`}>{row.orgName}</Link>
                        <span className="ops-timeline-when">{formatDate(row.at)}</span>
                      </div>
                      <p className="ops-timeline-body">
                        {row.payerName} · {formatMoney(row.amountMinor, view.currency)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
