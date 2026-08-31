// EVERY ROUTE THE APP ACTUALLY MOUNTS, with the guards and the DTO attached to each.
//
// LIFTED OUT OF `routes.test.ts` AT `T-110`, and the move is the point rather than tidiness.
// That test walks the router stack to assert INV-003 — *"a route with no requireCapability is
// a test failure"* — and the OpenAPI document needs to walk exactly the same stack to describe
// the same routes. Two walkers would mean the document could describe a route the test does not
// check, or miss one it does, and either way the disagreement would be invisible: both would
// pass.
//
// So there is one walker. The test asserts over it, `openapi/spec.ts` renders from it, and
// **a route that neither can see does not exist** — because both read the live Express stack
// through the prefixes `mount()` recorded, not a list anybody maintains.
//
// It reads `app.router.stack` and each mounted router's `stack`, which is the one piece of
// Express internals this codebase touches. `mount()` exists precisely to keep the PREFIX out of
// that reach (Express 5 dropped v4's `layer.regexp`), so what is read here is the stack shape
// alone — stable across Express 5 minors, and the alternative is parsing source.
import type { Express } from 'express';
import type { z } from 'zod';
import { CAPABILITY_TAG } from '../middleware/requireCapability.js';
import { PLATFORM_TAG } from '../middleware/requirePlatform.js';
import { DTO_TAG } from '../middleware/validate.js';
import { mountedRouters } from './mount.js';

export type RouteEntry = {
  method: string;
  /** Express form, with `:id` placeholders — `/api/v1/people/:id/assignments`. */
  path: string;
  /** True when EITHER guard is attached. INV-003's question, in one field. */
  guarded: boolean;
  /** Org capabilities from `requireCapability()` (11 §3). */
  capabilities: string[];
  /** Platform capabilities from `requirePlatform()` (19 §4). Never both — see 19 §9. */
  platform: string[];
  /** The DTO `validate()` parses this request against, when the route has one. */
  dto?: z.ZodTypeAny;
};

export function enumerateRoutes(app: Express): RouteEntry[] {
  const routes: RouteEntry[] = [];
  const appStack = (app as unknown as { router?: { stack: unknown[] } }).router?.stack ?? [];

  const collect = (layers: unknown[], prefix: string): void => {
    for (const raw of layers) {
      const route = (
        raw as {
          route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] };
        }
      ).route;
      if (!route) continue;

      const tagged = <T>(tag: symbol): T[] =>
        route.stack.flatMap((entry) =>
          typeof entry.handle === 'function' && tag in entry.handle
            ? [(entry.handle as unknown as Record<symbol, T>)[tag] as T]
            : [],
        );

      const capabilities = tagged<string>(CAPABILITY_TAG);
      const platform = tagged<string>(PLATFORM_TAG);
      // THE FIRST, not a merge. A route mounts `validate()` once — the DTO composes body,
      // query and params into a single schema precisely so that it can (14 §3) — and a second
      // one would be two schemas parsing one request, which is a bug the document should not
      // paper over by concatenating them.
      const dto = tagged<z.ZodTypeAny>(DTO_TAG)[0];

      for (const method of Object.keys(route.methods)) {
        routes.push({
          method: method.toUpperCase(),
          path: prefix + route.path,
          guarded: capabilities.length > 0 || platform.length > 0,
          capabilities,
          platform,
          ...(dto ? { dto } : {}),
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

/** `METHOD /path` — the key the response registry and the tests both address a route by. */
export const routeKey = (route: Pick<RouteEntry, 'method' | 'path'>): string =>
  `${route.method} ${route.path}`;

/** Express `:id` → OpenAPI `{id}`. The only difference between the two path grammars here. */
export const openApiPath = (path: string): string =>
  path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

/** Path parameter names, in order, from an Express path. */
export const pathParams = (path: string): string[] =>
  [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1] as string);
