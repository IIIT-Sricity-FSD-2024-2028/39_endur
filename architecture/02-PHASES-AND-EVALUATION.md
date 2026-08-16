# 02 — Phases and evaluation

Phase: all · Decisions: `_MEMORY.md` DEC-004, DEC-005

---

## 1. The three phases

Phases are aligned to what the course actually grades. The **order is fixed**; the dates are
estimates and should be corrected here as the real evaluation dates land.

| | Phase | Window | Graded artifact |
|---|---|---|---|
| **P1** | **MIDDLEWARE** | 16 Aug → ~20 Sep 2026 | The Express middleware chain — `12-MIDDLEWARE-STACK.md` |
| **P2** | **REACT** | ~21 Sep → ~1 Nov 2026 | The console + respondent screens — docs `30`–`42` |
| **P3** | **REDUX** | ~2 Nov → ~13 Dec 2026 | The store, custom store middleware — `23-STATE-AND-REDUX.md` |

Every doc carries a `Phase:` tag. **Do not build P3 work early**, and do not skip P1
middleware to make screens look finished sooner — the middleware chain is the thing being
marked first, and it is also what everything else sits on.

## 2. M0 — the 26 August demo

**M0 is a live graded checkpoint.** Demo on 27 Aug 2026; everything must be working by
26 Aug. Today is 16 Aug — that is **ten working days**.

### The honest tension, stated once

M0 needs React screens, but React is P2. This is accepted and explicit (DEC-005):

> **M0 is a vertical slice, not a phase.** It cuts through middleware, API and React at
> once. The React written for M0 is deliberately thin and gets re-deepened in P2. Do not
> treat M0 screens as finished work, and do not let M0's time pressure set the quality bar
> for P2.

### What M0 must prove

From `design_specs/BUILD_PLAN_EVAL1.md` §1 — evaluators will test **generality**. They will
name an organisation type nobody prepared for and see whether the system bends.

> **The winning beat:** *"Name any organisation."* → configured live in ~2 minutes →
> evaluator scans a QR code and submits feedback on their own phone → their response appears
> in the results.

If `Course`, `FacultyMember`, or a `student` enum still exists as a fixed concept, the demo
fails at exactly the moment it matters (INV-002).

### M0 scope

Docs tagged `Milestone: M0`:

| Layer | In M0 |
|---|---|
| Backend | Postgres + Prisma, migrations, JWT auth, org/unit/role/subject CRUD, template + campaign + response APIs, public token endpoint, **the middleware chain end to end** |
| Frontend | Console shell, setup wizard (5 steps), form builder (6 types), campaign creation, share sheet + QR, respondent flow, results |
| Data | Four seeded orgs across industries, **with historical responses** |

### M0 cut-list, in strict order

Cut from the top when you slip. The reasoning holds from `design_specs/design/11` §4: the
evaluation is about scaling across organisations, so a strong setup experience with a plain
results table beats the reverse.

1. Landing page → redirect to `/login`
2. Any analysis surface → it is P3, never start it
3. CSV import → seed data instead
4. Campaign detail page → the list card links straight to results
5. Results → drop to the plain table in `design_specs/design/08` §"cut-down version"
6. Template library browse UI → ship three seeded templates
7. People management UI → seed only, no add/edit

**Never cut:** the setup wizard, the vocabulary system, the share sheet + QR, the respondent
flow. Those four *are* the demo.

### Two load-bearing dates inside M0

- **22 Aug — the share sheet and QR.** Highest-risk component in the build (`_MEMORY.md`
  N-004): canvas rendering, tunnel URL, phone reachability. Build it *before* the respondent
  flow.
- **24 Aug — the vocabulary audit.** Set every label to nonsense, walk every screen, fix
  every English domain noun still showing (INV-001). Do this while there is still time to
  fix what it finds, not on the last day.

### M0 risks carried forward

| Risk | Mitigation | Owner |
|---|---|---|
| QR points at `localhost` and will not scan | OPEN-002 — decide the tunnel by 24 Aug, test on two phones | Backend |
| Venue network fails | Local build + phone hotspot + a recorded backup video | All |
| Nothing to show if the build slips | **Seed data lands 22 Aug, not 26 Aug.** A seeded demo alone can pass; an unseeded live build cannot | Backend |
| Live org creation breaks on stage | Pre-seeded orgs are the fallback and are always demoable | All |
| Fonts blocked at the venue → renders in system-ui | Self-host both faces (`design_specs/design/01` §2) | Frontend |

---

## 3. Phase 1 — middleware

**What is graded:** that authorisation, validation, tenancy, auditing and error handling are
*composable middleware*, not logic scattered through handlers.

### Deliverables

- [ ] The full ordered chain in `12-MIDDLEWARE-STACK.md`, every link implemented
- [ ] `validate(Dto)` driving all input validation from shared Zod schemas (`14`)
- [ ] `requireCapability()` backed by the GRANT resolver, returning a **decision trace** on
      403 (`11`)
- [ ] `requireEntitlement()` separate from capability, returning 402 (`16`, DEC-011)
- [ ] `tenantResolver` — `orgId` never read from a request body (INV-010)
- [ ] `auditWriter` — same transaction as the mutation (INV-007)
- [ ] `errorFunnel` — one exit, typed errors, no stack traces past the boundary
- [ ] Integration tests over the chain itself (`51-TESTING-STRATEGY.md`)

### The viva answer this phase must support

> *"Why middleware rather than checks in the handler?"*
>
> Because authorisation, tenancy and audit are **cross-cutting**. Put them in handlers and
> every new endpoint is a new chance to forget one. As middleware they are composed at the
> route definition, so a route that forgets `requireCapability` is visibly missing a line
> rather than invisibly missing a check — and the ordering constraints between them
> (authenticate before capability, capability before entitlement, audit after the handler)
> are expressed once, in the chain, instead of re-derived per endpoint.

---

## 4. Phase 2 — React

**What is graded:** component composition, state discipline, routing, and that the UI
genuinely re-skins per organisation.

### Deliverables

- [ ] The three worlds and their shells (`20-FRONTEND-ARCHITECTURE.md`)
- [ ] The component inventory, with real prop contracts (`24`)
- [ ] `useLabels()` wired through every screen, verified by the nonsense audit (`22`)
- [ ] All console pages, docs `30`–`42`
- [ ] Responsive down to 390px; the respondent flow is phone-first
- [ ] Empty, loading, error and 403 states everywhere (`design_specs/design/10`)

### Definition of done, per screen

From `design_specs/design/11` §5 — apply to every page doc's `## Acceptance`:

- [ ] Every domain noun comes from `useLabels()`, verified with nonsense labels
- [ ] Empty, loading and error states exist
- [ ] Works at 390px
- [ ] Keyboard reachable, with a visible focus ring
- [ ] No hardcoded colour, font, or spacing value — tokens only
- [ ] No emoji placeholder icons
- [ ] Copy matches `design_specs/design/10` exactly

---

## 5. Phase 3 — Redux

**What is graded:** store design, reducers, and — if we carry the theme through — custom
store middleware.

The shape is **not yet decided** (`_MEMORY.md` OPEN-001). What is decided is that the store
exists from P1 with two thin slices so P3 is additive rather than a rewrite (DEC-008). See
`23-STATE-AND-REDUX.md` for the options and the recommendation.

P3 also carries the roadmap features, in priority order: analysis (`43`), the improve loop
(`44`), the public API (`45`).

---

## 6. Work split

Three members. **Two drive Claude**; the third does not (OPEN-004 — assign when known).

| Track | Owns | Docs |
|---|---|---|
| **A — Backend** | Schema, migrations, permission engine, the middleware chain, all APIs, seed data | `10`–`16`, `50` |
| **B — Console** | Shell, wizard, structure, roles, powers grid, people, subjects, settings, simulator | `20`–`24`, `31`–`35`, `41`, `42` |
| **C — Collection** | Templates, form builder, campaigns, share sheet, respondent flow, results | `36`–`40` |

**Hand-off constraint:** track B builds the shell, `<PageHeader>` and `<VocabularyChips>`
first and hands them over before starting the wizard. Otherwise track C is blocked or builds
a second shell — which is exactly how two screens drift apart.

**Parallelism constraint:** two people run Claude simultaneously. Check the `MAP` lock table
in `_MEMORY.md` before creating source files. One doc owns a path; a second doc may read it
but must not restructure it.

**If it drops to two people:** one backend, one frontend. Cut the M0 list aggressively and
build the reduced results table. Do not cut the wizard.

---

## 7. Phase gates

Do not start the next phase until these pass.

**P1 → P2**

- [ ] Every route in `13-API-CONTRACT.md` responds, with the chain attached
- [ ] `DRIFT-004` passes: every capability referenced in a page doc exists in the catalogue
- [ ] A request with no capability returns 403 **with a decision trace**, not a bare denial
- [ ] Seed produces four orgs with historical responses
- [ ] Integration tests cover the chain, including ordering failures

**P2 → P3**

- [ ] `npm run audit:vocab` passes on every screen
- [ ] `DRIFT-003` passes: no design values leaked into `architecture/`
- [ ] Every page doc's `## Acceptance` list is fully checked
- [ ] The app is usable at 390px end to end

---

## 8. Superseded planning documents

`design_specs/BUILD_PLAN_EVAL1.md` is **partially superseded** (CONF-001, CONF-002). Its
stack recommendation (NestJS) and its permission model (integer levels) no longer apply. It
**remains authoritative** for the demo script (§6) and the risk table (§7), and this document
carries both forward. Do not edit or delete it.
