// The route table is a contract with 20 §2, not an implementation detail — the sidebar,
// the QR link and the share sheet all hardcode these paths. A route quietly renamed
// breaks a printed QR code, which is the one failure that cannot be fixed on demo day.
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

describe('the three route trees', () => {
  it.each([
    '/', '/login', '/start',
    '/app', '/app/setup', '/app/structure', '/app/roles',
    '/app/people', '/app/people/:id',
    '/app/subjects', '/app/subjects/:id',
    '/app/templates', '/app/templates/:id',
    '/app/forms/:id/build', '/app/forms/:id/preview',
    '/app/campaigns', '/app/campaigns/new', '/app/campaigns/:id', '/app/campaigns/:id/results',
    '/app/profile', '/app/simulator', '/app/settings',
    '/r/:token', '/r/:token/done',
  ])('serves %s', (path) => {
    expect(paths.has(path)).toBe(true);
  });

  // A disabled sidebar item with a "Soon" tag is correct. A stub page behind it is not:
  // a dead link that renders something is worse than one that visibly does not navigate
  // (design_specs/design/02 §7).
  it.each(['/app/analysis', '/app/inbox', '/app/reflect', '/app/communities'])(
    'has no stub page behind the P3 route %s',
    (path) => {
      expect(paths.has(path)).toBe(false);
    },
  );

  it('catches an unmatched path in the PUBLIC tree, not the console', () => {
    // Answering a typo inside /app would bounce a stranger to a login screen and confirm
    // that a console exists at all.
    expect(paths.has('/*')).toBe(true);
    expect(paths.has('/app/*')).toBe(false);
  });
});

describe('containment', () => {
  const worlds = routes.filter((route) => route.children);

  /** The component behind an element — identity, not markup. Two <div>s look alike to a
   *  serialiser; PublicBoundary and ConsoleBoundary would too. */
  const componentOf = (node: ReactNode): unknown =>
    isValidElement(node) ? node.type : undefined;

  it('gives every world its own error boundary', () => {
    // Three boundaries, three DISTINCT components. One shared boundary would let a crash
    // in the console take down the respondent flow (20 §1).
    const boundaries = worlds.map((route) => componentOf(route.errorElement));
    expect(boundaries).toHaveLength(3);
    expect(boundaries.every(Boolean)).toBe(true);
    expect(new Set(boundaries).size).toBe(3);
  });

  it('gives every world its own layout', () => {
    const layouts = worlds.map((route) => componentOf(route.element));
    expect(new Set(layouts).size).toBe(3);
  });
});
