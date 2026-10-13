import type { Valence } from '@endur/shared';
import { Icon } from '../Icon.js';

const TONE: Record<Valence, string> = {
  positive: 'tag-good',
  neutral: 'tag-neutral',
  negative: 'tag-bad',
};

export function TrendChip({
  delta,
  suffix,
  valence,
  label,
}: {
  delta: number;
  suffix?: string | undefined;
  valence?: Valence | undefined;
  label?: string | undefined;
}): JSX.Element {
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const words =
    direction === 'flat'
      ? 'no change'
      : `${direction === 'up' ? 'up' : 'down'} ${Math.abs(delta)}${suffix ? ` ${suffix}` : ''}`;

  return (
    <span
      className={`trend-chip is-${direction}${valence ? ` tag ${TONE[valence]}` : ''}`}
      title={label}
    >
      {direction === 'flat' ? (
        <span aria-hidden="true">—</span>
      ) : (
        <Icon name={direction === 'up' ? 'trend-up' : 'trend-down'} size={16} />
      )}
      <span className="num" aria-hidden="true">
        {direction === 'flat' ? '0' : Math.abs(delta)}
      </span>
      {suffix && direction !== 'flat' && (
        <span className="trend-chip-suffix" aria-hidden="true">{suffix}</span>
      )}
      <span className="sr-only">{label ? `${label}: ${words}` : words}</span>
    </span>
  );
}
