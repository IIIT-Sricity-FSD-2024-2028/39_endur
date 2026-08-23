# 43 — Analysis dashboard

Phase: **P3, re-tagged buildable 2026-08-23 — CONF-019** · Milestone: —
Design ref: `design_specs/design/08` §8.2
Decisions: `_MEMORY.md` **DEC-042 — the engine is rule-based**, resolving `OPEN-003`

> **Status changed 2026-08-23.** This document said *"do not build this before P3"* and the
> owner asked for every disabled sidebar item to be completed (`CONF-019`). Two things had to
> be true before that was actionable, and both now are: the engine is chosen (**rule-based**,
> DEC-042 — see § The engine, below) and the entitlement rows exist (`D-012`, which is
> `T-057`'s and is a genuine prerequisite rather than a formality — until an org has a
> subscription row, *every* org is silently Bronze and this page 402s for everyone, forever).
>
> The P3 tag stays on the **deepening**: themes over time, drill-through quality, and anything
> that needs an engine better than a lexicon. What is now buildable is the surface with an
> honest engine behind it, which is what `OPEN-003`'s recommendation always said to do first.

## Purpose

The Analyze layer. Results say *what happened*; analysis says *what it means* — recurring
themes in written comments, how sentiment is shifting, which issues matter most, and how
reliable a result is given how many people responded.

This is the Silver tier's entire value proposition (`01` §6).

## Route & access

`/app/analysis` — console world. Disabled with a "Soon" tag until P3.

## Capabilities

| Action | Capability | Entitlement |
|---|---|---|
| View | `analysis.read` | **Silver or above** — `402` below it |

The clean 402-vs-403 split (DEC-011) is worth demonstrating on exactly this surface: a Bronze
customer with full permissions gets a 402 and an upgrade path, not a confusing 403.

## Data contract — provisional

| Action | Endpoint | DTO |
|---|---|---|
| Overview | `GET /api/v1/analysis?from&to&unitId&subjectId` | → `AnalysisView` |
| Theme detail | `GET /api/v1/analysis/themes/:id` | → `ThemeDetail` with source comments |

```ts
export type AnalysisView = {
  sentiment: { positive: number; neutral: number; negative: number };
  trend:     { date: string; positive: number; neutral: number; negative: number }[];
  themes:    { id: string; label: string; mentions: number; score: number;
               valence: Valence; delta: number }[];
  drivers:   { label: string; impact: number; valence: Valence }[];
  reliability: { responseCount: number; audienceEstimate: number;
                 confidence: 'low' | 'medium' | 'high' };
};
```

Every charted value carries an explicit `valence` (CONF-004). The client never infers good or
bad from a number's sign.

**`reliability` is not decoration.** A 4.6 average from 8 responses and from 800 responses are
different facts, and presenting them identically is the most common way a feedback dashboard
lies. Showing confidence alongside every number is a genuine differentiator and costs almost
nothing.

## The engine — DEC-042, resolving OPEN-003

Themes and sentiment need an engine. The choice was open until 2026-08-23:

| Option | For | Against |
|---|---|---|
| **Rule-based** — keyword clustering, lexicon sentiment | No API cost, no key, deterministic, works offline | Weak on short informal comments; needs per-domain tuning |
| **LLM-assisted** — batch comments through a model | Genuinely good themes; handles phrasing variation | Cost, an API key in the stack, latency, non-determinism, a privacy question about sending feedback text to a third party |

**Decided: rule-based, and no LLM in P1–P3.** The privacy question was the deciding one and it
is not merely procedural — `52` promises respondents anonymity, and shipping their free-text
comments to an external service is a disclosure that must be surfaced to the customer rather
than buried. There is no consent mechanism in the product to surface it with, and building one
to enable a feature nobody has asked for in those terms is the wrong order.

Three secondary reasons, each of which would be sufficient on its own:

- **It adds a dependency and a key**, which is a decision the owner has reserved before
  (`DEC-036` is the same shape: the privacy property was obtained without the library).
- **Non-determinism breaks the acceptance list.** *"Themes drill through to their source
  comments"* is testable against a lexicon and is not testable against a model that answers
  differently on Tuesday.
- **It is honest about being weak.** A lexicon on 3,382 seeded responses produces mediocre
  themes, and the page says so — see § Reliability, which was already the differentiator here.

**What rule-based means concretely:** stop-word removal, stemming, n-gram frequency over the
free-text answers of a campaign, clustered by co-occurrence into at most twelve themes; a
sentiment lexicon scored per comment and aggregated per theme; `drivers` computed as the
correlation between a theme's presence and the response's own rating — which is arithmetic
over `numeric_value` (`10` §4.4), not inference.

**LLM stays available as a later opt-in**, per-org, with a visible disclosure and a per-org
setting — unchanged from the original recommendation. `REVISIT:2026-11-01`. Nothing here
forecloses it: the engine sits behind one interface with one function, the same seam
`stripMetadata()` occupies in `48`.

## State

P3, and shaped by the `23` decision (OPEN-001). Under Option A this is RTK Query with a long
cache — analysis is expensive to compute and does not change minute to minute.

## Components

Existing: `<StatCard>` `<BarRow>` `<StackedBar>` `<TrendChip>` `<ScoreBadge>`.
New for P3: a line chart for sentiment over time, and a theme table. Recharts is acceptable
here and only here (`24` §10).

## Interactions

Sentiment donut, sentiment-over-time line chart, a themes table sorted by mentions with a
gradient score bar, a key-drivers list, and filters by date range, unit and subject — all
scope-filtered (INV-003).

Each theme drills into its source comments, which is what stops a theme from being an
unfalsifiable label. If a user cannot see *why* "pace of delivery" scored badly, the theme is
an assertion rather than a finding.

## Corrections required when porting the mockup

`design_specs/design/08` §"corrections required" lists these, and they are not optional:

- Swap the mockup's `:root` for the canonical token block (CONF-003)
- **Negative sentiment must use the status ramp, never the brand accent** (CONF-004) — blue is
  the product and cannot also mean "a student is unhappy"
- Replace emoji placeholders with real icons
- Every valence indicator carries a number or label alongside colour (`21` §8)

## States

| State | Behaviour |
|---|---|
| Empty | Not enough data: *"Analysis appears once a feedback cycle has closed."* |
| Below k-anon | Suppressed identically to `40` |
| Loading | Skeletons; analysis is slow and the wait must be legible |
| 402 | Upgrade card explaining what Silver adds — not an error page |
| 403 | Full-page 403 |

## Acceptance — P3

- [ ] `analysis.read` returns 402 below Silver and 403 without the capability, never confused
- [ ] Every charted value carries an explicit `valence`
- [ ] Negative sentiment never renders in the brand accent
- [ ] Reliability is shown alongside every headline number
- [ ] Themes drill through to their source comments
- [ ] k-anonymity suppression applies here as on `40`
- [ ] **No comment text leaves the process** — asserted by the absence of any outbound HTTP
      client in the analysis feature, not by reading the code (DEC-042)
- [ ] The same input produces the same themes twice — determinism, which is what makes the
      rest of this list testable at all
- [ ] `analysis.read` returns 402 for a Bronze org **that has a subscription row** — which
      requires `D-012` to be repaid first, and is the reason this page cannot ship before it
- [ ] If an LLM is ever used, the org setting is opt-in and the disclosure is visible to the
      customer

## Out of scope

| Not building | Why |
|---|---|
| Predictive analytics | Unfalsifiable at this data volume |
| Cross-org benchmarking | A real product idea and a real privacy question. Not now |
| Custom dashboards | One good dashboard beats a builder nobody configures |
| The response inbox | Related surface, P3, `design_specs/design/08` §8.3 |
