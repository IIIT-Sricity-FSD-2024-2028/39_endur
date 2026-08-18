# 51 — Testing strategy

Phase: P1 onward · Owns: `**/*.test.ts`, `src/backend/test/**`, `e2e/**`

Testing is proportional to consequence. Three areas carry real consequence in this codebase,
and the rest is ordinary.

| Area | Why it matters | Coverage |
|---|---|---|
| **The permission resolver** | A wrong answer is a privacy breach | Exhaustive |
| **The middleware chain** | A missing link silently disables a guarantee | Integration, plus structural |
| **The respondent flow** | It is the demo, and it runs on someone else's phone | E2E on real devices |

Everything else: test the logic, skip the plumbing. A test that asserts Prisma can insert a
row tests Prisma.

## 1. Tooling

Vitest per workspace. Supertest for HTTP integration. Playwright for e2e. A real Postgres in
CI as a service container — **not** an in-memory substitute, because recursive CTEs, triggers
and RLS are exactly what needs testing and none of them exist in a fake.

## 2. Unit — the resolver

`src/backend/authz/**` is the most heavily tested code in the project. Every case in `11` §9
and §10 is a test:

- Deny beats allow, from a role, a group, a delegation, and a person override — four tests,
  because each path collects grants differently
- **INV-005**: Director on unit A, Editor on unit B → denied on B, with a trace naming the
  reason
- Scope coverage: `self` `own_unit` `subtree` `all` against every target kind
- `subtree` is evaluated per dimension — a subtree in `academic` says nothing about
  `administrative`
- Delegation grants inside its window, nothing outside, with no revocation step
- Expired positions and expired temporary units both drop grants
- Default deny: an ungranted capability is refused for every principal
- `authzVersion` bump invalidates the cache within the same request

**The property test that matters most:** `simulate()` and the live middleware return identical
decisions for identical inputs, over randomly generated org fixtures. If those two ever
diverge, the simulator lies, and a lying simulator is worse than none.

## 3. Structural tests — the ones that enforce invariants

Cheap, and they turn discipline into mechanism. This is the highest-value category in the
codebase.

| Test | Enforces |
|---|---|
| **Every non-public route has `requireCapability`** — walk the Express router stack and assert | INV-003. Highest-value test in the project |
| Every route has `validate` | `12` §8 |
| Every capability string in a route exists in the catalogue | DRIFT-004 |
| `grep`: `$queryRaw` appears only in `db/graph.ts` | DEC-007 |
| `grep`: `req.body` appears in no feature handler | `14` §9 |
| `grep`: no education-specific identifier outside the university preset | INV-002 |
| `grep`: no hex colour in `src/frontend` outside `design-system/` | DEC-012 |
| `grep`: no emoji in any `.tsx` | `21` §5 |
| Schema inspection: `responses` has no person-referencing column | INV-006 |
| No seeded template exceeds 10 questions | `01` §5 |

The router-stack test deserves emphasis: **a developer who adds an endpoint and forgets the
guard gets a failing build**, not a security hole discovered later. That is the difference
between an invariant and a wish.

## 4. Integration — the middleware chain

Supertest against the real app with a real database.

- **Ordering.** Deliberately mis-order two links and assert the failure is loud. This is what
  proves `12` §5's ordering table is real and not a comment.
- **Tenant isolation.** Two orgs seeded. Every list endpoint called with org A's token returns
  zero of org B's rows — including when a forged `orgId` is supplied in the body (INV-010).
- **Error shape.** Every error type produces the envelope; no route produces a body outside
  it; no response contains a stack trace.
- **403 vs 402.** A request failing both capability and entitlement returns **403**
  (`16` §4).
- **404 vs 403.** Out-of-scope resources return 404; visible-but-forbidden returns 403
  (`13` §5).
- **Audit atomicity.** Force a rollback mid-handler and assert no audit row survives
  (INV-007).
- **Idempotency.** A repeated launch with the same key returns the first response and mints
  one token.
- **Public payload.** `GET /public/campaigns/:token` asserted against an explicit key
  allowlist — a new field cannot leak in unnoticed.
- **Token uniformity.** Invalid, unlaunched, closed and expired tokens produce identical
  responses.

## 5. Frontend

Vitest + Testing Library. Test behaviour, not rendering.

- `<QuestionInput>` × 6: value round-trips, keyboard operable, correct ARIA
- **The preview and the respondent form use the same components** (INV-008) — assert by
  identity, not by snapshot
- `<UnitTree>`: reparent rejects a descendant drop; inline rename commits on `Enter`, reverts
  on `Esc`
- `<PowersGrid>`: cell cycling, shift-click deny, column copy
- `<ConfirmDialog>` cannot render without `consequence` — a type-level test
- `useLabels()` returns defaults for a missing label rather than `undefined`

**No snapshot tests.** They fail on every design change and get regenerated without being
read, which trains everyone to ignore a failing test.

## 6. E2E — Playwright

Four flows, and only four.

1. **Respondent flow**: scan-equivalent URL → fill → submit → thank you → the response appears
   in results. The demo, automated.
2. **Setup wizard**: preset → rename a role → add two units → change a label → finish → the
   org works.
3. **Org switch**: vocabulary visibly changes across the console.
4. **Permission boundary**: a level-3 user cannot see another department's people, and a
   direct URL returns a 403 page.

The respondent flow additionally runs on **real iOS Safari and real Android Chrome** before
26 Aug. Desktop responsive mode does not catch the 16px zoom-on-focus bug, and that bug breaks
the layout in front of the room (`39`).

## 7. What is deliberately not tested

| Not tested | Why |
|---|---|
| Prisma CRUD | Tests the ORM |
| Component rendering by snapshot | Fails on design changes, gets blindly regenerated |
| Third-party libraries | Not ours |
| Exact copy strings | Copy changes; behaviour should not |
| Visual regression | Real value, wrong phase — the design is still moving |

## 8. CI

`install → typecheck → lint → audit:drift → unit → integration (with Postgres) → build`

E2E runs on demand and nightly, not per push — it is too slow to sit in the inner loop, and a
slow pipeline gets bypassed.

## 9. Acceptance

- [ ] Every structural test in §3 exists and passes
- [ ] The router-stack test fails when a guard is removed — verified by removing one
- [ ] Resolver coverage includes every case in `11` §9
- [ ] The simulate-vs-middleware property test passes over random fixtures
- [ ] Tenant isolation holds against a forged body `orgId`
- [ ] Audit rows do not survive a rolled-back transaction
- [ ] The public campaign payload is allowlist-asserted
- [ ] All four e2e flows pass
- [ ] The respondent flow is verified on real iOS and Android before 26 Aug
- [ ] No snapshot tests exist
