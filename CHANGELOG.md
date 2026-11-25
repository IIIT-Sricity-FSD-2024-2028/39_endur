# Changelog

All notable changes to Endur are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html): MAJOR for a rewrite or a
breaking change, MINOR for new features, PATCH for fixes. How a release is made is in
[RELEASING.md](RELEASING.md).

## [Unreleased]

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

[Unreleased]: https://github.com/IIIT-Sricity-FSD-2024-2028/39_endur/compare/v3.0.1...HEAD
[3.0.1]: https://github.com/IIIT-Sricity-FSD-2024-2028/39_endur/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/IIIT-Sricity-FSD-2024-2028/39_endur/compare/V2.0...v3.0.0
[2.0]: https://github.com/IIIT-Sricity-FSD-2024-2028/39_endur/releases/tag/V2.0
[1.0]: https://github.com/IIIT-Sricity-FSD-2024-2028/39_endur/releases/tag/V1.0
