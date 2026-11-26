// The permission simulator — reads and the one write. 42 § Data contract.
//
// `simulate()` on the server is `resolve()` itself, called directly (`authz/simulate.ts`).
// This file does not repeat that promise.
//
// On RTK Query since R-406 (`store/api/endpoints/simulator.ts`). The catalogue is now the
// same cache entry as the powers grid's rows, so the second of the two pages asks nothing.
//
// Reads only (DEC-R03): running a simulation, the sentence being asked and the last five
// answers are `store/screens/simulator.ts`.
import type { CapabilityMeta } from '@endur/shared';
import { useGetCapabilityCatalogueQuery } from '../store/api/endpoints/roles.js';
import { useLoadable, type Loadable } from './query.js';

export function useCapabilityCatalogue(): Loadable<CapabilityMeta[]> {
  return useLoadable(useGetCapabilityCatalogueQuery());
}
