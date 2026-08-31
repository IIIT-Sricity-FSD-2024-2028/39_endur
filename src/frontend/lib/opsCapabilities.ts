// Capability-aware ops UI. Mirror of `lib/capabilities.ts`, Step 0.2, `Mithil/plan.md`.
//
// Usability only, never enforcement (INV-003) — `requirePlatform()` decides on every route.
// No scopes here: the platform catalogue is two fixed roles and a lookup (`19` §4), not the
// GRANT engine, so there is nothing narrower than "held" to ask for.
import { useCallback } from 'react';
import type { PlatformCapability } from '@endur/shared';
import { useAppSelector } from '../store/index.js';

export type OpsCan = (capability: PlatformCapability) => boolean;

export function useOpsCan(): OpsCan {
  const capabilities = useAppSelector((s) => s.ops.capabilities);
  return useCallback(
    (capability) => capabilities.includes(capability),
    [capabilities],
  );
}
