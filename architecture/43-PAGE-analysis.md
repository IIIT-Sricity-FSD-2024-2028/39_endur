# 43 — Analysis dashboard

Phase: **P3** · Milestone: — · Design ref: `design_specs/design/08` §8.2
Open: `_MEMORY.md` **OPEN-003 — the analysis engine is not chosen**

**Do not build this before P3.** It is `[ROADMAP]` throughout `design_specs` and appears in
the sidebar as a disabled item with a "Soon" tag and no page behind it (`20` §2). It is
specified now so the system stays coherent and so the answer to "what's next?" is a screenshot
rather than a sentence.

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

## The undecided part — OPEN-003

Themes and sentiment need an engine, and the choice is open:

| Option | For | Against |
|---|---|---|
| **Rule-based** — keyword clustering, lexicon sentiment | No API cost, no key, deterministic, works offline | Weak on short informal comments; needs per-domain tuning |
| **LLM-assisted** — batch comments through a model | Genuinely good themes; handles phrasing variation | Cost, an API key in the stack, latency, non-determinism, a privacy question about sending feedback text to a third party |

The privacy question is the deciding one and is not merely procedural: `52` promises
respondents anonymity, and shipping their free-text comments to an external service is a
disclosure that must be surfaced to the customer, not buried.

**Recommendation:** rule-based first, so the surface exists and is honest about its limits;
LLM as an opt-in per-org setting with an explicit disclosure. **Decide by 1 Nov 2026.**

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
- [ ] If an LLM is used, the org setting is opt-in and the disclosure is visible to the customer

## Out of scope

| Not building | Why |
|---|---|
| Predictive analytics | Unfalsifiable at this data volume |
| Cross-org benchmarking | A real product idea and a real privacy question. Not now |
| Custom dashboards | One good dashboard beats a builder nobody configures |
| The response inbox | Related surface, P3, `design_specs/design/08` §8.3 |
