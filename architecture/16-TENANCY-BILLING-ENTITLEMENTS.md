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
| **Silver — Understand** | See *why* results moved | Themes, sentiment, trends, reliability |
| **Gold — Improve** | Run the full loop | Reflection, gap analysis, plans, check-ins |
| **Enterprise — Decide** | Use output as formal evidence | 360°, full audit, appeals, SSO, **API access** |

Enterprise is priced individually: a base platform plus chosen services.

## 3. The entitlement map

```ts
// src/backend/billing/entitlements.ts
export const TIER_ENTITLEMENTS: Record<Tier, readonly Capability[]> = {
  bronze: [
    'org.*', 'unit.*', 'role.*', 'grant.*', 'person.*', 'assignment.*',
    'group.*', 'delegation.*', 'subject.*', 'template.*', 'campaign.*',
    'response.read', 'results.read', 'simulator.run',
  ],
  silver:     [...bronze, 'analysis.read', 'results.export', 'response.export'],
  gold:       [...silver, 'reflection.*', 'actionplan.*', 'checkin.*'],
  enterprise: [...gold,   'audit.read', 'apikey.*', 'api.*'],
};
```

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

- New orgs start `trialing` on Gold for 14 days, so the improvement loop is seen before it is
  sold. It is the differentiator; hiding it behind a paywall from day one guarantees nobody
  discovers it.
- On downgrade, data is **retained, not deleted** — the surfaces just stop resolving. A
  re-upgrade restores access to history. Deleting a customer's data on downgrade is how you
  lose a re-upgrade.
- Expiry moves the org to Bronze, never to zero access.

## 8. Endpoints

| Method | Path | Capability | Phase |
|---|---|---|---|
| GET | `/api/v1/billing` | `billing.read` | P2 |
| GET | `/api/v1/billing/usage` | `billing.read` | P2 |
| POST | `/api/v1/billing/tier` | `billing.update` | P3 |

No payment processor in P1–P3. `subscriptions.tier` is set administratively. Integrating
Stripe would demonstrate nothing the middleware chain does not already demonstrate, and it
introduces a webhook surface with real security requirements for zero marks.

**This is a stated limitation, not a hidden one:** the entitlement *architecture* is complete
and enforced; only the payment collection is absent.

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
