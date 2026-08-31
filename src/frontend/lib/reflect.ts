// The improve loop, client side. 44, 23 §3.
//
// Same two-not-errors shape as `lib/analysis.ts` (DEC-011): a 403 is the account, a 402 is
// the tier, and neither is an error to render red. What differs is a THIRD non-error that
// only exists here — a **404 on the gap** is the ordering constraint, not a missing page.
// The reviewee has not written their own assessment yet, and the remedy is the form.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreatePlanBody,
  GapView,
  ReflectionCycle,
  ReflectionForm,
  SubmitReflectionBody,
} from '@endur/shared';
import { ApiError, apiGet, apiPost } from './api.js';
import type { Upgrade } from './analysis.js';
import type { Loadable } from './org.js';

const upgradeFrom = (error: unknown): Upgrade | null =>
  error instanceof ApiError && error.status === 402
    ? {
        requiredTier: (error.details['requiredTier'] as Upgrade['requiredTier']) ?? null,
        currentTier: (error.details['currentTier'] as Upgrade['currentTier']) ?? null,
      }
    : null;

export type Gated<T> = Loadable<T> & {
  forbidden: boolean;
  upgrade: Upgrade | null;
  /** The gap's 404 — "you have not written yours yet", which is a state and not a failure. */
  locked: boolean;
  reload: () => Promise<void>;
};

function useGated<T>(path: string | null, enabled = true): Gated<T> {
  const [state, setState] = useState<Loadable<T>>({ data: null, loading: true, error: null });
  const [forbidden, setForbidden] = useState(false);
  const [upgrade, setUpgrade] = useState<Upgrade | null>(null);
  const [locked, setLocked] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!path || !enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    try {
      const response = await apiGet<{ data: T }>(path);
      if (!alive.current) return;
      setForbidden(false);
      setUpgrade(null);
      setLocked(false);
      setState({ data: response.data, loading: false, error: null });
    } catch (error) {
      if (!alive.current) return;
      const paid = upgradeFrom(error);
      const status = error instanceof ApiError ? error.status : 0;
      setUpgrade(paid);
      setForbidden(!paid && status === 403);
      setLocked(status === 404);
      setState({
        data: null,
        loading: false,
        error: paid || status === 403 || status === 404 ? null : (error as Error),
      });
    }
  }, [path, enabled]);

  useEffect(() => {
    alive.current = true;
    setState((current) => ({ ...current, loading: true }));
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  return { ...state, forbidden, upgrade, locked, reload: load };
}

export const useCycles = (enabled = true): Gated<ReflectionCycle[]> =>
  useGated<ReflectionCycle[]>('/reflect', enabled);

export const useReflectionForm = (campaignId: string | null): Gated<ReflectionForm> =>
  useGated<ReflectionForm>(campaignId ? `/reflect/${campaignId}` : null);

export const useGap = (campaignId: string | null): Gated<GapView> =>
  useGated<GapView>(campaignId ? `/reflect/${campaignId}/gap` : null);

export const submitReflection = (campaignId: string, body: SubmitReflectionBody) =>
  apiPost<SubmitReflectionBody, { data: { id: string } }>(`/reflect/${campaignId}`, body);

export const savePlan = (campaignId: string, body: CreatePlanBody) =>
  apiPost<CreatePlanBody, { data: unknown }>(`/reflect/${campaignId}/plan`, body);

export const finalisePlan = (planId: string) =>
  apiPost<undefined, { data: unknown }>(`/reflect/plans/${planId}/finalise`);
