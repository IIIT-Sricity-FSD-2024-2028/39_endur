// The permission simulator — reads and the one write. 42 § Data contract.
//
// `simulate()` on the server is `resolve()` itself, called directly (`authz/simulate.ts`).
// This file does not repeat that promise; it only shapes the request and keeps the local
// history `42` § State asks for — the last five simulations, on screen through a demo.
import { useCallback, useEffect, useState } from 'react';
import type { CapabilityMeta, DecisionView, SimulateBody } from '@endur/shared';
import { apiGet, apiPost, ApiError } from './api.js';
import type { Loadable } from './org.js';

export function useCapabilityCatalogue(): Loadable<CapabilityMeta[]> {
  const [state, setState] = useState<Loadable<CapabilityMeta[]>>({
    data: null, loading: true, error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void apiGet<{ data: CapabilityMeta[] }>('/authz/capabilities')
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

export type SimulationRecord = {
  id: string;
  query: SimulateBody;
  principalName: string;
  targetLabel: string;
  capabilityLabel: string;
  decision: DecisionView;
};

export type SimulatorController = {
  running: boolean;
  error: string | null;
  forbidden: boolean;
  /** Most recent first, capped at five (`42` § State). */
  history: SimulationRecord[];
  run: (
    query: SimulateBody,
    labels: { principalName: string; targetLabel: string; capabilityLabel: string },
  ) => Promise<void>;
};

let seq = 0;

export function useSimulator(): SimulatorController {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [history, setHistory] = useState<SimulationRecord[]>([]);

  const run = useCallback(
    async (
      query: SimulateBody,
      labels: { principalName: string; targetLabel: string; capabilityLabel: string },
    ) => {
      setRunning(true);
      setError(null);
      setForbidden(false);
      try {
        const { data } = await apiPost<SimulateBody, { data: DecisionView }>(
          '/authz/simulate',
          query,
        );
        seq += 1;
        setHistory((current) => [
          {
            id: `sim-${seq}`,
            query,
            principalName: labels.principalName,
            targetLabel: labels.targetLabel,
            capabilityLabel: labels.capabilityLabel,
            decision: data,
          },
          ...current,
        ].slice(0, 5));
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 403) {
          setForbidden(true);
        } else {
          setError((caught as Error).message);
        }
      } finally {
        setRunning(false);
      }
    },
    [],
  );

  return { running, error, forbidden, history, run };
}
