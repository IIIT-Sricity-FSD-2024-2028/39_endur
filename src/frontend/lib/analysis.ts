// The Analyze layer, client side. 43 § Data contract, 23 §3.
//
// TWO FAILURES ARE NOT ERRORS HERE, and telling them apart is the entire reason this file
// is not three lines of `apiGet` (DEC-011):
//
//   403  MAY THIS PERSON?      the account does not hold `analysis.read`. Remedy: an
//                              administrator. Nothing to buy, nothing to click.
//   402  HAS THIS ORG PAID?    the organisation is below Silver. Remedy: a tier. The
//                              account is fine and the page is not broken.
//
// The server decides both and says which (`13` §5); this file only has to keep them
// distinct so the page can render two genuinely different screens instead of one apology.
// `43` names this surface as the place that split is worth demonstrating, and a client that
// collapsed them would undo the demonstration in the last ten lines of the stack.
//
// A THIRD non-error arrives inside a 200: `suppressed: true` with no analysis fields at all
// (52 §2). There is deliberately nothing here that could reconstruct one.
//
// On RTK Query since R-502 (`store/api/endpoints/analysis.ts`).
import type { AnalysisQuery, AnalysisView, ThemeDetail, Tier } from '@endur/shared';
import { ApiError } from './api.js';
import { useGetAnalysisQuery, useGetThemeDetailQuery } from '../store/api/endpoints/analysis.js';
import { useLoadable, type Loadable } from './query.js';

/** What a 402 carries. Read from the envelope, never guessed — the client does not own
 *  the entitlement map and must not learn to (see `packages/shared/src/tiers.ts`). */
export type Upgrade = { requiredTier: Tier | null; currentTier: Tier | null };

export function analysisSearch(filters: AnalysisQuery): string {
  const params = new URLSearchParams();
  // Insertion order is fixed rather than object order, so the same filters always produce
  // the same string — the string is the cache key, and a reordered one would refetch.
  for (const key of ['from', 'to', 'campaignId', 'unitId', 'subjectId'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

/** A 402's details, or null if this was not one. */
export function upgradeFrom(error: unknown): Upgrade | null {
  if (!(error instanceof ApiError) || error.status !== 402) return null;
  return {
    requiredTier: (error.details['requiredTier'] as Tier | undefined) ?? null,
    currentTier: (error.details['currentTier'] as Tier | undefined) ?? null,
  };
}

export type AnalysisController = Loadable<AnalysisView> & {
  /** 403 — the capability is not held. A full-page state, not an empty dashboard. */
  forbidden: boolean;
  /** 402 — the tier does not include it. An upgrade card, not an error page. */
  upgrade: Upgrade | null;
  reload: () => Promise<void>;
  refreshing: boolean;
};

/**
 * NO POLLING, unlike `40`.
 *
 * Results poll because the demo beat is a number moving while somebody watches. Analysis is
 * a corpus-wide recomputation on every call, it does not change minute to minute (`43` §
 * State), and a ten-second timer here would re-run the engine over every comment in the
 * organisation six times a minute for a screen nobody is watching for movement. A Refresh
 * button says the same thing honestly and costs one click.
 */
export function useAnalysis(filters: AnalysisQuery, enabled = true): AnalysisController {
  // `initialOnly`: the page shows its skeleton only when there is nothing to show. A
  // refresh is `refreshing`, with the last good analysis still on screen (43 § States).
  const query = useGetAnalysisQuery(analysisSearch(filters), { skip: !enabled });
  const analysis = useLoadable(query, { initialOnly: true });
  if (!enabled) {
    return { data: null, loading: false, error: null, forbidden: false, upgrade: null, reload: analysis.reload, refreshing: false };
  }
  // NOT errors, and not left in `error` as well — the page would then render an upgrade card
  // with a red alert above it, which is the confusion DEC-011 exists to prevent said in CSS
  // instead of in a status code.
  const upgrade = upgradeFrom(analysis.error);
  const forbidden = !upgrade && analysis.error instanceof ApiError && analysis.error.status === 403;
  const gated = Boolean(upgrade) || forbidden;
  return {
    data: gated ? null : analysis.data,
    loading: analysis.loading,
    error: gated ? null : analysis.error,
    forbidden,
    upgrade,
    reload: analysis.reload,
    refreshing: query.isFetching,
  };
}

export type ThemeController = Loadable<ThemeDetail> & {
  /**
   * 403 — and here it means `response.read`, not `analysis.read`. Somebody who reached the
   * overview at all holds the second one, so a denial on this route is the OTHER gate: the
   * split `40` draws between an average and what one person wrote, enforced on the route
   * that would otherwise have gone around it (43 § The drill-through).
   */
  forbidden: boolean;
};

/**
 * One theme's source comments. `id` null means nothing is open, and nothing is fetched.
 *
 * A theme without them is an unfalsifiable label (`43`): if a reader cannot see WHY a theme
 * scored badly, the theme is an assertion. This request is what makes it a finding.
 */
export function useThemeDetail(id: string | null, filters: AnalysisQuery): ThemeController {
  const theme = useLoadable(
    useGetThemeDetailQuery({ id: id ?? '', search: analysisSearch(filters) }, { skip: !id }),
    { current: true },
  );
  if (!id) return { data: null, loading: false, error: null, forbidden: false };
  // 402 cannot reach here: the overview would have 402'd first and there would be no theme
  // to open. If it somehow does, it falls through to the error line and says so rather than
  // being silently swallowed as an empty panel.
  const forbidden = theme.error instanceof ApiError && theme.error.status === 403;
  return {
    data: theme.data,
    loading: theme.loading,
    error: forbidden ? null : theme.error,
    forbidden,
  };
}
