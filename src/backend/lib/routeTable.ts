// Lists every route the app actually mounts, along with the guards and DTO attached to each.
// One walker, used by both the route tests and the OpenAPI document, so the two can never disagree.
import type { Express } from 'express';
import type { z } from 'zod';
import { CAPABILITY_TAG } from '../middleware/requireCapability.js';
import { PLATFORM_TAG } from '../middleware/requirePlatform.js';
import { DTO_TAG } from '../middleware/validate.js';
import { mountedRouters } from './mount.js';

export type RouteEntry = {
  method: string;
  // The Express form of the path, with :id placeholders.
  path: string;
  // True when either authorisation guard is attached.
  guarded: boolean;
  // Org capabilities required by requireCapability().
  capabilities: string[];
  // Platform capabilities required by requirePlatform(). Never both on one route.
  platform: string[];
  // The schema validate() parses this request against, when the route has one.
  dto?: z.ZodTypeAny;
};

// Walks the live Express stack and returns one entry per mounted route.
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
      // The first schema only: a route mounts validate() once, and two would mean two schemas parsing one request.
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

// "METHOD /path" - the key tests and the response registry use to address a route.
export const routeKey = (route: Pick<RouteEntry, 'method' | 'path'>): string =>
  `${route.method} ${route.path}`;

// Express ':id' becomes OpenAPI '{id}': the only difference between the two path styles.
export const openApiPath = (path: string): string =>
  path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

// The path parameter names, in order.
export const pathParams = (path: string): string[] =>
  [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1] as string);
