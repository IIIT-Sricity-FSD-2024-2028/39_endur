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
| Load | `GET /api/v1/home?window=today\|7d\|30d\|all` | → `HomeView` |

```ts
export type HomeView = {
  stats: { window: StatWindow; responses: number; subjectsCovered: number;
           activeCampaigns: number; responseRate: number | null;
           responsesEver: number };
  activeCampaigns: { id: string; name: string; subjectCount: number;
                     responseCount: number; endsAt: string | null;
                     url: string | null; anonymous: boolean }[];
  recentComments?: { text: string; subjectName: string; submittedAt: string }[];
  prompts: { kind: 'no_subjects' | 'no_campaigns' | 'setup_incomplete' | 'seats_over';
             href: string }[];
};
```

**One endpoint, one round trip.** A dashboard that fires six requests is six chances to be
slow on venue wifi, and it is the first screen an evaluator sees after login.

**Every number is measured over `window`, and it defaults to 30 days** — `DEC-031`. This
section shipped an all-time total beside a "today" count, and an all-time total is the one
number on a hub nobody acts on: it only goes up. Changing the range refetches rather than
filtering client-side, because the k-anon gate and the rate's denominator are both decided
on the server — a client slicing all-time rows would be holding the rows the gate exists to
withhold. Three fields do **not** follow the range and each says so where it is read:
`activeCampaigns` is a fact about the present, `responsesEver` is never rendered and exists
only to separate "new here" from "quiet month", and the k-anon gate keys off the all-time
campaign total so a campaign cannot enter and leave the rate as the range moves.

`url` and `anonymous` were added at T-041 and they are what makes that sentence survive
§ Interactions. A campaign card's `Share` opens `<ShareSheet>`, which cannot render a QR
without the URL — so the alternative was a second request fired on the click, on venue wifi,
at the exact moment somebody is holding a phone up. Both fields come from columns the query
already reads. Every campaign here is open by definition, so the sheet is handed `open`
rather than a status the payload would have to carry as well.

**`responseRate` comes from the audience RULE and is `null` when no campaign has one** —
the same rule `40` states, and T-041 found the same bug here. `readStats` summed
`_count.subjects` for a denominator, so the first screen after sign-in rendered a RESPONSE
RATE of **3161% for Northfield, 2610% for Meridian, 2654% for Grand Palace and 4675% for
Riverside**. `N-043` fixed `readResults` and did not know this second reader existed. Both
now go through `features/campaigns/audience.ts`. A campaign with no denominator is excluded
from **both** sides of the fraction rather than counted into the numerator, because
responses from an open link measured against an invited campaign's audience is a third wrong
number rather than a compromise.

Everything in it is scope-filtered server-side and k-anon gated exactly as `40` specifies —
the home page must not become a way to read suppressed results.

## State

Local, `useHome()`. No polling — this is a hub, and live counters belong on `40`. A `Refresh`
affordance is unnecessary here; navigating back to it refetches.

## Components

`<PageHeader>` with vocabulary chips · `<StatCard>` × 4 · the shared `.segmented` control
as the range picker · `<EmptyState>` · `<ShareSheet>` on a campaign card. No new components.

The range picker sits **inside** the stat band, above the four cards and beside an
"Activity" heading, rather than up in the page header — `DEC-031`. It governs those four
numbers and nothing else on the screen, and a control in the header would read as filtering
the campaign list too. It is hidden for an organisation that has never collected anything,
because a range over nothing is a control with no question to answer.

**`<TrendChip>` is not built** — `CONF-017`. This section put one on the "today" delta;
§ Out of scope below rules trends out of this page entirely (*"that is `43`, and it is
P3"*), § Purpose says home *"must not become a second analysis dashboard"*, and the payload
carries no yesterday to compare today against — three sources agreeing against one list
entry. `<StatCard>`'s own contract says the same thing in miniature: a delta *"only ever
appears where a direction is real"*. Each count renders as a count. The chip's other
caller is `43`, which is P3, so nothing is blocked by not having it.

`DEC-031` did not reopen this. A window makes a previous period genuinely *measurable*,
which retires the third reason above and neither of the first two: § Out of scope still
rules trends off this page by name, and § Purpose still forbids it becoming an analysis
surface. The range changes what a number is measured over; it never adds a direction.

The campaign card, the recent-response strip and the prompt copy are page-local
(`Home/CampaignCard.tsx`, `Home/Recent.tsx`, `Home/cards.ts`) — the same treatment as `40`'s
per-question card and `32`'s detail panel.

## Interactions

**Four stat cards, over the selected range:** responses, response rate, subjects covered,
and active campaigns. The last is the exception and labels itself *"collecting right now"* —
`DEC-031`. "Subjects covered" is distinct subjects with at least one response in the range,
and it is there because an undivided response count cannot tell 200 responses about two
subjects from 200 about forty.

Every card repeats the range in words — *"in the last 30 days"*, not a bare *"30 days"* —
because a screen reader lands on the figure and not on the control above it, and a
screenshot of the row travels without the control at all.

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

- [x] One request populates the whole page — asserted on the hook, and the QR is inside it
      rather than one click away from a second request
- [x] Sections the caller cannot read are absent, not greyed — the server omits the KEY, and
      the page reads `undefined` vs `[]` to tell "not yours" from "nothing yet". Those are
      two different sentences and only the payload knows which one is true
- [x] A brand-new org shows an empty state with a next action, never four zeroes — the test
      asserts the RESPONSE RATE card is not on the page at all
- [x] A minimal-permission user sees a coherent page, not an error — and no action, because
      offering a next step to somebody who cannot take it is worse than saying nothing
- [x] Campaign cards link to results and expose `Share` directly
- [x] At most two prompts render at once — capped by the server, and the page renders the
      list it is handed rather than second-guessing it in either direction
- [x] The vocabulary chips render from the store, before anything else on the page — the
      chips read it directly and the page reads `useLabels()`. There is no org switch to
      re-render for: `OPEN-006`(a) removed the switcher, and signing in is a fresh boot
- [x] k-anon suppression applies to every number shown here (`40`) — on the server, for the
      stats and the comments both (T-024, asserted again at T-041)
- [x] Every noun from `useLabels()` (INV-001) — the page test mounts with the nonsense
      fixture and asserts the English words are absent from the whole render
- [ ] Works at 390px — device check with `T-045`
- [x] **The response rate has a denominator that exists**, or says it does not. Added at
      T-041 after finding this screen would have shown 2610-4675%
- [x] No progress bar on a campaign card. `design_specs/design/04` §4.1 draws `612 / 800`;
      the 800 is the same invented denominator, and the count stands alone instead

## Out of scope

| Not building | Why |
|---|---|
| Charts, trends, sentiment | That is `43`, and it is P3. Home is a hub |
| Configurable widgets | One good default beats a builder nobody configures |
| Live polling | Belongs on results (`40`), where a response landing is the point |
| Cross-campaign comparison | P3 |
| Activity feed | Needs the audit surface; P2 later at the earliest |
