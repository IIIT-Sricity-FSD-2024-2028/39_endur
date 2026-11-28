# Changelog

All notable changes to Endur are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html): MAJOR for a rewrite or a
breaking change, MINOR for new features, PATCH for fixes. How a release is made is in
[RELEASING.md](RELEASING.md).

## [Unreleased]

## [3.2.0] - 2026-11-28

A redesigned operator console for the people who run the platform, and every percentage in
Endur now shows the two numbers it comes from.

### Added

- **Operator console redesign (#70).** A new frame with a side rail (a drawer below 900px),
  and three new pages:
  - **Team** (`/ops/team`, owners only): add operators, change their role or disable
    them. A new operator's authenticator code is shown once. Nobody can change their own
    account, and the platform always keeps two owners.
  - **Support** (`/ops/support`): who entered which organisation's console, why, and when
    they left, with "Open now" and "Over" views.
  - **Audit** (`/ops/audit`): the platform's own audit trail, every operator action
    newest first, filterable by action.
- Analytics and Earnings share one date window: pick a range on one and the other opens at
  it (#70).
- 7 more Playwright end-to-end tests for the operator console: the estate, an
  organisation's plan override, analytics and earnings, team, support visits, logs and
  sign-out, and what staff (not owners) can see (#70).

### Changed

- Redesigned the estate, organisation, Analytics, Earnings and Logs pages of the operator
  console (#70).
- Every share in the operator console reads with what it is a share of, for example
  "37 of 50 · 74%" (#70).
- The API now sends counts instead of ready-made percentages. Response rates (Home, Results,
  Analysis), Analysis confidence and the average payment on Earnings are worked out in the
  browser from the counts on screen (#70).

### Fixed

- Asking the support register for visits that are over (`active=false`) returned the ones
  still open (#70).

## [3.1.0] - 2026-11-27

All client state moves to Redux Toolkit, and members get a Home that shows the forms they
still have to answer.

**Deploy with `--migrate`.** This release removes a database column, so earlier versions do
not run against a database it has migrated.

### Added

- **Redux Toolkit for all client state (#68).**
  - RTK Query handles every server read, with cache tags so a save refreshes what it
    changed. Anything that changes what the signed-in user may do (a grant, a role, a
    position) updates the sidebar and pages without a reload.
  - Each screen keeps its state in `store/screens/`, alongside slices for sign-in,
    vocabulary, pop-up messages, the form builder, the setup wizard and the powers grid.
  - Middleware handles builder autosave and undo history, clears cached data on sign-out
    or switching organisation, and ends the session on any `401`.
  - Redux DevTools in development, with passwords blanked out of every action.
- **Forms waiting on Home (#68).** A members-only form launched for a role or unit appears
  on each member's Home, with a count beside Home in the sidebar, until they answer it.
  Answered forms move to "Past feedback". Endur records only that someone answered, never
  when or what.
- **End-to-end tests (#68).** 15 Playwright browser tests: sign-up on a trial, invites,
  permissions, the form builder, polls, booking, changing plan, announcements, and
  answering a form.
- **Continuous integration (#68).** Every pull request runs typecheck, lint, the project's
  audits, frontend and backend tests, the build, and the end-to-end tests.
- `LOGIN_RATE_LIMIT_MAX` setting: sign-in attempts allowed per IP address and email in 15
  minutes (default 10).

### Changed

- Templates and Start follow the user's powers. In the IIIT Sri City demo, Faculty have no
  Templates page and Start offers only the forms they can start; Students have no Start at
  all (#68).
- The powers grid keeps its header row and power column in view while it scrolls (#68).
- The API server records any crash in the log before it stops, keeps running if its
  terminal is closed, and gives requests in progress up to 5 seconds to finish when it
  shuts down (#68).

### Security

- Removed `campaign_participants.responded_at` (migration
  `20261106150000_participants_forget_when`). It stored the moment a member answered,
  which could be matched against response times to link a member to their answer (#68).

## [3.0.1] - 2026-11-04

### Fixed

- The payment success screen is shown before the app navigates into the console, instead
  of being skipped (#64).
- `RedirectIfSignedIn` no longer cuts off the payment success screen for a user who has
  just signed up (#64).
- A client IP address that cannot be parsed no longer crashes writes that record an audit
  entry (#64).

## [3.0.0] - 2026-11-01

A rebuild of Endur on a new architecture, and its first public deployment, at
**https://endur.azurewebsites.net**.

### Added

- **New architecture (#57).** TypeScript end to end in an npm-workspaces monorepo:
  Express 5 backend with an explicit, ordered middleware chain; React 18 + Vite frontend
  with three route trees and a design system; Zod DTOs in `packages/shared` used by both
  sides; PostgreSQL 16 through Prisma, with hand-written migrations.
- **Organisation as data (#57).** Units, roles, people and grants are configurable rows, so
  the same app runs a college, hotel, hospital or company, and the interface vocabulary
  follows the organisation.
- **Console (#57).** Home dashboard, campaigns and templates, people, roles and powers,
  inbox, announcements, results with gap analysis, and the setup wizard with live preview.
- **Polls and slot booking (#57).**
- **Payments and billing (#57).** Plans, a simulated checkout, and an earnings dashboard
  for the platform owner.
- **Trial subscriptions (#58).** Start a trial, convert to paid mid-trial, trial expiry,
  and "trials started" in platform analytics.
- **Platform console (#57).** Expanded superuser and owner tools, and OpenAPI (Swagger)
  docs for the API in development.
- **Demo data (#57).** Five seeded demo organisations, including IIIT Sri City.
- **Deployment (#62, #63).** Azure App Service + Azure Database for PostgreSQL, and
  `scripts/deploy-azure.sh` to build and deploy in one command.

### Changed

- Setup wizard moved to a vertical layout, with the live preview on the review step (#57).
- Updated illustrations, design tokens and platform pages (#57).
- Setup wizard code split into smaller named helpers (#59).

### Fixed

- The production build and server now run end to end (#59).
- npm install works on Linux hosts, and Prisma works without a `.env` file (#62).
- Past time slots can no longer be booked, and a race when saving slots is fixed (#60).
- The 30-second step for two-factor (TOTP) codes is restored (#58).
- Billing bugs and inconsistencies, and filter fixes (#61).
- QR code, back button, invite button, superuser revenue and superuser permission bugs (#57).

## [2.0] and [1.0] - 2026-05-05

Earlier versions, tagged `V2.0` and `V1.0` before this changelog existed. Both tags point to
the same commit (#56).

[Unreleased]: https://github.com/IIIT-Sricity-FSD-2024-2028/39_endur/compare/v3.2.0...HEAD
[3.2.0]: https://github.com/IIIT-Sricity-FSD-2024-2028/39_endur/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/IIIT-Sricity-FSD-2024-2028/39_endur/compare/v3.0.1...v3.1.0
[3.0.1]: https://github.com/IIIT-Sricity-FSD-2024-2028/39_endur/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/IIIT-Sricity-FSD-2024-2028/39_endur/compare/V2.0...v3.0.0
[2.0]: https://github.com/IIIT-Sricity-FSD-2024-2028/39_endur/releases/tag/V2.0
[1.0]: https://github.com/IIIT-Sricity-FSD-2024-2028/39_endur/releases/tag/V1.0
