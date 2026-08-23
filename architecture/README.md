# Endur — architecture

This folder is the **single source of truth for contracts**: schema, routes, DTOs,
capabilities, state, and acceptance criteria. It is written to be fed back in as build
prompts — each file stands alone, without conversational context.

It is *not* the source of truth for visual design. That is `design_specs/`, and these docs
link to it rather than restating it.

| Concern | Authority |
|---|---|
| Colour, type, spacing, component anatomy, copy, empty states | `design_specs/design/` |
| Schema, routes, DTOs, capabilities, state, acceptance criteria | `architecture/` |
| Which decision won, and why | `architecture/_MEMORY.md` |
| What is built and what is next | `/PROGRESS.md` — **read first every session** |

---

## Read in this order

**Everyone, first**

| # | File | What it settles |
|---|---|---|
| — | [`_MEMORY.md`](_MEMORY.md) | Every decision, invariant, and resolved conflict. Read before changing anything architectural. |
| 01 | [`01-PRODUCT-CONTRACT.md`](01-PRODUCT-CONTRACT.md) | What Endur is, who uses it, what we sell, what is out of scope |
| 02 | [`02-PHASES-AND-EVALUATION.md`](02-PHASES-AND-EVALUATION.md) | P1/P2/P3, the M0 demo cut-list, who builds what |
| 03 | [`03-REPO-AND-TOOLING.md`](03-REPO-AND-TOOLING.md) | Monorepo layout, TypeScript config, scripts, environment |

**Backend — Phase 1**

| # | File | What it settles |
|---|---|---|
| 10 | [`10-DATA-MODEL.md`](10-DATA-MODEL.md) | The Postgres schema, the org graph, recursive queries, indexes |
| 11 | [`11-PERMISSION-ENGINE.md`](11-PERMISSION-ENGINE.md) | Capability catalogue, scopes, the resolver, decision traces |
| 12 | [`12-MIDDLEWARE-STACK.md`](12-MIDDLEWARE-STACK.md) | **The Phase-1 graded artifact.** The ordered chain, each link specified |
| 13 | [`13-API-CONTRACT.md`](13-API-CONTRACT.md) | Every endpoint, the error envelope, pagination, the public API |
| 14 | [`14-DTO-AND-VALIDATION.md`](14-DTO-AND-VALIDATION.md) | Zod-as-DTO conventions, the shared package, error mapping |
| 15 | [`15-AUTH-AND-SESSIONS.md`](15-AUTH-AND-SESSIONS.md) | Staff cookie sessions, respondent tokens, API keys, the anonymity guarantee |
| 16 | [`16-TENANCY-BILLING-ENTITLEMENTS.md`](16-TENANCY-BILLING-ENTITLEMENTS.md) | Tiers → entitlements, metering, tenant isolation |
| 17 | [`17-BACKGROUND-JOBS.md`](17-BACKGROUND-JOBS.md) | ⚠️ **Placeholder — covers a real gap.** Campaign open/close, expiry, webhook retry |
| 18 | [`18-OBSERVABILITY-AND-OPS.md`](18-OBSERVABILITY-AND-OPS.md) | **P1** — log + error files, rotation |
| 19 | [`19-PLATFORM-OPERATORS.md`](19-PLATFORM-OPERATORS.md) | P2 |

**Frontend — Phase 2**

| # | File | What it settles |
|---|---|---|
| 20 | [`20-FRONTEND-ARCHITECTURE.md`](20-FRONTEND-ARCHITECTURE.md) | The three worlds, routing, data layer, folder layout |
| 21 | [`21-DESIGN-SYSTEM-BINDING.md`](21-DESIGN-SYSTEM-BINDING.md) | How `design_specs` tokens become CSS without duplication |
| 22 | [`22-VOCABULARY-SYSTEM.md`](22-VOCABULARY-SYSTEM.md) | `useLabels()`, and the audit that proves nothing is hardcoded |
| 23 | [`23-STATE-AND-REDUX.md`](23-STATE-AND-REDUX.md) | Thin store now; the Phase-3 plan, marked undecided |
| 24 | [`24-COMPONENT-INVENTORY.md`](24-COMPONENT-INVENTORY.md) | The component set with TypeScript prop contracts |
| 25 | [`25-FRONTEND-ERROR-HANDLING.md`](25-FRONTEND-ERROR-HANDLING.md) | *Placeholder* — error envelope → UI, field-path mapping |
| 26 | [`26-ACCESSIBILITY.md`](26-ACCESSIBILITY.md) | *Placeholder* — implementation for tree and grid. **The floor is already binding** |
| 27 | [`27-FRONTEND-PERFORMANCE.md`](27-FRONTEND-PERFORMANCE.md) | *Placeholder* — bundle budgets. Write only when something is measurably slow |
| 28 | [`28-COMPONENT-TESTING.md`](28-COMPONENT-TESTING.md) | *Placeholder* — fixtures and helpers. Policy lives in `51` |
| 29 | [`29-RESERVED.md`](29-RESERVED.md) | *Unassigned* — free slot, explains the numbering scheme |

**Pages and features** — one file each, each usable as a standalone prompt

| # | File | Phase |
|---|---|---|
| 30 | [`30-PAGE-landing-auth.md`](30-PAGE-landing-auth.md) | P1 · M0 |
| 31 | [`31-PAGE-setup-wizard.md`](31-PAGE-setup-wizard.md) | P2 · M0 |
| 32 | [`32-PAGE-org-structure.md`](32-PAGE-org-structure.md) | P2 · M0 |
| 33 | [`33-PAGE-roles-and-powers-grid.md`](33-PAGE-roles-and-powers-grid.md) | P2 |
| 34 | [`34-PAGE-people.md`](34-PAGE-people.md) | P2 |
| 35 | [`35-PAGE-subjects.md`](35-PAGE-subjects.md) | P2 · M0 |
| 36 | [`36-PAGE-templates-library.md`](36-PAGE-templates-library.md) | P2 · M0 |
| 37 | [`37-PAGE-form-builder.md`](37-PAGE-form-builder.md) | P2 · M0 |
| 38 | [`38-PAGE-campaigns.md`](38-PAGE-campaigns.md) | P2 · M0 |
| 39 | [`39-PAGE-respondent-flow.md`](39-PAGE-respondent-flow.md) | P2 · M0 |
| 40 | [`40-PAGE-results.md`](40-PAGE-results.md) | P2 · M0 |
| 41 | [`41-PAGE-settings.md`](41-PAGE-settings.md) | P2 |
| 42 | [`42-PAGE-permission-simulator.md`](42-PAGE-permission-simulator.md) | P2 |
| 43 | [`43-PAGE-analysis.md`](43-PAGE-analysis.md) | P3 |
| 44 | [`44-FEATURE-improve-loop.md`](44-FEATURE-improve-loop.md) | P3 |
| 45 | [`45-FEATURE-public-api.md`](45-FEATURE-public-api.md) | P3 |
| 46 | [`46-PAGE-home-dashboard.md`](46-PAGE-home-dashboard.md) | P2 · M0 |
| 47 | [`47-PAGE-profile.md`](47-PAGE-profile.md) | P2 |
| 48 | [`48-FEATURE-file-upload.md`](48-FEATURE-file-upload.md) | **P1** — see CONF-018 |
| 49 | [`49-PAGE-plan-and-billing.md`](49-PAGE-plan-and-billing.md) | P2 |

**Pages and features that arrived after `30`–`49` filled.** They sit in the `50`s beside the
cross-cutting docs rather than being renumbered into a block with no room; see § Numbering.

| # | File | Phase |
|---|---|---|
| 56 | [`56-PAGE-activity-log.md`](56-PAGE-activity-log.md) | P2 — the organisation's own log |
| 57 | [`57-FEATURE-accounts-and-invites.md`](57-FEATURE-accounts-and-invites.md) | P2 |
| 58 | [`58-PAGE-inbox.md`](58-PAGE-inbox.md) | P2 |

**P3 stretch** — the four `SCOPE.md` layers shown as disabled "Soon" items in the sidebar
(`20` §2). Reserved, not designed; designing them now would be work thrown away (CONF-006).

| # | File | Phase |
|---|---|---|
| 60 | [`60-FEATURE-communities.md`](60-FEATURE-communities.md) | *Placeholder* · P3 stretch |
| 61 | [`61-FEATURE-announcements.md`](61-FEATURE-announcements.md) | *Placeholder* · P3 stretch |
| 62 | [`62-FEATURE-voting.md`](62-FEATURE-voting.md) | *Placeholder* · P3 stretch |
| 63 | [`63-FEATURE-notifications.md`](63-FEATURE-notifications.md) | *Placeholder* · P3 stretch |

**Endur's own platform** — the deliberately cross-tenant surface. `19` is the model and the
guards; `70` and `71` are its two screens. Read `19` before either.

| # | File | Phase |
|---|---|---|
| 70 | [`70-PAGE-platform-console.md`](70-PAGE-platform-console.md) | P2 |
| 71 | [`71-PAGE-platform-analytics.md`](71-PAGE-platform-analytics.md) | P2 |
| 72 | [`72-PAGE-platform-logs.md`](72-PAGE-platform-logs.md) | P2 |

**Cross-cutting**

| # | File | What it settles |
|---|---|---|
| 50 | [`50-SEED-AND-DEMO.md`](50-SEED-AND-DEMO.md) | Industry presets, seeded orgs, the demo script, reset |
| 51 | [`51-TESTING-STRATEGY.md`](51-TESTING-STRATEGY.md) | What is tested where, and what must never ship untested |
| 52 | [`52-SECURITY-AND-PRIVACY.md`](52-SECURITY-AND-PRIVACY.md) | Anonymity, k-anonymity, audit, the confidentiality limit |
| 53 | [`53-NOVELTY-CLAIMS.md`](53-NOVELTY-CLAIMS.md) | What is genuinely novel and how to defend it under questioning |
| 54 | [`54-COURSE-DELIVERABLE.md`](54-COURSE-DELIVERABLE.md) | **Hand this to the React teacher.** Their checklist → our routes, MPA-vs-SPA per page |
| 55 | [`55-BUILD-ORDER.md`](55-BUILD-ORDER.md) | **The task backlog.** Stable `T-###` ids, lanes, dependencies. Companion to `/PROGRESS.md` |

---

## Numbering

Blocks with headroom, **not** a contiguous sequence — so a new doc lands next to related ones
instead of being appended where nobody looks.

| Block | Covers | Free slots |
|---|---|---|
| `00`–`09` | Foundations | `04`–`09` |
| `10`–`19` | Backend and API | — |
| `20`–`29` | Frontend | — |
| `30`–`49` | Pages and features | — |
| `50`–`59` | Cross-cutting, **and pages that arrived after `30`–`49` filled** | `59` |
| `60`–`69` | P3 stretch features | `64`–`69` |
| `70`–`79` | **Endur's own platform surfaces** | `73`–`79` |

**The page block overflowed on 2026-08-23** and three new page/feature docs took `56`–`58`.
The alternative was renumbering `30`–`49`, which would have invalidated several hundred
cross-references in docs and in code comments to save a filing inconsistency. Two of the three
are genuinely cross-cutting anyway — `56` reads what every feature writes, `57` spans auth,
people and the permission engine — and `58` is the odd one out, filed next to them rather than
alone. **Do not renumber them back**, for the same reason `60`–`63` says so.

A file marked *Placeholder* has a reserved number, a stated purpose, and a **"write this
when"** trigger — but no decided content. Do not treat one as a specification, and do not feed
one in as a build prompt.

## Using a doc as a prompt

Each page/feature doc is written so this works cold:

> Read `architecture/_MEMORY.md`, `architecture/11-PERMISSION-ENGINE.md`, and
> `architecture/37-PAGE-form-builder.md`. Build what 37 specifies. Follow the invariants.

Always include `_MEMORY.md` — it carries the invariants that the page doc assumes rather
than repeats. Include `11` for anything behind auth, and `24` for anything that renders.

## The page/feature doc template

Every **specified** file numbered 30+ follows this exactly. If a section is empty, it says
`None`, so a missing section always means an incomplete doc.

**Placeholders are exempt** and use their own shape — `Why this slot is reserved` / `What will
go here` / `Write this when`. That difference is deliberate: a placeholder wearing the spec
template would read as a specification, and someone would build from it.

```
# <n> — <Page name>

Phase: P1|P2|P3 · Milestone: M0|— · Design ref: design_specs/design/0X §Y

## Purpose            why this screen exists, one paragraph
## Route & access     path, which world, who may reach it
## Capabilities       exact capability strings checked, per action
## Data contract      endpoints consumed, DTOs in and out
## State              what is local, what is store, what autosaves
## Components         drawn from 24-COMPONENT-INVENTORY
## Interactions       happy path, then edge cases
## States             empty · loading · error · 403
## Acceptance         a testable checklist
## Out of scope       what NOT to build, and why
```

## Ground rules

1. **Reference, never duplicate.** No hex colour, font name, or spacing value appears in
   this folder. `npm run audit:drift` scans for them and must return nothing.
2. **A page doc may not invent a component.** Add it to `24-COMPONENT-INVENTORY.md` first.
3. **A page doc may not invent a capability.** Add it to the catalogue in
   `11-PERMISSION-ENGINE.md` §3 first.
4. **Check the lock table** in `_MEMORY.md` § `MAP` before creating source files — two
   people build in parallel here.
