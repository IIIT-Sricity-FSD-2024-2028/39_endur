import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import type { RouteObject } from 'react-router-dom';
import { routes } from './index.js';

function flatten(list: RouteObject[], prefix = ''): string[] {
  return list.flatMap((route) => {
    const here = route.index
      ? prefix || '/'
      : route.path === undefined
        ? prefix
        : route.path.startsWith('/')
          ? route.path
          : `${prefix}/${route.path}`;
    const children = route.children ? flatten(route.children, here === '/' ? '' : here) : [];
    return route.children ? children : [here];
  });
}

const paths = new Set(flatten(routes));

describe('the four route trees', () => {
  it.each([
    '/', '/login', '/start', '/activate/:token',
    '/app', '/app/setup', '/app/structure', '/app/roles',
    '/app/start',
    '/app/people', '/app/people/:id',
    '/app/subjects', '/app/subjects/:id',
    '/app/templates', '/app/templates/:id',
    '/app/forms/:id/build', '/app/forms/:id/preview',
    '/app/campaigns', '/app/campaigns/new', '/app/campaigns/:id', '/app/campaigns/:id/results',
    '/app/profile', '/app/simulator', '/app/settings',
    '/app/inbox',
    '/app/analysis',
    '/app/reflect',
    '/app/announcements',
    '/app/booking', '/app/booking/:id',
    '/app/logs',
    '/app/plan',
    '/r/:token', '/r/:token/done',
    '/book/:token',
    '/ops/login', '/ops', '/ops/orgs/:id', '/ops/analytics', '/ops/earnings', '/ops/logs',
  ])('serves %s', (path) => {
    expect(paths.has(path)).toBe(true);
  });

  it.each(['/app/communities'])(
    'has no stub page behind the P3 route %s',
    (path) => {
      expect(paths.has(path)).toBe(false);
    },
  );

  it('catches an unmatched path in the PUBLIC tree, not the console', () => {
    expect(paths.has('/*')).toBe(true);
    expect(paths.has('/app/*')).toBe(false);
    expect(paths.has('/ops/*')).toBe(true);
  });
});

describe('containment', () => {
  const worlds = routes.filter((route) => route.children);

  const componentOf = (node: ReactNode): unknown =>
    isValidElement(node) ? node.type : undefined;

  const pairs = worlds.map((route) => ({
    layout: componentOf(route.element),
    boundary: componentOf(route.errorElement),
  }));

  it('gives every world its own error boundary', () => {
    expect(worlds.length).toBeGreaterThan(1);
    expect(pairs.every((pair) => Boolean(pair.boundary))).toBe(true);

    const layoutsPerBoundary = new Map<unknown, Set<unknown>>();
    for (const pair of pairs) {
      const seen = layoutsPerBoundary.get(pair.boundary) ?? new Set();
      seen.add(pair.layout);
      layoutsPerBoundary.set(pair.boundary, seen);
    }
    expect([...layoutsPerBoundary.values()].every((layouts) => layouts.size === 1)).toBe(true);
  });

  it('gives every world its own layout', () => {
    expect(pairs.every((pair) => Boolean(pair.layout))).toBe(true);

    const boundariesPerLayout = new Map<unknown, Set<unknown>>();
    for (const pair of pairs) {
      const seen = boundariesPerLayout.get(pair.layout) ?? new Set();
      seen.add(pair.boundary);
      boundariesPerLayout.set(pair.layout, seen);
    }
    expect([...boundariesPerLayout.values()].every((set) => set.size === 1)).toBe(true);

    expect(new Set(pairs.map((pair) => pair.layout)).size).toBe(4);
    expect(worlds.length).toBe(5);
  });
});
