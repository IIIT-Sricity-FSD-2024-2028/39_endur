# 16 — Tenancy, billing and entitlements

Phase: P1 (tenancy) · P2 (entitlements) · P3 (metering UI) · Owns: `src/backend/billing/**`
Decisions: `_MEMORY.md` DEC-011 · Invariants: INV-010
Source: `design_specs/SCOPE.md` § "What we sell"

The revenue model is architecture, not a slide. If entitlements are bolted on later they end
up scattered through handlers, and the tier boundaries stop being enforceable.

---

## 1. Tenancy

One database, one schema, `org_id` on every tenant table. Not schema-per-tenant, not
database-per-tenant.

**Why:** a college has hundreds of rows, not millions. Schema-per-tenant would mean running a
migration N times and would make the template library — which spans tenants by design
(`Template.orgId IS NULL`) — awkward. Row-level tenancy with disciplined enforcement is the
right size of solution here, and it is honestly defensible rather than merely convenient.

Enforcement is two layers deep (`10` §8):

1. **`tenantResolver` injects `orgId`**, taken from the API key, the JWT claim, or the
   campaign token — never from a request body (INV-010). Services use a tenant-bound Prisma
   client that adds the filter automatically.
2. **Postgres row-level security** as a redundant backstop, with the session variable set at
   connection checkout. Deliberately duplicative: if the application layer ever forgets, the
   database still refuses.

Layer 1 is required for M0; layer 2 lands before P1 closes.

---

## 2. Tiers

| Tier | Sells | Adds |
|---|---|---|
| **Bronze — Measure** | Run campaigns and get results | The collection engine |
| **Silver — Understand** | See *why* results moved | Themes, sentiment, trends, reliability, **announcements** |
| **Gold — Improve** | Run the full loop | Reflection, gap analysis, plans, check-ins, **booking** |
| **Enterprise — Decide** | Use output as formal evidence | 360°, full audit, appeals, SSO, **API access** |

~~Enterprise is priced individually: a base platform plus chosen services.~~
**SUPERSEDED 2026-08-31 by `DEC-099`, and BUILT the same day (`T-099`). Enterprise is ₹4,999
per month, and it prints.** Owner
directive. "Priced individually" was true as a sales posture and false as a product decision:
it forced `priceMinor: 0` as a sentinel, a `selectable: false` special case in every reader,
and two strings of apology copy on the card. A number deletes all three.

**A price is not a checkout.** Enterprise stays off `SIGNUP_TIERS` and off the join path;
`selectable: false` survives and now means exactly one thing — *the customer cannot assign this
to themselves*. The card's verb is **Request** (`DEC-100`), and an operator can still set the
tier directly (`19` §4), which is the path `DEC-048` chose and `DEC-099` found broken.

**Built note.** `<PlanPicker>`'s `unavailable` ended up narrower than `DEC-099` predicted —
`disabled || (mode === 'signup' && !plan.selectable)` rather than `mode !== 'override'` —
because `T-100` landed in the same pass and gave the `join` card a **Request** verb instead of a
disabled one. The operator's case is fixed either way. The `Arranged with us` line **stayed**,
reworded: deleting it, as `DEC-099` proposed, would have left a card whose verb differs from
every other card's with nothing on it saying why.

## 3. The entitlement map

```ts
// src/backend/billing/entitlements.ts
export const TIER_ENTITLEMENTS: Record<Tier, readonly Capability[]> = {
  bronze: [
    'org.*', 'unit.*', 'role.*', 'grant.*', 'person.*', 'assignment.*',
    'group.*', 'delegation.*', 'subject.*', 'template.*', 'campaign.*',
    'account.*', 'billing.*',                    // added 2026-08-24 — see below
    'response.read', 'results.read', 'simulator.run',
  ],
  silver:     [...bronze, 'analysis.read', 'results.export', 'response.export',
                          'announcement.*'],   // added 2026-08-30, T-094
  gold:       [...silver, 'reflection.*', 'actionplan.*', 'checkin.*',
                          'booking.*'],        // added 2026-08-30, T-095
  enterprise: [...gold,   'audit.read', 'apikey.*', 'api.*'],
};
```

> **`account.*` and `billing.*` were in NO TIER AT ALL until `T-088` found them (2026-08-24).**
> Two bugs of the same shape. `account.*` arrived with `T-072` and this table was simply not
> updated — but an organisation that cannot provision a sign-in for its own people cannot use
> the product at any price, and §3's first assertion below is that the whole permission surface
> is in Bronze. `billing.*` had been uncovered since `T-003` and is the worse of the two: with
> `billing.update` in no tier, mounting `requireEntitlement` on `POST /billing/tier` would
> `402` every attempt to LEAVE the tier you are on — a paywall in front of the upgrade button.
> Neither had fired: the account routes are not entitlement-gated and `POST /billing/tier` does
> not exist yet. `src/backend/test/tiers.test.ts` now asserts that every capability in the
> catalogue appears in at least one tier, so the next module cannot be forgotten the same way.
> **A capability in no tier is always a bug, never a decision** — an operator-only power belongs
> in `19`'s separate platform catalogue, which this table does not describe.

Two things this table asserts, and both are deliberate:

**The entire org-structure and permission surface is in Bronze.** Correct handling of
who-can-see-what is in every tier — it is not an upgrade (`01` §6). Selling privacy as a
paid feature would be indefensible, and it also keeps the two middlewares cleanly separated.

**`simulator.run` is in Bronze too.** It is the cheapest trust-builder in the product
(`_MEMORY.md` N-005). Gating it would mean the customers least able to configure permissions
correctly are the ones who cannot check their work.

## 4. Capability versus entitlement (DEC-011)

Two middlewares, two questions, two status codes.

| | `requireCapability` | `requireEntitlement` |
|---|---|---|
| Asks | May **this person** do this? | Has **this organisation** paid for it? |
| Source | `grants` table, per principal | `subscriptions.tier`, per org |
| Failure | `403 FORBIDDEN` + decision trace | `402 PAYMENT_REQUIRED` + `requiredTier` |
| Remedy | Ask your administrator | Upgrade the plan |
| Order | First | Second |

Capability is checked **first**. Never tell someone to buy an upgrade for something they would
not be allowed to use even after buying it — that is both a bad experience and, for a
competitor probing the API, an information leak about org structure.

Conflating them would also mean writing billing state into the grant table, where it would be
editable from the powers grid. An administrator must not be able to grant themselves a tier.

## 5. Metering — what is counted

> **The people answering forms are never charged for.** A college with 4,000 students pays for
> the staff being reviewed and the staff running the system.

```
billable_seats(org) =
    count(users where status = 'active')
  + count(subjects where linked_user_id IS NULL and not archived)   -- non-person subjects
```

Person-subjects are not double-counted: a subject with `linked_user_id` set is already a
`user`. Non-person subjects — a restaurant, a ward, a bus route — count as one seat each,
because they are things being reviewed.

**Responses are never counted.** Not for billing, not for rate limiting the respondent path
beyond abuse protection. Charging per response would create an incentive to suppress
participation, which is the exact problem the product exists to solve. This is worth saying
out loud in the pitch — it is the clearest signal that the pricing follows the product thesis
rather than fighting it.

This is also *why* respondents are not `users` in the schema (`10` §3): the pricing model and
the privacy model point at the same design.

Seat count is recomputed on a schedule and on membership change, cached on
`subscriptions.seats`, and shown in settings with a breakdown so a bill is never a surprise.

## 6. Over-limit behaviour

Never break a running campaign. A tenant over its seat count:

- **can** continue to collect responses and read results
- **cannot** add people or non-person subjects → `402` with the current and required counts
- sees a persistent banner in the console with the exact number over

Blocking collection would punish the respondents, who are not the customer and did not choose
the plan.

## 7. Trials and downgrades

- ~~New orgs start `trialing` on Gold for 14 days, so the improvement loop is seen before it is
  sold. It is the differentiator; hiding it behind a paywall from day one guarantees nobody
  discovers it.~~ **SUPERSEDED ON THE SIGN-UP PATH BY `DEC-048` (2026-08-24).** A new
  organisation picks Bronze, Silver or Gold at sign-up and is on it immediately, `status:
  'active'`. The sentence above is an argument about **price**, and `DEC-035` removed price —
  when any tier is one free click, a 14-day free trial of Gold is a countdown to nothing, and
  expiring it would need a scheduler that `OPEN-005` says nothing owns. **Never implemented:**
  nothing has ever written a `Subscription` row (`D-012`), so this trial has not once happened.
  Whether a `trialing` status survives anywhere else — an operator granting one, say — is not
  decided; the line is annotated rather than deleted because removing a documented feature is
  larger than the change that prompted this.
- On downgrade, data is **retained, not deleted** — the surfaces just stop resolving. A
  re-upgrade restores access to history. Deleting a customer's data on downgrade is how you
  lose a re-upgrade. **Unchanged and load-bearing** — everything below narrows *when* a
  downgrade happens, never what it destroys, which is nothing.
- Expiry moves the org to Bronze, never to zero access.

### 7a. The ladder is one-way while a period is running — `DEC-096`, 2026-08-31

**Owner directive, and the argument is the refund policy.** The product captures at the moment
of the join, `payments` is append-only, there are no invoices and no refunds (§8). So a
customer moving Gold → Silver mid-period **pays a second time for less than they already
hold**, and the product keeps both captures. That is not a consequence to warn about in a
confirm dialog; it is a transaction that should not exist.

| Move | What happens |
|---|---|
| To a **higher** tier | Applies immediately. The capture is the **difference** — `DEC-097` |
| To the **same** tier | `409`. Already there |
| To a **lower** tier | `409` on the spot. It can be **scheduled** for the end of the period instead — `DEC-098` |

**`POST /billing/tier` is where this is decided, not `/app/plan`.** The affordance is removed
from the customer's page and from the operator's picker, and neither is the rule: `13`
§ Billing is a documented route and `INV-003` says the client never decides. A UI that stops
offering a downgrade while the service still performs one has moved a policy into React.

### 7b. A downgrade is scheduled and applied on read — `DEC-098`

**BUILT 2026-08-31 (`T-098`).** `readBilling` is the one applier; `requireEntitlement` still
selects `tier` alone. When it fires it writes three things in one transaction — the
subscription, a `payments` row of `kind: 'expiry'` at ₹0, and an audit row **with no actor**,
because a date passing is not an action anybody took and the person who happened to open the
page did not perform it. The period rolls forward; nothing is billed for the new one, and
nothing ever has been.

*"The plan can be downgraded but only when it's exhausted."* Which needs the one thing this
product does not have: something that runs when a date passes. §8 says it plainly —
`subscriptions.period_end` bills nothing when it passes — `17-BACKGROUND-JOBS.md` is unwritten
and `OPEN-005` says nothing owns a scheduler.

**So nothing runs.** The customer writes `subscriptions.pending_tier`; the row is otherwise
untouched and nothing is captured. **The first request after `period_end` passes** moves the
tier and clears the column. That is the trick `readBilling` already uses to repair a missing
subscription row (`D-012`), and its own comment carries the argument: the write happens on the
read so that the entitlement gate and the page agree from the next request onward.

`pending_tier` is **never consulted by `requireEntitlement`** — only by the write that retires
it. `49` § Interactions requires that the tier the customer reads and the tier the gate decides
with are the same row, with no cache and no future-dated value, and this keeps that true.

**Known and accepted:** an organisation nobody opens never transitions. A tier is only ever
consulted when somebody asks, so an org with no requests has nothing being gated.

### 7c. The period is one calendar month — `DEC-096`

**BUILT 2026-08-31 (`T-097`).** Calendar month with clamping (31 Jan → 28/29 Feb), never 30
days: a customer renews on the date they joined, and a 30-day period walks backwards through
the calendar. One function — `src/backend/billing/period.ts` `newPeriod()`.

**It was 365 days in FOUR places, not the three this section named.** `joinTier`'s repair,
`readBilling`'s `D-012` repair, `overridePlan`, **and `database/seed/demo.ts`** — the fourth was
found by grepping for the *column* rather than for the number, which is the only way to find the
copy nobody remembered writing.

**And they already disagreed.** Two used `+ 365 * DAY` and two used `setFullYear(+1)`, so in a
leap year a registered organisation got a period one day longer than a repaired one. Nothing
read the difference, which is exactly why it survived: a constant duplicated four ways is not
wrong until something starts depending on it, and `DEC-098` is about to make `period_end` the
date a downgrade fires on.

A year-long period would also make §7b unobservable. Nobody demonstrates a feature with a
365-day fuse.

## 8. Endpoints

| Method | Path | Capability | Phase |
|---|---|---|---|
| GET | `/api/v1/billing` | `billing.read` | P2 |
| GET | `/api/v1/billing/usage` | `billing.read` | P2 |
| GET | `/api/v1/billing/plans` | `billing.read` | P2 |
| POST | `/api/v1/billing/tier` | `billing.update` | P2 |
| POST · DELETE | `/api/v1/billing/downgrade` | `billing.update` | P2 — `DEC-098` |
| GET · POST | `/api/v1/billing/enterprise-request` | `billing.read` · `billing.update` | P2 — `DEC-100` |

**DEC-080 — there are prices, and the money is simulated.** Bronze **₹99**, Silver **₹499**,
Gold **₹999**, ~~per year~~ **per month since `DEC-096`**, in INR — plus Enterprise at
**₹4,999** per month (`DEC-099`, built 31 Aug), which used to be a sentinel `0`. **The numbers themselves did
not change when the period did, which is a 12× rise and is deliberate** — `OPEN-015`, **answered
by the owner 31 Aug**: *"Monthly period, prices left at ₹99/₹499/₹999 sounds good."*
`tiers.test.ts` pins all four against the literals, so the next change to them is a change to a
test as well as to a table. They live in `packages/shared/src/tiers.ts` as `priceMinor`
(integer **paise** — 9900 is ₹99) because the picker has to print them before anybody has a
session. ~~Enterprise carries `priceMinor: 0`, which is **not free**.~~ **The sentinel is gone
(`DEC-099`)** — it was never free, it read as free to anything that did not know, and it forced
a `selectable` check in front of every price render. That special case leaked out of the data as
copy. `selectable: false` now means one thing and one thing only: the customer cannot assign this
tier to themselves.

`POST /billing/tier` is **still a join**. `<PaymentDialog>` runs a checkout in the client,
mints a reference and then calls the same route — so the authoritative write, the capability
that guards it and the entitlement gate behind it are all exactly what they were. The dialog is
a step in front of the write, never a condition on it: `paymentRef` is optional, and a request
without one still joins and still records a capture. Gating a tier on a client-generated string
would put an authorisation decision in React (`INV-003`).

**Every capture is priced server-side** from `PLAN_OPTIONS`, on both write paths (registration
and plan change), inside the transaction that writes the subscription. There is no field on any
request for an amount.

**An upgrade captures the DIFFERENCE — `DEC-097`, 2026-08-31.** `priceOf(to) − priceOf(from)`,
and `period_end` does not move. The customer has already paid for this period; charging the
full new price bills the overlap twice, which is §7a's objection to downgrades pointed the
other way.

**It also corrects a number nobody had noticed.** `/ops/earnings` sums `payments`. Today an org
that walked Bronze → Silver → Gold inside one period contributes ₹99 + ₹499 + ₹999 = **₹1,597**
to estate revenue for a customer holding one ₹999 plan — the ledger **overstates, and it
overstates most for the customers who upgrade most**. Under the difference rule the same
journey sums to ₹999, which is what the estate actually holds.

*Not prorated by days remaining.* Rejected on reasoning, not overlooked: with a one-month period
the largest possible overcharge is one month of one step, and proration buys that back at the
cost of a **second money formula and a rounding rule** in a system that has exactly one
(`priceOf`, integer paise, no floats). Revisit when renewal exists — nothing renews today, and
until it does, "the rest of the period" is a quantity nothing else in the product reads.

**What is still absent, and deliberately:** no payment processor, no webhook surface, no card
data, no invoices, no refunds, no renewal — `subscriptions.period_end` still bills nothing when
it passes, and `DEC-098` does not change that. What it does now is **fire a scheduled
downgrade** the first time somebody reads the row after it, and start a new period so the row is
not left permanently expired. `payments` is an append-only ledger of captures, not an accounts system, and the UI
says "Endur demo checkout · no card details are collected" where a real one would take a card.

> This supersedes **DEC-035** on price and checkout only. DEC-034's hole stays closed the way
> DEC-035 closed it — `billing.update` is a capability, seeded to administrators only, resolved
> in middleware, and audited.

> DEC-035's original note, kept because the hole it names is real: DEC-034 split
> `billing.update` to keep the tier write out of the org's hands until a checkout completed.
> The checkout that returned at DEC-080 is a **client step**, so it does not revive that split
> — `19` §8 carries the full reasoning and the protection that remains.

## 9. Acceptance

- [ ] A capability failure returns 403 and an entitlement failure returns 402, and the two
      are never swapped
- [ ] Capability is evaluated before entitlement — verified by a request that fails both,
      which must return 403
- [ ] Every permission capability is present in the Bronze entitlement list
- [ ] `billable_seats` excludes respondents and does not double-count person-subjects
- [ ] An over-limit org can still collect responses and read results
- [ ] A downgrade retains data; a re-upgrade restores access to it
- [ ] A cross-tenant read returns empty even with a forged body `orgId`
- [ ] RLS policies are active on every tenant table (P1 exit criterion)

## 10. Out of scope

| Not building | Why |
|---|---|
| Payment processing | Demonstrates nothing new; adds a real webhook security surface |
| Per-seat proration, invoices, tax | Finance, not architecture |
| Usage-based pricing on responses | Contradicts the product thesis, §5 |
| Self-serve plan changes | `billing.update` exists; the UI is P3 |
| Schema- or database-per-tenant | Wrong size of solution, §1 |
