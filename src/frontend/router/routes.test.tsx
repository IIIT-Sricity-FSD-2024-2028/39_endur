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

describe('the four route trees', () => {
  it.each([
    '/', '/login', '/start', '/activate/:token',
    '/app', '/app/setup', '/app/structure', '/app/roles',
    '/app/people', '/app/people/:id',
    '/app/subjects', '/app/subjects/:id',
    '/app/templates', '/app/templates/:id',
    '/app/forms/:id/build', '/app/forms/:id/preview',
    '/app/campaigns', '/app/campaigns/new', '/app/campaigns/:id', '/app/campaigns/:id/results',
    '/app/profile', '/app/simulator', '/app/settings',
    '/app/inbox',
    // Added at T-082. No RequireCapability wrapper on it, deliberately: the page owns both
    // a 403 and a 402 and a route guard knows nothing about entitlements.
    '/app/analysis',
    '/app/reflect',
    // T-076. WRAPPED in RequireCapability, unlike the two above — there is no 402 on the
    // log, so a route guard can say everything there is to say (56 § States).
    '/app/logs',
    '/app/plan',
    '/r/:token', '/r/:token/done',
    // The ops world (DEC-033, 19 §4). It was live and untested here, which is how `20` §1
    // went on saying "three worlds" for a fortnight after there were four.
    '/ops/login', '/ops', '/ops/orgs/:id', '/ops/analytics', '/ops/earnings', '/ops/logs',
  ])('serves %s', (path) => {
    expect(paths.has(path)).toBe(true);
  });

  // A disabled sidebar item with a "Soon" tag is correct. A stub page behind it is not:
  // a dead link that renders something is worse than one that visibly does not navigate
  // (design_specs/design/02 §7).
  // Inbox left this list at T-080, Analysis at T-082 and REFLECT AT T-084, each when its
  // page was built. `/app/communities` is the only one left — it is P3-stretch (`60`) and
  // must not acquire a stub page.
  it.each(['/app/communities'])(
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
    // /ops keeps its OWN catch-all, and that is not the same decision reversed: a stranger
    // never reaches /ops at all, so a 404 inside it tells them nothing they did not type.
    expect(paths.has('/ops/*')).toBe(true);
  });
});

describe('containment', () => {
  const worlds = routes.filter((route) => route.children);

  /** The component behind an element — identity, not markup. Two <div>s look alike to a
   *  serialiser; PublicBoundary and ConsoleBoundary would too. */
  const componentOf = (node: ReactNode): unknown =>
    isValidElement(node) ? node.type : undefined;

  // Counted, not hardcoded. This read `3` until 29 Aug, went red the moment `/ops` became
  // the fourth world (DEC-033), and the number was never the property worth guarding —
  // EVERY world having its OWN boundary and layout is. Asserting against `worlds.length`
  // states that directly, so a fifth world must bring its own pair to pass and cannot
  // break the test merely by existing (`20` §1).
  it('gives every world its own error boundary', () => {
    // One shared boundary would let a crash in the console take down the respondent flow.
    const boundaries = worlds.map((route) => componentOf(route.errorElement));
    expect(worlds.length).toBeGreaterThan(1);
    expect(boundaries.every(Boolean)).toBe(true);
    expect(new Set(boundaries).size).toBe(worlds.length);
  });

  it('gives every world its own layout', () => {
    const layouts = worlds.map((route) => componentOf(route.element));
    expect(layouts.every(Boolean)).toBe(true);
    expect(new Set(layouts).size).toBe(worlds.length);
  });
});
