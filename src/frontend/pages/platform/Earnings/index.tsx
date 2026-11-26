import { useEffect, useRef } from 'react';
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
 * The window's revenue, counting up to its value when it arrives. An ANIMATION, so it is a
 * ref writing frames into its own text node, not state (DEC-R03's one exception, as the
 * Structure page's counters): the figure rendered is always the true one, and the count-up
 * only runs between frames, skipped for reduced motion.
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
  const [params, setParams] = useSearchParams();
  // Not called `window`: that would shadow the browser's global inside this component.
  const range = readWindow(params);
  const earnings = useEarnings(range);


  const setWindow = (patch: Partial<EarningsWindow>): void => {
    const next = new URLSearchParams(params);
    const merged = { ...range, ...patch };
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
      header: 'Organization',
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
          ? 'New organization'
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
              value={range.from?.slice(0, 10) ?? ''}
              onChange={(event) => setWindow({ from: event.target.value || undefined })}
            />
            <input
              type="date"
              className="input"
              aria-label="To"
              value={range.to?.slice(0, 10) ?? ''}
              onChange={(event) => setWindow({ to: event.target.value || undefined })}
            />
            <select
              className="input"
              value={range.granularity}
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
                value={<CountedMoney minor={data.totals.revenueMinor} currency={data.currency} />}
                context={`${formatMoney(data.totals.lifetimeRevenueMinor, data.currency)} taken in total, all time`}
              />
              <StatCard
                kicker="Payments"
                value={data.totals.payments}
                context={`${data.totals.orgsPaying} organization${data.totals.orgsPaying === 1 ? '' : 's'} paid in this window`}
              />
              <StatCard
                kicker="Average payment"
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
                kicker="Organizations on a plan"
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
                what that plan earned <strong>in this window</strong> — an organization that
                has since moved still paid.
              </p>
              <TierDonut slices={data.byTier} />
            </section>

            <section className="card">
              <h3>Plans bought over time</h3>
              <p className="text-muted">
                Purchases per period — not a census of who was on what. Nothing records the
                tier an organization sat on in a past month, and inventing it would move
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
                Changes only — a new organization choosing its first plan is above, not here.
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
