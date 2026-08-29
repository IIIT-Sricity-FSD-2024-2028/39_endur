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
    // T-093. The console's gallery, and NOT the public `/start` above it — the two are
    // different screens in different trees and the test names both so a rename cannot
    // quietly collapse them into one.
    '/app/start',
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
    // T-094 and T-096. Same posture as Analysis: no route guard, because the page owns a
    // 402 as well as a 403 and a guard knows nothing about entitlements.
    '/app/announcements',
    // T-095/T-096. Gold, and gated by the page rather than the route for the same reason.
    '/app/booking', '/app/booking/:id',
    // T-076. WRAPPED in RequireCapability, unlike the two above — there is no 402 on the
    // log, so a route guard can say everything there is to say (56 § States).
    '/app/logs',
    '/app/plan',
    '/r/:token', '/r/:token/done',
    // T-095. THE RESPONDENT WORLD'S SECOND DOOR, under the same layout and boundary as `/r`
    // rather than a tree of its own — and at `/book/:token` rather than `/r/book/:token`,
    // because `/r/:token` already matches one segment and would read "book" as a campaign
    // token.
    '/book/:token',
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
  // EVERY world having its OWN boundary and layout is.
  //
  // IT WENT RED AGAIN AT `T-095`, AND THAT TIME THE TEST WAS WRONG RATHER THAN THE ROUTER.
  // `/book/:token` is a second ROOT in the respondent world, not a fifth world: it shares
  // `RespondLayout` and `RespondBoundary` deliberately, because a booking link has every
  // property that world exists for and duplicating a layout and a boundary to give it its
  // own root would leave the respondent world with two boundaries to keep in step (20 §2).
  // A one-root-per-boundary assertion could only be satisfied by making that mistake.
  //
  // So the property is stated the way it was always meant: a world IS a layout, and the
  // PAIRING is what containment depends on. Every layout has exactly one boundary and every
  // boundary belongs to exactly one layout — so a crash in the console still cannot reach
  // the respondent flow, and two roots of the same world cannot drift apart.
  const pairs = worlds.map((route) => ({
    layout: componentOf(route.element),
    boundary: componentOf(route.errorElement),
  }));

  it('gives every world its own error boundary', () => {
    expect(worlds.length).toBeGreaterThan(1);
    expect(pairs.every((pair) => Boolean(pair.boundary))).toBe(true);

    // No boundary is shared by two DIFFERENT layouts. That is the containment claim: one
    // shared boundary across worlds would let a crash in the console take down the
    // respondent flow.
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

    // And the pairing holds the other way: a layout never appears under two boundaries, so
    // `/r` and `/book` — the respondent world's two roots — are caught by the same one.
    const boundariesPerLayout = new Map<unknown, Set<unknown>>();
    for (const pair of pairs) {
      const seen = boundariesPerLayout.get(pair.layout) ?? new Set();
      seen.add(pair.boundary);
      boundariesPerLayout.set(pair.layout, seen);
    }
    expect([...boundariesPerLayout.values()].every((set) => set.size === 1)).toBe(true);

    // Four worlds, five roots. Named rather than derived, so a fifth WORLD arriving without
    // its own pair is a failure somebody has to look at rather than a number that slides.
    expect(new Set(pairs.map((pair) => pair.layout)).size).toBe(4);
    expect(worlds.length).toBe(5);
  });
});
