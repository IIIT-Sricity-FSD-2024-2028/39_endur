// `/ops/earnings` — DEC-080, `71` § Revenue. What the estate has paid.
//
// OWNER ONLY, and behind its OWN capability. `platform.revenue.read` and
// `platform.analytics.read` were one string while DEC-035 stood and there was no money to
// separate; DEC-080 splits them because the questions separated. The nav item is absent for
// `staff` (`OpsLayout`), and a direct visit still gets a full-page 403 naming the capability
// rather than an empty screen that looks broken — the same posture `/ops/analytics` takes.
//
// SISTER PAGE, NOT A REPLACEMENT. Analytics answers "is this working?" in organisations,
// seats and activity. This answers "what did we take?" in rupees. Merging them would make
// one page that argues with itself about which number matters.
//
// THE WINDOW IS THE SAME WINDOW, down to the twelve-month default and the URL params, so an
// owner moving between the two pages does not have to re-narrow the range.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TIERS, formatMoney, type PaymentKind, type Tier } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { StatCard } from '../../../components/data/StatCard.js';
import { ResponsiveTable, type Column } from '../../../components/data/ResponsiveTable.js';
import { RevenueChart } from '../../../components/platform/RevenueChart.js';
import { TierDonut } from '../../../components/platform/TierDonut.js';
import { TierTrendChart } from '../../../components/platform/TierTrendChart.js';
import { formatDate } from '../../../lib/format.js';
import { useEarnings } from '../../../lib/earnings.js';
import type { EarningsWindow } from '../../../lib/earnings.js';

const TIER_LABEL: Record<Tier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  enterprise: 'Enterprise',
};

type PaymentRow = {
  id: string;
  at: string;
  orgId: string;
  orgName: string;
  payerName: string;
  tier: Tier;
  fromTier: Tier | null;
  /**
   * `expiry` is in the union but does not reach this table — `/platform/earnings` excludes it
   * from the window (`DEC-098`), because a Rs 0 plan move is not a capture and counting it as
   * one would drag the average payment down with events where no money changed hands. The
   * type stays honest about the column, and the row below still renders correctly if it ever
   * arrives.
   */
  kind: PaymentKind;
  amountMinor: number;
};

function readWindow(params: URLSearchParams): EarningsWindow {
  const granularity = params.get('granularity');
  return {
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    granularity: granularity === 'quarter' ? 'quarter' : 'month',
  };
}

/**
 * The total, counting up from zero.
 *
 * THE ONE ANIMATED FIGURE ON THE PAGE, and it is animated for a reason rather than for
 * texture: the revenue line beneath it draws at the same moment, and a number that lands
 * with the line reads as one fact arriving instead of two. Every other stat is static.
 *
 * REDUCED MOTION IS CHECKED HERE, in JS, which is the one exception to "honoured globally,
 * once" (endur.css) — that rule collapses CSS durations and can say nothing about a
 * `setInterval` counting integers. A reader who has asked for less motion gets the final
 * figure on the first frame.
 */
function useCountUp(target: number, ms = 600): number {
  const [value, setValue] = useState(target);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || target === 0) {
      setValue(target);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / ms);
      // The same shape as `--ease` — decelerating, so the figure settles rather than stops.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // THE FIGURE LANDS EVEN IF THE FRAMES NEVER COME. `requestAnimationFrame` does not run
    // in a background or throttled tab, and a revenue total stranded at ₹0 because nobody
    // painted is a WRONG NUMBER on screen — far worse than an unanimated right one. The
    // animation is decoration; this is the guarantee underneath it.
    const land = window.setTimeout(() => setValue(target), ms + 80);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(land);
    };
  }, [target, ms]);

  return value;
}

export default function Earnings(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const window = readWindow(params);
  const earnings = useEarnings(window);

  const revenue = useCountUp(earnings.data?.totals.revenueMinor ?? 0);

  const setWindow = (patch: Partial<EarningsWindow>): void => {
    const next = new URLSearchParams(params);
    const merged = { ...window, ...patch };
    if (merged.from) next.set('from', merged.from); else next.delete('from');
    if (merged.to) next.set('to', merged.to); else next.delete('to');
    next.set('granularity', merged.granularity);
    setParams(next);
  };

  if (earnings.forbidden) {
    return (
      <div className="fullpage">
        <div>
          <h3>You do not have access to this</h3>
          <p className="text-muted">
            Earnings needs the <code>platform.revenue.read</code> capability, which only the
            owner role holds.
          </p>
        </div>
      </div>
    );
  }

  const data = earnings.data;

  const paymentColumns: Column<PaymentRow>[] = [
    { key: 'at', header: 'When', primary: true, render: (row) => formatDate(row.at) },
    {
      key: 'org',
      header: 'Organisation',
      render: (row) => <Link to={`/ops/orgs/${row.orgId}`}>{row.orgName}</Link>,
    },
    { key: 'payer', header: 'Paid by', render: (row) => row.payerName },
    {
      key: 'tier',
      header: 'Plan',
      render: (row) => (
        <span className={`tag tag-outline earn-tier`}>{TIER_LABEL[row.tier]}</span>
      ),
    },
    {
      key: 'kind',
      header: 'Reason',
      render: (row) =>
        row.kind === 'signup'
          ? 'New organisation'
          : `${row.fromTier ? TIER_LABEL[row.fromTier] : 'Unknown'} → ${TIER_LABEL[row.tier]}` +
            (row.kind === 'expiry' ? ' · scheduled' : ''),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => <span className="earn-amount">{formatMoney(row.amountMinor)}</span>,
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Earning"
        subtitle="What the estate has paid — by period, by plan, and who paid it."
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
              onChange={(event) =>
                setWindow({ granularity: event.target.value === 'quarter' ? 'quarter' : 'month' })
              }
            >
              <option value="month">Monthly</option>
              <option value="quarter">Quarterly</option>
            </select>
          </div>
        }
      />

      {earnings.error && (
        <p className="field-error" role="alert">{earnings.error.message}</p>
      )}

      <div className={earnings.loading ? 'is-dimmed' : undefined}>
        {!data ? (
          <p className="text-muted" aria-live="polite">Loading…</p>
        ) : (
          <div className="ops-sections">
            <div className="stat-row">
              <StatCard
                kicker="Revenue in this window"
                value={formatMoney(revenue, data.currency)}
                context={`${formatMoney(data.totals.lifetimeRevenueMinor, data.currency)} taken in total, all time`}
              />
              <StatCard
                kicker="Payments"
                value={data.totals.payments}
                context={`${data.totals.orgsPaying} organisation${data.totals.orgsPaying === 1 ? '' : 's'} paid in this window`}
              />
              <StatCard
                kicker="Average payment"
                // A dash, never ₹0 — the same argument the conversion rate makes next door.
                // A mean of no payments is not a payment of zero.
                value={
                  data.totals.averageMinor === null
                    ? '—'
                    : formatMoney(data.totals.averageMinor, data.currency)
                }
                context={
                  data.totals.averageMinor === null
                    ? 'Nothing was captured in this window'
                    : `across ${data.totals.payments} payment${data.totals.payments === 1 ? '' : 's'}`
                }
              />
              <StatCard
                kicker="Organisations on a plan"
                value={data.byTier.reduce((sum, row) => sum + row.orgsOnTier, 0)}
                context={TIERS.map(
                  (tier) =>
                    `${data.byTier.find((row) => row.tier === tier)?.orgsOnTier ?? 0} ${TIER_LABEL[tier].toLowerCase()}`,
                ).join(' · ')}
              />
            </div>

            <section className="card">
              <h3>Revenue over time</h3>
              <p className="text-muted">
                What was captured in each period. The floor is zero, not the quietest month —
                the size of a month is the thing being read.
              </p>
              <RevenueChart series={data.byPeriod} />
            </section>

            <section className="card">
              <h3>Plan mix</h3>
              <p className="text-muted">
                The ring is who is on each plan <strong>now</strong>. The amount beside it is
                what that plan earned <strong>in this window</strong> — an organisation that
                has since moved still paid.
              </p>
              <TierDonut slices={data.byTier} />
            </section>

            <section className="card">
              <h3>Plans bought over time</h3>
              <p className="text-muted">
                Purchases per period — not a census of who was on what. Nothing records the
                tier an organisation sat on in a past month, and inventing it would move
                historic figures retroactively.
              </p>
              <TierTrendChart series={data.tierOverTime} />
            </section>

            <section className="card">
              <h3>Recent payments</h3>
              <ResponsiveTable
                columns={paymentColumns}
                rows={data.recent}
                rowKey={(row) => row.id}
                caption="The most recent payments in this window"
                empty={<p className="text-muted">Nothing has been paid in this window.</p>}
              />
            </section>

            <section className="card">
              <h3>Who moved plan</h3>
              <p className="text-muted">
                Changes only — a new organisation choosing its first plan is above, not here.
              </p>
              {data.recentChanges.length === 0 ? (
                <p className="text-muted">Nobody changed plan in this window.</p>
              ) : (
                <ul className="earn-changes">
                  {data.recentChanges.map((row) => (
                    <li className={`earn-change is-${row.tier}`} key={row.id}>
                      <span className="earn-change-move">
                        {row.fromTier ? TIER_LABEL[row.fromTier] : 'Unknown'} →{' '}
                        {TIER_LABEL[row.tier]}
                      </span>
                      <Link className="earn-change-org" to={`/ops/orgs/${row.orgId}`}>
                        {row.orgName}
                      </Link>
                      <span className="text-meta">{row.payerName}</span>
                      <span className="text-meta earn-change-meta">
                        {formatDate(row.at)} · {formatMoney(row.amountMinor)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
