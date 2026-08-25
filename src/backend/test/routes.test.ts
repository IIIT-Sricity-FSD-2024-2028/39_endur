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
import { PLATFORM_TAG } from '../middleware/requirePlatform.js';
import { mountedRouters } from '../lib/mount.js';
import { grantsForLevel } from '../presets/grant-matrix.js';

/**
 * Routes that are public BY DESIGN, each with the reason. Adding an entry here is a
 * deliberate security decision and should be argued for in review.
 */
const PUBLIC_ROUTES: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /^\/healthz$/, why: 'liveness — no tenant, no principal' },
  { pattern: /^\/api\/v1\/auth\//, why: 'authentication itself cannot require a principal' },
  { pattern: /^\/r\//, why: 'respondent flow — a QR scan has no account (DEC-009)' },
  { pattern: /^\/api\/v1\/public\//, why: 'respondent payloads, allowlisted in 13 §6' },
  {
    // NOT UNAUTHENTICATED — `authenticate` runs, and without a session this 401s. It is
    // uncapability-GATED, which is what this list actually enumerates.
    //
    // 13 § Profile and 47 § Capabilities both specify it with no capability, and the reason
    // is that no capability could stand in for the check that matters. The obvious
    // candidate, `person.update: self`, is seeded to every role (50 §1), so gating on it
    // would refuse nobody — it would only make the route LOOK guarded. Worse, it would
    // imply an organisation could withhold password changes by editing a role, and the
    // person it withheld them from would then be unable to rotate a credential they own.
    //
    // What authorises this call is holding the session AND knowing the current password,
    // and the second half is verified inside the service, where a hash comparison can
    // happen. `57` § "Why an administrator still cannot set a password" is the same rule
    // from the other side: `person.update` over somebody's subtree must never become a way
    // to set their password, and the absence of that capability here is what guarantees the
    // only password this route can change is the caller's own.
    pattern: /^\/api\/v1\/profile\/password$/,
    why:
      'a password change is authorised by holding the session and knowing the current ' +
      'password (13 § Profile, 47 § Capabilities). No capability expresses that, and the ' +
      'nearest one is seeded to every role, so a gate would guard nothing while implying ' +
      'an org could take the right away. The route takes NO id, so the only password it ' +
      'can reach is the caller\'s own.',
  },
  {
    // T-059, 19 §11. Two routes, and both are the platform's own front door: you cannot
    // gate signing in on a permission held by the person signing in, and `/platform/me`
    // answers "who am I", which is the same question one layer on. `requirePlatformAuth`
    // is the real guard on `/me` — without the `endur.ops` cookie it 401s — so what this
    // entry actually enumerates is "not capability-gated", exactly as it does for
    // /auth/ above. Every OTHER route under this prefix carries `requirePlatform()`.
    pattern: /^\/api\/v1\/platform\/(auth\/(login|logout)|me)$/,
    why:
      'the operator login and "who am I" — authentication cannot require a principal, and ' +
      '/me is gated by requirePlatformAuth rather than by a capability (19 §11)',
  },
  {
    pattern: /^\/api\/v1\/files\/:id$/,
    why:
      'serving a logo or an avatar (48). The unguessable id IS the credential: these render ' +
      'on a respondent phone with no session, no tenant and no cookie, so there is no ' +
      'principal for requireCapability to decide about. Nothing else is ever served here — ' +
      'readFile() refuses any row whose kind is not logo or avatar.',
  },
];

type Route = {
  method: string;
  path: string;
  guarded: boolean;
  capabilities: string[];
  /** T-059. The FOURTH guard's tag, collected separately — see the two tests below. */
  platform: string[];
};

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
      const tagged = (tag: symbol) =>
        route.stack.flatMap((entry) =>
          typeof entry.handle === 'function' && tag in entry.handle
            ? [(entry.handle as unknown as Record<symbol, string>)[tag] as string]
            : [],
        );
      const capabilities = tagged(CAPABILITY_TAG);
      const platform = tagged(PLATFORM_TAG);
      for (const method of Object.keys(route.methods)) {
        routes.push({
          method: method.toUpperCase(),
          path: prefix + route.path,
          guarded: capabilities.length > 0 || platform.length > 0,
          capabilities,
          platform,
        });
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

  /**
   * FOUND AT T-081, AND IT HAD BEEN TRUE SINCE T-003 (`D-033`).
   *
   * `analysis.read` was catalogued in `11` §3, entitled at Silver in `16` §3, and in NO ROW
   * of the seeded grant matrix — so no role in any organisation had ever held it, and the
   * route would have returned 403 to every user of every org including a Gold one. The
   * entitlement said yes and the grant said nothing, which is exactly `D-012`'s shape (no
   * org had a subscription row) and `D-028`'s (`account.*` and `billing.*` were in no tier).
   *
   * A capability with no seeded holder is not always wrong — `45`'s `apikey.*` has no route
   * yet, and a grant to a route that does not exist cannot be tested. What is always wrong
   * is a MOUNTED ROUTE requiring one. That is the pair this asserts, so the next occurrence
   * fails on the day the router is mounted rather than the day somebody opens the page.
   *
   * `reflection.*`, `actionplan.*` and `checkin.*` are the next five, and `T-083` will meet
   * this test the moment it mounts `/api/v1/reflect`.
   */
  it('no mounted route requires a capability that no seeded role holds', () => {
    const seeded = new Set(
      ([1, 2, 3, 4] as const).flatMap((level) =>
        grantsForLevel(level).map((grant) => grant.capability as string),
      ),
    );
    const unreachable = [
      ...new Set(
        routes.flatMap((route) =>
          route.capabilities.filter((capability) => !seeded.has(capability)),
        ),
      ),
    ].sort();

    expect(
      unreachable,
      'these routes can never be reached by anybody: add the row to 50 §1 and grant-matrix.ts',
    ).toEqual([]);
  });

  /**
   * 19 §9's hardest rule, and it is the reason this test knows about the fourth guard at
   * all: `requireCapability` and `requirePlatform` MUST NEVER BOTH APPEAR ON ONE ROUTE.
   *
   * A route is either a tenant route or a platform route. Both is a route whose
   * authorisation model nobody can state in one sentence — and worse, one whose two guards
   * would each be satisfied by a principal the other refuses, so the pair reads as "either
   * an operator or an administrator" when every word of 19 says they share nothing.
   */
  it('no route carries both guards', () => {
    const both = routes.filter((route) => route.capabilities.length > 0 && route.platform.length > 0);
    expect(both.map((route) => `${route.method} ${route.path}`)).toEqual([]);
  });

  /**
   * The greppability claim in 19 §11, asserted rather than asserted-in-prose: a single
   * prefix is what lets this file check that no `platform.` capability leaks into the
   * tenant surface, and that no tenant capability guards a platform route.
   */
  it('platform capabilities live under /api/v1/platform, and only there', () => {
    for (const route of routes) {
      const isPlatform = route.path.startsWith('/api/v1/platform');
      if (route.platform.length > 0) {
        expect(isPlatform, `${route.path} uses requirePlatform outside the prefix`).toBe(true);
      }
      if (isPlatform) {
        expect(route.capabilities, `${route.path} uses an ORG capability`).toEqual([]);
      }
    }
  });

  it('every public route is public for a stated reason', () => {
    for (const route of routes.filter((r) => !r.guarded)) {
      const entry = isPublic(route.path);
      expect(entry?.why, `${route.method} ${route.path} is unguarded`).toBeTruthy();
    }
  });
});
