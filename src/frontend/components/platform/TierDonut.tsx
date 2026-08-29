// <TierDonut> — `71` § Revenue, DEC-080. The plan mix, right now.
//
// SAME TECHNIQUE AS THE SENTIMENT DONUT (`pages/console/Analysis/Sentiment.tsx`): a
// `conic-gradient` whose stops are DATA and live inline, over the `.donut` mask that owns
// the ring's thickness. No library, no `<path>` arc arithmetic, and one place in the product
// where a ring's proportions are decided.
//
// NEVER COLOUR ALONE (21 §8). The legend carries the count, the share and what each tier
// EARNED, because that is what gets quoted out of this card — the ring is the shape of the
// answer and the list is the answer.
//
// TWO NUMBERS THAT ARE NOT THE SAME NUMBER. The ring draws `orgsOnTier`, which is today; the
// revenue column is the window. They are labelled as such on the page, because "Gold: 4"
// beside "Gold: ₹3,996" invites reading the second as the first times a price, and a tier an
// organisation moved OFF still earned money inside the window.
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

/** The metals, from `tokens.css`. Enterprise is not a metal and takes the neutral. */
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
