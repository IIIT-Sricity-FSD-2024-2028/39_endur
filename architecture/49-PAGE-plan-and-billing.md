# 49 — Page: plan and billing (the organisation's own)

Phase: **P2** · Milestone: — · Owns: `src/frontend/pages/console/Billing/**`
Related: `16` (tiers, metering, over-limit), `41` (settings, which hosts this), `30` (sign-up),
`19` §8 (what `billing.update` means now)
Decisions: `_MEMORY.md` DEC-034, **DEC-035 (no pricing — joining a tier is one click)**
Design ref: none yet — see `70` § Design note

---

## Purpose

The customer's side of the plan model: what plan this organisation is on, what it is using
against that plan, and how to change it. `71` is the estate-wide view of the same thing.

It also carries the **plan-selection step at sign-up**, which is the other half of what the
user asked for — *"buys a plan sign up page"*.

> **There are no prices anywhere in this product — DEC-035.** Endur is a course project, not a
> business, so a plan is **joined**, not bought: one button per tier, and clicking it puts the
> organisation on that tier immediately. No amounts, no currency, no checkout, no processor,
> no invoice. What survives is the part that was ever architecturally interesting — the
> **entitlement gate** (`16` §3) and the **seat meter** (`16` §5), both of which work exactly
> as specified whether or not money moves.

## Route & access

| | |
|---|---|
| Route | `/app/settings/billing` — a tab in settings (`41`), not a top-level nav item |
| Also rendered at | `/start` step 2, as plan selection during sign-up (§ Interactions) |
| World | Console |
| Guard | `RequireCapability capability="billing.read"` on the route — this page *is* the action, so someone without it gets a full-page 403 rather than an empty screen (the rule `31` and `32` already follow) |

**A settings tab, not a nav item.** Billing is looked at monthly, not daily, and `design_specs/design/02`
§3's sidebar is grouped by what people do — Organize, Collect, Understand. Billing is none of
those, and a fourth group holding one item is a worse answer than a tab.

## Capabilities

| Action | Capability | Notes |
|---|---|---|
| See the plan and usage | `billing.read` | Seeded to administrators only, not to every role |
| Join a tier | `billing.update` | **Writes `subscriptions.tier`.** One click, effective immediately — DEC-035 |
| Set another org's tier | — | Not reachable from this world at all. `platform.plan.override` (`19` §4) |

> **What DEC-034 was protecting, and why it still matters with no prices.** `16` §8 put
> `POST /billing/tier` behind `billing.update`, so an administrator could give their own
> organisation Enterprise for free. DEC-034 split the capability so the tier write happened
> server-side after a checkout. **DEC-035 deletes the checkout, so that split has nothing left
> to hang on and `billing.update` writes the tier again — deliberately, and recorded.**
>
> The protection that remains is the one that was always doing the real work: `billing.update`
> is a **capability**, so it is grantable, denyable and audited like every other, and the
> default grant matrix (`11` §8) seeds it to administrators and to nobody else. A self-upgrade
> is now an intended feature rather than a hole, and it is still the resolver — not a handler —
> that decides who may do it.
>
> `platform.plan.override` (`19` §4) is unchanged and is still a *different* capability in a
> *different* system: it sets **someone else's** tier, which no org capability can ever do.

## Data contract

| Purpose | Endpoint | Returns |
|---|---|---|
| Current plan | `GET /billing` | `BillingSummary` |
| Usage against it | `GET /billing/usage` | `UsageReport` |
| The four tiers and what each unlocks | `GET /billing/plans` | `PlanOption[]` |
| **Join a tier** | `POST /billing/tier` | `BillingSummary` — the new state, applied |

```ts
type BillingSummary = {
  tier: Tier; status: 'trialing' | 'active' | 'cancelled';
  periodStart: string; periodEnd: string;
  trialEndsAt: string | null;
  // No price field. There is no price — DEC-035.
};

type PlanOption = {
  tier: Tier;
  name: string;            // "Silver — Understand", from 16 §2
  sells: string;           // the one-line promise
  includes: string[];      // resolved from TIER_ENTITLEMENTS, never hand-written twice
  current: boolean;
};

type UsageReport = {
  seats: { used: number; included: number | null; breakdown:
    { activeUsers: number; nonPersonSubjects: number } };
  campaigns: { active: number };
  responses: { last30d: number };     // shown, never billed — see §"What is not counted"
};
```

`seats.breakdown` is required, not decorative. `16` §5 says a bill must never be a surprise,
and *"you have 34 seats"* invites the reply *"34 of what?"* — the breakdown answers it in
place.

## The billable-seat rule, restated where the customer reads it

```
billable_seats = active users
               + non-person subjects that are not archived
```

Seats are still metered and the limit is still enforced (`16` §5–§6) — a plan with no price
still has a size, and the seat meter is what makes the entitlement gate mean something. Two
facts the page states in words, because they are the model's argument:

- **Respondents are never counted.** A college with 4,000 students is metered on the staff
  being reviewed and the staff running the system. This is `16` §5, and it is *why* respondents
  are not `users` in the schema — the seat model and the privacy model point the same way.
- **A person-subject is not double-counted.** A subject with `linkedUserId` set is already a
  user and counts once.

### What is not counted, and why it is shown anyway

Response volume appears on this page as **usage, never as a limit**. `16` §5 rules out
per-response metering outright: counting responses creates an incentive to suppress
participation, which is the exact problem the product exists to solve. Showing the number
while stating it does not count against anything is the clearest possible signal that the
model follows the product thesis. Say it on the page.

## State

| What | Where |
|---|---|
| The summary and usage | Fetched on open. Not stored — a stale tier is a wrong tier |
| The tier after a join | Refetched, never patched locally. The server decides the resulting state (a join can change `status` as well as `tier`) |
| Over-limit banner state | Derived from `UsageReport`, rendered by the shell so it appears on **every** console page (`16` §6) |

## Components

| Component | New? | Use |
|---|---|---|
| `<PlanPicker>` | **new**, shared with `70` | The four tiers, what each includes, current one marked, a **Join** button on each of the others |
| `<StatCard>` `<BarRow>` `<ResponsiveTable>` `<ConfirmDialog>` | existing | Usage figures and the downgrade confirmation |
| `<OverLimitBanner>` | **new** | Persistent, in `<AppShell>`, with the exact number over |

`<PlanPicker>` is one component used by two worlds — the customer choosing and the operator
overriding. Same information, different verb. Two implementations would drift within a month,
which is the argument INV-008 and INV-009 already make twice.

## Interactions

### Sign-up — plan selection at `/start`  ·  **BUILT 2026-08-24 (`T-088`)**

`30` currently creates the organisation and drops into the setup wizard. Plan selection is
inserted as a step **between** account creation and the wizard.

**SUPERSEDED 2026-08-24 BY `DEC-048`. The step is a direct choice and there is no trial.**
Three buttons — Bronze, Silver, Gold — and the one pressed is the tier the organisation is on,
written by `register` with `status: 'active'`. Not skippable, nothing pre-selected, no
`trialing`. Owner's words: *"just pick the option (bronze, silver and gold) and you get
assigned that."*

**Enterprise is not on the picker.** `16` §4 prices it individually as *"a base platform plus
chosen services"*, which is a sales conversation rather than a button. It stays
operator-assigned through `platform.plan.override` (`19` §4) — a route the spec already has
for exactly this.

The paragraph this replaces argued for a pre-selected 14-day Gold trial, on the grounds that
*"hiding the differentiator behind a paywall on day one guarantees nobody discovers it"* and
that *"a mandatory plan choice before anyone has seen the product is a sign-up form that asks a
question its reader cannot yet answer."* **Both arguments are about price, and `DEC-035`
removed price the day before.** When any tier is one free click, a 14-day free trial of Gold is
a countdown to nothing — on day 15 the organisation presses Gold again — and expiring it would
need a scheduler, which `OPEN-005` says nothing in this product owns. The unanswerable question
stops being unanswerable too: with no amounts, the choice is reversible at zero cost from
Settings.

**This step is where `D-012` was repaid, and it is now repaid.** Nothing wrote a `Subscription`
row at all, so every organisation in the product was silently Bronze and every Silver and Gold
surface `402`'d for everyone. `DEC-048` settled the three-way ambiguity that blocked it, and
`T-088` built it: `tier` is a field on `RegisterBody` and the row is written **inside
`register`'s transaction**, so an organisation cannot exist without a tier somebody chose.

**Two steps, ONE POST**, and asking on a page after the account existed would have recreated
`D-012` exactly — a live organisation with no row for as long as it takes them to answer. It
also means every error the POST can return names a field on step 1, so a failure returns there
with the tier still selected (`30` § Create organization).

`T-088` was carved out of `T-058` because it needs none of the rest of this page — no seat
meter, no `/billing/usage`, no `<OverLimitBanner>`. What it did need already existed:
`billing/entitlements.ts` and a correctly mounted `requireEntitlement`. **It also found that
`account.*` and `billing.*` were in no tier at all** — see `16` §3.

**With no prices the step is genuinely one click**, which is the whole reason DEC-035 is worth
having: sign-up does not fork into a payment flow that would have to be faked for a demo and
explained away in a viva.

### Joining a tier from settings

`<PlanPicker>` → **Join** → `POST /billing/tier` → the row is written and the entitlement gate
starts answering differently on the next request. No intermediate state, no `pending`, no
`effectiveFrom` in the future — a plan change that takes effect later is a scheduling problem
(`OPEN-005`) bought for nothing.

An **upgrade applies with no dialog.** A confirmation before giving someone more is friction
with no risk behind it. ~~A **downgrade confirms**, because it takes surfaces away.~~
**AMENDED 2026-08-31 — `DEC-096`. There is no downgrade to confirm.**

| Direction | What this page does |
|---|---|
| Upgrade | No dialog. `<PaymentDialog>` shows the **difference** (`DEC-097`), then it takes effect immediately and the new surfaces unlock now |
| Same tier | The card reads **Current plan** and is inert, as it already did |
| Lower tier | **No action on the card.** It renders as context — the tier and its price, no button. `POST /billing/tier` answers `409` if anything calls it anyway |
| Lower tier, **scheduled** | A single secondary link under the current plan: *"Move to Bronze when this period ends on 30 September"* → `POST /billing/downgrade`. Nothing is captured and nothing changes today (`DEC-098`) |
| Either | Collection never stops. Running campaigns keep running (`16` §6) |

**Why the affordance goes rather than gaining a warning.** The old row's sentence — *data is
retained, not deleted* — is still true and still in `16` §7, and it was never the problem. The
problem is money: there are no refunds, so a customer who downgrades mid-period pays again for
less than they already hold and the product keeps both captures (`16` §7a). A dialog that
explained that accurately would be a dialog talking somebody out of a click the product should
not offer.

**The scheduled downgrade is the affordance that replaces it**, and it is one line of copy, not
a second picker. It has a date in it because a promise without one is the thing customers ring
about, and cancelling it is the same link again.

**BUILT 2026-08-31 (`T-098`), and the placement is the decision worth recording.** The block
sits under the **current plan**, above the picker, and the lower cards keep no action at all —
their sentence points up at it. `<PlanPicker>`'s rule is that a tier below the current one
carries no button (`DEC-096`), and a rule with one exception is a rule somebody adds a second
exception to. The tier still has to be chosen somewhere, so the block offers one small button
per sellable tier below the current one — inline in the sentence rather than as a button bar,
because what is being said is one sentence and the tiers are its ends. It disappears entirely on
Bronze, and without `billing.update`; the picker beside it stays visible but inert, because
"what are we on and what would the next one add" is still `billing.read`'s question.

**A downgrade still deletes nothing.** `16` §7 is unchanged; what changed is when it can
happen.

**A join is audited like any other privileged write** (`12` §4.14): actor, from-tier, to-tier,
request id. With no invoice and no receipt, `audit_log` is the *only* record that the change
happened, which makes it more load-bearing here than it is on a route that also produces a
document.

### Asking for Enterprise  ·  **BUILT 2026-08-31 (`DEC-099`, `DEC-100` — `T-099`, `T-100`)**

Enterprise's card stops being a dead disabled button. It prints **₹4,999 / month** like every
other card and its verb is **Request** → `<EnterpriseRequestDialog>` → `POST
/billing/enterprise-request` (`billing.update`).

**A price is not a checkout.** Nothing is captured, no subscription row moves, and the customer
is not on Enterprise when the dialog closes. What happens is that an `enterprise_requests` row
opens for Endur's owner, who rings them back — the tier stays operator-assigned through
`platform.plan.override` exactly as `DEC-048` decided.

- **The success state is a promise, not a receipt.** *"We'll be in touch."* No ticket number, no
  ETA: nothing in the product can honour either.
- **A second request while one is `open` is a `409`** that says the first is already with us —
  never a duplicate row, and never a silent success that teaches the customer to click again.
- **Who asked is resolved from the session**, never posted, for the same reason
  `<MessageComposer>` resolves recipients server-side.

### Messages from Endur  ·  **SPECIFIED 2026-08-31 (`DEC-101`) — NOT BUILT**

Not on this page. An operator contacting an organisation (`70` § Interactions) writes to the
administrators' **inbox** — see `58` § From Endur. It is recorded here only because this is the
page a customer opens when they want to talk to Endur, and it must not grow a second inbox.

### Going over the seat limit

`16` §6, and the behaviour is deliberately asymmetric:

- **Still allowed:** collecting responses, reading results, everything the respondents touch
- **Blocked:** adding people, adding non-person subjects → `402` with current and required counts
- **Always visible:** `<OverLimitBanner>` on every console page, naming the exact number over

Blocking collection would punish the respondents, who are not the customer and did not choose
the plan.

## Assigning levelled roles — already specified, deliberately not re-specified here

The other half of what was asked for — *"can assign leveled roles"* — **exists and is owned by
`33-PAGE-roles-and-powers-grid.md`**. It is not repeated here, and it must not be:

| Question | Where it is answered |
|---|---|
| The role ladder and reordering | `33` § Interactions — drag to reorder, levels renumber live |
| How a level is stored | `10` — `Node.level`, *"ordering only, nothing else"* |
| What a level actually **does** | `11` §8 — it seeds a default grant matrix at org creation and nothing more |
| Assigning a person to a role in a unit | `34` § Interactions — the assignment, which is what carries scope (INV-005) |

> **The trap this note exists to prevent.** "Levelled roles" sounds like an integer permission
> ladder, and `DEC-002` replaced exactly that with the GRANT engine — `CONF-002` records the
> conflict. A level is a **display and seeding** concept: it orders the ladder and it decides
> which default grants a new org gets. **It is never consulted at authorisation time.** If a
> future change makes a level decide an access question, that supersedes `DEC-002` and needs
> saying out loud, not doing quietly.

## States

| State | Behaviour |
|---|---|
| Trialing | Days remaining, what happens at the end (**Bronze, never zero access** — `16` §7), and the join buttons |
| Active | Plan, what it unlocks, period, usage. **No amount is rendered** — there is none |
| Over limit | Banner plus an inline explanation of exactly which actions are blocked |
| No subscription row | Treated as the trial default and **repaired on read** — this is today's reality for every organisation (`D-012`), and a customer must never see a billing page that says "unknown" |
| Loading / Error / 403 | As `25` |

## Acceptance

- [ ] `POST /billing/tier` without `billing.update` returns **403 from middleware**, and the
      row is unchanged — the check that replaces DEC-034's, and the one that matters now
- [ ] `POST /billing/tier` with `billing.update` writes the row and the response reflects it
- [ ] A tier written by one org is invisible to another — the write goes through `tenantClient`
      like every other (INV-010)
- [ ] A join writes an `audit_log` row naming the from-tier and the to-tier
- [ ] The entitlement gate answers differently on the **next** request after a join, with no
      restart and no cache to invalidate
- [ ] ~~No response body, no page and no seed carries a price, an amount or a currency~~
      **REVERSED by `DEC-080` (29 Aug) and stale here since.** Every selectable tier prints a
      price, and it is `formatMoney` from `PLAN_OPTIONS` — never a literal in a component
- [ ] **Every price on the page reads `/ month`, and the period written to `period_end` is one
      calendar month** — `DEC-096`. Three call sites hardcode 365 days today
- [x] **`POST /billing/tier` to a LOWER rank returns `409` and the row is unchanged**, and the
      test calls the route directly rather than through the page — the button's absence is not
      the rule (`INV-003`)
- [x] **`POST /billing/tier` to the SAME rank returns `409`** and captures nothing. A
      double-submitted dialog must not bill twice for standing still
- [x] **An upgrade captures `priceOf(to) − priceOf(from)`**, computed server-side, in the same
      transaction as the tier — `DEC-097`. Asserted on the `payments` row, not on the dialog
- [x] **A scheduled downgrade changes nothing today**: `subscriptions.tier` is unmoved, no
      `payments` row is written, and the entitlement gate answers exactly as it did
- [x] **The first read after `period_end` applies a `pending_tier`** and clears the column, and
      the read that applies it returns the new tier — `DEC-098`
- [x] **`POST /billing/enterprise-request` writes one `open` row and does not touch
      `subscriptions`**; a second while one is open is `409`
- [x] **Enterprise's card prints ₹4,999 and its verb is `Request`, not `Join`** — and no page
      renders `₹0` for it, the property the old sentinel guard existed to protect
- [ ] `billable_seats` excludes respondents and does not double-count person-subjects
- [ ] The breakdown's parts sum to the displayed total
- [ ] An over-limit org can still collect responses and read results
- [ ] An over-limit org gets `402` with current and required counts when adding a person
- [ ] The banner appears on **every** console page, not only this one
- [ ] A downgrade deletes nothing; a re-upgrade restores access to the same history
- [ ] ~~Sign-up creates a `Subscription` row — `trialing`, Gold, 14 days~~ **SUPERSEDED by
      `DEC-048`**: sign-up writes the chosen tier, `status: 'active'`. Nothing has ever written
      `trialing` on this path, which is what made `/ops/analytics`' trial counters unable to
      move (`DEC-102`)
- [ ] ~~An expired trial moves to Bronze, never to zero access~~ — no trial exists to expire.
      The line that survives is `16` §7's, about **expiry**, and `DEC-098` is what finally makes
      `period_end` mean something
- [ ] Response counts appear with an explicit statement that they are not billed
- [ ] Every user-facing noun on this page resolves through `useLabels()` — this is a customer
      surface and INV-001 applies in full, unlike `70` and `71` (`19` §12)

## Out of scope

| Not building | Why |
|---|---|
| **Prices, amounts, currency** | DEC-035. Not deferred — *absent*. There is no number to show, no `plan_prices` table, and nothing in the seed invents one |
| Payment processing, cards, invoices, tax | `16` §10, and now moot. A processor is a webhook security surface for zero marks |
| A checkout flow | DEC-035. With nothing to collect, a checkout is a form that asks for nothing and then does what the button already did |
| Enterprise as an enquiry | Joined like the other three. "Contact us" is a sales flow, and there is no sales |
| Proration | Finance, not architecture, and there is no money to prorate |
| Seat purchase as a separate transaction | Seats are metered, not bought. `16` §5 |
| A usage history chart | The current period answers the billing question. Trends over billing periods are `71`'s question, on the other side of the product |
