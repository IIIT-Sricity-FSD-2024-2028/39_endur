# 19 — Platform operators — Endur's own side of the product

Phase: **P2** · Milestone: — · Owns: `src/backend/platform/**`, `src/frontend/pages/platform/**`
Related: `16` (tenancy, tiers, entitlements), `11` (the org permission engine), `12` §3 (principals)
Decisions: `_MEMORY.md` DEC-033, DEC-034 · Resolves: `OPEN-007` · Invariants: **INV-011**, INV-006, INV-010
Pages: `70-PAGE-platform-console.md`, `71-PAGE-platform-analytics.md`

---

## 1. Purpose

Everything else in `architecture/` describes the product **a customer** uses. This describes
the product **we** use: who at Endur can see the estate of organisations, who can change what
a customer is paying, and who talks to a customer's administrator.

It exists as its own document because it is the only surface in the system that is
**deliberately cross-tenant**, and every other document assumes the opposite.

## 2. Why this could not be a grant, and what happens if you try

The obvious implementation — an `is_superuser` flag on `users`, or a role holding every
capability — is wrong, and it is wrong three times over. Each of these is a mechanism the
product already has, and each one is org-shaped **by construction, not by omission**:

| Mechanism | Why it cannot express an operator |
|---|---|
| `GrantScope` | The widest scope is `all`, which means *this entire organisation*. There is nothing above it, and INV-005 ties powers to the unit of an assignment — which is inside an org by definition |
| `tenantClient` (`db/tenant.ts`) | Stamps `orgId` onto every read and every create. A service **cannot express** a cross-tenant query, and lint forbids importing the raw client outside that one seam |
| INV-010 | An `orgId` may only arrive from `tenantResolver`. A "platform" request has no single org for it to resolve |

Those three are not obstacles to route around. They are the isolation guarantee we sell
(`16` §1, `52`), and the whole value of `db/tenant.ts` is that **forgetting is impossible**.
Adding a bypass that ordinary services could reach would convert a structural guarantee back
into a remembered one — which is exactly the trade `D-003` already regrets making once.

> **DEC-033 — A platform operator is a separate principal kind with a separate account
> table, a separate authentication surface, a separate capability catalogue, and a separate
> database seam. It is never a `User`, never a `Grant`, and never a flag.**

The cost is one more of several things. The benefit is that an org administrator, no matter
what they are granted, **cannot become an operator** — because there is no grant that means
it and no column that says it.

## 3. The two operator roles

The user asked for two and they are genuinely different jobs, not two levels of one job.

| Role | Who | Answers |
|---|---|---|
| **`owner`** — superuser | Us, the people who own the business | *Is this working as a business?* Revenue, plan mix, growth, churn, seat trends |
| **`staff`** — platform admin | Whoever runs support and operations | *Is this customer OK?* Org health, plan changes, contacting an organisation's administrators |

Deliberately **two roles and not a grid.** A permission engine for a four-person internal team
is over-engineering, and the product already contains one excellent permission engine that this
one must not be confused with. Two named roles with a fixed capability set each is legible in a
way a second GRANT resolver would not be.

`owner` is a strict superset of `staff` **except for one thing**: see §6.

## 4. The platform capability catalogue

**Separate from `11` §3, and it must stay separate.** If these strings entered
`CAPABILITY_CATALOGUE`, then the per-module wildcard expansion `TIER_ENTITLEMENTS` uses would
sweep them up,
the powers grid (`33`) would render them as assignable rows, and an org administrator could be
granted `platform.analytics.read`. That is not a hypothetical — it is exactly the shape of the
hole `billing.update` has today (§8).

Lives in code at `packages/shared/src/platform-capabilities.ts`.

| Capability | `staff` | `owner` | Notes |
|---|---|---|---|
| `platform.org.read` | ✔ | ✔ | The estate list, and one org's **metadata**. Never its content |
| `platform.org.suspend` | — | ✔ | Suspends sign-in for an org. Destructive; owner only |
| `platform.plan.read` | ✔ | ✔ | What an org is on, and since when |
| `platform.plan.override` | ✔ | ✔ | Set a tier administratively — a support action, and the reason `billing.update` must not mean this (§8) |
| `platform.analytics.read` | — | ✔ | **The whole estate at once. Owner only.** Support helps one customer at a time and `platform.org.read` is what that needs (`71` § Route & access) |
| `platform.usage.read` | ✔ | ✔ | Seats, campaign counts, response volume — as **numbers** |
| `platform.message.send` | ✔ | ✔ | Contact an org's administrators (`70` §Interactions) |
| `platform.audit.read` | ✔ | ✔ | The platform's own audit trail |
| `platform.operator.manage` | — | ✔ | Create, disable and re-role operator accounts |

Naming rule matches `11` §3 — `platform.<object>.<verb>` — with the `platform.` prefix as the
thing that makes a mistaken merge into the org catalogue visibly wrong at a glance.

## 5. INV-011 — what an operator may never see

> **INV-011 · A platform operator can read counts, never content. No operator capability,
> in any role, resolves to a response body, an answer, a free-text comment, or a respondent
> identity — and this is enforced by the platform client returning aggregates only, not by
> a UI that declines to render them.**

This is the load-bearing constraint of the entire document and it is not negotiable, because
it is the thing we sell. `01` §6 and `52` promise that feedback is private to the organisation
that collected it; INV-006 puts anonymity in SQL specifically so that no view can undo it. An
Endur employee with a "read any response" button would make every one of those claims false,
and the fact that they'd need a reason to click it is not a control.

**Practically:** a `platform` principal's database seam exposes counts, sums, and grouped
aggregates over `organizations`, `subscriptions`, `nodes`, `campaigns` and `responses` — and
the `responses` access is `COUNT(*)` and `MAX(created_at)`. It cannot select `answers` at all.

**The support consequence, stated honestly:** when a customer reports *"the results page looks
wrong"*, an operator cannot look at their results. They ask the customer, or the customer
grants a time-boxed in-org account through the normal `person.create` path. That is slower,
and it is the correct trade. Say this out loud in the viva — a deliberate limitation with a
stated reason reads as design; the same limitation discovered by an examiner reads as an
oversight.

## 6. The one thing `owner` cannot do

An operator cannot change their **own** role or delete their own account, and an `owner`
cannot silently remove the last other `owner`. A platform with one locked-out owner and no
recovery path is an outage nobody can fix from inside — the same class of failure as `33`'s
lockout guard, which already exists for exactly this reason and whose reasoning transfers
directly.

## 7. Authentication — a separate surface

| | Org staff (`15` §2) | Platform operator |
|---|---|---|
| Table | `users` | **`platform_users`** |
| Login path | `POST /api/v1/auth/login` | **`POST /api/v1/platform/auth/login`** |
| Cookie | `endur.sid` | **`endur.ops`** |
| Principal kind (`12` §3) | `user` | **`platform`** |
| Tenant | resolved by `tenantResolver` | **none — `req.ctx.orgId` stays `undefined`** |
| MFA | not in P1–P3 | **required from the start** (§9) |

**A separate cookie name is not tidiness.** One session, two meanings is how privilege
confusion bugs happen: any code path that reads "is there a session?" without asking "which
kind?" becomes a vulnerability the moment the second kind exists. Two names means a
mis-scoped middleware fails closed and loudly rather than open and silently.

`platform_users` is a separate table for the same reason `users` cannot host it: `users` is
`@@unique([orgId, email])` with `orgId` non-null, so an operator would need a fake home
organisation — and that fake org would then appear in the estate list, the revenue figures and
the seat count. `CONF-013`'s cross-tenant lockout is what that class of shortcut looks like
when it goes wrong.

## 8. `billing.update` — the hole, and what DEC-035 did to it

`16` §8 puts `POST /billing/tier` behind `billing.update`, which is an **org** capability
(`11` §3, Platform module). As written, an organisation administrator can be granted the power
to set their own tier — a free upgrade to Enterprise in a product whose revenue model is tiers.
**DEC-034** closed that by splitting the capability: `billing.update` meant *start a checkout*,
and the tier write happened server-side on completion.

> **DEC-035 supersedes that split.** With no prices and no checkout (`49`), there is no
> server-side completion for the write to hide behind, and `billing.update` writes
> `subscriptions.tier` directly. **A self-upgrade is now the intended behaviour, not a hole** —
> there is nothing to defraud.

What still holds, and it is the part that was always load-bearing: `billing.update` is a
**capability**, so it is grantable, denyable, deny-wins (INV-002) and audited, and the default
matrix (`11` §8) seeds it to administrators only. The decision of who may change a plan is
still made by the resolver in middleware, never in a handler.

Two capabilities, two meanings, and the one that touches *another* organisation is still not
reachable from inside a tenant at all:

| Action | Who | Capability |
|---|---|---|
| See our plan and usage | Org administrator | `billing.read` |
| **Join a tier — ours** | Org administrator | `billing.update` |
| Set a tier — **anyone's** | Endur operator | `platform.plan.override` |

## 9. The middleware — `requirePlatform()`

A fourth guard alongside `requireCapability` and `requireEntitlement`, in the same style and
for the same reason: authorisation is decided in middleware, never in a handler (INV-003).

```ts
platformRouter.post(
  '/orgs/:id/plan',
  requirePlatformAuth(),                  // principal.kind === 'platform', or 401
  validate(OverridePlanDto),
  requirePlatform('platform.plan.override'),
  platformAudit('plan.override'),
  setPlan,
);
```

Ordering constraints, added to `12` §5:

- `requirePlatformAuth` runs **after** the session load and **instead of** `tenantResolver` —
  a platform route has no tenant, and reaching `tenantResolver` with no org is what would
  produce a confusing 400 rather than a clean 401
- `requirePlatform` runs **after** `validate` and **before** any handler, exactly as
  `requireCapability` does
- **`requireCapability` and `requirePlatform` must never both appear on one route.** A route
  is either a tenant route or a platform route. Both is a route whose authorisation model
  nobody can state in one sentence, which is `12` §1's whole argument

**A `platform` principal fails `requireCapability` closed**, and a `user` principal fails
`requirePlatform` closed. Neither is a superset of the other — they are different systems and
the guards say so.

### MFA, and why it is not deferred like everything else

Every other security nicety in this project is honestly scoped out for a course project. This
one is not, because a single stolen operator password exposes the plan and revenue data of
**every customer at once** rather than one tenant. TOTP, at operator login only. It is a
small, well-understood dependency and the blast radius argument is the whole justification.

## 10. Data model

Added to `10-DATA-MODEL.md`'s schema; specified here because this document owns the surface.

```
platform_users        id · email(citext, unique) · password_hash · name
                      role('owner'|'staff') · status · mfa_secret · last_login_at
                      -- NO org_id. That absence is the design.

platform_audit_log    id · actor_id -> platform_users · action · target_org_id(nullable)
                      · payload(jsonb) · request_id · created_at
                      -- SEPARATE from audit_log, whose org_id is NOT NULL and whose rows
                      -- belong to the customer. An operator's actions are OUR record,
                      -- and mixing them would put Endur's internal activity inside a
                      -- customer's exportable audit trail.

-- NO plan_prices TABLE. DEC-035 removed pricing from the product: a tier is joined
-- with a button and no amount exists anywhere to version. This absence is deliberate
-- and is recorded here because an earlier revision of this document specified the
-- table; if it reappears, it is a supersession and needs saying out loud.
```

`subscriptions` (`16`, existing) is unchanged in shape and gains the rows it never had —
see `D-012`, which records that nothing has ever written one.

> **DEC-035 — Endur has no prices.** `16` §2 names four tiers and states no price, and it now
> never will: an organisation **joins** a tier from `49` with one click, `POST /billing/tier`
> writes `subscriptions.tier`, and the entitlement gate (`16` §3) answers differently from the
> next request. The seat meter still meters and the gate still gates — those were always the
> interesting parts. What is gone is a checkout, a processor, an invoice and a price list, none
> of which would have demonstrated anything the middleware chain does not already demonstrate.

## 11. Endpoints

Added to `13-API-CONTRACT.md` §3. Prefix `/api/v1/platform`, and **every route under it is
platform-only** — a single prefix is what makes the surface greppable and what lets the
route-enumeration test (`12` §7) assert that no `platform.` capability appears anywhere else.

| Method | Path | Capability |
|---|---|---|
| POST | `/platform/auth/login` | — · rate limited hard, MFA |
| POST | `/platform/auth/logout` | — |
| GET | `/platform/me` | — · the operator and their role |
| GET | `/platform/orgs` | `platform.org.read` · the estate, paginated, filterable by tier and status |
| GET | `/platform/orgs/:id` | `platform.org.read` · metadata and counts. **No content** |
| POST | `/platform/orgs/:id/plan` | `platform.plan.override` |
| POST | `/platform/orgs/:id/suspend` | `platform.org.suspend` |
| GET | `/platform/stats` | `platform.usage.read` · estate-wide counts, `71` §2 |
| GET | `/platform/analytics` | `platform.analytics.read` · `71` |
| POST | `/platform/orgs/:id/message` | `platform.message.send` · `70` §Interactions |
| GET | `/platform/audit` | `platform.audit.read` |
| GET/POST/PATCH | `/platform/operators` | `platform.operator.manage` |

## 12. The vocabulary exception

INV-001 says no user-facing domain noun is hardcoded. **The platform console is exempt, and
the exemption is principled rather than convenient:** `22` §1 already establishes that Endur's
own furniture stays literal — Home, Settings, Templates — because it describes *the product*,
not *the customer's world*. The platform console is entirely Endur's own furniture. Its readers
are four people who work here, it has no `organization.labels` to resolve against, and it
legitimately says "Organizations", "Revenue" and "Plan".

**This requires a narrowing in `audit:vocab`**, which scans `src/frontend/pages/**`. Add
`src/frontend/pages/platform/` to the exclusion list, in the same spirit and for the same
stated reason as `presets/` and `database/` (`N-049`): a check that fires on correct code is a
check people learn to route around.

## 13. Acceptance

- [ ] A `platform` principal calling any `/api/v1/*` tenant route is refused — not served an
      empty result, **refused**
- [ ] An org `user` principal calling any `/api/v1/platform/*` route gets 401, whatever they
      hold in `grants`
- [ ] No string beginning `platform.` appears in `CAPABILITY_CATALOGUE`, asserted by a test
- [ ] No `platform.` capability is reachable from the powers grid or from `TIER_ENTITLEMENTS`
- [ ] Granting an org administrator every capability in `11` §3 gives them no platform access
- [ ] **The platform client cannot select `answers`** — asserted by a test that tries
- [ ] `/platform/orgs/:id` returns counts and no response content, verified field by field
- [ ] Every operator mutation writes a `platform_audit_log` row in the same transaction
- [ ] An operator cannot change their own role, and the last `owner` cannot be removed
- [ ] Two sessions with two cookie names coexist in one browser without either being confused
      for the other

## 14. Out of scope

| Not building | Why |
|---|---|
| A permission grid for operators | Two fixed roles. A second GRANT engine for a four-person team is the definition of over-engineering, and it invites confusion with the real one |
| Operator impersonation ("log in as this customer") | The single most useful support feature and the single most dangerous. It is INV-011 with extra steps, and no amount of consent UI makes an Endur employee reading feedback compatible with what `01` §6 promises |
| Payment processing | `16` §10 already rejects it and nothing here changes that. Prices, plans and revenue are recorded; money is not moved |
| Self-serve operator signup | Operators are created by an `owner`. There is no public path in |
| Prices, amounts, currency, per-customer pricing | **DEC-035 — there is no pricing in Endur at all.** A tier is joined with a button (`49`); nothing collects, stores or displays an amount |
