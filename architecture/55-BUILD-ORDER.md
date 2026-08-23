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
| T-040 | C | T-023 | Results — full view, not the cut-down table. Fixed a 4675% response rate (`N-043`) and a CSV header that said the English noun (`N-044`) | `40` |
| T-041 | B | T-024 | Home dashboard — **STAGE 4 COMPLETE**. Found the response rate of `N-043` in a second reader, on the first screen after sign-in (`N-046`); `<TrendChip>` refused (`CONF-017`) | `46` |

> **T-038's share sheet lands 22 Aug, before T-039.** Highest-risk component in the build:
> canvas rendering, tunnel URL, phone reachability (`_MEMORY.md` N-004).

## Stage 5 — M0 hardening

| id | lane | needs | task | spec |
|---|---|---|---|---|
| T-042 | A | T-021 | **Resolve `OPEN-005`** — campaign status derived-on-read vs scheduler. Record as a DEC | `17` |
| T-043 | X | — | **Resolve `OPEN-002`** — public URL / tunnel. Test QR on two real phones | `50` §6 |
| T-044 | X | T-041 | **Vocabulary nonsense audit** across every screen — 24 Aug · **done 20 Aug**, four findings, three of them now mechanical (`22` § What T-044 found, `N-048`, `N-049`) | `22` §5 |
| T-045 | X | all | **Three full demo rehearsals** on the venue network | `50` §5 |
| T-046 | B | T-041 | **Settings — the Words card** (`D-010`). The cut-list keeps it and `<VocabularyChips>` links `#words` from every console page, so `/app/settings` was an M0 route behind a scaffold. Extracted `<WordsEditor>` from wizard step 4 rather than forking it · **done 21 Aug** | `41`, `24` §4 |
| T-047 | A | — | **CSRF cookie lifetime + self-heal** (`D-009`). It had none beside a 7-day session, so reopening the browser left a signed-in caller with no token and every mutation failing permanently · **done 21 Aug** | `12` §4, `15` §2 |
| T-048 | A | — | **A separate test database** (`D-004`). `globalSetup` creates and migrates `endur_test`; `setupFiles` points each worker at it before `lib/config.ts` reads `.env`. Two guards refuse to run against the development database · **done 21 Aug** | `03` §5 |
| T-049 | A | — | **Register retries a slug collision** (`D-006`). A P2002 on `slug` takes the next slug rather than answering 500; the retry uses a random suffix, because a sequential retry needs as many attempts as there are contenders. Found `N-055` while checking it · **done 21 Aug** | `15` §5, `30` |

`T-046` and `T-047` were not planned. They came out of the first walkthrough of the running
app on 21 Aug, which is the argument for walking it early — 45 tasks of green tests had not
found either one, because both are about what survives BETWEEN sessions and what a sidebar
promises, and neither is a thing a unit test thinks to ask.

`T-042` and `T-043` are decisions, not code, and both are M0-critical. Do them early — they
are cheap now and expensive on 25 Aug.

---

## Stage E — the first evaluation · ABOVE EVERYTHING BELOW

Opened 23 Aug when the graded criteria arrived: a complete working application, five
mandatory middleware types — **logging, error handling, file upload, security,
router-level** — and **logs and error information written to files at regular intervals**.

**COMPLETE — 23 Aug.** All five tasks built, tested and documented in one session. What
follows is the record; the detail is in `PROGRESS.md`'s session log for that date.

| id | lane | what landed | spec |
|---|---|---|---|
| ~~T-061~~ | A | **Multipart parsing and the upload routes.** `middleware/upload.ts` — hand-written rather than `multer`, one file, one field, images only, and mounted **per route** on the four upload routes so the JSON-parser exception cannot spread. Size counted as the bytes arrive; on refusal it unpipes and drains rather than destroying the request, so the 413 gets back. `lib/imageBytes.ts` sniffs format and dimensions from headers and strips metadata (`DEC-036`, resolving `OPEN-008`); `lib/storage.ts` writes tenant-partitioned to disk. Plus `GET /files/:id`, whose chain is the shortest in the app | `48`, `12` §4.4 |
| ~~T-062~~ | B | **`<FileUpload>` and its two placements** — the logo card in Settings, and the avatar on `/app/profile`, which stops being a placeholder and becomes partially real. `apiUpload()` added to the one client; the browser writes its own `Content-Type` because only it knows the boundary | `48`, `24`, `41`, `47` |
| ~~T-063~~ | A | **Logs and errors written to files.** `lib/logFile.ts` + `pino.multistream`: `app-<date>.log` and `error-<date>.log` alongside stdout, daily and size rotation, retention by the date in the filename, synchronous writes, and a failure that **fails off rather than taking the app down**. `18` rewritten from its placeholder | `18`, `12` §4.2 |
| ~~T-064~~ | A | **Router-level middleware pass.** `middleware/chains.ts` — links 6–8 as four different `router.use()` chains. `tenantResolver` became a factory and lost both path-regex exception lists, because the mount point already knows what they were tracking. Repays `D-017` | `12` §2, §5 |
| ~~T-065~~ | A | **The CSV size contradiction.** One number, `CSV_MAX_CHARS`, **below** the parser's limit so a field error wins over `PAYLOAD_TOO_LARGE`. `12` §4.4 rewritten: it described a streaming CSV parser that was never written. Repays `D-016` | `12` §4.4, `34` |

**What this stage proves, and the order to show it in:** `app.ts` is application-level
middleware, a feature router is router-level and the chains **differ between routers**, a
route definition is per-route, and `errorFunnel` is a four-argument error handler registered
last. `12` §2 carries a table naming which kind each box is.

---

## Stage 6 — P2 build-out · after M0, not before it

Opened 23 Aug from a read-only survey of four questions. **No task here is on the path to the
26 Aug milestone**; `T-043`, `T-045` and `D-005` are. The ids are fixed here so that
`PROGRESS.md` and this file cannot drift, and the reasoning behind each is in `PROGRESS.md`'s
23 Aug session log entry rather than repeated.

| id | lane | needs | what | spec |
|---|---|---|---|---|
| T-050 | B | — | **People UI** — list, create, invite, assignments. The one thing that breaks a cold end-to-end run: nine endpoints and CSV import have existed since `T-018`, and `lib/people.ts` exports two read-only hooks. Do this before any other Stage-6 task | `34` |
| T-051 | B | T-050 | **Person detail and my account.** `47` reuses `34`'s anatomy; building them apart means building the same panel twice | `34`, `47` |
| T-052 | B | T-050 | **Roles and the powers grid.** Repays `D-008` — `describe()`'s English power labels are this doc's design work, not something to invent from outside it | `33`, `11` §3 |
| T-053 | A | — | **Mount `POST /authz/simulate`.** `authz/simulate.ts` exports `simulate()`; no router mounts it. `13` §Trust already specifies it. Repays `D-014` | `13`, `11` §6 |
| T-054 | C | T-053 | **Permission simulator page** | `42` |
| T-055 | A | — | **RLS policies.** Layer 2 of `10` §8. Repays `D-001` and `D-003` — eleven services currently check `orgId` by hand and one forgotten call is a cross-tenant read | `10` §8, `16` §1 |
| ~~T-056~~ | X | — | **DONE 23 Aug — `DEC-033`.** An operator is a separate principal kind, not a bigger grant. `19-PLATFORM-OPERATORS.md` written; `OPEN-007` resolved; `INV-011` added | `19` |
| T-057 | A | — | **Billing surface and seat metering** — `GET /billing`, `/billing/usage`, `/billing/plans`, `POST /billing/tier`, `billable_seats`. Repays `D-012`, `D-013`, `D-015`. `billing.read` and `billing.update` have been in the catalogue since `T-003`; the routes have never existed. **No prices** — DEC-035 | `49`, `16` §5 |
| T-058 | B | T-057 | **The plan and billing page** — usage with its breakdown, `<PlanPicker>` with a **Join** button per tier (DEC-035, no checkout), the sign-up plan step, and `<OverLimitBanner>` in `<AppShell>`. `16` §6: an over-limit org still collects and still reads results | `49` |
| T-059 | A | T-057 | **Platform backend** — `platform_users`, `platform_audit_log`, the separate login and cookie, `requirePlatform()`, and the aggregate-only db seam. **`INV-011` is asserted here**, by a test that tries to select `answers` and fails | `19` |
| T-066 | B | T-059 | **`/ops` platform console** — the estate list, one org's counts, plan override, suspend, and messaging an org's administrators. A **fourth route tree** with its own error boundary | `70` |
| T-067 | B | T-059 | **`/ops/analytics`** — tier mix, movement, trials and conversion, quiet organisations. Owner-only. The four decisions in `71` § "The decisions inside these numbers" are the point of the task — counts, never money (DEC-035) | `71` |
| ~~T-068~~ | X | — | **DROPPED 23 Aug — `DEC-035`.** Was "seed `plan_prices`". There is no pricing and no such table; a tier is joined with a button | `49`, `19` §10 |
| T-060 | X | T-050 | **Cold-start end-to-end pass.** Distinct from `T-045`: that rehearses the *seeded* demo, this starts at `/start` with an empty organisation and walks create org → people → structure → subjects → template → campaign → respond → results | `50`, `01` §4 |

## After Stage 6

Coarser on purpose; re-plan once M0 lands and the real pace is known.

**Remainder of P1** — RLS (`T-055`) · `17` written properly · password reset · audit read
surface. *Idempotency middleware and scoped rate limits were on this list and are now built —
`middleware/idempotency.ts` is mounted on the public, people, templates and campaigns routers.*

**Rest of P2** — `48` uploads · accessibility pass (`26`) · error handling (`25`) · component
tests (`28`) · `54` kept current. *`41` settings was on this list and landed early as `T-046`.*

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
