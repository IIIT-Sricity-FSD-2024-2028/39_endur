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

  byTier: { tier: Tier; orgs: number; seats: number }[];

  movement: {                // per period, in ORGS. Never netted into one number
    period: string;
    new: number; upgraded: number; downgraded: number; churned: number;
  }[];

  trials: { started: number; converted: number; expired: number; conversionRate: number | null };

  adoption: {                // the question a tier mix cannot answer
    orgsWithACampaign: number;
    orgsWithAResponse: number;
    orgsQuiet30d: number;    // no response in 30 days — the churn signal that precedes churn
  };

  totals: { seats: number; campaigns: number; responses: number };  // COUNTS ONLY — INV-011
};
```

## The decisions inside these numbers

Each is a place the obvious implementation is wrong.

### 1 · A trial is never counted as a customer

An org `trialing` on Gold (`16` §7) chose nothing. Folding it into "Gold organisations" inflates
the single most optimistic number on the page and hides the only question a trial raises: does
it convert. Trials get their own figures and their own conversion rate, next to — never inside —
the tier mix.

### 2 · Movement is four counts, never one

Four organisations upgrading and one Enterprise customer leaving is not "net +3". Upgrades,
downgrades, new and churned are reported separately and always together; there is no combined
figure on this page because there is no honest one.

### 3 · `conversionRate` is `null`, not `0`, when no trial has ended yet

The distinction `46` established for response rate and it matters more here: zero conversions
out of zero completed trials is not a zero percent conversion rate, it is no measurement.
A dash says *not yet*; a `0%` says *failing*.

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

## Components

| Component | New? | Use |
|---|---|---|
| `<StatCard>` | existing | Organisations, trials, conversion, quiet |
| `<StackedBar>` `<BarRow>` | existing | Tier mix, movement. **Reused, never forked** — the rule INV-008 and INV-009 already make twice |
| `<ResponsiveTable>` | existing | Per-tier and per-period breakdown |
| `<GrowthChart>` | **new** | Organisations over time by tier. Renamed from `<RevenueChart>` in `24` §6b, same shape, no currency formatting |

> **`<TrendChip>` is still not built and is not built here either.** `CONF-017` rules trends
> off the *customer's* home page for reasons about analysis surfaces; those reasons do not
> apply to an internal screen, where a direction is the point. If it is built, it is built for
> this page and `46` remains unchanged — record it as a decision rather than letting the
> component quietly appear on both.

## Interactions

Pick a window (default: last 12 months, monthly) → four cards, a growth series, a tier mix, a
movement table, an adoption block. Clicking a tier or the quiet count filters `70`'s estate
list — a link out to operations, never a drill into content.

**Every figure states its basis in the card, not in a tooltip.** *"38 organisations · excludes
6 trialing"* is one line and it prevents the single most likely misreading. A number whose
definition is hidden behind a hover is a number that will be quoted wrongly.

## States

| State | Behaviour |
|---|---|
| Empty | No organisations: cards render zeros, and `conversionRate` renders a dash rather than `0%` (§3) |
| Loading | Previous figures dim and stay (`46`, `70`) |
| 403 | `staff` never reaches the route; a direct URL gets a full-page 403 naming the capability |

## Acceptance

- [x] `staff` gets 403 from middleware at `GET /platform/analytics`, and the tab is absent —
      `platform.test.ts` "staff gets 403, naming the capability"; `<OpsLayout>`'s nav only
      renders the Analytics link when `useOpsCan('platform.analytics.read')` is true (T-066)
- [x] `trialing` organisations appear in `orgs.trialing` and in **no** `byTier` row —
      `analytics()` excludes `status: 'trialing'` from the `byTier` query; test asserts a
      trialing-gold org still shows `orgs.trialing > 0`
- [x] `conversionRate` is `null` when no trial has completed, and renders as a dash — `null`
      when `converted + expired === 0`; the page renders `—`, never `0%`
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
