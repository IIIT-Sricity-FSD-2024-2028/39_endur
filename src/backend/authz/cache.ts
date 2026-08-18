// 11 §7. Two layers, both cheap.
//
// The per-principal cache has a 30-second TTL, but the TTL is NOT what keeps it correct.
// `organizations.settings.authzVersion` is bumped in the same transaction as any write to
// nodes, edges or grants, and it is part of the key — so a permission change invalidates
// every entry for that tenant instantly. A 30-second window in which a revoked permission
// still works is a security bug, not a performance trade-off.
//
// In-process Map for P1. Redis only if we ever run more than one API instance; do not add
// it speculatively.
import type { CandidateGrant } from './types.js';

const TTL_MS = 30_000;

type Entry = { grants: CandidateGrant[]; expiresAt: number };

const store = new Map<string, Entry>();

const keyFor = (orgId: string, userId: string, authzVersion: number) =>
  `${orgId}:${userId}:${authzVersion}`;

export function getCachedGrants(
  orgId: string,
  userId: string,
  authzVersion: number,
): CandidateGrant[] | undefined {
  const key = keyFor(orgId, userId, authzVersion);
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.grants;
}

export function setCachedGrants(
  orgId: string,
  userId: string,
  authzVersion: number,
  grants: CandidateGrant[],
): void {
  store.set(keyFor(orgId, userId, authzVersion), { grants, expiresAt: Date.now() + TTL_MS });
}

/** Tests and the seed need a clean slate; nothing in a request path should call this. */
export function clearGrantCache(): void {
  store.clear();
}
