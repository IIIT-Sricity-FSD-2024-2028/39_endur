# 55 — Build order

Phase: all · Owns: no path · Companion: `/PROGRESS.md` (the live state)

The ordered task backlog. **This file is the plan; `PROGRESS.md` is the state.** Task ids are
stable and never reused — `PROGRESS.md`, commit messages and session notes all reference them.

---

## How to read this

| Column | Meaning |
|---|---|
| **id** | `T-###`, stable forever |
| **lane** | `A` backend · `B` console · `C` collection · `X` cross-cutting. Two people never work the same lane simultaneously |
| **needs** | Task ids that must be done first. Blank = startable now |
| **spec** | The doc that specifies it. **Read it plus `_MEMORY.md` before starting** |
| **done when** | Usually "the spec's `## Acceptance` list passes" — the doc is the definition of done |

A task is sized to fit roughly one working session. If one is taking three, it was too big —
split it and record the split in `PROGRESS.md`.

---

## Reality check on M0

**8 days from 2026-08-18. 45 tasks. Two to three people.**

That is roughly two tasks per person per day, and several tasks here are genuinely large
(T-010 the resolver, T-037 the builder). **This is tight enough that the cut-list in `02` §2
is a working tool, not a contingency.**

The honest guidance: get **T-001 → T-014 plus T-025 seed** done first. A seeded demo with a
working middleware chain can pass the evaluation on its own. An unseeded half-built frontend
cannot.

---

## Stage 0 — foundation · blocks everything

| id | lane | needs | task | spec |
|---|---|---|---|---|
| T-001 | X | — | Monorepo scaffold: workspaces, tsconfig, eslint, prettier | `03` §1–3 |
| T-002 | X | T-001 | Docker Postgres, `.env.example`, config parsed by Zod at boot | `03` §4–5 |
| T-003 | X | T-001 | `packages/shared`: `capabilities.ts`, `errors.ts`, `labels.ts`, `dto/common.ts` | `14` §2, `11` §3 |
| T-004 | A | T-002 | Prisma schema, full data model, first migration | `10` §2–5 |

**T-003 before any feature work.** The capability catalogue and error codes are referenced by
everything; adding them later means editing every file that guessed.

## Stage 1 — the middleware chain · the P1 graded artifact

| id | lane | needs | task | spec |
|---|---|---|---|---|
| T-005 | A | T-002 | `context`, `requestId`, `requestLogger`, `security`, `bodyParser`, global `rateLimit` | `12` §3, §4.1–4.5 |
| T-006 | A | T-004,T-005 | `tenantResolver` + tenant-bound Prisma client | `12` §4.6, `10` §8 |
| T-007 | A | T-006 | Sessions, argon2id, `/login` `/logout` `/me`, atomic `/register` | `15` §2, §5 |
| T-008 | A | T-007 | `csrfProtection`, cookie principals only | `12` §4.8 |
| T-009 | A | T-003,T-005 | `validate(Dto)` + `errorFunnel` + the error envelope | `12` §4.9, §4.16, `13` §5 |
| T-010 | A | T-004 | **GRANT resolver** — collect, scope, params, decision trace, cache | `11` §5–7 |
| T-011 | A | T-004 | `db/graph.ts` recursive CTEs, depth-guarded, tenant-scoped | `10` §6 |
| T-012 | A | T-010,T-011 | `requireCapability` + `requireEntitlement` | `12` §4.10–4.11, `16` §4 |
| T-013 | A | T-006 | `auditWriter` + `ctx.tx` same-transaction flush | `12` §4.14 |
| T-014 | A | T-012,T-013 | **Route-enumeration test** + chain integration tests | `51` §3–4 |

**T-014 is not optional and not last-if-there-is-time.** It is what makes INV-003 mechanical
instead of a matter of discipline, and it is the single highest-value test in the codebase.

## Stage 2 — API features

| id | lane | needs | task | spec |
|---|---|---|---|---|
| T-015 | A | T-012 | Org, presets, `POST /org/setup` single-transaction commit | `13`, `50` §1 |
| T-016 | A | T-012 | Units CRUD, reparent with cycle check, impact preview | `13`, `32` |
| T-017 | A | T-012 | Roles, bulk grants matrix, warnings | `13`, `33` |
| T-018 | A | T-012 | People, assignments, CSV import + preview | `13`, `34` |
| T-019 | A | T-012 | Subjects | `13`, `35` |
| T-020 | A | T-012 | Templates, clone, bulk questions | `13`, `36`, `37` |
| T-021 | A | T-012 | Campaigns, launch (idempotent), audience resolve | `13`, `38` |
| T-022 | A | T-021 | Public respondent endpoints, uniform 404s, payload allowlist | `13` §6, `39` |
| T-023 | A | T-021 | Results aggregation + k-anonymity gate | `13`, `40`, `52` §2 |
| T-024 | A | T-023 | `GET /home` — one call | `13`, `46` |
| T-025 | A | T-015..T-021 | **Seed: 5 presets + 4 demo orgs with historical responses** | `50` §1–4 |

> **T-025 lands 22 Aug, not 26 Aug** (`02` §2). A seeded demo alone can pass; an unseeded live
> build cannot.

## Stage 3 — frontend foundation

| id | lane | needs | task | spec |
|---|---|---|---|---|
| T-026 | X | T-001 | Vite + React + TS, three route trees, three error boundaries | `20` §2–3 |
| T-027 | X | T-026 | `tokens.css` / `organic.css` / `endur.css`, **self-hosted fonts** | `21` §2–4 |
| T-028 | X | T-026 | `labels.ts`, `vocabularySlice`, `authSlice`, store | `22` §3, `23` §2 |
| T-029 | X | T-026 | `lib/api.ts` — cookies, CSRF header, `ApiError` | `20` §4 |
| T-030 | B | T-027,T-028 | `AppShell`, `Sidebar`, `TopBar`, `PageHeader`, `VocabularyChips` | `24` §2 |

**T-028 before any page component exists.** `labels.ts` is three lines and the most important
file in the frontend — write it first so no component ever gets the chance to hardcode a noun.

**T-030 is a hand-off.** Lane B ships the shell before starting the wizard, or lane C is
blocked or builds a second shell.

## Stage 4 — M0 screens

| id | lane | needs | task | spec |
|---|---|---|---|---|
| T-031 | B | T-030,T-029 | Landing, sign in, create org | `30` |
| T-032 | B | T-031,T-015 | **Setup wizard, 5 steps** — never cut | `31` |
| T-033 | B | T-030,T-016 | `<UnitTree>` component + structure page | `32`, `24` §4 |
| T-034 | B | T-030,T-019 | Subjects | `35` |
| T-035 | C | T-030,T-020 | Template library | `36` |
| T-036 | C | T-027 | `<QuestionEditor>` ×6 + `<QuestionCard>` + `kinds.ts` — **the inputs landed at T-035** (`N-031`); departures in `N-034` | `24` §5, `37` §The six types |
| T-037 | C | T-036,T-020 | Form builder page — **every component it needs exists**; stack, reorder, autosave, preview | `37` |
| T-038 | C | T-030,T-021 | Campaigns 3-step + **`<ShareSheet>` + QR** | `38`, `24` §6 |
| T-039 | C | T-035,T-022 | **Respondent flow** — **three** edge states, not four (`CONF-015`); never cut. Departures in `N-039`–`N-041` | `39` |
| T-040 | C | T-023 | Results (cut-down table first, then full) | `40` |
| T-041 | B | T-024 | Home dashboard | `46` |

> **T-038's share sheet lands 22 Aug, before T-039.** Highest-risk component in the build:
> canvas rendering, tunnel URL, phone reachability (`_MEMORY.md` N-004).

## Stage 5 — M0 hardening

| id | lane | needs | task | spec |
|---|---|---|---|---|
| T-042 | A | T-021 | **Resolve `OPEN-005`** — campaign status derived-on-read vs scheduler. Record as a DEC | `17` |
| T-043 | X | — | **Resolve `OPEN-002`** — public URL / tunnel. Test QR on two real phones | `50` §6 |
| T-044 | X | T-041 | **Vocabulary nonsense audit** across every screen — 24 Aug | `22` §5 |
| T-045 | X | all | **Three full demo rehearsals** on the venue network | `50` §5 |

`T-042` and `T-043` are decisions, not code, and both are M0-critical. Do them early — they
are cheap now and expensive on 25 Aug.

---

## After M0

Coarser on purpose; re-plan once M0 lands and the real pace is known.

**Remainder of P1** — RLS policies (`10` §8) · idempotency middleware · scoped rate limits ·
`17` written properly · password reset · audit read surface.

**P2** — pages `33` powers grid, `34` people UI, `41` settings, `42` simulator, `47` profile,
`48` uploads · accessibility pass (`26`) · error handling (`25`) · component tests (`28`) ·
`54` kept current.

**P3** — **resolve `OPEN-001` by 15 Oct** (the Redux shape, `23` §4), then the store migration
· analysis (`43`) · improve loop (`44`) · public API (`45`).

---

## Rules

1. **Read the spec doc and `_MEMORY.md` before starting a task.** The invariants live in
   `_MEMORY.md` and the page docs assume them rather than repeat them.
2. **A task is done when its spec's `## Acceptance` list passes** — not when it renders.
3. **Update `PROGRESS.md` in the same commit** as the work. A stale progress file is worse
   than none, because the next session trusts it.
4. **Do not start a task whose `needs` are unmet.** If you must, record the stub in
   `PROGRESS.md` under Debt so it is not forgotten.
5. **Check the `MAP` lock table** in `_MEMORY.md` before creating files — two people build in
   parallel here.
6. **A new capability, component, or endpoint goes in its catalogue first** — `11` §3, `24`,
   `13` respectively. This is what kept the docs consistent through three revisions.
