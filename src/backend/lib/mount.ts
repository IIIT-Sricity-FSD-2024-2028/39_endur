// Mounts a router and remembers its URL prefix.
// Express 5 does not expose that prefix, and the route tests and API docs both need it.
import type { Express, Router } from 'express';

const MOUNTS = new Map<Router, string>();

// Mounts the router on the app and records the prefix.
export function mount(app: Express, prefix: string, router: Router): void {
  MOUNTS.set(router, prefix);
  app.use(prefix, router);
}

// The prefix a router was mounted at, and the list of every mounted router.
export const mountPathOf = (router: Router): string => MOUNTS.get(router) ?? '';
export const mountedRouters = (): Array<[Router, string]> => [...MOUNTS.entries()];
