// Short-lived cache of the grants a person holds, so one request does not hit the database twice.
// The org's authzVersion is part of the key, so any permission change drops the old entries at once.
import type { CandidateGrant } from './types.js';

const TTL_MS = 30_000;

type Entry = { grants: CandidateGrant[]; expiresAt: number };

const store = new Map<string, Entry>();

// Cache key: which org, which user, and which version of that org's permissions.
const keyFor = (orgId: string, userId: string, authzVersion: number) =>
  `${orgId}:${userId}:${authzVersion}`;

// Reads cached grants, returning undefined if there are none or they have gone stale.
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

// Stores this person's grants in the cache for the next 30 seconds.
export function setCachedGrants(
  orgId: string,
  userId: string,
  authzVersion: number,
  grants: CandidateGrant[],
): void {
  store.set(keyFor(orgId, userId, authzVersion), { grants, expiresAt: Date.now() + TTL_MS });
}

// Empties the cache. Only tests and the seed script use it, never a live request.
export function clearGrantCache(): void {
  store.clear();
}
