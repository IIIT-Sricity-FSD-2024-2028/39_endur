# 43 — Analysis dashboard

Phase: **P3, re-tagged buildable 2026-08-23 — CONF-019** · Milestone: —
Status: **BACKEND BUILT 2026-08-25 (`T-081`)** · page is `T-082`, next. Promoted
2026-08-24 by `CONF-021` — the owner asked a second time. `T-088` wrote the subscriptions
row, so the 402-vs-403 demonstration is real rather than universal
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

## Data contract — BUILT

| Action | Endpoint | DTO |
|---|---|---|
| Overview | `GET /api/v1/analysis?from&to&campaignId&unitId&subjectId` | → `AnalysisView` |
| Theme detail | `GET /api/v1/analysis/themes/:id` | → `ThemeDetail` with source comments |

Authoritative shape: `packages/shared/src/dto/analysis.ts`. It differs from the provisional
sketch this document carried in four places, and **each difference was forced by the data
rather than chosen** (`DEC-061`):

| Field | Sketch | Built | Because |
|---|---|---|---|
| `suppressed` `threshold` | absent | present, and the analysis fields are **optional** | § States already required suppression *"identically to `40`"*, and `40` suppresses by OMITTING the body, not by flagging it. The sketch had no way to express an absent analysis |
| `reliability.audienceEstimate` | `number` | `number \| null` | An `anyone` audience has no denominator, and neither does a filtered slice. `40` learned this at `T-040` (`N-044`) and the field is the same one |
| `themes[].delta` | `number` | `number \| null` | `delta` measures against the window immediately before this one, and both `from` and `to` are optional. `0` would be a claim that nothing changed, which we would not know |
| `drivers[].id` | absent | present | The list is sorted by `|impact|` and the themes table by mentions, so a driver row has to be able to say *which* theme it is about without matching on a label |

Every charted value carries an explicit `valence` (CONF-004). The client never infers good or
bad from a number's sign — and the reason the server may is that a lexicon **defines** which
words are good, the same way an NPS band defines promoters. It is a definition, not an
inference from arithmetic.

**`reliability` is not decoration.** A 4.6 average from 8 responses and from 800 responses are
different facts, and presenting them identically is the most common way a feedback dashboard
lies. Showing confidence alongside every number is a genuine differentiator and costs almost
nothing.

Confidence is read from the response count (`30` / `100`), then **downgraded one step** when a
response rate is known and under 20% — forty replies to a thousand invitations is forty people
who felt strongly enough to write, which is a different population from forty out of fifty. It
can only ever lower the reading: a high rate on nine responses is still nine people.

### Where the numbers come from

`features/analysis/` **holds no query.** It calls `readCorpus()` in the results service and
`analyse()` in the engine beside it, and nothing else — the same shape `58` gave the inbox
(`DEC-058`), for the same reason: a list of individual comments is what the k-anonymity gate
exists to withhold, and analysis is a list of individual comments with arithmetic on top.

`readCorpus` returns a **discriminated union** whose `comments` field exists only on the
unsuppressed branch, so the gate is not a check that could be forgotten — it is the type
(`DEC-062`). There are two gates, and the second one is what the filters make necessary:

1. **per campaign**, by `readableCampaigns()` — the same function and the same scope predicate
   the inbox uses, so *"the analysis matches `40`"* is true by construction;
2. **over the filtered slice**, exactly as `readResults` counts its own threshold. Without it,
   `?subjectId=…` is a per-subject breakdown of three people — the request `38` § "Not built"
   refused, arrived at through a query parameter rather than a route.

### The drill-through needs a second capability

`GET /analysis/themes/:id` carries **`response.read` as well as `analysis.read`**, because it
returns verbatim comments and `40` already decided what those cost: *"seeing that the average
is 4.3 and reading what one person wrote are different levels of access."* Gating it on
`analysis.read` alone would have made this page a way around the split `40` exists to draw —
quietly, because the seeded matrix hands both to the same three levels and nothing would have
gone wrong yet.

The overview needs no such line. Its corpus scope is already `response.read`'s, so a caller
holding `analysis.read` and no `response.read` anywhere gets an empty analysis rather than
somebody else's.

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

**Built 2026-08-25, and four things only the real corpora showed.** The engine passed twelve
hand-written fixtures and then produced this from The Grand Palace's 229 seeded comments:

- **Four themes, confidently.** `room` appears in 113 of 229 comments — 49% of the corpus — so
  a flat 50% containment bar merged nearly everything into it, because a term in ten documents
  overlaps a theme covering half the corpus about five times by coincidence. The bar now has to
  **beat chance**: `max(0.5, 2 × the host's share)`, capped at 1 so a ubiquitous theme can
  still have facets.
- **`Comfortable`, sitting in the themes table beside `Checkout`.** A theme is *what* people
  talked about; the lexicon is *how they felt*. A term every part of which is an opinion word
  is no longer a candidate — `comfortable` goes, `comfortable bed` stays.
- **`Twice` and `Dropped`.** Real words from real sentences, and not topics. The stop list is
  the file that needed the change, which is what it is for.
- **`called` stemmed to `cal` while `call` stemmed to `call`.** The double-consonant rule fired
  on `-ll`, `-ff` and `-ss`, which are ordinary English word endings. Narrowed to the doublings
  that only ever arise from a suffix.

What is left after those is **vocabulary coverage**, and it is the weakness this section
already promised: Riverside's 115 comments read 101 neutral, because a hotel lexicon does not
know a hospital's words. § Reliability is the answer, and it is a better one than a confident
wrong theme.

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

## Acceptance

Backend, `T-081`, 2026-08-25 — 36 tests in `src/backend/test/analysis.test.ts`:

- [x] `analysis.read` returns 402 below Silver and 403 without the capability, never confused —
      **and 403 beats 402**, so nobody is invited to buy something they still could not open
- [x] Every charted value carries an explicit `valence`
- [x] Reliability is returned alongside every headline number
- [x] Themes drill through to their source comments, and every comment genuinely contains the
      theme — asserted, because a theme whose sources do not mention it is a label, not a finding
- [x] k-anonymity suppression applies here as on `40` — **twice**: per campaign, and over the
      filtered slice. Proved by disabling the second gate and watching the test go red
- [x] **No comment text leaves the process** — asserted by the absence of any outbound HTTP
      client across the whole feature folder, with comments stripped before the scan so the
      check cannot be satisfied by deleting its own explanation (DEC-042)
- [x] The same input produces the same themes twice — asserted under a **shuffled** corpus, and
      verified against all four seeded demo organisations under reversal
- [x] `analysis.read` returns 402 for a Bronze org **that has a subscription row** — `D-012`
      was repaid by `T-088`, and `setUpOrg(…, 'bronze')` writes one
- [x] The drill-through is gated on `response.read` as well, so it cannot become a way around
      `40`'s split between an average and what one person wrote

Page, `T-082`, outstanding:

- [ ] Negative sentiment never renders in the brand accent
- [ ] Reliability is **shown** alongside every headline number
- [ ] If an LLM is ever used, the org setting is opt-in and the disclosure is visible to the
      customer

## Out of scope

| Not building | Why |
|---|---|
| Predictive analytics | Unfalsifiable at this data volume |
| Cross-org benchmarking | A real product idea and a real privacy question. Not now |
| Custom dashboards | One good dashboard beats a builder nobody configures |
| The response inbox | Related surface, P3, `design_specs/design/08` §8.3 |
