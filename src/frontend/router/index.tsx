// The three route trees. 20 §2.
//
// Two properties are load-bearing here and are worth stating before the code:
//
//  1. THREE TREES, THREE LAYOUTS, THREE ERROR BOUNDARIES. A crash in the console cannot
//     take down the respondent flow.
//  2. EVERY PAGE IS LAZY. Route-level code splitting per world is what keeps the console
//     out of the respondent bundle — which is loaded on a phone, on a venue network, by
//     someone with no patience (20 §8).
//
// P3 routes are NOT here. The sidebar shows them disabled with a "Soon" tag and they never
// navigate. A stub page behind a dead link is worse than a disabled item
// (design_specs/design/02 §7).
import { lazy, Suspense } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { ConsoleLayout, OpsLayout, PublicLayout, RespondLayout } from './layouts.js';
import { ConsoleBoundary, OpsBoundary, PublicBoundary, RespondBoundary } from './boundaries.js';
import { RedirectIfSignedIn, RequireCapability, SessionLoading } from './guards.js';

const Landing = lazy(() => import('../pages/public/Landing.js'));
const Login = lazy(() => import('../pages/public/Login.js'));
const Start = lazy(() => import('../pages/public/Start.js'));
const Activate = lazy(() => import('../pages/public/Activate.js'));

const Home = lazy(() => import('../pages/console/Home/index.js'));
const Setup = lazy(() => import('../pages/console/Setup/index.js'));
const Structure = lazy(() => import('../pages/console/Structure/index.js'));
const Roles = lazy(() => import('../pages/console/Roles/index.js'));
const People = lazy(() => import('../pages/console/People/index.js'));
const PersonDetail = lazy(() => import('../pages/console/People/PersonDetail.js'));
const Subjects = lazy(() => import('../pages/console/Subjects/index.js'));
const SubjectDetail = lazy(() => import('../pages/console/Subjects/Detail.js'));
const Templates = lazy(() => import('../pages/console/Templates/index.js'));
const TemplateDetail = lazy(() => import('../pages/console/Templates/Detail.js'));
const Builder = lazy(() => import('../pages/console/Builder/index.js'));
const BuilderPreview = lazy(() => import('../pages/console/Builder/Preview.js'));
const Campaigns = lazy(() => import('../pages/console/Campaigns/index.js'));
const CampaignNew = lazy(() => import('../pages/console/Campaigns/New.js'));
const CampaignDetail = lazy(() => import('../pages/console/Campaigns/Detail.js'));
const Results = lazy(() => import('../pages/console/Results/index.js'));
const Inbox = lazy(() => import('../pages/console/Inbox/index.js'));
const Analysis = lazy(() => import('../pages/console/Analysis/index.js'));
const Reflect = lazy(() => import('../pages/console/Reflect/index.js'));
const Logs = lazy(() => import('../pages/console/Logs/index.js'));
const Profile = lazy(() => import('../pages/console/Profile/index.js'));
const Simulator = lazy(() => import('../pages/console/Simulator.js'));
const Settings = lazy(() => import('../pages/console/Settings.js'));
const Plan = lazy(() => import('../pages/console/Plan/index.js'));

const Fill = lazy(() => import('../pages/respond/Fill.js'));
const Done = lazy(() => import('../pages/respond/Done.js'));

// `19`, `70`. THE FOURTH WORLD — never imported by anything in `/app`, `/` or `/r`, so
// nothing here reaches the console or respondent bundles (`pages/respond/bundle.test.ts` is
// the existing guard for the respondent half; `T-066` adds no equivalent for this one
// because nothing outside this file imports these paths at all — 20 §2's whole argument).
const OpsLogin = lazy(() => import('../pages/platform/Login.js'));
const OpsConsole = lazy(() => import('../pages/platform/Console/index.js'));
const OpsOrgDetail = lazy(() => import('../pages/platform/Console/OrgDetail.js'));
const OpsAnalytics = lazy(() => import('../pages/platform/Analytics/index.js'));
const OpsEarnings = lazy(() => import('../pages/platform/Earnings/index.js'));
const OpsLogs = lazy(() => import('../pages/platform/Logs/index.js'));

/** One Suspense per route, so a chunk still downloading in the console never blanks the
 *  respondent's form. */
const hold = (element: JSX.Element): JSX.Element => (
  <Suspense fallback={<SessionLoading />}>{element}</Suspense>
);

function NotFound(): JSX.Element {
  return (
    <div className="fullpage">
      <div>
        <h3>Page not found</h3>
        <p className="text-muted">That address does not match anything here.</p>
        <a className="btn btn-secondary" href="/">Back to the start</a>
      </div>
    </div>
  );
}

export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    errorElement: <PublicBoundary />,
    children: [
      // All three bounce a signed-in user to /app. The guard is OUTSIDE `hold`, so the
      // redirect happens before the page chunk is fetched at all — a sign-in form that
      // downloads and then vanishes is the flash 30 § Acceptance rules out.
      { path: '/', element: <RedirectIfSignedIn>{hold(<Landing />)}</RedirectIfSignedIn> },
      { path: '/login', element: <RedirectIfSignedIn>{hold(<Login />)}</RedirectIfSignedIn> },
      { path: '/start', element: <RedirectIfSignedIn>{hold(<Start />)}</RedirectIfSignedIn> },
      // No `<RedirectIfSignedIn>` — 57 § Interactions: the activation is filed under the
      // INVITE's organisation even when a different tenant's session is live on this
      // browser, so a signed-in stranger must still reach this page rather than bounce.
      { path: '/activate/:token', element: hold(<Activate />) },
      // An unmatched path is a PUBLIC 404. Answering it inside the console would leak
      // that a console exists, and would bounce a stranger to /login for a typo.
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/app',
    element: <ConsoleLayout />,
    errorElement: <ConsoleBoundary />,
    children: [
      { index: true, element: hold(<Home />) },
      // The two console routes with a capability gate on the route itself (31 § States,
      // 32 § States). Everywhere else out-of-scope data is simply absent; on these two the
      // page IS the action, so somebody without the capability has nothing to look at and
      // gets a full-page 403 rather than an empty screen that looks broken.
      { path: 'setup', element: hold(<RequireCapability capability="org.update"><Setup /></RequireCapability>) },
      { path: 'structure', element: hold(<RequireCapability capability="unit.read"><Structure /></RequireCapability>) },
      { path: 'roles', element: hold(<Roles />) },
      { path: 'people', element: hold(<People />) },
      { path: 'people/:id', element: hold(<PersonDetail />) },
      { path: 'subjects', element: hold(<Subjects />) },
      { path: 'subjects/:id', element: hold(<SubjectDetail />) },
      { path: 'templates', element: hold(<Templates />) },
      { path: 'templates/:id', element: hold(<TemplateDetail />) },
      { path: 'forms/:id/build', element: hold(<Builder />) },
      { path: 'forms/:id/preview', element: hold(<BuilderPreview />) },
      { path: 'campaigns', element: hold(<Campaigns />) },
      { path: 'campaigns/new', element: hold(<CampaignNew />) },
      { path: 'campaigns/:id', element: hold(<CampaignDetail />) },
      { path: 'campaigns/:id/results', element: hold(<Results />) },
      // No RequireCapability wrapper: the page renders its own 403 panel, because the
      // capability it needs (`response.read`) is one somebody can hold for SOME campaigns
      // and not others, and a route-level gate cannot say that (58 § States).
      { path: 'inbox', element: hold(<Inbox />) },
      // No RequireCapability wrapper, and here there are TWO reasons rather than one.
      // The first is the inbox's: `analysis.read` is scoped, so a route-level gate cannot
      // say which campaigns. The second is `43`'s whole point — this page has a 402 as well
      // as a 403 (DEC-011), the guard knows nothing about entitlements, and wrapping it
      // would answer a Bronze customer's "upgrade to see this" with "you do not have
      // access". The page renders both states itself and keeps them apart.
      { path: 'analysis', element: hold(<Analysis />) },
      // Same two reasons as Analysis: a scoped capability, and a 402 a route guard cannot
      // express. T-084.
      { path: 'reflect', element: hold(<Reflect />) },
      { path: 'profile', element: hold(<Profile />) },
      { path: 'simulator', element: hold(<Simulator />) },
      { path: 'settings', element: hold(<RequireCapability capability="org.read"><Settings /></RequireCapability>) },
      // WRAPPED, like Settings and the log. `49` § Route & access asks for a full-page 403
      // on direct navigation, and it can: `billing.read` is seeded `all` (11 §8), so there
      // is no scoped hold that would make a narrow reader see a half-page. There is no 402
      // to express either — `billing.*` is in Bronze, and a paywall in front of the upgrade
      // button is the bug `D-028` recorded.
      { path: 'plan', element: hold(<RequireCapability capability="billing.read"><Plan /></RequireCapability>) },
      // T-076. WRAPPED, unlike Analysis and Reflect, and for the opposite reason: there is
      // no 402 here — the log is not a tier feature — and `56` § States asks for a
      // full-page 403 on direct navigation. The page renders its own 403 as well, because
      // a caller can hold `audit.read` and still be refused by the API.
      { path: 'logs', element: hold(<RequireCapability capability="audit.read"><Logs /></RequireCapability>) },
    ],
  },
  {
    path: '/r',
    element: <RespondLayout />,
    errorElement: <RespondBoundary />,
    children: [
      { path: ':token', element: hold(<Fill />) },
      { path: ':token/done', element: hold(<Done />) },
    ],
  },
  {
    path: '/ops',
    element: <OpsLayout />,
    errorElement: <OpsBoundary />,
    children: [
      // `/ops/login` is OUTSIDE `RequirePlatformAuth` (`OpsLayout` wraps the whole tree in
      // it) — so this route must not be nested under the guard a second time. It is not:
      // `OpsLayout` gates its `<Outlet>`, and `Login` itself redirects an already-
      // authenticated operator onward, which is the same shape `RedirectIfSignedIn` gives
      // `/login` — done inside the page here because the guard lives on the wrong side of
      // the layout for this one route to opt out of it.
      { path: 'login', element: hold(<OpsLogin />) },
      { index: true, element: hold(<OpsConsole />) },
      { path: 'orgs/:id', element: hold(<OpsOrgDetail />) },
      // `T-067`. `staff` reaching this by URL still gets served the chunk — the route
      // itself has no capability gate (`70` § States precedent: `Analysis`/`Reflect` do the
      // same for a scoped capability) — but the page's own request 403s and it renders that,
      // naming `platform.analytics.read`, rather than an empty screen.
      { path: 'analytics', element: hold(<OpsAnalytics />) },
      // `T-058`, DEC-080. Same posture as `analytics`: no capability gate on the route, the
      // page's own request 403s and it renders that, naming `platform.revenue.read`.
      { path: 'earnings', element: hold(<OpsEarnings />) },
      // `T-078`. No capability gate on the route itself — same precedent as `analytics`
      // above — the page's own request 403s and it renders that.
      { path: 'logs', element: hold(<OpsLogs />) },
      // A direct visit to anything else falls through to this catch-all rather than the
      // PUBLIC 404 — `/ops/anything-wrong` must resolve inside the ops tree, never leak
      // that a console exists by 404-ing through the marketing site's not-found page.
      { path: '*', element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
