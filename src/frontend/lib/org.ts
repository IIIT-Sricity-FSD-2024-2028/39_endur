// Organisation reads and the wizard's single write. 31 § Data contract, 23 §3.
//
// Pages call these hooks; the hooks call `api.ts`. The wizard in particular must never
// touch `fetch` — its whole correctness argument is that five steps produce ONE request,
// and that is much easier to keep true when there is exactly one function that can send it.
import { useCallback, useEffect, useState } from 'react';
import type { OrgView, PresetView, SetupOrgBody } from '@endur/shared';
import { apiGet, apiPost } from './api.js';

export type Loadable<T> = { data: T | null; loading: boolean; error: Error | null };

/**
 * The preset catalogue. Loaded BEFORE step 1 renders — 31 § States: "the wizard does not
 * open half-populated". A step-1 grid that pops in after a beat is the first thing an
 * evaluator sees, and it looks like a page that is not ready.
 */
export function usePresets(): Loadable<PresetView[]> {
  const [state, setState] = useState<Loadable<PresetView[]>>({
    data: null, loading: true, error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void apiGet<{ data: PresetView[] }>('/org/presets')
      .then((response) => {
        if (!cancelled) setState({ data: response.data, loading: false, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * The commit. ONE request, ONE transaction — the server seeds roles, units, derived grants
 * and the preset's starter templates atomically, so closing the tab mid-wizard leaves
 * nothing behind rather than an organisation with roles and no structure.
 */
export function useSetupOrg(): (body: SetupOrgBody) => Promise<OrgView> {
  return useCallback(async (body: SetupOrgBody) => {
    const response = await apiPost<SetupOrgBody, { data: OrgView }>('/org/setup', body);
    return response.data;
  }, []);
}
