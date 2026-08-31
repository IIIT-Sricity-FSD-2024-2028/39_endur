// Capability-aware UI. 20 §6.
//
// > This is USABILITY, NEVER ENFORCEMENT (INV-003). The API returns only what the caller
// > may see and rejects what they may not do. A wrong capability set here causes a
// > confusing button, not a security hole.
//
// The corollary from design_specs/design/02 §5: out-of-scope data is ABSENT, not greyed
// out. No "you don't have permission" ghosts in lists. The single exception is a
// directly-navigated URL, which gets a full-page 403 state.
import { useCallback } from 'react';
import { scopeReaches, type Capability, type Scope } from '@endur/shared';
import { useAppSelector } from '../store/index.js';

/**
 * `atLeast` IS THE T-086 HALF, and it defaults to `self` so that `can(x)` means exactly
 * what it always meant: held somewhere, at any width.
 *
 * The wider form answers the only question a nav gate can usefully ask. `person.read` is
 * seeded to every role at `self` so that `/app/profile` opens (`50` §1), so `can(
 * 'person.read')` is TRUE FOR EVERY ACCOUNT IN THE PRODUCT and gating the People item on
 * it showed everybody a page listing exactly themselves (`D-027`). `can('person.read',
 * 'own_unit')` is the question that item meant to ask all along.
 *
 * What it does NOT tell you is which unit, or whether a particular row is readable. The
 * map carries the widest scope of any live allow and nothing about anchors (see the
 * backend's authz/held.ts). Anything that has to be true of a SPECIFIC thing is the
 * server's answer, not this one.
 */
export type Can = (capability: Capability, atLeast?: Scope) => boolean;

export function useCan(): Can {
  const capabilities = useAppSelector((s) => s.auth.capabilities);
  // Memoised on the map identity: the slice only replaces it on sign-in or org switch, so
  // this rebuilds twice a session rather than on every render of every list row. The map
  // IS the lookup structure, so unlike the old array there is nothing to build first.
  return useCallback(
    (capability, atLeast = 'self') => scopeReaches(capabilities[capability], atLeast),
    [capabilities],
  );
}
