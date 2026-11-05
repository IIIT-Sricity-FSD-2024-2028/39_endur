// The improve loop, client side. 44, 23 §3.
//
// Same two-not-errors shape as `lib/analysis.ts` (DEC-011): a 403 is the account, a 402 is
// the tier, and neither is an error to render red. What differs is a THIRD non-error that
// only exists here — a **404 on the gap** is the ordering constraint, not a missing page.
// The reviewee has not written their own assessment yet, and the remedy is the form.
//
// The reads are on RTK Query since R-502 (`store/api/endpoints/reflect.ts`); the three writes
// stay plain calls, each followed by the page's own re-read.
import type {
  CreatePlanBody,
  GapView,
  ReflectionCycle,
  ReflectionForm,
  SubmitReflectionBody,
} from '@endur/shared';
import { ApiError, apiPost } from './api.js';
import { upgradeFrom } from './analysis.js';
import type { Upgrade } from './analysis.js';
import {
  useGetCyclesQuery,
  useGetGapQuery,
  useGetReflectionFormQuery,
} from '../store/api/endpoints/reflect.js';
import { useLoadable, type Loadable } from './query.js';

export type Gated<T> = Loadable<T> & {
  forbidden: boolean;
  upgrade: Upgrade | null;
  /** The gap's 404 — "you have not written yours yet", which is a state and not a failure. */
  locked: boolean;
  reload: () => Promise<void>;
};

type GatedResult<T> = Parameters<typeof useLoadable<T>>[0];

/**
 * A read with the three non-errors told apart. `loading` means "nothing to show yet": the
 * page swaps the form and the gap for "Loading…" while it is true, and the re-read after a
 * plan is saved must not blank them. Another campaign never shows the last one's form.
 */
function useGated<T>(result: GatedResult<T>, active: boolean): Gated<T> {
  const loaded = useLoadable(result, { current: true, initialOnly: true });
  if (!active) return { data: null, loading: false, error: null, forbidden: false, upgrade: null, locked: false, reload: loaded.reload };
  const upgrade = upgradeFrom(loaded.error);
  const status = loaded.error instanceof ApiError ? loaded.error.status : 0;
  const forbidden = !upgrade && status === 403;
  const locked = status === 404;
  const gated = Boolean(upgrade) || forbidden || locked;
  return {
    data: gated ? null : loaded.data,
    loading: loaded.loading,
    error: gated ? null : loaded.error,
    forbidden,
    upgrade,
    locked,
    reload: loaded.reload,
  };
}

export const useCycles = (enabled = true): Gated<ReflectionCycle[]> =>
  useGated(useGetCyclesQuery(undefined, { skip: !enabled }), enabled);

export const useReflectionForm = (campaignId: string | null): Gated<ReflectionForm> =>
  useGated(useGetReflectionFormQuery(campaignId ?? '', { skip: !campaignId }), Boolean(campaignId));

export const useGap = (campaignId: string | null): Gated<GapView> =>
  useGated(useGetGapQuery(campaignId ?? '', { skip: !campaignId }), Boolean(campaignId));

export const submitReflection = (campaignId: string, body: SubmitReflectionBody) =>
  apiPost<SubmitReflectionBody, { data: { id: string } }>(`/reflect/${campaignId}`, body);

export const savePlan = (campaignId: string, body: CreatePlanBody) =>
  apiPost<CreatePlanBody, { data: unknown }>(`/reflect/${campaignId}/plan`, body);

export const finalisePlan = (planId: string) =>
  apiPost<undefined, { data: unknown }>(`/reflect/plans/${planId}/finalise`);
