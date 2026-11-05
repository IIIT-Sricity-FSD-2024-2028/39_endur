// Organisation reads and the wizard's single write. 31 § Data contract, 23 §3.
//
// Pages call these hooks; the hooks call the store's endpoints. The wizard must never
// touch `fetch` — its whole correctness argument is that five steps produce ONE request,
// and that is much easier to keep true when there is exactly one function that can send it.
//
// On RTK Query since R-401 (`store/api/endpoints/org.ts`). Names and shapes unchanged. What
// changed: saving the org's name or its words now also re-reads `/auth/me`, so the top bar
// and every noun in the shell follow without a reload.
import { useCallback } from 'react';
import type {
  LabelSet, OrgView, PresetView, SetupOrgBody, UpdateOrgBody,
} from '@endur/shared';
import { useAppDispatch } from '../store/index.js';
import {
  orgApi,
  useGetOrgQuery,
  useGetPresetsQuery,
  useRemoveLogoMutation,
  useSetupOrgMutation,
  useUpdateLabelsMutation,
  useUpdateOrgMutation,
  useUploadLogoMutation,
} from '../store/api/endpoints/org.js';
import { unwrapApi, useLoadable, type Loadable } from './query.js';

/** Defined once, in `lib/query.ts`; re-exported because a dozen `lib` files import it here. */
export type { Loadable } from './query.js';

/**
 * The preset catalogue. Loaded BEFORE step 1 renders — 31 § States: "the wizard does not
 * open half-populated". A step-1 grid that pops in after a beat is the first thing an
 * evaluator sees, and it looks like a page that is not ready.
 */
export function usePresets(): Loadable<PresetView[]> {
  return useLoadable(useGetPresetsQuery());
}

/**
 * The commit. ONE request, ONE transaction — the server seeds roles, units, derived grants
 * and the preset's starter templates atomically, so closing the tab mid-wizard leaves
 * nothing behind rather than an organisation with roles and no structure.
 */
export function useSetupOrg(): (body: SetupOrgBody) => Promise<OrgView> {
  const [setupOrg] = useSetupOrgMutation();
  return useCallback((body: SetupOrgBody) => unwrapApi(setupOrg(body)), [setupOrg]);
}

/**
 * The org as settings needs it. Separate from the session's copy in `authSlice`: that one
 * carries only what the shell renders, and this page edits fields the shell never shows.
 *
 * `loading` means "nothing to show yet", not "a request is in flight": Settings swaps its
 * whole form for a skeleton while it is true, and a re-read after a logo upload must not
 * blank the form somebody is in the middle of.
 */
export function useOrg(): Loadable<OrgView> & { set: (org: OrgView) => void } {
  const dispatch = useAppDispatch();
  const org = useLoadable(useGetOrgQuery(), { initialOnly: true });

  const set = useCallback(
    (next: OrgView) => {
      dispatch(orgApi.util.updateQueryData('getOrg', undefined, () => next));
    },
    [dispatch],
  );

  return { data: org.data, loading: org.loading, error: org.error, set };
}

export function useUpdateOrg(): (body: UpdateOrgBody) => Promise<OrgView> {
  const [updateOrg] = useUpdateOrgMutation();
  return useCallback((body: UpdateOrgBody) => unwrapApi(updateOrg(body)), [updateOrg]);
}

/**
 * Labels are PATCHed per key and merged server-side (`22` §3) — a whole-set write would
 * silently discard a rename the caller did not have on screen.
 */
export function useUpdateLabels(): (labels: LabelSet) => Promise<OrgView> {
  const [updateLabels] = useUpdateLabelsMutation();
  return useCallback((labels: LabelSet) => unwrapApi(updateLabels(labels)), [updateLabels]);
}

/** The org as it is now, read past the cache: what the logo hooks hand back. */
function useReadOrg(): () => Promise<OrgView> {
  const dispatch = useAppDispatch();
  return useCallback(
    () => unwrapApi(dispatch(orgApi.endpoints.getOrg.initiate(undefined, { subscribe: false, forceRefetch: true }))),
    [dispatch],
  );
}

/**
 * The organisation logo (48). Both hooks return the updated `OrgView` rather than the file,
 * so the caller updates the org it already holds instead of stitching a url in by hand —
 * the same reason `useUpdateLabels` returns the whole org.
 */
export function useUploadLogo(): (file: File) => Promise<OrgView> {
  const [uploadLogo] = useUploadLogoMutation();
  const readOrg = useReadOrg();
  return useCallback(
    async (file: File) => {
      await unwrapApi(uploadLogo(file));
      return readOrg();
    },
    [uploadLogo, readOrg],
  );
}

export function useRemoveLogo(): () => Promise<OrgView> {
  const [removeLogo] = useRemoveLogoMutation();
  const readOrg = useReadOrg();
  return useCallback(async () => {
    await unwrapApi(removeLogo());
    return readOrg();
  }, [removeLogo, readOrg]);
}
