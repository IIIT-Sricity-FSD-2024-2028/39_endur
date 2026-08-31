// The route enumeration test: a route with no capability guard is a test failure.
// This is what makes "every authorised route passes through requireCapability" mechanical
// rather than a matter of anyone remembering. When it fails, the fix is almost always to add
// the guard, not to add the route to the allowlist below.
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { enumerateRoutes } from '../lib/routeTable.js';
import { grantsForLevel } from '../presets/grant-matrix.js';

// Routes that are public BY DESIGN, each with its reason. Adding an entry here is a security decision.
const PUBLIC_ROUTES: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /^\/healthz$/, why: 'liveness — no tenant, no principal' },
  { pattern: /^\/api\/v1\/auth\//, why: 'authentication itself cannot require a principal' },
  { pattern: /^\/r\//, why: 'respondent flow — a QR scan has no account (DEC-009)' },
  { pattern: /^\/api\/v1\/public\//, why: 'respondent payloads, allowlisted in 13 §6' },
  {
    // Not unauthenticated: a session is still required, so this list really enumerates "not gated on a capability".
    // No capability could stand in for the check that matters here - the obvious one is seeded to every role,
    // so it would refuse nobody and only make the route look guarded. What authorises this call is holding
    // the session AND knowing the current password, which is verified inside the service.
    pattern: /^\/api\/v1\/profile\/password$/,
    why:
      'a password change is authorised by holding the session and knowing the current ' +
      'password (13 § Profile, 47 § Capabilities). No capability expresses that, and the ' +
      'nearest one is seeded to every role, so a gate would guard nothing while implying ' +
      'an org could take the right away. The route takes NO id, so the only password it ' +
      'can reach is the caller\'s own.',
  },
  {
    // The platform's own front door: you cannot gate signing in on a permission held by the person signing in,
    // and "who am I" is the same question one step on. Every other platform route carries its own guard.
    pattern: /^\/api\/v1\/platform\/(auth\/(login|logout)|me)$/,
    why:
      'the operator login and "who am I" — authentication cannot require a principal, and ' +
      '/me is gated by requirePlatformAuth rather than by a capability (19 §11)',
  },
  {
    // Leaving a support session. Giving up access can never be the thing somebody is not permitted to do,
    // and gating it on the capability that opened the session would trap an operator whose role changed.
    // The route takes no id: it ends the session the caller's own cookie names.
    pattern: /^\/api\/v1\/platform\/support-session\/leave$/,
    why:
      'ending your own support session is the platform twin of POST /auth/logout — giving up ' +
      'access cannot require a permission, and gating it on platform.support.enter would trap ' +
      'an operator whose role changed mid-session (DEC-114, 19 §15). requirePlatformAuth is ' +
      'the real guard, and the route takes no id so it can only end the caller\'s own',
  },
  {
    // Messages from Endur. Not unauthenticated - a session is required - but not capability-gated either:
    // the response capability scopes which units' responses you may see, and says nothing about a message
    // addressed to you by name. The row names the reader, and the service scopes every query by the session.
    pattern: /^\/api\/v1\/inbox\/messages(\/:id\/(read|unread))?$/,
    why:
      'a message from Endur is addressed to ONE user by name (DEC-101, 58 § From Endur). ' +
      'No capability expresses "this row is yours": response.read scopes units and would ' +
      'lock a recipient out of their own mail, and a notification.* module would imply a ' +
      'shared queue somebody can be excluded from. The service scopes by the session\'s ' +
      'user id, so the route can only ever reach the caller\'s own rows.',
  },
  {
    // The API document and its viewer. They describe the SHAPE of the API and carry no customer data,
    // and every fact in them is already derivable from the client bundle.
    // What scopes them is the MOUNT: they are not mounted in production at all.
    pattern: /^\/api\/v1\/docs(\/|\/openapi\.json)?$/,
    why:
      'the OpenAPI document and its viewer (DEC-115, 13 §12). It describes the shape of the API ' +
      'and contains no tenant data — every fact in it is already derivable from the client ' +
      'bundle. It is scoped by NOT BEING MOUNTED in production rather than by a capability, so ' +
      'a production deployment 404s it like any unknown URL.',
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

// The walker lives in lib/routeTable.ts and is imported here.
// The API document walks the same stack, and two walkers could disagree about which routes exist
// without either one failing. One walker, two readers.

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

  // A mounted route must never require a capability no seeded role holds.
  // That combination once meant a documented, entitled feature that answered 403 for everybody, in every
  // organisation - the entitlement said yes and the grant said nothing.
  // A capability with no holder is not always wrong; a MOUNTED ROUTE requiring one always is.
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

  // The tenant guard and the platform guard must never both appear on one route.
  // A route is either a tenant route or a platform route: both is a route whose authorisation model
  // nobody can state in one sentence.
  it('no route carries both guards', () => {
    const both = routes.filter((route) => route.capabilities.length > 0 && route.platform.length > 0);
    expect(both.map((route) => `${route.method} ${route.path}`)).toEqual([]);
  });

  // Platform capabilities live under the platform prefix and only there, which is what makes the surface
  // greppable - and no tenant capability may guard a platform route.
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
