// <TrendChip> — 24 §3, built at T-082 after being catalogued at T-003 and refused twice.
//
// Two P2 pages listed it and neither could fill it. `46` § Out of scope ruled trends off
// the home dashboard (*"that is 43, and it is P3"*) and its payload carried nothing to
// compare "today" against — CONF-017. `43` is the caller it was catalogued for, and this is
// that page.
//
// THE ARROW IS MANDATORY AND THE COLOUR IS NOT. The arrow is the non-colour cue that keeps
// a trend readable in greyscale, in print, and to about one man in twelve (21 §8). The
// colour is a claim that the direction is GOOD or BAD, and that claim is the server's to
// make or nobody's (CONF-004) — which is why `valence` is a prop rather than a comparison
// against zero.
//
// Its first caller passes no valence at all, deliberately. A theme mentioned twelve more
// times this month than last is not thereby better or worse: more people talked about
// parking. `43`'s payload states a valence for the theme's SCORE and states none for its
// delta, and this component is built so that the honest thing is also the default one.
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
  /** "mentions", "points" — the unit, so the number is not a bare integer in a chip. */
  suffix?: string | undefined;
  /** Omit for a direction with no judgement attached. Absent means uncoloured. */
  valence?: Valence | undefined;
  /** What the number is a change IN, for the screen reader. The visible chip is read in
   *  the context of its row; a screen reader reaching it out of context is not. */
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
        // No icon in the vocabulary means "unchanged", and inventing one for a single use
        // would be a concept added to a closed list (`design_specs/design/01` §5). An em
        // dash reads as flat in every font we ship and needs no glyph.
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
