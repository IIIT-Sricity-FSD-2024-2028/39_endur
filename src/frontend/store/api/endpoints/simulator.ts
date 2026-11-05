// The permission simulator on RTK Query. 42 § Data contract; docs/REDUX-PLAN.md (R-406).
//
// `simulate()` on the server is `resolve()` itself, called directly (`authz/simulate.ts`).
// It is a POST that changes nothing, so it is a mutation with nothing to invalidate: each
// run is an event the page keeps in its history, not a cached answer. Caching it would be
// wrong, too, because the same question has a different answer after a grant edit.
//
// The capability catalogue the simulator's dropdown is built from is the powers grid's
// (`getCapabilityCatalogue` in `roles.ts`): one cache entry for both pages.
import type { DecisionView, SimulateBody } from '@endur/shared';
import { api } from '../api.js';

export const simulatorApi = api.injectEndpoints({
  endpoints: (build) => ({
    simulate: build.mutation<DecisionView, SimulateBody>({
      query: (body) => ({ url: '/authz/simulate', method: 'POST', body }),
      transformResponse: (response: { data: DecisionView }) => response.data,
    }),
  }),
});

export const { useSimulateMutation } = simulatorApi;
