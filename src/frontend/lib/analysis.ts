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
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisQuery, AnalysisView, ThemeDetail, Tier } from '@endur/shared';
import { ApiError, apiGet } from './api.js';
import type { Loadable } from './org.js';

/** What a 402 carries. Read from the envelope, never guessed — the client does not own
 *  the entitlement map and must not learn to (see `packages/shared/src/tiers.ts`). */
export type Upgrade = { requiredTier: Tier | null; currentTier: Tier | null };

export function analysisSearch(filters: AnalysisQuery): string {
  const params = new URLSearchParams();
  // Insertion order is fixed rather than object order, so the same filters always produce
  // the same string — the string is the effect dependency, and a reordered one refetches.
  for (const key of ['from', 'to', 'campaignId', 'unitId', 'subjectId'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

/** A 402's details, or null if this was not one. */
function upgradeFrom(error: unknown): Upgrade | null {
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
  const [state, setState] = useState<Loadable<AnalysisView>>({
    data: null, loading: true, error: null,
  });
  const [forbidden, setForbidden] = useState(false);
  const [upgrade, setUpgrade] = useState<Upgrade | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const search = analysisSearch(filters);

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setRefreshing(true);
    try {
      const response = await apiGet<{ data: AnalysisView }>(`/analysis${search}`);
      if (!alive.current) return;
      setForbidden(false);
      setUpgrade(null);
      setState({ data: response.data, loading: false, error: null });
    } catch (error) {
      if (!alive.current) return;
      const paid = upgradeFrom(error);
      if (paid) {
        // NOT an error, and not left in `error` as well — the page would then render an
        // upgrade card with a red alert above it, which is the confusion DEC-011 exists to
        // prevent said in CSS instead of in a status code.
        setUpgrade(paid);
        setState({ data: null, loading: false, error: null });
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        setForbidden(true);
        setState({ data: null, loading: false, error: null });
        return;
      }
      // The last good analysis stays on screen (43 § States, same rule as 40's poll).
      setState((current) => ({ ...current, loading: false, error: error as Error }));
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, [enabled, search]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  return { ...state, forbidden, upgrade, reload: load, refreshing };
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
  const [state, setState] = useState<Loadable<ThemeDetail>>({
    data: null, loading: false, error: null,
  });
  const [forbidden, setForbidden] = useState(false);
  const alive = useRef(true);
  const search = analysisSearch(filters);

  useEffect(() => {
    alive.current = true;
    if (!id) {
      setState({ data: null, loading: false, error: null });
      setForbidden(false);
      return () => {
        alive.current = false;
      };
    }

    setState({ data: null, loading: true, error: null });
    setForbidden(false);
    void (async () => {
      try {
        const response = await apiGet<{ data: ThemeDetail }>(
          `/analysis/themes/${encodeURIComponent(id)}${search}`,
        );
        if (!alive.current) return;
        setState({ data: response.data, loading: false, error: null });
      } catch (error) {
        if (!alive.current) return;
        // 402 cannot reach here: the overview would have 402'd first and there would be no
        // theme to open. If it somehow does, it falls through to the error line and says so
        // rather than being silently swallowed as an empty panel.
        if (error instanceof ApiError && error.status === 403) {
          setForbidden(true);
          setState({ data: null, loading: false, error: null });
          return;
        }
        setState({ data: null, loading: false, error: error as Error });
      }
    })();

    return () => {
      alive.current = false;
    };
  }, [id, search]);

  return { ...state, forbidden };
}
