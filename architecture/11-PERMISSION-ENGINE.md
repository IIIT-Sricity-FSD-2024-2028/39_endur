# 11 — Permission engine

Phase: P1 · Milestone: M0 · Owns: `src/backend/authz/**`
Decisions: `_MEMORY.md` DEC-002, DEC-039, DEC-044 · Invariants: INV-003, INV-004, INV-005, **INV-012**
Source: `design_specs/customization.md` §5

This is the novelty claim and the reason the middleware chain is worth grading. Read it
before `12-MIDDLEWARE-STACK.md`.

---

## 1. What it answers

> **Can this principal perform this capability on this target, right now — and which rule
> decided it?**

The second half matters as much as the first. Every decision returns a **trace**. The trace
powers the 403 body, the audit row, and the simulator (`42-PAGE-permission-simulator.md`).
A resolver that returns a bare boolean cannot support any of the three.

## 2. The three inputs

```ts
type Principal =
  | { kind: 'user';       userId: string; orgId: string }
  | { kind: 'apiKey';     keyId: string;  orgId: string; scopes: string[] }
  | { kind: 'respondent'; campaignId: string; orgId: string };

type Target =
  | { kind: 'org' }
  | { kind: 'unit';     unitId: string }
  | { kind: 'person';   userId: string }
  | { kind: 'subject';  subjectId: string }
  | { kind: 'campaign'; campaignId: string }
  | { kind: 'self' };

type Capability = string;   // from the catalogue, §3
```

Respondents resolve trivially: they may submit to their own campaign and nothing else. They
never reach the grant tables at all (DEC-009). API keys resolve against their declared
`scopes` intersected with the org's entitlements (`16`).

---

## 3. The capability catalogue

**The catalogue is defined by the application, never by the user** (`customization.md` §3).
Administrators assign existing verbs to their own role names; they never invent verbs.
Bounded verbs plus unbounded structure is the whole reason the UI can stay simple — unbounded
verb creation would mean an unbounded interface.

Canonical list. Lives in code at `packages/shared/src/capabilities.ts`; this table and that
file must agree (`DRIFT-004`).

| Module | Capability | Notes | Phase |
|---|---|---|---|
| **Organisation** | `org.read` | | P1 |
| | `org.update` | name, industry, labels | P1 |
| | `org.delete` | danger zone | P2 |
| **Structure** | `unit.read` | | P1 |
| | `unit.create` `unit.update` `unit.delete` | | P1 |
| | `unit.reparent` | separate: it moves people's scope | P2 |
| **Roles** | `role.read` `role.create` `role.update` `role.delete` | | P1 |
| **Powers** | `grant.read` | view the powers grid | P2 |
| | `grant.update` | **edit who can do what.** The most dangerous capability in the system | P2 |
| **People** | `person.read` `person.create` `person.update` `person.delete` | `self`-scoped variants of the first two are seeded to **every** role — they are what make `/app/profile` (`47`) openable | P1 |
| | `person.import` | CSV | P2 |
| | `assignment.create` `assignment.delete` | give / remove a position. **Bounded by §5b** | P1 |
| **Accounts** | `account.create` | Provision a sign-in for an existing person — mints a one-time activation link, never a password (`57`). **Bounded by §5b** | P2 |
| | `account.revoke` | Disable an account and end its sessions. The person and their positions survive | P2 |
| | `account.reset` | Re-issue activation for someone who never activated or lost access | P2 |
| **Groups** | `group.read` `group.create` `group.update` `group.delete` | committees, teams | P2 |
| **Delegation** | `delegation.read` `delegation.create` `delegation.revoke` | stand-ins | P2 |
| **Subjects** | `subject.read` `subject.create` `subject.update` `subject.archive` | | P1 |
| **Templates** | `template.read` `template.create` `template.update` `template.delete` | | P1 |
| | `template.clone` | library → org | P1 |
| **Campaigns** | `campaign.read` `campaign.create` `campaign.update` `campaign.delete` | | P1 |
| | `campaign.launch` | mints the public token — irreversible | P1 |
| | `campaign.close` | | P1 |
| **Results** | `response.read` | individual responses / comments | P1 |
| | `response.export` | | P2 |
| | `results.read` | aggregates | P1 |
| | `results.export` | | P2 |
| **Trust** | `simulator.run` | "why was this allowed?" | P2 |
| | `audit.read` | The organisation's own activity log, `56`. Reads allows **and denies** (DEC-041) | P2 |
| **Platform** | `apikey.read` `apikey.create` `apikey.revoke` | Enterprise only | P3 |
| | `billing.read` `billing.update` | | P2 |
| **Improve** | `reflection.create` `reflection.read` | | P3 |
| | `actionplan.create` `actionplan.read` | | P3 |
| | `checkin.create` `checkin.read` | | P3 |
| **Analyze** | `analysis.read` | | P3 |

Naming rule: `<object>.<verb>`, lowercase, singular object. A page doc may not use a string
absent from this table — add it here first (`README.md` ground rule 3).

### What is NOT in this table — platform capabilities

**Capabilities carrying the `platform.` prefix are a separate catalogue and must never be
merged into this one.**
They live in `packages/shared/src/platform-capabilities.ts` and are specified by
`19-PLATFORM-OPERATORS.md` §4.

This is not filing tidiness. Everything in the table above is **grantable**: it can be assigned
to a role in the powers grid (`33`), it is swept up by the per-module wildcard expansion
`TIER_ENTITLEMENTS` uses (`16` §3), and it is resolved per-request against the `grants` table by
the algorithm in §5. A
platform capability must be none of those things — an organisation administrator holding
`platform.analytics.read` would be able to read the whole estate at once, and there would be no
bug to point at, because the grant system would have worked exactly as designed.

Two catalogues, two resolvers, two guards: `requireCapability()` reads this table, and
`requirePlatform()` reads that one. **A route carries one or the other and never both**
(`19` §9). `packages/shared` asserts the two sets are disjoint, and the route-enumeration test
(`12` §7) asserts no `platform.` string appears outside `/api/v1/platform/*`.

### Parameterised capabilities

`grants.params` lets one capability carry different strength at different levels, instead of
inventing artificial roles to encode limits.

```
approve_spend  scope:subtree  params:{ maxAmount: 25000 }
approve_leave  scope:own_unit params:{ maxDays: 3 }
```

Endur's own catalogue above is unparameterised in P1–P2. The mechanism exists because the
model is meant to host customer-specific modules later, and because it is what makes the
powers grid's "type a number into a cell" interaction possible
(`33-PAGE-roles-and-powers-grid.md`).

---

## 4. Scopes

Narrowest to widest.

| Scope | Covers |
|---|---|
| `self` | Only the principal, or a resource whose owner is the principal |
| `own_unit` | Targets in the **anchor unit** exactly |
| `subtree` | Targets in the anchor unit or any descendant, in that dimension |
| `all` | Any target in the organisation |

### The anchor unit — the crux of INV-005

A grant attached to a **role** has no unit of its own. The unit comes from the **position**
through which the grant was reached.

> A person holding *Director — Project Ayaan* reaches the `Director` role's grants **anchored
> at Ayaan**. On *Night Bus*, where they are an Editor, those grants do not apply at all.

This is the most important behavioural detail in the whole model, and the one the setup UI
confirms explicitly rather than assuming (`customization.md` §9 screen 4). Without it, anyone
with a senior hat somewhere quietly gains senior powers everywhere.

Anchor resolution, by grant subject kind:

| Grant is on | Anchor unit |
|---|---|
| a **role** node | the unit of each position the principal holds with that role — evaluated once per position |
| a **position** node | that position's unit |
| a **group** node | the group's `meta.scopeUnitId`; absent ⇒ the whole org |
| a **person** node | the person's **home unit** — see below (DEC-044) |

### The home unit — DEC-044

| The person has | Anchor |
|---|---|
| One **primary** position | Its unit. This is the original rule |
| No primary, exactly **one** position | That one's unit |
| No primary, **two or more** positions | **None** — no unit-scoped claim |
| No positions | **None** — `self` and `all` grants only |

The second row exists because `isPrimary` **defaults to `false`** on `CreateAssignmentBody`,
so the ordinary *"give this person a position"* call produces no primary at all. A strict
primary-only rule would have left per-person overrides inert for the commonest shape in the
product — which is the bug DEC-044 was written to fix.

The third row refuses to guess, and that is deliberate. `isPrimary` exists to resolve exactly
that ambiguity; picking one anyway would anchor somebody's override at whichever row the
database happened to return first, and **a permission system that answers non-deterministically
is worse than one that answers narrowly.** The trace records `"the grant has no anchor unit"`
so the simulator (`42`) explains it rather than leaving it a mystery.

> **This was broken until 2026-08-23, and silently.** `collect.ts` registered the person node
> with no unit at all, so `scopeCovers()` correctly refused every unit-scoped person grant a
> claim — and **a per-person deny at `own_unit` or `subtree` did nothing whatsoever.** INV-004
> says a deny beats an allow unconditionally; a deny that never applies never beats anything.
> The per-person *allow* was equally inert. Every existing test used scope `all`, which needs
> no anchor, which is why four audits missed it (`CONF-020`, `D-020`).
>
> A related bug in `held.ts` fell out of the same misreading and was **pre-existing**: it
> subtracted an org-wide deny only when the grant had no anchor, but `all` scope is decided
> before an anchor is ever consulted — so an `all`-scoped deny on a **role** was never
> subtracted from the UI capability set either. Scope is the test; the anchor is irrelevant
> to it.

---

## 5. The resolution algorithm

```
resolve(principal, capability, target, at = now):

  1  COLLECT candidate grants, each paired with its anchor unit:
       a. grants on the person node                        (direct overrides)
       b. for each active `member` edge person → position:
            - grants on that position node                 anchor = position.unit
            - grants on that position's role node          anchor = position.unit
       c. grants on each group the person is an active member of
       d. for each active `delegates` edge into a position the principal covers:
            - the delegator position's grants, anchor = the delegation's unit,
              intersected with the delegation's validity window

  2  FILTER capability == requested capability

  3  FILTER validity:  valid_from <= at AND (valid_to IS NULL OR valid_to > at)
       applies to the grant, the edge that reached it, and the position's unit ends_at

  4  FILTER scope covers target, using the anchor unit  (§4)

  5  IF any surviving grant has effect = 'deny'
         -> DENIED. return the narrowest-scoped deny as decidedBy.          [INV-004]

  6  IF any surviving grant has effect = 'allow'
         -> ALLOWED.
            decidedBy = narrowest scope among the allows;
                        tie broken by the highest role level (lowest level number)
            params    = combined per org.settings.paramMode:
                          'union'   -> max of each numeric param   (default)
                          'highest' -> params from the highest-level assignment only

  7  OTHERWISE -> DENIED, reason 'no_grant'.
```

Five consequences worth stating explicitly, because each is a question a marker can ask:

1. **Deny always beats allow** (INV-004). A hard block on external vendors stays a block even
   after someone adds them to a committee granting broad access. This is what makes the
   `BLOCK` cells in the powers grid genuinely safe rather than merely default.
2. **A narrower scope wins a tie.** `own_unit` beats `all` for the purposes of `decidedBy`,
   so the trace names the most specific rule that applied.
3. **Powers are scoped to the assignment's unit** (INV-005) — see §4.
4. **Default is deny.** No grant means no. There is no implicit permission anywhere.
5. **Every decision records which grant decided it**, which is what powers the simulator, the
   audit log and support debugging.

### The decision trace

```ts
type Decision = {
  allowed: boolean;
  capability: string;
  reason: 'granted' | 'explicit_deny' | 'out_of_scope' | 'expired' | 'no_grant';
  decidedBy?: {
    grantId: string;
    via: 'person' | 'position' | 'role' | 'group' | 'delegation';
    subjectName: string;      // "Dean", "Safety Committee", "Rahul Verma"
    scope: GrantScope;
    anchorUnitId?: string;
    anchorUnitName?: string;
    effect: GrantEffect;
  };
  params?: Record<string, number>;
  considered: Array<{ grantId: string; via: string; scope: string;
                      effect: string; rejectedBecause?: string }>;
};
```

`considered` is the difference between a usable simulator and a useless one. "Blocked"
teaches nothing; *"on Night Bus he is an Editor; his Director powers apply only on Ayaan"*
teaches the whole model in one sentence.

`considered` is included in API responses **only** for `simulator.run` and for 403 bodies in
non-production. Production 403s carry `decidedBy` and `reason` only — enough to be
actionable, not enough to map the org's permission structure from outside.

---

---

## 5b. The escalation bound — you cannot hand out what you do not hold

**INV-012. No principal may create a position, a grant or an account whose resolved powers
exceed their own.**

§5 answers *may this person act on this target*. It does **not** answer *may this person
create an actor more powerful than themselves*, and those are different questions. Until
2026-08-23 the product only asked the first one, and that was a hole:

> `POST /people/:id/assignments` requires `assignment.create` on the target unit and nothing
> else. A caller holding exactly that one capability — a departmental coordinator, say, whose
> job really is to put people into positions — could assign the **Owner** role at the root
> unit to a colleague, or to a second account of their own, and hold the organisation an hour
> later. Every check passed. There is no bug to point at; the resolver worked exactly as
> specified, because nobody had specified this.

Found while writing `57-FEATURE-accounts-and-invites.md`, and it is the same shape as the
`billing.update` hole `DEC-034` found: a capability that is safe to *hold* becomes unsafe to
*hand out* the moment there is a route that hands things out. `57` is that route, which is
why the bound is written here rather than there — the guard belongs to the engine, not to one
feature.

### The rule

```
mayGrant(actor, position) :=
  for every capability C in the catalogue:
    for every anchor unit U the position would reach C at:
      resolve(position, C, U).allowed  ==>  resolve(actor, C, U).allowed
```

In words: **the capability set the new position resolves to, at the units it resolves them
at, must be a subset of the actor's own set at those same units.** A dean may create another
dean inside their own faculty. A dean may not create an owner, and may not create a dean of a
faculty that is not theirs — the second is already INV-005 and the guard is the first.

Three properties of that formulation matter:

**It is computed from the resolver, never from `Node.level`.** Level is ordering and seeding
only (DEC-002, CONF-002); a comparison like *"level 3 may create level 4 and below"* would
re-introduce the integer-level model through a side door, and would be wrong the moment an
administrator edits the powers grid so that a lower-numbered role holds less.

**A deny the actor carries must survive into what they create.** If a coordinator is denied
`grant.update` anywhere, they cannot create a position that is allowed it — otherwise a deny
is escapable by proxy, and INV-004 becomes a suggestion.

**It never widens anything.** The bound can only refuse; it is a second gate after
`requireCapability`, never a substitute for it. A route still needs its capability. This is
the same posture as `requireEntitlement` (`12` §4.11) — an extra reason to say no.

### Where it applies

| Route | Status | Why |
|---|---|---|
| `POST /people/:id/assignments` | **Built, `T-071`** | The original hole. A position is the only thing that carries powers (INV-005) |
| `POST /people/import` | **Built, `T-071`** | **The import creates positions too**, behind `person.import` alone — found while building the guard. Without it the row above is bypassable in one call by naming a senior role in a one-row CSV |
| `POST /people/:id/account` (`57`) | **Built, `T-072`** | Provisioning a sign-in for a position is what turns the graph into access. The pairs come from the positions the person ALREADY HOLDS — the bound is checked against what they would wake up holding |
| `POST /people/:id/account/reset` (`57`) | **Built, `T-072`** | **Found while building the row above.** Re-issuing mints an equally working link for the same account, so a bound on one and not the other is a bound with a second door. Same shape as the `POST /people/import` row |
| `PATCH /grants` (the powers grid, `33`) | `T-052` | Editing a role's row raises everyone holding it. Already partly covered by `33`'s lockout guard; this generalises it |

`POST /people` is deliberately **not** in that table. A person with no position has no powers
at all, which is exactly why `34` keeps roles out of the create-person DTO — so there is
nothing to bound yet.

**The bulk path is the one to notice.** A guard mounted only on the single-assignment route
would have been *worse than no guard*, because the board would have recorded the hole as
repaid. The two routes share one resolution of *"which role does this row mean"*
(`features/people/positions.ts`) rather than each doing their own, because the failure mode
of two copies is a row the guard did not check and the handler did create.

### What it actually catches first, which is not what you would guess

The bound is about **reach**, not possession. Building it produced a case worth recording:
a Section Head holding `assignment.create: own_unit` who tries to assign the *Principal*
role in their own unit is refused on **`assignment.create` itself** — the Principal role
carries it at `subtree`, which reaches units the Section Head cannot. The capability is one
they hold; the *distance* is not.

So a refusal naming a capability the caller obviously has is correct rather than confusing,
and the message says **where**: *"That position includes `assignment.create` on Team A1,
which you do not hold there yourself."* A message naming only the capability would have read
as a bug in exactly this, the most common case.

### The failure it returns

`403 WOULD_ESCALATE` (its own code in `13` §5, not a plain `FORBIDDEN`) with
`details.capability` and `details.unitName`:

> *"That position includes `grant.update` on Engineering, which you do not hold there
> yourself."*

**One finding, not all of them.** The caller needs one specific power named to understand
the refusal; enumerating every over-reach of an Owner role produces a forty-item list that
says less than one line does.

Naming the specific capability is not a nicety. A bare "not allowed" on this route reads as a
bug to the administrator, who can plainly see they hold `assignment.create`; the answer they
need is *which* power they were about to hand out that they do not have.

### The bootstrap exception, stated so nobody finds it by accident

Registration and `/org/setup` create the founder's position before any actor exists to bound
against (`15` §5, `31`). They run **before** this guard, not around it: they are seeded, not
granted, and the seam is that both write inside the registration transaction rather than
through `POST /assignments`. Any future route that seeds a position must go through the same
seam or through the guard — never neither.


## 6. Implementation

```
src/backend/authz/
  catalogue.ts      re-exports @endur/shared capabilities + module grouping
  resolve.ts        resolve(principal, capability, target, at): Promise<Decision>
  collect.ts        step 1 — gather grants with anchors
  scope.ts          step 4 — does this anchor+scope cover this target
  params.ts         step 6 — union / highest combination
  cache.ts          §7
  simulate.ts       read-only wrapper used by 42. NOT a second implementation.
```

**`simulate.ts` must call `resolve.ts`.** If the simulator ever re-implements the algorithm
it becomes worse than useless — it would show a decision the system did not actually make
(`_MEMORY.md` N-005).

Target resolution needs the org graph. `scope.ts` consumes `unitSubtree()` and
`unitAncestors()` from `db/graph.ts` (`10` §6); it never writes SQL of its own.

---

## 7. Caching

The resolver runs on every authorised request, and step 1 is several joins. Two layers:

**Per-request memo.** A `Map` on the request object keyed by
`capability + target`. A single handler often checks the same capability repeatedly (list
endpoints especially). Free, and correct by construction because a request is a snapshot.

**Per-principal grant set, short TTL.** Steps 1's raw output — the person's positions,
roles, groups, delegations and their grants — cached for 30 seconds, keyed
`(orgId, userId, authzVersion)`.

`organizations.settings.authzVersion` is an integer bumped in the same transaction as **any**
write to `nodes`, `edges` or `grants`. Bumping the version invalidates every cached entry for
that tenant instantly, so a permission change is never stale — which matters, because a
30-second window where a revoked permission still works is a security bug, not a performance
trade-off.

In-process `Map` with TTL for P1. Redis only if we ever run more than one API instance; do
not add it speculatively.

---

## 8. Seeding the level rule

At org creation, the industry preset writes `derived: true` grants reproducing
`BUILD_PLAN_EVAL1.md`'s original rule — *a user sees data for people below their role level,
within their unit's subtree* — so a fresh org behaves sensibly with zero configuration
(`10` §2.4).

Concretely, for each role at level *n*:

```
role.read     scope:subtree   allow
person.read   scope:subtree   allow
subject.read  scope:subtree   allow
results.read  scope:subtree   allow      (levels 1..2 only)
campaign.*    scope:subtree   allow      (levels 1..3)
grant.update  scope:all       allow      (level 1 only)
```

plus **`self`-scoped `person.read` and `person.update` for every role without exception** —
these back `/app/profile` (`47`). A default-deny model silently produces an unopenable profile
page if `self` is forgotten, so it is called out here rather than left implicit.

> **The concrete, authoritative table is `50-SEED-AND-DEMO.md` §1 § "The seeded grant
> matrix".** This section states the rule; that table states every row. Do not re-derive the
> matrix from this prose — implement the table.

The same matrix serves every preset; only the role *names* differ, which is the generic model
doing its job.

The administrator edits these in the powers grid. Editing a derived grant clears its
`derived` flag so regeneration never silently reverts them (`10` §9).

---

## 9. Failure modes to get right

| Situation | Correct behaviour |
|---|---|
| Principal has no positions at all | Deny everything except `self` |
| Position's unit was deleted | Position is inactive; grants through it do not apply |
| Delegation window has passed | Grants disappear on their own; nothing to revoke |
| Grant valid but campaign closed | Capability allows; the *service* rejects on state. These are different failures and must return different codes — 403 vs 409 |
| Two hats, one denies | Denied. Always (INV-004) |
| Target unit in a different dimension | `subtree` is evaluated **per dimension**; a subtree in `academic` says nothing about `administrative` |
| Someone grants themselves `grant.update` | Allowed if a rule permits it, **and audited loudly**. The self-approval-loop warning in `33` is the product-level answer, not a resolver special case |

---

## 10. Acceptance

- [ ] `resolve()` returns a `Decision` with a populated `decidedBy` on every allow
- [ ] An explicit deny beats an allow from a group, a delegation, and a person override —
      three separate tests
- [ ] INV-005 test: a person who is Director on unit A and Editor on unit B is denied a
      Director capability on B, and the trace explains why
- [ ] A delegation grants access inside its window and nothing outside it, with no revocation
      step required
- [ ] Expired positions and expired temporary units both drop grants
- [ ] Bumping `authzVersion` invalidates the cache within the same request
- [ ] `simulate()` and the live middleware return identical decisions for identical inputs —
      a property test over random org fixtures
- [ ] A production 403 body contains `reason` and `decidedBy` but never `considered`
- [ ] Default-deny: a fresh capability nobody has been granted is refused for every principal
- [ ] Every seeded role can read and update **itself** — the `/app/profile` precondition
- [ ] **A per-person deny at `subtree` actually denies** (DEC-044) — the test that would have
      caught `D-020`, and its `own_unit` counterpart stops at the anchor rather than sweeping
      the branch
- [ ] A per-person **allow** at `own_unit` actually grants
- [ ] `visibleUnits()` subtracts the same per-person deny the resolver honours — the list side
      and the detail side must not disagree
- [ ] Two unflagged positions produce **no** anchor, and the trace says why
- [ ] `heldCapabilities()` subtracts an `all`-scoped deny **whether or not it is anchored**
- [ ] **INV-012**: a caller holding only `assignment.create` cannot assign a role that would
      resolve to a capability they do not hold at that unit — the escalation test (§5b)
- [ ] A deny the actor carries cannot be escaped by creating a position that lacks it
- [ ] The escalation bound is computed from `resolve()`, never from `Node.level` — asserted
      by inverting two roles' levels and observing the bound not move
- [ ] Registration and `/org/setup` still seed the founder's position with no actor to bound
      against, and no other path can

## 11. Out of scope

| Not building | Why |
|---|---|
| User-defined capabilities | The one restriction that makes the UI possible (`customization.md` §3) |
| Attribute-based rules over arbitrary fields | Scope + params covers the real cases; ABAC would make the powers grid unrenderable |
| Row-level policy expressions | The `subtree` scope is the row-level policy, expressed once |
| Time-of-day recurrence in the resolver | Delegation recurrence is stored in `edges.meta` but only evaluated in P3. P1–P2 use plain date ranges |
| Cross-org grants | Tenants are isolated (INV-010). There is no such thing |
