# 19 — Platform operators — Endur's own side of the product

Phase: **P2** · Milestone: — · Owns: `src/backend/platform/**`, `src/frontend/pages/platform/**`
Related: `16` (tenancy, tiers, entitlements), `11` (the org permission engine), `12` §3 (principals)
Decisions: `_MEMORY.md` DEC-033, DEC-034 · Resolves: `OPEN-007` · Invariants: **INV-011**, INV-006, INV-010
Pages: `70-PAGE-platform-console.md`, `71-PAGE-platform-analytics.md`, `72-PAGE-platform-logs.md`
Status: **BUILT 2026-08-26 — `T-059`.** The door exists. `platform_users`,
`platform_sessions`, `platform_audit_log`, `organizations.suspended_at`, the `endur.ops`
cookie, `requirePlatform()`, the aggregate-only seam and thirteen routes under
`/api/v1/platform`. **`INV-011` is asserted by a test that tries to select `answers` and
fails**, plus one that tries through a nested `include` and one that tries to write inside a
tenant. `N-058` was checked before starting and it held: the `T-057` dependency was dropped,
not waited out — see `DEC-071`. What is still ahead is what was always behind this door:
`T-066` (`/ops`), `T-067` (`/ops/analytics` and its endpoint), `T-077`/`T-078` (the log
viewer)

**AMENDED 2026-08-31 — `T-109`, `DEC-114`. §15 is new and it supersedes one row of §14.**
An operator may now enter a customer's own console for an hour, under a banner the customer
cannot dismiss, with their powers minted as ordinary grants minus `SUPPORT_DENIED_CAPABILITIES`.
INV-011, DEC-033 and the aggregate seam are untouched — §15.3 is why that is true rather than
merely claimed

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

**Built, and it cost four files rather than four subsystems.** `platform_users` +
`platform_sessions` (`10`), `packages/shared/src/platform-capabilities.ts` (§4),
`src/backend/platform/session.ts` (§7) and `src/backend/platform/db.ts` (§5). The principal
is the fourth arm of `Principal` in `middleware/context.ts` and **the only one with no
`orgId`** — which is what makes every "is there an organisation?" check in the codebase
answer correctly about an operator without being told about operators.

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

Lives in code at `packages/shared/src/platform-capabilities.ts`. **Built as specified —
sixteen now, with the same role columns.** (Ten when this was written; `DEC-074` added
`logs.export`, `DEC-080` split `revenue.read` off `analytics.read`, `DEC-100` added the two
Enterprise verbs, and `DEC-114` added the two support verbs. The count is stated so that a
reader who finds a different number knows the table is what to trust, not this sentence.)
Two tests hold the separation open: one asserts no
`platform.` key is in `CAPABILITY_CATALOGUE`, and one asserts no tier in `TIER_ENTITLEMENTS`
entitles one. The second is the one that matters, because the wildcard expansion is the
mechanism that would sweep them up — an organisation could otherwise **buy** operator
access.

| Capability | `staff` | `owner` | Notes |
|---|---|---|---|
| `platform.org.read` | ✔ | ✔ | The estate list, and one org's **metadata**. Never its content |
| `platform.org.suspend` | — | ✔ | Suspends sign-in for an org. Destructive; owner only |
| `platform.plan.read` | ✔ | ✔ | What an org is on, and since when |
| `platform.plan.override` | ✔ | ✔ | Set a tier administratively — a support action, and the reason `billing.update` must not mean this (§8) |
| `platform.analytics.read` | — | ✔ | **The whole estate at once. Owner only.** Support helps one customer at a time and `platform.org.read` is what that needs (`71` § Route & access) |
| `platform.revenue.read` | — | ✔ | **The money. Owner only** (`DEC-080`). Deliberately not folded into `platform.analytics.read`: DEC-035 collapsed the two when it deleted pricing, and DEC-080 splits them again because they answer different questions — adoption helps a customer, revenue does not |
| `platform.usage.read` | ✔ | ✔ | Seats, campaign counts, response volume — as **numbers** |
| `platform.message.send` | ✔ | ✔ | Contact an org's administrators (`70` §Interactions) |
| `platform.audit.read` | ✔ | ✔ | The platform's own audit trail |
| `platform.logs.read` | ✔ | ✔ | **The rotating application log files** (`18` §2) through `72`. Diagnostics, so support needs it as much as the owner does. Safe under INV-011 **because `18` §3 already guarantees no body, no credential and no respondent identity ever reaches a log line** — the viewer inherits that property, it does not create it |
| `platform.logs.export` | ✔ | ✔ | **A copy of a log file, filtered, as a download** (`72` § Interactions, `DEC-074`). Separate from `platform.logs.read` on purpose: a read is a page on a screen, an export is a file that outlives the session and the retention window, and one capability for both could not be separated later without a migration. Audited as `logs.export` with the file, format, filters and line count |
| `platform.enterprise.read` | — | ✔ | **The Enterprise request queue. Owner only** (`DEC-100`). A customer asking to be sold to is a revenue event, and it is split from `platform.org.read` for the reason `platform.revenue.read` is split from `platform.analytics.read`: staff see every organisation and never need a pipeline |
| `platform.enterprise.update` | — | ✔ | Move a request through `open` → `contacted` → `closed`. **A separate verb**, so the queue could later be shown to somebody who may not work it — the same split `platform.logs.read`/`platform.logs.export` makes |
| `platform.support.enter` | ✔ | ✔ | **Open a customer's own console as a time-boxed support principal** (§15, `DEC-114`). BOTH roles, because this is the support job as §3 describes it — *"is this customer OK?"* cannot be answered from an aggregate. What it confers inside the tenant is decided by the org GRANT engine, not here: the session's powers are minted grants minus `SUPPORT_DENIED_CAPABILITIES` |
| `platform.support.read` | ✔ | ✔ | **The register** — who entered which organisation, why, and when they left. Split from `.enter` for the reason every pair on this surface is split: reading changes nothing, entering is the action that must be attributable. Both roles, so an operator can see their own trail without an owner opening it for them |
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
the `responses` access is `COUNT(*)` and `MAX(submitted_at)`. It cannot select `answers` at all.

**How it is enforced, in `src/backend/platform/db.ts`.** A Prisma extension with three rules,
in order of how much each matters:

| Rule | Effect |
|---|---|
| `Answer` is **unreachable** | Not filtered, not aggregated. The model cannot be addressed in any operation, including a nested `select`/`include` — `campaign.findMany({ include: { responses: { include: { answers: true } } } })` throws, because the args are walked rather than the operation name trusted |
| `Response` answers **aggregates only** | `count`, `aggregate`, `groupBy`. `findMany` and `findFirst` throw. Those two questions — how many, how recently — are what *"is this customer collecting?"* needs, and neither can carry a sentence |
| Everything else is **read-only** | Except `Organization`, `Subscription`, `PlatformUser` and `PlatformAuditLog`. No capability in §4 means "edit a tenant's data", and the two rows an operator IS meant to change are the plan and the suspension |

The failure is a **thrown `PlatformSeamViolation`, never an empty result and never a 403**.
An operator surface that silently returns nothing when asked a forbidden question is a
surface where the forbidden question looks answered — and a tidy 403 is something somebody
later adds to an allowlist. This is a line of code to delete, so it fails like one.

`responses` carries no `org_id` — it is reached through its campaign (`10` §8), which is what
makes `db/tenant.ts`'s *"scoping the parent scopes the child"* true. The estate's two response
numbers are therefore grouped by campaign and folded back per organisation. Both are still
`COUNT(*)` and `MAX()`.

**The support consequence, stated honestly:** when a customer reports *"the results page looks
wrong"*, an operator cannot look at their results. They ask the customer, or the customer
grants a time-boxed in-org account through the normal `person.create` path. That is slower,
and it is the correct trade. Say this out loud in the viva — a deliberate limitation with a
stated reason reads as design; the same limitation discovered by an examiner reads as an
oversight.

## 6. The one thing `owner` cannot do

**Built.** An operator cannot change their **own** role or delete their own account, and an
`owner` cannot silently remove the last other `owner` — the guard refuses when fewer than two
active owners would remain, counting the actor, because only an `owner` holds
`platform.operator.manage` and a platform with one owner who forgets a password has nobody to
reset it.

A platform with one locked-out owner and no recovery path is an outage nobody can fix from inside — the same class of failure as `33`'s
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
| MFA | not in P1–P3 | **required from the start** (§9) — built, TOTP, `mfa_secret` NOT NULL |
| Session store | `sessions` (connect-pg-simple) | **`platform_sessions`**, an opaque id — `DEC-072` |

**A separate cookie name is not tidiness.** One session, two meanings is how privilege
confusion bugs happen: any code path that reads "is there a session?" without asking "which
kind?" becomes a vulnerability the moment the second kind exists. Two names means a
mis-scoped middleware fails closed and loudly rather than open and silently.

**`DEC-072` — a second cookie name, but NOT a second `express-session`.** Mounting one would
have reintroduced the exact failure this section names: `req.session` is single-valued, so two
instances both write it and whichever ran last wins. The second name would have been
decoration over a shared object. Instead the store is `platform_sessions`, the id is 32 random
bytes held server-side, and `src/backend/platform/session.ts` is the only file in the codebase
that reads `endur.ops` at all. The cookie is **path-scoped to `/api/v1/platform`** and lives
12 hours rather than the staff session's 7 days.

The consequence is the property this section wants: `authenticate` cannot attach an operator
by accident, because it reads `req.session` and an operator never has one. An operator
reaching `/api/v1/home` gets `UNRESOLVED_TENANT` — refused before a handler runs, not served
an empty result.

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

**Built, and it is not a dependency after all.** `src/backend/platform/totp.ts` is RFC 6238 in
forty lines of `node:crypto` — an HMAC, a counter and a modulo. A package for that is a supply
chain larger than the thing it supplies. `mfa_secret` is **NOT NULL**, so there is no
"MFA not configured yet" state for a login to fall through; ±1 step of clock drift is
accepted; the comparison is constant-time; and **login answers one message for all three
failures**, because an attacker who learns the password was right has learned the password.

`npm run ops:code -w @endur/api` prints the current code for each seeded operator. It refuses
to run in production — anything that can print a code can bypass the second factor — and it
exists so MFA is a feature to demonstrate rather than an obstacle to apologise for.

## 10. Data model

Added to `10-DATA-MODEL.md`'s schema; specified here because this document owns the surface.

```
platform_users        id · email(citext, unique) · password_hash · name
                      role('owner'|'staff') · status · mfa_secret · last_login_at
                      -- NO org_id. That absence is the design.

platform_sessions     id(opaque, 32 random bytes) · operator_id -> platform_users
                      · expires_at · created_at
                      -- DEC-072. NOT the `sessions` table and NOT a second express-session:
                      -- req.session is single-valued, so two instances fight over it, which
                      -- is the very privilege confusion §7 mounts a second cookie to prevent.

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

`organizations` gains one column, and it belongs to this document rather than to `10`:

```
organizations.suspended_at  timestamptz null
                      -- §6, 70. Set by platform.org.suspend, owner only. DEC-073 enforces
                      -- it in tenantResolver ON THE RESOLUTION SOURCE: a tenant resolved
                      -- FROM THE SESSION is refused, one resolved from a respondent token
                      -- is not. That is the only place in the codebase that knows the
                      -- difference, and it is the whole of "cuts staff, not respondents".
```

`subscriptions` (`16`, existing) is unchanged in shape and gains the rows it never had —
see `D-012`, which records that nothing has ever written one. **`T-088` repaid that on
24 Aug**, so the estate list reads a real tier off a real row.

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

| Method | Path | Capability | |
|---|---|---|---|
| POST | `/platform/auth/login` | — · rate limited hard (5 / 15 min, per IP+email), MFA | ✅ |
| POST | `/platform/auth/logout` | — | ✅ |
| GET | `/platform/me` | — · the operator and their role | ✅ |
| GET | `/platform/orgs` | `platform.org.read` · the estate, paginated, filterable by tier and status | ✅ |
| GET | `/platform/orgs/:id` | `platform.org.read` · metadata and counts. **No content** | ✅ |
| POST | `/platform/orgs/:id/plan` | `platform.plan.override` | ✅ |
| POST | `/platform/orgs/:id/suspend` | `platform.org.suspend` | ✅ |
| GET | `/platform/stats` | `platform.usage.read` · estate-wide counts, `71` §2 | ✅ |
| GET | `/platform/analytics` | `platform.analytics.read` · `71` | **`T-067`** |
| GET | `/platform/earnings` | `platform.revenue.read` · `71` § Revenue | **`T-058`** |
| POST | `/platform/orgs/:id/message` | `platform.message.send` · `70` §Interactions | ✅ |
| GET | `/platform/audit` | `platform.audit.read` | ✅ |
| GET | `/platform/logs` · `/platform/logs/:file` | `platform.logs.read` · `72`. The file list, and one file tailed or filtered | **`T-077`** |
| GET | `/platform/logs/:file/export` | `platform.logs.export` · `72`, `DEC-074`. One file, same filters, chronological, as an `ndjson` or `csv` attachment | **`T-090`** |
| GET/POST/PATCH | `/platform/operators` | `platform.operator.manage` | ✅ |

**The chain under this prefix is different from every other router's, and each difference is
a requirement (§9):** no `tenantResolver` (nothing to resolve), no `authenticate` (it reads
`req.session` and would attach a `user`), no `csrfProtection` (`endur.ops` is `sameSite:
'lax'`, so a cross-site POST carries no cookie and arrives as a stranger — the same argument
`chains.ts` makes for the respondent surface, from the cookie rather than from the chain).
`requirePlatformAuth()` replaces all three, mounted once above the routes so a route added
later cannot be added unauthenticated by omission.

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

`src/backend/test/platform.test.ts`, 17 tests.

- [x] A `platform` principal calling any `/api/v1/*` tenant route is refused — not served an
      empty result, **refused** (`UNRESOLVED_TENANT`: the cookie is not even sent)
- [x] An org `user` principal calling any `/api/v1/platform/*` route gets 401, whatever they
      hold in `grants`
- [x] No string beginning `platform.` appears in `CAPABILITY_CATALOGUE`, asserted by a test
- [x] No `platform.` capability is reachable from the powers grid or from `TIER_ENTITLEMENTS`
- [x] Granting an org administrator every capability in `11` §3 gives them no platform access
      (the founder holds all of them, and it buys nothing)
- [x] **The platform client cannot select `answers`** — asserted by a test that tries, twice:
      directly and through a nested `include`
- [x] `/platform/orgs/:id` returns counts and no response content, verified field by field —
      the key list is asserted exactly, and the serialised body is checked for content keys
- [x] Every operator mutation writes a `platform_audit_log` row in the same transaction
- [x] An operator cannot change their own role, and the last `owner` cannot be removed
- [x] Two sessions with two cookie names coexist in one browser without either being confused
      for the other
- [x] **No route carries both `requireCapability` and `requirePlatform`** — `routes.test.ts`,
      added at `T-059`. §9 said "must never", and "must never" without a test is a comment
- [x] `/platform/logs/:file` accepts only names matching the log-file pattern and cannot be
      made to read a file outside `LOG_DIR` — asserted with `../`, an absolute path, a
      URL-encoded traversal and a symlink · **`T-077`**, `platform-logs.test.ts`, "the file
      name is the whole attack surface"

## 13b. What T-059 did not build, and why

| Not built | Why, and who owns it |
|---|---|
| `GET /platform/analytics` | **`T-067`.** `71`'s four decisions *"are the point of the task"* — what movement means, what a quiet organisation is, counts and never money. Implementing the endpoint here would have decided them in a service file rather than in the doc that argues them |
| `GET /platform/logs`, `/platform/logs/:file` | **BUILT 2026-08-25, `T-077`**, with `72`'s three-way path guard. The reader, guard and parser live at `src/backend/platform/logs/` per `_MEMORY.md`'s MAP; the routes call it through `service.ts` the same way every other platform route calls its logic |
| Email delivery for `POST /orgs/:id/message` | There is no mail transport in this product and inventing one here would be a feature nobody asked for. **The record is built and it is the half `70` argues for**: *"the next operator can see the conversation"*. Recipients are resolved server-side, the subject and body are stored, and `/platform/audit` is where they are read |
| A cached `subscriptions.seats` | **`T-057`.** Seats are computed live from `16` §5's formula instead — see `DEC-071` for why reading the never-written column would have been worse than not showing the number |
| Any `/ops` screen | **`T-066`**, `T-067`, `T-078`. Everything above is reachable today with `curl` and a cookie, which is exactly what "the door exists" means |

## 14. Out of scope

| Not building | Why |
|---|---|
| A permission grid for operators | Two fixed roles. A second GRANT engine for a four-person team is the definition of over-engineering, and it invites confusion with the real one |
| ~~Operator impersonation ("log in as this customer")~~ | **SUPERSEDED 2026-08-31 by `DEC-114`. See §15.** The row's objection was right and it was *narrow*: it refused an Endur employee **reading feedback**, not an operator entering. §15 builds the entering and removes the reading — `SUPPORT_DENIED_CAPABILITIES` resolves as `deny` grants that INV-004 makes unbeatable. It is also not impersonation: the operator acts **as themselves**, in a row under their own name, so no real person's audit trail is ever made to say something they did not do |
| Payment processing | `16` §10 already rejects it and nothing here changes that. Prices, plans and revenue are recorded; money is not moved |
| Self-serve operator signup | Operators are created by an `owner`. There is no public path in |
| Prices, amounts, currency, per-customer pricing | **DEC-035 — there is no pricing in Endur at all.** A tier is joined with a button (`49`); nothing collects, stores or displays an amount |

---

## 15. Support access — an operator inside a customer's console

Phase: **P2** · Task: **`T-109`** · Decision: **`DEC-114`** · Status: **BUILT 2026-08-31**

> **A platform operator may open a time-boxed session inside a customer's own console. Their
> powers there are GRANTS resolved by the ordinary engine — never a bypass — minus
> `SUPPORT_DENIED_CAPABILITIES`, which is INV-011 restated for a much wider door.**

### 15.1 Why this exists, given §14 said it would not

§14's row refused *"log in as this customer"*, and the sentence it refused with is the one to
read carefully:

> *"no amount of consent UI makes an Endur employee **reading feedback** compatible with what
> `01` §6 promises."*

The objection is to **reading feedback**. It is not to entering. §5 had already conceded the
consequence in words and named the workaround in the same breath:

> *"when a customer reports 'the results page looks wrong', an operator cannot look at their
> results. They ask the customer, or **the customer grants a time-boxed in-org account through
> the normal `person.create` path**."*

That workaround **is this feature, done by hand and done badly**. It is an account the customer
has to create, that nobody remembers to revoke, that costs them a seat, that appears in their
People list and in every audience built from it, and whose audit rows name a person rather than
an Endur employee. Building it properly is strictly safer than the path §5 already sanctioned.

The requirement that forced the question came from outside: **every workflow in the product must
be reachable by the superuser.**

### 15.2 The three properties that make it a different thing

| Property | Mechanism | Why it is load-bearing |
|---|---|---|
| **The operator acts as themselves** | A synthetic `users` row per operator per organisation, under their own name, `status = 'support'`, no password hash, **no person node** | This is what makes it not impersonation. Acting as a named customer makes that person's audit trail a lie, and that is the half of "log in as" that can never be made safe |
| **The customer is told, and cannot be untold** | `<SupportBanner>` in `<AppShell>`, above the top bar, undismissable, carrying the operator's name and their typed reason verbatim | An operator working invisibly inside somebody's account is a different feature and it is still not built |
| **It stops by itself** | One hour, in the row, checked **in the query** on every request | *"Remember to press Leave"* is not a control, for the same reason a position carries `validTo` rather than a revocation reminder |

### 15.3 The powers are grants, and that is the whole design

The obvious implementation is four lines in `requireCapability`:

```ts
if (req.ctx.principal.support) return next();   // ← never written, on purpose
```

That is wrong twice. It is a **second permission model**, and a second permission model drifts
from the first the moment either changes (`N-005`, one layer down). And it is silently **total**
— every capability shipped afterwards would be held by an operator without anybody deciding
that it should be.

So the powers are expressed in the product's own vocabulary instead. `authz/support.ts` mints
candidate grants; `authz/collect.ts` returns them on the **no-person-node branch**, which every
real member of every organisation never reaches; `resolve()` runs unchanged. Every property the
engine already has then applies for free:

- **INV-004** — a deny beats an allow unconditionally, so the deny list is *inescapable* rather
  than "checked in the places we remembered".
- **INV-007** — the audit row records which grant decided it, so a customer's own log
  distinguishes *"Endur support changed this"* from *"Endur support was refused this"*.
- **`42`** — the simulator explains a support refusal in the same sentence shape it explains
  every other refusal in the product.

Both the allow **and** the deny are minted for a denied capability. Omitting the allow would
refuse the request too, with `no_grant` — *"nobody gave you this at all"* — which is the wrong
sentence: it sends an operator hunting a customer's powers grid for a row that must never exist.
`explicit_deny` is the true and permanent answer.

### 15.4 What an operator still cannot do — `SUPPORT_DENIED_CAPABILITIES`

Ten capabilities, in `packages/shared/src/support.ts`, in three groups denied for three
different reasons.

| Group | Capabilities | Why |
|---|---|---|
| **Feedback content** | `response.read` · `response.export` · `results.read` · `results.export` · `analysis.read` | INV-011 restated for the console. This is the thing we sell |
| **Personal content** | `reflection.read` · `actionplan.read` · `checkin.read` | `44` describes these as a private loop between two named people. *"Endur can read your 1:1 notes"* is the same broken promise wearing a different noun |
| **Irreversible or financial** | `org.delete` · `billing.update` | Neither is a support action. The operator's own surface has the right verb for the second (`platform.plan.override`, which takes no money and writes no `payments` row), and there is no right verb for the first |

**A DENY LIST, NOT AN ALLOW LIST**, and the direction is the decision. An allow list is a thing
somebody forgets to add to: ship a capability, the operator silently does not hold it, that
reads as a bug, and it gets "fixed" by widening. A deny list fails the other way — ship a
capability and they hold it, and the only ones they do not hold are the ones somebody wrote
down, with a reason, in the file a reviewer opens. **To widen it, delete a line.**

### 15.5 What is deliberately not built

| Not building | Why |
|---|---|
| A consent prompt the customer approves | The organisation that most needs help — suspended, locked out, nobody reading the email — is the one nobody could then reach. Disclosure after the fact, on every page, in an audited register, is both the stronger control and the reachable one |
| A customer-side "eject this operator" button | Ending somebody else's session is an action with a target, so it is a capability question — and inventing `support.revoke` puts a customer's staff in the position of cutting the operator off mid-fix on the one screen where the fix is happening. **The hour is the control they have**, and it is printed on the strip beside the disclosure |
| Widening `platform/db.ts` | `User` and `SupportSession` are **not** in `WRITABLE_MODELS`. The allowlist is not per-function: adding `User` there would make `user.create` reachable from every handler in a 900-line file forever. One operation, one file — `db/support.ts`, which says so at the top |
| A support session that can answer a campaign | `requireMembership` refuses one explicitly. An operator's answers inside a customer's results would be permanent and, by INV-006, unidentifiable for removal |

### 15.6 Routes

| Route | Capability | Notes |
|---|---|---|
| `POST /platform/orgs/:id/support-session` | `platform.support.enter` | `reason` is **required, min 10 characters, no default**. Regenerates the session (fixation), sets `endur.sid` + `endur.csrf`, writes the row and the platform audit entry. Answers `{ session, redirectTo, deniedCapabilities }` — a **path**, never a token |
| `POST /platform/support-session/leave` | *(none — see below)* | Ends the row **before** destroying the session, so the access is gone even if the destroy fails |
| `GET /platform/support-sessions` | `platform.support.read` | The register. Still INV-011: names, dates and one sentence the operator typed |

**Leave carries no capability**, and it is allowlisted in `routes.test.ts` with that reason:
giving up access can never be the thing somebody is not permitted to do, and gating it on
`platform.support.enter` would trap an operator whose role changed mid-session. It is the
platform twin of `POST /auth/logout`, which is unguarded one surface over for the same reason.

**No route here carries both guards.** §9's hardest rule is intact: the enter route is a
platform route answering a platform question — *"may this operator open a session"* — and every
question afterwards is asked on a different route by `requireCapability`, exactly as it is for
the customer's own staff. That the response sets a tenant cookie does not make it a tenant route.

### 15.7 Acceptance

- [x] An operator inside the console can create a role, a unit, a person, a campaign — the
      customer's own work · `support-access.test.ts`
- [x] **And cannot read one line of their feedback.** The test walks
      `SUPPORT_DENIED_CAPABILITIES` rather than a hardcoded route, so deleting an entry fails
      here rather than quietly becoming readable
- [x] A denied capability answers `explicit_deny` with `decidedBy.via === 'support'`, and the
      trace shows the allow that lost — **INV-004, demonstrated**
- [x] The **customer's own staff** are told, from a live row rather than from their session
- [x] No seat, no person node, no audience membership, and no way to sign in through
      `POST /auth/login`
- [x] Leave takes effect on the **next request**; expiry needs no Leave
- [x] The customer's own `audit_log` names the operator, with `decidedBy.via = 'support'`
- [x] A support session reaches a **suspended** organisation, which the customer's own staff
      cannot — the one carve-out in `tenantResolver`, because the moment a customer most needs
      somebody from Endur is the moment they have been cut off
- [x] `platform.support.*` is absent from `CAPABILITY_CATALOGUE`, so no tier can entitle it
