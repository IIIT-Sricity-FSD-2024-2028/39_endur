# 71 — Page: platform analytics (Endur superuser)

Phase: **P2** · Milestone: — · Owns: `src/frontend/pages/platform/Analytics/**`
Related: `19-PLATFORM-OPERATORS.md` (INV-011), `16` (tiers, entitlements, seats), `70` (the ops console)
Decisions: `_MEMORY.md` DEC-035 · Design ref: none yet — see `70` § Design note
Status: **BUILT 2026-08-25 (`T-067`)**. This is the **superuser**
page the owner named; `70` is the admin one. Needed `T-059`, built on top of it.

> **Was `71-PAGE-platform-revenue.md` until 2026-08-23.** DEC-035 removes pricing from the
> product entirely, so a revenue page had nothing left to compute. What the owner actually
> wanted from it — *is this working, is it growing, who is stuck* — is answered better by
> adoption than by an invented currency figure, and that is what this page is now.

---

## Purpose

The screen the owner opens to answer *"is this working?"* — how many organisations are on the
platform, which tiers they chose, whether that mix is moving, and where the estate is going
quiet.

`70` is one organisation at a time, for support. This is **the whole estate at once, in
aggregate**, for the person who owns the thing.

## What happened to money, said plainly

**There are no prices in Endur — DEC-035.** A plan is joined with a button (`49`), no amount
is ever collected, stored or displayed, and there is no `plan_prices` table.

So this page reports in **organisations, seats and activity**. That is not a downgrade dressed
up: MRR would have been a constant multiplied by a count, which is a count with extra
confidence attached. Everything the four original decisions protected still applies, restated
against the units that actually exist:

| Original concern | Still true here |
|---|---|
| Historic figures must not move retroactively | Counts are computed from `subscriptions` history and audit rows, never from today's state re-projected backwards |
| A trial is not a customer | `trialing` organisations are counted **separately** from joined ones, everywhere, on every card |
| Enterprise is not comparable to the others | It is a tier in the mix; nothing multiplies it by anything |
| Movement is counted in organisations | Unchanged, and now it is the *only* unit — upgrades, downgrades and churn are counts and cannot be netted into a single misleading number |

## Route & access

| | |
|---|---|
| Route | `/ops/analytics` |
| World | The platform tree (`70` § Route & access) |
| Guard | `RequirePlatformAuth` **plus** `platform.analytics.read` on the route itself |
| Nav | The tab is **absent** for `staff`, not disabled. A disabled control tells you a thing exists |

**Still owner-only, and the reason changed.** It used to be *"support does not need money"*.
Money is gone, and the reason that remains is narrower but real: this is the estate-wide
picture of the business's own position — total customers, churn, where growth comes from — and
a support account exists to help one customer at a time. `70` gives support everything it
needs, one organisation at a time. This gives the owner the shape of all of them at once.

## Capabilities

| Action | Capability |
|---|---|
| Everything on this page | `platform.analytics.read` · **owner** |
| Drill into one organisation | `platform.org.read` — links to `70`'s detail, which stays count-only |

> **Renamed from `platform.revenue.read`** with the page. No code held the old string — the
> platform catalogue in `19` §4 is a spec, not yet a module — so this is a rename in docs only.
> If it ever reappears in code, it is a bug and this line is the evidence.

## Data contract

| Purpose | Endpoint | Returns |
|---|---|---|
| The figures | `GET /platform/analytics?from=&to=&granularity=month` | `PlatformAnalytics` |
| Estate counts | `GET /platform/stats` | `PlatformStats` — shared with `70` |

```ts
type PlatformAnalytics = {
  window: { from: string; to: string; granularity: 'month' | 'quarter' };

  orgs: {
    total: number;
    joined: number;          // a tier was chosen
    trialing: number;        // 16 §7, counted apart from joined — never folded in
    cancelled: number;
  };

  byTier: { tier: Tier; orgs: number }[];   // `seats` REMOVED — DEC-102

  movement: {                // per period, in ORGS. Never netted into one number
    period: string;
    new: number; upgraded: number; downgraded: number; churned: number;
  }[];                       // source moved to `payments` — DEC-102

  // `trials` REMOVED — DEC-102. Nothing has ever written `trialing` on the sign-up path
  // (DEC-048) and `converted` had no source at all, so both cards were unable to move.

  adoption: {                // the question a tier mix cannot answer
    orgsWithACampaign: number;
    orgsWithAResponse: number;
    orgsQuiet30d: number;    // no response in 30 days — the churn signal that precedes churn
  };

  totals: { campaigns: number; responses: number };  // COUNTS ONLY — INV-011. `seats` removed
};
```

**AMENDED 2026-08-31 — `DEC-102`, `DEC-103`. Three fields leave and one changes source.** The
owner created an organisation, watched *Trials started* stay where it was, and read the counter
as redundant. It is worse than redundant — **it cannot move**, and the same is true of two of
its neighbours. Each removal below is a figure that had no source, not a figure that was merely
quiet.

**Only `movement` reads the window.** Everything else on this page is a count as of now, and
`DEC-103` requires the page to say so rather than leaving an operator to conclude the date
controls are broken.

## The decisions inside these numbers

Each is a place the obvious implementation is wrong.

### 1 · A trial is never counted as a customer — ~~and then there were no trials~~

An org `trialing` on Gold (`16` §7) chose nothing. Folding it into "Gold organisations" inflates
the single most optimistic number on the page and hides the only question a trial raises: does
it convert. Trials get their own figures and their own conversion rate, next to — never inside —
the tier mix.

**The rule stands; the feature it guards does not exist. `DEC-102` removes both cards.**
`DEC-048` made registration write `status: 'active'`, so **nothing but a seeded
operator-created org is ever `trialing`** — the counter the owner watched could only have moved
if an operator had gone and made one. And `converted` is a hardcoded `0` in the service, under a
comment stating it has no source: nothing records a trialing→active *transition*, only a tier
override, which carries no prior status. So `conversionRate` is permanently the em-dash of
decision 3, and **two of the six headline cards were structurally incapable of changing**.

The service's comment argues for the honest zero and is right about honesty, wrong about the
remedy: **the honest thing to do with a metric that has no source is not to print it.** The DTO
fields go too — a field left in the shape is a field something starts computing again.

`orgs.trialing` **stays**, because it is a live count of rows with that status and it is what
excludes them from `joined` and from the tier mix. It is a filter, not a metric.

### 2 · Movement is four counts, never one — and they now come from `payments`

Four organisations upgrading and one Enterprise customer leaving is not "net +3". Upgrades,
downgrades, new and churned are reported separately and always together; there is no combined
figure on this page because there is no honest one. **Unchanged.**

**What changes is the source — `DEC-102`.** `upgraded`/`downgraded` were counted from
`platform_audit_log` rows with `action: 'plan.override'`, which is **the operator's action**. A
customer's own upgrade writes `billing.update` to the tenant `audit_log`, which this query has
never read. **So the movement table has only ever counted what operators did, while labelled as
what the estate did**, and the page never said so.

`payments` already carries `from_tier`, `tier` and `kind`, is written on **both** paths, and is
what `/ops/earnings` sums. One source for money and movement, or the two pages disagree about
the same event.

**`downgraded` means what the owner said it means**: the previous plan was higher than the one
now in force. With `DEC-096` a customer can no longer move down at all, so the surviving cases
are an operator override and the scheduled expiry of `DEC-098` — which is why that expiry
transition must write a `payments` row of `kind: 'expiry'`, `amount_minor: 0`. A zero-amount row
in a money ledger is the fair objection; the alternative is a second table describing the same
event, and `INV-009` loses that trade.

### 2b · Seats are not on this page — `DEC-102`

`16` §5 specifies `billable_seats` and `D-013` records that `subscriptions.seats` has never been
written by anything; pricing is **flat per organisation** (`DEC-080`). A seat column on the
revenue owner's page measures something no invoice reads. It leaves the tier-mix bar labels and
the totals line.

It stays on `70`'s estate row, where it is a *size* signal for support rather than a billing
one — and note that `<OrgRow>`'s `overSeats` chip is already inert, because `seatLimit` is
always `null` until `T-057` exists. Flagged, not acted on.

### 3 · ~~`conversionRate` is `null`, not `0`~~ — the principle survives its example

The distinction `46` established for response rate and it matters more here: zero conversions
out of zero completed trials is not a zero percent conversion rate, it is no measurement.
A dash says *not yet*; a `0%` says *failing*.

**`DEC-102` deletes the card and keeps the rule.** The rule is the one that decided the
removal: a measurement with no source does not get printed. Any future ratio on this page is
`null` when its denominator is zero — that has not changed and is why decision 3 is annotated
rather than deleted.

### 3b · Copy — two strings that read as bug reports

- **`{n} responses, counted — never read`.** `INV-011` is enforced by the DTO shape, by
  `platformClient` returning aggregates, and by `19` §5 — **not by a caption**. Written on the
  page it reads to the owner as an admission that something is broken. The three words go; the
  property is untouched and still asserted in § Acceptance.
- **"Quiet 30 days"** names a duration and counts organisations. It becomes **"Gone quiet"**,
  with the existing context line doing the work — *"of N organisations · no response in the last
  30 days"*. It deliberately keeps the word **Quiet**, because `70`'s estate row tags the same
  organisations with a `Quiet` chip from the same `isQuietOrg` predicate (decision 4, `N-064`),
  and a stat card that stopped using the word would break the link a reader follows between the
  two screens.

### 4 · Adoption is the number that predicts churn, and it is not a tier

`orgsQuiet30d` is the only leading indicator on the page. A tier mix tells you what people
chose once; quiet organisations tell you who is about to leave, which is the number worth
opening the page for. It links straight to `70`'s estate list, filtered — the *action* is
support contact, so the link goes to the console, never to anyone's content (INV-011).

## State

| What | Where |
|---|---|
| Window and granularity | URL params. A figure quoted in a message must be re-openable at the same window |
| The report | Fetched per window. Never cached across windows |

**AMENDED 2026-08-31 — `DEC-103`. What the window actually governs, and one off-by-one day.**
The owner reported the date filters not working at `?from=2026-08-02&to=2026-08-12`. Two faults,
and only one of them is cosmetic.

1. **The window governs almost nothing.** `orgs`, `byTier`, `adoption` and `totals` are
   unfiltered counts of the whole estate for all time; only `movement` and `trials` ever read
   `from`/`to`. Move the dates and five of the six sections do not change — **indistinguishable
   from a broken control.** With `trials` gone (`DEC-102`), **`movement` is the only windowed
   section left**, and the page must say so: the Movement card carries the window in its
   subtitle, and every point-in-time figure is labelled **as of today**.
2. **`to` loses a day — `D-044`.** `<input type="date">` sends `2026-08-12`; `z.coerce.date()`
   reads that as `2026-08-12T00:00:00Z`; every query is `lte: to`. **The whole of the last day
   selected is excluded, and a single-day window (`from` = `to`) matches nothing at all.** `to`
   is inclusive to the end of its day.

**The tier mix cannot be windowed, and that is a schema fact rather than an omission.**
`subscriptions` holds one row per organisation with no history, so *"the tier mix as of 12
August"* is not a question this database can answer — the same limit `<GrowthChart>` documents
in `24` §6b. Labelling it *as of today* is honest; reconstructing it from `payments` is a
different feature and belongs with the one that needs it.

## Components

| Component | New? | Use |
|---|---|---|
| `<StatCard>` | existing | Organisations, **Gone quiet**. ~~Trials, conversion~~ — removed by `DEC-102`; the headline row goes from six cards to four |
| `<StackedBar>` `<BarRow>` | existing | Tier mix, movement. **Reused, never forked** — the rule INV-008 and INV-009 already make twice |
| `<ResponsiveTable>` | existing | Per-tier and per-period breakdown |
| `<GrowthChart>` | **new** | Organisations over time by tier. Renamed from `<RevenueChart>` in `24` §6b, same shape, no currency formatting |

> **`<TrendChip>` is still not built and is not built here either.** `CONF-017` rules trends
> off the *customer's* home page for reasons about analysis surfaces; those reasons do not
> apply to an internal screen, where a direction is the point. If it is built, it is built for
> this page and `46` remains unchanged — record it as a decision rather than letting the
> component quietly appear on both.

## Interactions

Pick a window (default: last 12 months, monthly) → the cards, a growth series, a tier mix, a
movement table, an adoption block. Clicking a tier or the quiet count filters `70`'s estate
list — a link out to operations, never a drill into content.

**The window control sits with what it controls.** It is in the page header today, above six
sections of which one obeys it (`DEC-103`). It belongs on the Movement card, and the header
keeps only what a window cannot change.

**Every figure states its basis in the card, not in a tooltip.** *"38 organisations · excludes
6 trialing"* is one line and it prevents the single most likely misreading. A number whose
definition is hidden behind a hover is a number that will be quoted wrongly.

## States

| State | Behaviour |
|---|---|
| Empty | No organisations: cards render zeros. ~~and `conversionRate` renders a dash rather than `0%`~~ — the card is gone (`DEC-102`); the rule it demonstrated is §3 and still applies to any ratio added later |
| Loading | Previous figures dim and stay (`46`, `70`) |
| 403 | `staff` never reaches the route; a direct URL gets a full-page 403 naming the capability |

## Acceptance

- [x] `staff` gets 403 from middleware at `GET /platform/analytics`, and the tab is absent —
      `platform.test.ts` "staff gets 403, naming the capability"; `<OpsLayout>`'s nav only
      renders the Analytics link when `useOpsCan('platform.analytics.read')` is true (T-066)
- [x] `trialing` organisations appear in `orgs.trialing` and in **no** `byTier` row —
      `analytics()` excludes `status: 'trialing'` from the `byTier` query; test asserts a
      trialing-gold org still shows `orgs.trialing > 0`
- [x] ~~`conversionRate` is `null` when no trial has completed, and renders as a dash~~ —
      **RETIRED by `DEC-102`.** It passed, and it asserted a card that could never show anything
      else: `converted` is a hardcoded `0`, so the dash was the only branch reachable. A test
      that can only ever take one path is not testing a decision
- [x] **Neither `trials` nor any seat figure appears in `PlatformAnalytics`** — asserted on the
      serialised payload, so the fields cannot come back quietly (`DEC-102`)
- [x] **`movement.upgraded`/`downgraded` are read from `payments`** — **and still from
      `plan.override` beside it**, which is a correction to `DEC-102` recorded in its `built`
      note: an operator override deliberately writes no `payments` row, so "rather than" would
      have made an operator moving thirty organisations show as no movement at all. The two
      sources are disjoint by construction. A customer's own upgrade appears in them, and the
      test drives `POST /billing/tier` with a customer session — the path that produced nothing
      before
- [x] **A window of one day returns that day's movement**, `from` = `to` — the `D-044`
      regression, and the smallest case that catches it
- [x] **Every figure the window does not govern is labelled `as of today`** on the page, and
      the window control sits on the Movement card (`DEC-103`)
- [x] **No page copy explains an invariant.** `— never read` is gone; `INV-011` is asserted by
      the payload scan two rows below, which is where it was always enforced
- [x] Churn, upgrades, downgrades and new are four separate counts with no net figure
      anywhere — `movement[]` carries the four fields and nothing else; `<GrowthChart>` and
      the movement table render all four, no combined column
- [x] `orgsQuiet30d` matches the estate list `70` produces for the same filter — one
      definition, two screens: `isQuietOrg` moved to `@endur/shared` (`N-064`) and both
      `<OrgRow>`'s chip and `analytics()`'s count import it
- [x] No response, answer, comment or respondent field appears in any payload (INV-011),
      asserted against `PlatformAnalytics` field by field — `platform.test.ts` string-scans
      the serialised response for `"answers"`/`"comment"`/`"respondent"`/`"value"`
- [x] **No amount, price or currency appears in any payload or on the page** (DEC-035) — same
      test also scans for `"price"`/`"amount"`/`"currency"`; `PlatformAnalytics` has no such
      field to begin with
- [x] Every card renders its basis line — each `<StatCard>`'s `context` prop states what the
      number excludes or measures ("excludes N trialing and N cancelled", "of N completed
      trials", etc.)

## Out of scope

| Not building | Why |
|---|---|
| Revenue, MRR, ARR, ARPA | DEC-035. There are no prices, and a constant times a count is not a financial figure |
| Invoices, tax, proration, payment | `16` §10, and now moot |
| Forecasting or cohort retention curves | Real analytics on a few dozen organisations is noise presented as insight. Revisit at a scale that has one |
| Per-customer profitability | Needs cost data that does not exist, about money that does not exist |
| Anything derived from response content | INV-011, and it would be the most tempting breach of it — *"which customers get the most feedback"* is a count, and it stays a count |
