# 46 — Organization home / dashboard

Phase: P2 · Milestone: **M0** · Design ref: `design_specs/design/04-PAGE-ADMIN-CONSOLE.md` §4.1

> **Found as a gap, not requested.** `/app` has been in the route map (`20` §2) and specified
> in `design_specs/design/04` §4.1 since the start, but no architecture doc owned it. It is
> also the teacher's "Home/Dashboard" item (`54`).

## Purpose

The first screen after sign-in, and the one people return to. It answers three questions in
one glance: *is anything collecting right now, is anyone responding, and is there anything I
need to do?* Everything on it is a link to somewhere else — it is a hub, not a destination,
and it must not become a second analysis dashboard (`43` is that, and it is P3).

For the demo it carries a specific load: it is the screen showing that the org **has data**,
immediately after the org switcher changes vocabulary.

## Route & access

`/app` — console world, session required. The post-login landing route, and the post-setup
landing route.

If the org has no roles yet, redirect to `/app/setup` instead — an unconfigured org's home is
empty and confusing (`30` § Interactions).

## Capabilities

| Section | Capability |
|---|---|
| Page | `org.read` |
| Active campaign cards | `campaign.read` |
| Response counts and rates | `results.read` |
| Recent comments strip | `response.read` |
| Setup prompts | whichever the prompt links to — a prompt for an action you cannot take is not shown |

Every section is **absent** without its capability, not greyed (INV-003). A faculty-level user
sees a much smaller home than a dean, and that is the correct behaviour rather than a
degraded one.

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| Load | `GET /api/v1/home` | → `HomeView` |

```ts
export type HomeView = {
  stats: { responsesTotal: number; responsesToday: number;
           activeCampaigns: number; responseRate: number | null };
  activeCampaigns: { id: string; name: string; subjectCount: number;
                     responseCount: number; endsAt: string | null }[];
  recentComments?: { text: string; subjectName: string; submittedAt: string }[];
  prompts: { kind: 'no_subjects' | 'no_campaigns' | 'setup_incomplete' | 'seats_over';
             href: string }[];
};
```

**One endpoint, one round trip.** A dashboard that fires six requests is six chances to be
slow on venue wifi, and it is the first screen an evaluator sees after login.

Everything in it is scope-filtered server-side and k-anon gated exactly as `40` specifies —
the home page must not become a way to read suppressed results.

## State

Local, `useHome()`. No polling — this is a hub, and live counters belong on `40`. A `Refresh`
affordance is unnecessary here; navigating back to it refetches.

## Components

`<PageHeader>` with vocabulary chips · `<StatCard>` × 4 · `<BarRow>` in the breakdown ·
`<EmptyState>` · `<TrendChip>` on the "today" delta. No new components.

## Interactions

**Four stat cards:** total responses, responses today, active campaigns, response rate.

**Active campaign cards** link straight to `/app/campaigns/:id/results`, and each carries a
`Share` action opening `<ShareSheet>` — because during a demo the most common thing you want
from this screen is the QR code, and making that two clicks instead of four matters.

**Prompts** are the setup-completion nudges. At most **two** at a time, in priority order:
no subjects → no campaigns → setup incomplete → over seats. A dashboard that nags with six
banners is a dashboard people stop reading.

The post-setup one-time banner from `31` lands here: *"Northfield University is set up. Add a
{subject} to start collecting."*

**Org switching** re-renders this page. The vocabulary chips must change first (`22` §4) —
this is the ten-second proof and this is the screen it happens on.

## States

| State | Behaviour |
|---|---|
| Empty (new org) | Not four zeroed stat cards. A single `<EmptyState>` with the next action: *"Add a {subject} to start collecting."* Zeroes look broken; an empty state looks intentional |
| Empty (no permission for any section) | *"Nothing assigned to you yet."* with no actions — a legitimate state for a low-level role, and it must not look like an error |
| Loading | Card skeletons at the real layout |
| Error | Inline retry; the rest of the shell stays usable |
| 403 | Not reachable — `org.read` is seeded to every role |
| Unconfigured org | Redirect to `/app/setup` |

## Acceptance

- [ ] One request populates the whole page
- [ ] Sections the caller cannot read are absent, not greyed
- [ ] A brand-new org shows an empty state with a next action, never four zeroes
- [ ] A minimal-permission user sees a coherent page, not an error
- [ ] Campaign cards link to results and expose `Share` directly
- [ ] At most two prompts render at once
- [ ] Switching org re-renders the vocabulary chips before anything else
- [ ] k-anon suppression applies to every number shown here (`40`)
- [ ] Every noun from `useLabels()` (INV-001)
- [ ] Works at 390px

## Out of scope

| Not building | Why |
|---|---|
| Charts, trends, sentiment | That is `43`, and it is P3. Home is a hub |
| Configurable widgets | One good default beats a builder nobody configures |
| Live polling | Belongs on results (`40`), where a response landing is the point |
| Cross-campaign comparison | P3 |
| Activity feed | Needs the audit surface; P2 later at the earliest |
