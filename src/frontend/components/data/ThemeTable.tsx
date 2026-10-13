import type { ReactNode } from 'react';
import type { ThemeSummary, Valence } from '@endur/shared';
import { ResponsiveTable, type Column } from './ResponsiveTable.js';
import { TrendChip } from './TrendChip.js';

const TONE: Record<Valence, string> = {
  positive: 'tag-good',
  neutral: 'tag-neutral',
  negative: 'tag-bad',
};

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
        theme.delta === null ? (
          <span className="text-meta">—</span>
        ) : (
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
