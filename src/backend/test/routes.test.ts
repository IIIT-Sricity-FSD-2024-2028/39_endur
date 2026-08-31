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
import { enumerateRoutes } from '../lib/routeTable.js';
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
    // T-109, DEC-114. LEAVING A SUPPORT SESSION, and it is uncapability-gated on purpose.
    //
    // `requirePlatformAuth()` is mounted on the whole router above it, so this 401s without
    // the `endur.ops` cookie — what this list enumerates is "not capability-gated", exactly as
    // it does for /auth/ and /platform/me.
    //
    // NOT `platform.support.enter`. Giving up access can never be the thing somebody is not
    // permitted to do, and gating it on the capability that opened the session would mean an
    // operator whose role changed mid-session could not close the session that role had
    // opened — the one state where leaving matters most. `POST /auth/logout` is unguarded for
    // the same reason one surface over.
    //
    // The route takes NO id: it ends the session the CALLER's cookie names and no other, so
    // there is nothing an operator could send to close a colleague's.
    pattern: /^\/api\/v1\/platform\/support-session\/leave$/,
    why:
      'ending your own support session is the platform twin of POST /auth/logout — giving up ' +
      'access cannot require a permission, and gating it on platform.support.enter would trap ' +
      'an operator whose role changed mid-session (DEC-114, 19 §15). requirePlatformAuth is ' +
      'the real guard, and the route takes no id so it can only end the caller\'s own',
  },
  {
    // T-101, DEC-101. NOT UNAUTHENTICATED — `authenticate` runs and this 401s without a
    // session. It is uncapability-GATED, which is what this list enumerates.
    //
    // NOT `response.read`. That capability scopes which UNITS' responses you may see, and it
    // has nothing to say about a message addressed to you BY NAME. Gating on it would mean an
    // administrator with no response scope could be sent a message they could never open —
    // and the operator would still be told it was delivered, which is the exact failure
    // `DEC-101` exists to fix.
    //
    // AND NOT A NEW `notification.*` MODULE. A capability implies a shared queue somebody can
    // be excluded from; this queue is one reader's, because THE ROW NAMES THEM. `58` makes the
    // same argument about inbox read state — the state is the reader's, so there is nothing
    // narrower than "held" to ask for. What authorises the call is the session, and the
    // service scopes every query by `userId` from it rather than from anything in the request
    // (INV-010's shape), so there is no id a caller could send to reach a colleague's mail.
    pattern: /^\/api\/v1\/inbox\/messages(\/:id\/(read|unread))?$/,
    why:
      'a message from Endur is addressed to ONE user by name (DEC-101, 58 § From Endur). ' +
      'No capability expresses "this row is yours": response.read scopes units and would ' +
      'lock a recipient out of their own mail, and a notification.* module would imply a ' +
      'shared queue somebody can be excluded from. The service scopes by the session\'s ' +
      'user id, so the route can only ever reach the caller\'s own rows.',
  },
  {
    // T-110, DEC-115. THE API DOCUMENT AND ITS VIEWER, and they are unguarded on purpose.
    //
    // The document describes the SHAPE of the API — paths, schemas, which capability each route
    // needs — and carries no customer data, no organisation names and no secrets. Every fact in
    // it is already derivable by reading the client bundle. A session gate would keep out the one
    // audience that most needs it (somebody integrating, somebody evaluating, somebody new to the
    // codebase) in exchange for hiding nothing.
    //
    // What actually scopes it is the MOUNT: `app.ts` does not mount this router in production, so
    // there the path answers the same 404 as any other unknown URL rather than a 403 that would
    // confirm it would have been there. A capability could not have expressed that, because in
    // production there is no route for one to sit on.
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

/**
 * THE WALKER MOVED TO `lib/routeTable.ts` AT `T-110`, and this test now imports it.
 *
 * It was defined here for as long as this was the only thing that needed it. The OpenAPI
 * document needs to walk the same stack (`DEC-115`), and two walkers would be able to disagree
 * about which routes exist WITHOUT EITHER FAILING — the spec would describe a route this test
 * never checked, or miss one it did, and nothing would say so. One walker, two readers.
 */

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
