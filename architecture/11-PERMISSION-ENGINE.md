# 11 — Permission engine

Phase: P1 · Milestone: M0 · Owns: `apps/api/src/authz/**`
Decisions: `_MEMORY.md` DEC-002 · Invariants: INV-003, INV-004, INV-005
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
| **People** | `person.read` `person.create` `person.update` `person.delete` | | P1 |
| | `person.import` | CSV | P2 |
| | `assignment.create` `assignment.delete` | give / remove a position | P1 |
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
| | `audit.read` | | P2 |
| **Platform** | `apikey.read` `apikey.create` `apikey.revoke` | Enterprise only | P3 |
| | `billing.read` `billing.update` | | P2 |
| **Improve** | `reflection.create` `reflection.read` | | P3 |
| | `actionplan.create` `actionplan.read` | | P3 |
| | `checkin.create` `checkin.read` | | P3 |
| **Analyze** | `analysis.read` | | P3 |

Naming rule: `<object>.<verb>`, lowercase, singular object. A page doc may not use a string
absent from this table — add it here first (`README.md` ground rule 3).

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
| a **person** node | the person's primary position's unit; absent ⇒ `self` only |

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

## 6. Implementation

```
apps/api/src/authz/
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

plus `self`-scoped reads for the lowest level. The exact matrix per preset is in
`50-SEED-AND-DEMO.md`.

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

## 11. Out of scope

| Not building | Why |
|---|---|
| User-defined capabilities | The one restriction that makes the UI possible (`customization.md` §3) |
| Attribute-based rules over arbitrary fields | Scope + params covers the real cases; ABAC would make the powers grid unrenderable |
| Row-level policy expressions | The `subtree` scope is the row-level policy, expressed once |
| Time-of-day recurrence in the resolver | Delegation recurrence is stored in `edges.meta` but only evaluated in P3. P1–P2 use plain date ranges |
| Cross-org grants | Tenants are isolated (INV-010). There is no such thing |
