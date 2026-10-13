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
const ConsoleStart = lazy(() => import('../pages/console/Start/index.js'));
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
const Announcements = lazy(() => import('../pages/console/Announcements/index.js'));
const Booking = lazy(() => import('../pages/console/Booking/index.js'));
const BookingDetail = lazy(() => import('../pages/console/Booking/Detail.js'));
const Analysis = lazy(() => import('../pages/console/Analysis/index.js'));
const Reflect = lazy(() => import('../pages/console/Reflect/index.js'));
const Logs = lazy(() => import('../pages/console/Logs/index.js'));
const Profile = lazy(() => import('../pages/console/Profile/index.js'));
const Simulator = lazy(() => import('../pages/console/Simulator.js'));
const Settings = lazy(() => import('../pages/console/Settings.js'));
const Plan = lazy(() => import('../pages/console/Plan/index.js'));

const Fill = lazy(() => import('../pages/respond/Fill.js'));
const Book = lazy(() => import('../pages/respond/Book.js'));
const Done = lazy(() => import('../pages/respond/Done.js'));

const OpsLogin = lazy(() => import('../pages/platform/Login.js'));
const OpsConsole = lazy(() => import('../pages/platform/Console/index.js'));
const OpsOrgDetail = lazy(() => import('../pages/platform/Console/OrgDetail.js'));
const OpsAnalytics = lazy(() => import('../pages/platform/Analytics/index.js'));
const OpsEarnings = lazy(() => import('../pages/platform/Earnings/index.js'));
const OpsLogs = lazy(() => import('../pages/platform/Logs/index.js'));

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
      { path: '/', element: <RedirectIfSignedIn>{hold(<Landing />)}</RedirectIfSignedIn> },
      { path: '/login', element: <RedirectIfSignedIn>{hold(<Login />)}</RedirectIfSignedIn> },
      { path: '/start', element: <RedirectIfSignedIn>{hold(<Start />)}</RedirectIfSignedIn> },
      { path: '/activate/:token', element: hold(<Activate />) },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/app',
    element: <ConsoleLayout />,
    errorElement: <ConsoleBoundary />,
    children: [
      { index: true, element: hold(<Home />) },
      { path: 'start', element: hold(<ConsoleStart />) },
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
      { path: 'inbox', element: hold(<Inbox />) },
      { path: 'announcements', element: hold(<Announcements />) },
      { path: 'booking', element: hold(<Booking />) },
      { path: 'booking/:id', element: hold(<BookingDetail />) },
      { path: 'analysis', element: hold(<Analysis />) },
      { path: 'reflect', element: hold(<Reflect />) },
      { path: 'profile', element: hold(<Profile />) },
      { path: 'simulator', element: hold(<Simulator />) },
      { path: 'settings', element: hold(<RequireCapability capability="org.read"><Settings /></RequireCapability>) },
      { path: 'plan', element: hold(<RequireCapability capability="billing.read"><Plan /></RequireCapability>) },
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
    path: '/book',
    element: <RespondLayout />,
    errorElement: <RespondBoundary />,
    children: [{ path: ':token', element: hold(<Book />) }],
  },
  {
    path: '/ops',
    element: <OpsLayout />,
    errorElement: <OpsBoundary />,
    children: [
      { path: 'login', element: hold(<OpsLogin />) },
      { index: true, element: hold(<OpsConsole />) },
      { path: 'orgs/:id', element: hold(<OpsOrgDetail />) },
      { path: 'analytics', element: hold(<OpsAnalytics />) },
      { path: 'earnings', element: hold(<OpsEarnings />) },
      { path: 'logs', element: hold(<OpsLogs />) },
      { path: '*', element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
