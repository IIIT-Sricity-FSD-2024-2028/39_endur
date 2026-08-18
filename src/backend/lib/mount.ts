// Router mounting, with the prefix recorded.
//
// Express 5 does not expose a router's mount path on its layer (v4's `regexp` is gone),
// so the route-enumeration test cannot recover it by walking internals — and a test that
// depends on framework internals is a test that breaks on a minor upgrade.
//
// Recording it here costs one line per router and makes T-014 independent of Express.
import type { Express, Router } from 'express';

const MOUNTS = new Map<Router, string>();

export function mount(app: Express, prefix: string, router: Router): void {
  MOUNTS.set(router, prefix);
  app.use(prefix, router);
}

export const mountPathOf = (router: Router): string => MOUNTS.get(router) ?? '';
export const mountedRouters = (): Array<[Router, string]> => [...MOUNTS.entries()];
