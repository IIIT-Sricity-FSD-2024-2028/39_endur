import { formatMoney, type Tier } from '@endur/shared';

export type TierSlice = {
  tier: Tier;
  orgsOnTier: number;
  revenueMinor: number;
  payments: number;
};

const TIER_LABEL: Record<Tier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  enterprise: 'Enterprise',
};

const TOKEN: Record<Tier, string> = {
  bronze: 'var(--tier-bronze-500)',
  silver: 'var(--tier-silver-500)',
  gold: 'var(--tier-gold-500)',
  enterprise: 'var(--color-neutral-400)',
};

export function TierDonut({ slices }: { slices: TierSlice[] }): JSX.Element {
  const total = slices.reduce((sum, slice) => sum + slice.orgsOnTier, 0);

  let sweep = 0;
  const stops = slices.map((slice) => {
    const from = sweep;
    sweep += total > 0 ? (slice.orgsOnTier / total) * 360 : 0;
    return `${TOKEN[slice.tier]} ${from}deg ${sweep}deg`;
  });

  return (
    <div className="donut-row">
      <div
        className="donut"
        aria-hidden="true"
        style={total > 0 ? { background: `conic-gradient(${stops.join(', ')})` } : undefined}
      />

      <ul className="donut-legend earn-donut-legend">
        {slices.map((slice) => (
          <li key={slice.tier}>
            <span className={`donut-key fill-tier-${slice.tier}`} aria-hidden="true" />
            <span className="donut-label">{TIER_LABEL[slice.tier]}</span>
            <span className="num">{slice.orgsOnTier}</span>
            <span className="text-meta earn-amount">{formatMoney(slice.revenueMinor)}</span>
          </li>
        ))}
      </ul>

      <table className="sr-only">
        <caption>Plan mix — organisations on each tier now, and what each earned in this window</caption>
        <thead>
          <tr>
            <th scope="col">Plan</th>
            <th scope="col">Organisations now</th>
            <th scope="col">Payments in window</th>
            <th scope="col">Revenue in window</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((slice) => (
            <tr key={slice.tier}>
              <th scope="row">{TIER_LABEL[slice.tier]}</th>
              <td>{slice.orgsOnTier}</td>
              <td>{slice.payments}</td>
              <td>{formatMoney(slice.revenueMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
