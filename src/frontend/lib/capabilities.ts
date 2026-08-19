// Capability-aware UI. 20 §6.
//
// > This is USABILITY, NEVER ENFORCEMENT (INV-003). The API returns only what the caller
// > may see and rejects what they may not do. A wrong capability set here causes a
// > confusing button, not a security hole.
//
// The corollary from design_specs/design/02 §5: out-of-scope data is ABSENT, not greyed
// out. No "you don't have permission" ghosts in lists. The single exception is a
// directly-navigated URL, which gets a full-page 403 state.
import { useMemo } from 'react';
import type { Capability } from '@endur/shared';
import { useAppSelector } from '../store/index.js';

export type Can = (capability: Capability) => boolean;

export function useCan(): Can {
  const capabilities = useAppSelector((s) => s.auth.capabilities);
  // Memoised on the array identity: the slice only replaces it on sign-in or org switch,
  // so this rebuilds twice a session rather than on every render of every list row.
  const held = useMemo(() => new Set(capabilities), [capabilities]);
  return (capability) => held.has(capability);
}
