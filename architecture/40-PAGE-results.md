# 40 — Results

Phase: P2 · Milestone: **M0** (cut-list item 5 — drop to the plain table if behind) · Design ref: `design_specs/design/08-PAGE-RESULTS-AND-ANALYSIS.md` §8.1

## Purpose

What people said. **Results states what happened; it does not judge it** — interpretation is
the Analyze layer (`43`, P3). Holding that line is what keeps the two surfaces from collapsing
into one confused screen.

This is the second half of the demo's decisive beat: the evaluator scans, submits, and their
response appears here.

## Route & access

`/app/campaigns/:id/results` — console world.

## Capabilities

| Action | Capability |
|---|---|
| View aggregates | `results.read` |
| View individual responses and comments | `response.read` |
| Export CSV | `results.export` |

Two capabilities on purpose: seeing that the average is 4.3 and reading what an individual
wrote are different levels of access. A head of department may reasonably have the first
without the second.

**Filters are scope-filtered** — a head of department's subject and unit dropdowns contain only
their own unit (INV-003).

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| Aggregates | `GET /api/v1/campaigns/:id/results?subjectId&unitId` | → `ResultsView` |
| Comments | `GET /api/v1/campaigns/:id/responses?cursor&questionId` | → paginated `ResponseItem[]` |
| Export | `GET /api/v1/campaigns/:id/export` | CSV |

```ts
export type ResultsView = {
  responseCount: number;
  audienceEstimate: number | null;
  responseRate: number | null;
  newSince?: string;                       // ISO — drives the "landed" animation
  suppressed: boolean;                     // k-anonymity gate, see below
  questions: QuestionSummary[];
};

export type QuestionSummary = {
  questionId: string; kind: QuestionKind; text: string; answered: number;
  average?: number;
  distribution?: { label: string; count: number; percent: number; valence?: Valence }[];
  npsMix?: { promoters: number; passives: number; detractors: number; score: number };
};
```

**`valence` is explicit in the DTO** (CONF-004) — the client must never infer good/bad from a
number's sign. It is populated only where valence is a *definition* (NPS promoter/detractor),
never where it would be an inference.

Aggregation uses `answers.numeric_value` (`10` §4.4), not `(value->>'n')::numeric` per row.

**`audienceEstimate` comes from the audience RULE, and is `null` for an open link.** T-040
found it reading `campaign.subjects.length`, which made `responseRate` responses-per-subject:
every seeded demo campaign rendered a **RESPONSE RATE between 1750% and 4675%**, on the screen
an evaluator opens straight after scanning. A link has no roll and therefore no denominator —
both fields have been typed `| null` since revision one, which is this document anticipating
exactly that. `features/campaigns/audience.ts` holds the count; the create screen's preview
keeps its own documented substitution, because a `0` beside an open audience reads as a broken
rule rather than an unbounded one.

### k-anonymity gate

If `responseCount < K_ANON_THRESHOLD` (default 5), the endpoint returns `suppressed: true`
with **no per-question data at all** — not zeroed, not rounded. Absent
(`52-SECURITY-AND-PRIVACY.md`).

With three responses in a department, an average plus a comment identifies the author.
Suppression is the promise of anonymity being kept when it is inconvenient, which is the only
time a privacy promise means anything.

## State

Local, `useResults(campaignId, filters)`. Filters in the URL query string so a filtered view
is linkable.

Polls every 10 seconds. **A manual `Refresh` button sits next to the count anyway** —
auto-refresh is the thing most likely to be flaky on venue wifi, and the demo cannot depend on
it.

The client tracks the last-seen `submittedAt` to identify newly arrived responses (`21` §7).

## Components

`<PageHeader>` · `<StatCard>` × 4 · `<BarRow>` · `<StackedBar>` (NPS only) · `<EmptyState>`.

**`<ScoreBadge>` is not built** — `CONF-016`. This section listed it; § Purpose and
§ Interactions below forbid exactly what it does, and `design_specs/design/08` §8.1 sides with
the prohibition by drawing the average as display type with no badge. A threshold colour on an
average is the interpretation this page refuses. The number renders as a number.

`<BarRow>` gained `showPercent` here, catalogued in `24` first, for the count-and-percent
columns §8.1 draws. `<StackedBar>` was built here and **NPS is its only caller**.

The per-question card, the comment list and the four stat lines are page-local
(`Results/QuestionResult.tsx`, `Results/Comments.tsx`, `Results/stats.ts`) — the same
treatment as `32`'s detail panel and `38`'s close consequence.

## Interactions

**Four stat cards:** responses, response rate, average rating across rating questions, comment
count.

**Per-question cards.** Header is `Q{n} · {text}` with the type and answer count; the average
sits beside the count where the type has one.

Distribution bars are **single-colour fill**. Do not colour rating 1 red and rating 5 green —
that is interpretation. The one exception is NPS, where promoter / passive / detractor is a
*definition* rather than an inference, and uses the three-colour stacked bar.

**Comments.** Newest first, three shown, `Show all N` expands in place. Each shows the subject
and a relative time. Requires `response.read`.

**Live arrival.** New responses raise the counters and flash the new comment card, fading over
600 ms. `aria-live="polite"` on the counter. **This is what the evaluator sees after scanning,
and it should visibly land.**

**Export** downloads a CSV — one row per response, one column per question. Twenty minutes of
work, and it is the answer to "can we get the data out?", which someone always asks. Headers
use the org's labels (`22` §6) — they said the literal word "Subject" until T-040, which is
precisely the leak `22` §6 warns about and the one nobody thinks to check, because
`audit:vocab` only scans the frontend.

It is **fetched through the API client rather than linked to** with an `<a href>`. Export is a
Silver feature (`16` §3), so a default-tier org gets a `402`; a plain link would answer that by
navigating the reader to a page of raw JSON instead of showing them the plan message.

## The cut-down version — build this first

If behind on 22 Aug, ship exactly this and stop: one table (question, type, answers, average)
plus a comment list. It is not impressive, but it is *complete*, and a complete plain table
beats a half-built dashboard in front of an evaluator every time.

## States

| State | Behaviour |
|---|---|
| Empty (no responses) | `<EmptyState>`: *"No responses yet"* + the Share action, so the fix is one click away |
| Suppressed | A card explaining the threshold: *"Results appear once 5 people have responded. 3 so far."* Not an error |
| Loading | Skeleton cards |
| Error | Inline above the cards; the last good data stays visible |
| 403 aggregates | Full-page 403 |
| 403 comments | Aggregates render; the comment section is **absent**, not greyed |
| Closed campaign | Renders normally with a `Closed` tag and the date range |

## Acceptance

- [x] Aggregates use `numeric_value`, not per-row JSON extraction — T-023, and the rating
      branch is one indexed `aggregate` plus one `groupBy`
- [x] Below the k-anon threshold, per-question data is absent from the response body — not
      merely hidden by the client. Asserted on the body (T-023) *and* on the page, which
      renders no card because it has nothing to render one from
- [~] A response submitted from a phone appears within one poll cycle, and the manual refresh
      also works — the poll, the ten-second interval, the no-stacking guard and the Refresh
      button are all tested; the phone is `T-045`
- [x] The thank-you page count and the results count agree — the same `COUNT`, read inside
      the transaction that writes the response (T-039, `13` §6)
- [x] A new response visibly lands — the counter rises, `aria-live` announces it, and the new
      comment flashes for 600 ms. **Only the ones that arrived while somebody was watching**:
      a baseline is captured on first load, or opening a campaign with 287 comments would
      flash all 287
- [x] Distribution bars are single-colour; only NPS uses valence colours — and there is no
      branch on the page that could paint one otherwise, which is what the test asserts
- [x] `valence` is present in the DTO wherever a chart uses it (CONF-004) — NPS only, and it
      is the only three-colour chart in the product
- [x] Filters are scope-filtered — by the API, which is what INV-003 means. The dropdowns
      render what `GET /campaigns/:id` and `GET /units` returned and filter nothing themselves
- [x] Comments are absent without `response.read`, and aggregates still render — and the
      request is not made at all rather than made and refused
- [x] CSV export headers use the org's labels — fixed at T-040; the test now pins the test
      org's own noun and asserts the English one is gone
- [x] The cut-down table exists and is shippable on its own — superseded by the full view,
      which landed inside the same budget. The cut-list in `02` §2 still names this page
- [x] `aria-live` announces the response count change — as its own node, because a live region
      wrapping the whole stat card would re-announce the kicker and the context every time
      one response lands
- [ ] Works at 390px — device check with `T-045`
- [x] **The response rate has a denominator that exists**, or says it does not. Added at T-040
      after finding the seeded demo would have shown 1750–4675%

## Out of scope

| Not building | Why |
|---|---|
| Themes, sentiment, key drivers | The Analyze layer, P3 (`43`) |
| Cross-campaign trends | P3. The per-subject trend on `35` is the miniature version |
| Colour-coded rating distributions | Interpretation, not reporting |
| Response inbox with triage | P3 (`design_specs/design/08` §8.3) |
| PDF report export | CSV answers the real question |
| Real-time push (SSE / websockets) | Polling is honest and cannot break on stage |
