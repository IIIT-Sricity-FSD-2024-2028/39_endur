// THE ROUTE-ENUMERATION TEST. 12 §7, 51 §3.
//
// "A route with no requireCapability is a test failure."
//
// This is the single highest-value test in the codebase, because it is what makes INV-003
// — every authorised route passes through requireCapability — MECHANICAL rather than a
// matter of discipline. Reviewers forget; this does not.
//
// When a new route is added and this fails, the fix is almost never to add it to the
// allowlist. It is to add the guard.
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { CAPABILITY_TAG } from '../middleware/requireCapability.js';
import { mountedRouters } from '../lib/mount.js';

/**
 * Routes that are public BY DESIGN, each with the reason. Adding an entry here is a
 * deliberate security decision and should be argued for in review.
 */
const PUBLIC_ROUTES: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /^\/healthz$/, why: 'liveness — no tenant, no principal' },
  { pattern: /^\/api\/v1\/auth\//, why: 'authentication itself cannot require a principal' },
  { pattern: /^\/r\//, why: 'respondent flow — a QR scan has no account (DEC-009)' },
  { pattern: /^\/api\/v1\/public\//, why: 'respondent payloads, allowlisted in 13 §6' },
];

type Route = { method: string; path: string; guarded: boolean };

/**
 * Walks the app's own stack plus every mounted router, using the prefixes recorded by
 * `mount()` rather than Express internals.
 */
function enumerateRoutes(app: ReturnType<typeof createApp>): Route[] {
  const routes: Route[] = [];
  const appStack = (app as unknown as { router?: { stack: unknown[] } }).router?.stack ?? [];

  const collect = (layers: unknown[], prefix: string): void => {
    for (const raw of layers) {
      const route = (raw as { route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] } }).route;
      if (!route) continue;
      const guarded = route.stack.some(
        (entry) => typeof entry.handle === 'function' && CAPABILITY_TAG in entry.handle,
      );
      for (const method of Object.keys(route.methods)) {
        routes.push({ method: method.toUpperCase(), path: prefix + route.path, guarded });
      }
    }
  };

  collect(appStack, '');
  for (const [router, prefix] of mountedRouters()) {
    collect((router as unknown as { stack: unknown[] }).stack, prefix);
  }
  return routes;
}

const isPublic = (path: string) => PUBLIC_ROUTES.find((entry) => entry.pattern.test(path));

describe('route enumeration — INV-003', () => {
  const routes = enumerateRoutes(createApp());

  it('finds routes at all (a passing test over an empty list proves nothing)', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it('every non-public route has requireCapability attached', () => {
    const unguarded = routes.filter((route) => !route.guarded && !isPublic(route.path));
    expect(
      unguarded.map((route) => `${route.method} ${route.path}`),
      'add requireCapability() to these, or justify an entry in PUBLIC_ROUTES',
    ).toEqual([]);
  });

  it('every public route is public for a stated reason', () => {
    for (const route of routes.filter((r) => !r.guarded)) {
      const entry = isPublic(route.path);
      expect(entry?.why, `${route.method} ${route.path} is unguarded`).toBeTruthy();
    }
  });
});
