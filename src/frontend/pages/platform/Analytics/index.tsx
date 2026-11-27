// `/ops/analytics`: is this working? The whole estate at once, in aggregate (`71`). R-716.
//
// THE SERVER SENDS COUNTS; EVERY PERCENTAGE HERE IS A SELECTOR'S. The report is cached in
// `state.opsApi.queries['getAnalytics("?granularity=month")']` (open Redux DevTools to see
// the raw counts), and `selectAnalyticsView` (store/screens/opsReports.ts) works out every
// share, the funnel, the movement totals and each bar's height from it. Each share is
// printed with what it is a share OF, so "74%" always reads "37 of 50 · 74%".
//
// The window is `state.opsReports.window`, the same one Earnings reads.
import { Link } from 'react-router-dom';
import type { Tier } from '@endur/shared';
import { OpsBarChart, type ChartSeries } from '../../../components/platform/OpsBarChart.js';
import { ReportWindow } from '../../../components/platform/ReportWindow.js';
import { Denied, Kpi, OpsError, OpsHeader, ShareRow, ShareText } from '../../../components/platform/OpsUi.js';
import { useAnalytics } from '../../../lib/analytics-ops.js';
import { useAppSelector } from '../../../store/index.js';
import { selectAnalyticsView, selectReportSearch } from '../../../store/screens/opsReports.js';

const MOVEMENT: ChartSeries[] = [
  // Series colours in their validated order (ops.css): not gold and amber, which read as one.
  { key: 'new', label: 'New', fill: 'ops-fill-s1' },
  { key: 'trialStarted', label: 'Trials started', fill: 'ops-fill-s2' },
  { key: 'upgraded', label: 'Upgraded', fill: 'ops-fill-s3' },
  { key: 'downgraded', label: 'Downgraded', fill: 'ops-fill-s4' },
  { key: 'churned', label: 'Churned', fill: 'ops-fill-s5' },
];

const FILL: Record<Tier, string> = {
  bronze: 'ops-fill-bronze',
  silver: 'ops-fill-silver',
  gold: 'ops-fill-gold',
  enterprise: 'ops-fill-enterprise',
};

export default function Analytics(): JSX.Element {
  const search = useAppSelector(selectReportSearch);
  const report = useAnalytics(search);
  const view = useAppSelector(selectAnalyticsView);

  if (report.forbidden) {
    return <Denied capability="platform.analytics.read" what="Analytics" />;
  }

  return (
    <>
      <OpsHeader
        kicker="Business"
        title="Analytics"
        subtitle="Is this working? The whole estate at once, in aggregate: counts only, never content."
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
          <section className="ops-kpis" aria-label="The estate in numbers">
            <Kpi
              icon="organization"
              label="On a plan"
              value={view.orgs.joined.count.toLocaleString()}
              detail={<ShareText share={view.orgs.joined} unit="organizations" />}
            />
            <Kpi
              icon="start"
              label="Trialing"
              value={view.orgs.trialing.count.toLocaleString()}
              detail={<>Counted apart, never folded in · <ShareText share={view.orgs.trialing} /></>}
            />
            <Kpi
              icon="countdown"
              label="Gone quiet"
              tone={view.adoption.quiet.count > 0 ? 'warn' : undefined}
              value={view.adoption.quiet.count.toLocaleString()}
              detail={<>No response in 30 days · <ShareText share={view.adoption.quiet} /></>}
            />
            <Kpi
              icon="results"
              label="Responses per campaign"
              value={view.totals.responsesPerCampaign ?? '—'}
              detail={`${view.totals.responses.toLocaleString()} responses over ${view.totals.campaigns.toLocaleString()} campaigns`}
            />
          </section>

          <section className="ops-card card" aria-labelledby="movement">
            <div className="ops-card-head">
              <h2 id="movement">Movement in this window</h2>
              <p className="ops-card-note">
                Five counts per {view.window.granularity}, never netted into one. The only section the dates change.
              </p>
            </div>
            <OpsBarChart
              chart="movement"
              series={MOVEMENT}
              caption="Organization movement by period"
              totals={Object.fromEntries(MOVEMENT.map((line) => [
                line.key,
                String(view.movement.totals[line.key as keyof typeof view.movement.totals]),
              ]))}
              columns={view.movement.rows.map((row) => ({
                label: row.label,
                ratios: row.ratios,
                values: Object.fromEntries(MOVEMENT.map((line) => [
                  line.key,
                  String(row[line.key as keyof typeof row.ratios]),
                ])),
              }))}
            />
          </section>

          <div className="ops-grid-2">
            <section className="ops-card card" aria-labelledby="tier-mix">
              <div className="ops-card-head">
                <h2 id="tier-mix">Plan mix · as of today</h2>
                <p className="ops-card-note">
                  Of the {view.tierMix.onPlan.toLocaleString()} organizations on a plan; trials excluded. Adds up to 100%.
                </p>
              </div>
              <div className="ops-shares">
                {view.tierMix.rows.map((row) => (
                  <ShareRow key={row.tier} label={row.label} share={row} fill={FILL[row.tier]} />
                ))}
              </div>
            </section>

            <section className="ops-card card" aria-labelledby="adoption">
              <div className="ops-card-head">
                <h2 id="adoption">Adoption · as of today</h2>
                <p className="ops-card-note">Each step as a share of the whole estate, and of the step before.</p>
              </div>
              <ol className="ops-funnel">
                {view.adoption.funnel.map((step) => (
                  <li key={step.label}>
                    <span className="ops-funnel-label">{step.label}</span>
                    <span className="ops-funnel-figure">
                      <strong>{step.count.toLocaleString()}</strong> · {step.percent}%
                      {step.ofPrevious !== null && (
                        <span className="ops-how"> ({step.ofPrevious}% of the step before)</span>
                      )}
                    </span>
                    <span className="ops-funnel-bar" aria-hidden="true">
                      <span style={{ width: `${step.percent}%` }} />
                    </span>
                  </li>
                ))}
              </ol>
              <Link className="btn btn-secondary btn-sm" to="/ops">Open the estate list</Link>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
