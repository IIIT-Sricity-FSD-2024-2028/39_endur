// <ThemeTable> — 24 §3, new at T-082 for `43` § Components ("a theme table").
//
// A THEME THAT DOES NOT OPEN IS AN ASSERTION. `43` § Interactions is unusually blunt about
// this: *"if a user cannot see WHY 'pace of delivery' scored badly, the theme is an
// assertion rather than a finding."* So every row is a BUTTON, and the drill-through is the
// component's reason to exist rather than a refinement of it.
//
// It is a button and not a clickable `<tr>` on purpose. `<ResponsiveTable>` offers
// `onRowClick`, and a row is not focusable, not announced as actionable, and not reachable
// by keyboard — on the one table in the product whose whole point is that you can open a
// row.
//
// NO SUB-THEMES. The mockup draws "Themes & sub-themes" indented two deep; the payload has
// one level, because the engine MERGES a facet into its host rather than nesting it (`43` §
// The engine). Drawing an indent with nothing to put in it would be a shape promising data
// that does not exist.
import type { ReactNode } from 'react';
import type { ThemeSummary, Valence } from '@endur/shared';
import { ResponsiveTable, type Column } from './ResponsiveTable.js';
import { TrendChip } from './TrendChip.js';

const TONE: Record<Valence, string> = {
  positive: 'tag-good',
  neutral: 'tag-neutral',
  negative: 'tag-bad',
};

/** The word beside the colour. Never colour alone (21 §8) — and on a score bar the colour
 *  is a gradient, which is the least legible kind of colour there is. */
const WORD: Record<Valence, string> = {
  positive: 'Positive',
  neutral: 'Mixed',
  negative: 'Negative',
};

export function ThemeTable({
  themes,
  onOpen,
  openId,
  empty,
  caption,
}: {
  themes: ThemeSummary[];
  onOpen: (id: string) => void;
  /** Which row is open, so the button can say "close" and the row can carry the state. */
  openId?: string | null;
  empty: ReactNode;
  caption?: string | undefined;
}): JSX.Element {
  const mostMentions = Math.max(1, ...themes.map((theme) => theme.mentions));

  const columns: Column<ThemeSummary>[] = [
    {
      key: 'label',
      header: 'Theme',
      primary: true,
      render: (theme) => (
        <button
          type="button"
          className="theme-open"
          aria-expanded={openId === theme.id}
          onClick={() => onOpen(theme.id)}
        >
          {theme.label}
        </button>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      render: (theme) => (
        <span className="theme-score">
          {/* The gradient runs bad -> good across the WHOLE track and the remainder is
              masked off at `score`, so the colour at the tip means the same thing on every
              row. A fill whose own gradient ended at its own width would paint a 20 and a
              90 with the same colour at the tip and say nothing. */}
          <span className="score-meter">
            <span className="score-meter-rest" style={{ left: `${theme.score}%` }} />
          </span>
          <span className="num">{theme.score}</span>
          <span className={`tag ${TONE[theme.valence]}`}>{WORD[theme.valence]}</span>
        </span>
      ),
    },
    {
      key: 'mentions',
      header: 'Mentions',
      render: (theme) => (
        <span className="theme-mentions">
          <span className="num">{theme.mentions}</span>
          {/* Comments, not word occurrences — one ranty comment saying "parking" nine times
              is one person (43 § Data contract). The bar makes two rows comparable without
              reading either number. */}
          <span className="theme-mentions-bar" aria-hidden="true">
            <span style={{ width: `${(theme.mentions / mostMentions) * 100}%` }} />
          </span>
        </span>
      ),
    },
    {
      key: 'delta',
      header: 'Change',
      hideBelow: 'sm',
      render: (theme) =>
        // NULL IS NOT ZERO AND IS NOT DRAWN AS ONE (DEC-061). `delta` is measured against
        // the window immediately before this one, and with no date range there is no such
        // window. A "0" here would be a claim that nothing changed.
        theme.delta === null ? (
          <span className="text-meta">—</span>
        ) : (
          // NO VALENCE PASSED, deliberately. More people talking about a theme is not
          // thereby better or worse, and the payload states a valence for the SCORE and
          // none for the delta (CONF-004).
          <TrendChip delta={theme.delta} suffix="mentions" label={theme.label} />
        ),
    },
  ];

  return (
    <ResponsiveTable
      columns={columns}
      rows={themes}
      rowKey={(theme) => theme.id}
      empty={empty}
      caption={caption}
    />
  );
}
