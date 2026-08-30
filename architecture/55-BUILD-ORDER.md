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

**Nothing in this stage or the next has been dropped.** Asked directly by the owner on
24 Aug, about the four greyed sidebar items and the missing tiers, so it is worth stating in
the plan rather than only in `PROGRESS.md`: `Roles` is `T-052`, `Inbox` is `T-079`/`T-080`,
`Analysis` is `T-081`/`T-082`, `Reflect` is `T-083`/`T-084`, and the tiers are
`T-057`/`T-058`. Every one has a complete spec. They are **sequenced behind M0**, not
abandoned — and two of the four are sequenced behind `T-057` specifically, which is the part
that was hard to see. `PROGRESS.md` § *"Why is that item still greyed?"* is the one-screen
version of this.

Opened 23 Aug from a read-only survey of four questions. **No task here is on the path to the
26 Aug milestone**; `T-043`, `T-045` and `D-005` are. The ids are fixed here so that
`PROGRESS.md` and this file cannot drift, and the reasoning behind each is in `PROGRESS.md`'s
23 Aug session log entry rather than repeated.

| id | lane | needs | what | spec |
|---|---|---|---|---|
| T-050 | B | — | **People UI** — list, create, invite, assignments. The one thing that breaks a cold end-to-end run: nine endpoints and CSV import have existed since `T-018`, and `lib/people.ts` exports two read-only hooks. Do this before any other Stage-6 task | `34` |
| **T-051** ✅ | B | T-050 | **BUILT 2026-08-24. Person detail and my account.** Both pages, and `<PowersByPlace>` is the panel `34` and `47` would otherwise have built twice (`24` §4, INV-009). Backend: `GET`/`PATCH /profile` and `POST /profile/password` — the three routes `13` § Profile had catalogued and nobody had written — plus `features/people/powers.ts`, now the ONE caller of the resolver for this question. **It found a live INV-005 break:** `readPerson` re-found the unit BY NAME, and two units may share one, so a person with a position in each had one unit's powers printed under the other's heading. `Position` gained `unitId`, `roleLevel` and `validTo`; `PersonDetail`'s `powersByPlace` type was named so `ProfileView` could reuse it rather than fork the renderer. `POST /profile/password` is the one authenticated route on the route-enumeration allowlist, argued in place | `34`, `47` |
| T-052 | B | T-050 | **Roles and the powers grid.** Repays `D-008` — `describe()`'s English power labels are this doc's design work, not something to invent from outside it | `33`, `11` §3 |
| T-053 | A | — | **Mount `POST /authz/simulate`.** `authz/simulate.ts` exports `simulate()`; no router mounts it. `13` §Trust already specifies it. Repays `D-014` | `13`, `11` §6 |
| T-054 | C | T-053 | **Permission simulator page** | `42` |
| T-055 | A | — | **RLS policies.** Layer 2 of `10` §8. Repays `D-001` and `D-003` — eleven services currently check `orgId` by hand and one forgotten call is a cross-tenant read | `10` §8, `16` §1 |
| ~~T-056~~ | X | — | **DONE 23 Aug — `DEC-033`.** An operator is a separate principal kind, not a bigger grant. `19-PLATFORM-OPERATORS.md` written; `OPEN-007` resolved; `INV-011` added | `19` |
| **T-057** | A | — | **Billing surface and seat metering. THE HEAVIEST TASK ON THIS BOARD, and it does not look it.** It gates `T-082` and `T-083`, which is *two of the four greyed sidebar items* — and `D-012` means no organisation has ever had a subscription row, so `requireEntitlement` falls back to Bronze and every Gold surface `402`s for every user in the product. Building the improve loop or the analysis page first produces a screen nobody can open.<br><br>**Billing surface and seat metering** — `GET /billing`, `/billing/usage`, `/billing/plans`, `POST /billing/tier`, `billable_seats`. Repays `D-012`, `D-013`, `D-015`. `billing.read` and `billing.update` have been in the catalogue since `T-003`; the routes have never existed. **No prices** — DEC-035 | `49`, `16` §5 |
| **T-088** ✅ | B | — | **BUILT 2026-08-24. THE TIER PICKER AT SIGN-UP — `DEC-048`, and the owner asked for this one by name.** One step between account creation and the setup wizard: three buttons, Bronze / Silver / Gold, and the one pressed is the one you are on. `register` writes the `subscriptions` row with the chosen tier and `status: 'active'`. **Deliberately carved out of `T-057`/`T-058`** — it needs neither the seat meter, nor `/billing/usage`, nor `<OverLimitBanner>`, nor the billing page, and `src/backend/billing/entitlements.ts` (TIERS, TIER_ENTITLEMENTS, `tierIncludes`) plus a mounted `requireEntitlement` already exist. What is missing is **the row ever being written**. **Repays `D-012`, and therefore unblocks `T-082` and `T-083`** — the two greyed pages that `402` for every user today. Enterprise is not on the picker: it is operator-assigned (`19` §4). **Built as specified, plus two things the spec did not know about:** `account.*` and `billing.*` were in **no tier at all** (`16` §3, now `D-028`), and `requireEntitlement` had **no tests whatsoever** — `test/tiers.test.ts` is new and is why `D-012` could not have survived it | `49` § Interactions, `16` §7, `30` |
| T-058 | B | T-057, T-088 | **The plan and billing page** — usage with its breakdown, `<PlanPicker>` with a **Join** button per tier (DEC-035, no checkout), ~~the sign-up plan step~~ (**moved to `T-088`**) and `<OverLimitBanner>` in `<AppShell>`. `16` §6: an over-limit org still collects and still reads results | `49` |
| **T-059** ✅ | A | ~~T-057~~ **none** | **BUILT 2026-08-26. Platform backend.** `platform_users`, `platform_sessions`, `platform_audit_log`, `organizations.suspended_at`, the `endur.ops` cookie, `requirePlatform()`, and the aggregate-only db seam. **`INV-011` is asserted by a test that tries to select `answers` and fails**, and by two more that try through a nested `include` and by writing inside a tenant. `N-058` was checked before starting and held — **`DEC-071`** drops the `T-057` dependency rather than waiting it out | `19` |
| T-066 | B | T-059 | **`/ops` platform console** — the estate list, one org's counts, plan override, suspend, and messaging an org's administrators. A **fourth route tree** with its own error boundary | `70` |
| T-067 | B | T-059 | **`/ops/analytics`** — tier mix, movement, trials and conversion, quiet organisations. Owner-only. The four decisions in `71` § "The decisions inside these numbers" are the point of the task — counts, never money (DEC-035) | `71` |
| ~~T-068~~ | X | — | **DROPPED 23 Aug — `DEC-035`.** Was "seed `plan_prices`". There is no pricing and no such table; a tier is joined with a button | `49`, `19` §10 |
| T-060 | X | T-050 | **Cold-start end-to-end pass.** Distinct from `T-045`: that rehearses the *seeded* demo, this starts at `/start` with an empty organisation and walks create org → people → structure → subjects → template → campaign → respond → results | `50`, `01` §4 |

## Stage 7 — the four asks · opened 2026-08-23

From four owner instructions in one message: **complete every disabled sidebar page** ·
**both kinds of admin can see logs** · **an organisation can make accounts for its own
levels** · **a feedback cycle can be open to everyone or to the organisation only,
configurable**.

Documentation for all four is **done** — `56`, `57`, `58` and `72` written; `10`, `11`, `12`,
`13`, `14`, `15`, `18`, `19`, `24`, `33`, `34`, `38`, `39`, `43`, `44`, `52` amended; seven
decisions (`DEC-037`…`DEC-043`), one invariant (`INV-012`) and one conflict (`CONF-019`)
recorded. This table is what is left to build.

**Nothing here is M0.** `T-043`, `T-045` and `D-005` still come first.

### 7a · The access toggle — DEC-037

| id | lane | needs | what | spec |
|---|---|---|---|---|
| ~~T-069~~ | A | — | **DONE 23 Aug.** `campaigns.access` end to end — the column with its `CHECK`, `campaign_participants`, the after-launch trigger extended to two columns (and renamed, because `endur_anonymous_is_immutable` was a lie once it guarded two), `CampaignAccess` in the DTO and on the public payload, `resolveCampaign` + `requireMembership` on both public routes. **Building it surfaced `D-022`**, which `DEC-045` closes: the audit row for a submission was about to carry the member's user id | `38`, `10` §4.3, `12` §4.10c |
| ~~T-070~~ | C | T-069 | **DONE 23 Aug.** Step 2's own question with its consequence lines, `access` on `<ShareSheet>` (replacing the line that would be false), the two respondent dead-ends, and `<AccessNotice>` — **three sentences and one deliberate silence**, not the four this line said; see `24` §7 | `38`, `39`, `24` §7 |

### 7b · Accounts — DEC-038, and the escalation hole DEC-039

| id | lane | needs | what | spec |
|---|---|---|---|---|
| ~~T-071~~ | A | — | **DONE 23 Aug**, and mounted on `POST /people/import` as well — the import creates positions too, so a guard on one route would have been worse than none. `requireNoEscalation` first, on its own. `11` §5b, mounted on `POST /people/:id/assignments`. **This is a live hole in shipped code** (`D-018`) and it is repaid whether or not anything else in Stage 7 gets built | `11` §5b, `12` §4.10b |
| ~~T-072~~ | A | T-071 | **DONE 24 Aug.** `account_invites` + `users.disabled_at`, the three capabilities (seeded in `50` §1), the three routes, `/auth/activate/:token` both verbs, and revocation that deletes `sessions` rows **and outstanding invites**. Found and closed two live holes on the way: `D-024` (a fake revoke on `PATCH /people/:id`) and `D-026` (**a person you created was invisible to you**) | `57`, `15` §5 |
| T-073 | B | T-072, T-050 | **Accounts in the UI.** The `Invite` row action, the account panel on person detail, `<InviteLink>`, and the public `/activate/:token` page | `57`, `34`, `24` §6c |

### 7c · The two logs — DEC-040, DEC-041, DEC-043

| id | lane | needs | what | spec |
|---|---|---|---|---|
| ~~T-074~~ | A | — | **DONE 23 Aug — and superseded in part by `DEC-045`, which re-keys the rule on the ACTION rather than the principal.** `audit_log.ip` is NULL for non-user principals. One line in `db/tx.ts` and two tests. **Do this before `T-075` renders anything**, because the page is what makes the leak live | `10` §5, `52` §6, DEC-040 |
| ~~T-075~~ ✅ | A | T-074 | **BUILT 2026-08-25. The audit read surface.** `GET /audit` with its filters and cursor, `outcome` on the row, denials written for mutating capabilities | `56`, `13` §Trust |
| ~~T-076~~ ✅ | B | T-075 | **BUILT 2026-08-25. `/app/logs`.** The table, the expand-to-trace, the refusals-only toggle, and **`<DecisionTrace>` — which `T-054` also needs, so whoever is second extends rather than forks** | `56`, `24` §6c |
| T-077 | A | T-059 | **Platform log routes.** `platform.logs.read`, the file list, the bounded read, and the three-way path guard | `72`, `19` §4 |
| T-078 | B | T-077 | **`/ops/logs`.** `<LogViewer>`, filters in the URL, `requestId` collapse-to-one-request | `72` |

### 7d · The remaining sidebar pages — CONF-019

| id | lane | needs | what | spec |
|---|---|---|---|---|
| T-079 | A | — | **Inbox backend.** `inbox_state`, five routes, and the queue read **through `features/results/service.ts`** so the k-anonymity gate is not forked | `58` |
| T-080 | C | T-079 | **`/app/inbox`.** Four tabs, `<ResponseCard>`, the keyboard queue — and **`<ScoreBadge>`, which is catalogued but has never been built** | `58`, `24` §3 |
| **T-081** ✅ | A | — | **BUILT 2026-08-25. Analysis backend, rule-based** (`DEC-042`). Themes, lexicon sentiment, drivers as correlation over `numeric_value`. No outbound HTTP client exists in the feature and a test asserts its absence — **with comments stripped first**, so the check cannot be satisfied by deleting its own explanation. `features/analysis/` holds **no query at all**: `readCorpus()` returns a discriminated union whose `comments` exist only on the unsuppressed branch, so the k-anonymity gate is the **type** rather than a check somebody remembers (`DEC-062`). **Found `D-033`** — `analysis.read` was in no row of the seeded matrix, so the route would have 403'd for every user of every org including a Gold one (`DEC-063`) | `43`, `50` §1 |
| **T-082** ✅ | C | T-081, ~~T-057~~ **T-088 ✅** | **BUILT 2026-08-25. `/app/analysis`.** Needed `T-057` for a real 402 path — the 402-vs-403 demonstration is the point of the screen — and **`T-088` supplied it on 24 Aug** by writing the subscriptions row. **Two failures, two screens:** 403 says an administrator, 402 names the tier and what it adds, and neither ever says the other's sentence. Reliability rides on the strip **and** on every panel heading, because the strip scrolls away. The drill-through's own 403 renders inside the panel with the analysis still on screen. **No charting library** — the mockup is already an inline SVG and a conic gradient, so `24` §10's Recharts row is superseded rather than unused (`DEC-064`); four visuals are page-local by `DEC-065`. Sidebar item un-disabled in the same commit | `43`, `16` §3, `24` §3 |
| **T-083** ✅ | A | ~~**T-057**~~ **T-088 ✅** | **BUILT 2026-08-25. Improve-loop backend.** Three tables, the finalisation trigger, and the ordering constraint enforced in the API. ~~`T-057` is a hard prerequisite~~ — **it was, and `T-088` repaid it on 24 Aug.** Every capability here is Gold, and until `D-012` was closed no organisation had ever had a subscription row, so this surface would have `402`d for every user in the product including the demo. It no longer does | `44`, `D-012` |
| **T-084** ✅ | B | T-083 | **BUILT 2026-08-25. `/app/reflect`.** My cycles, the reflection form on `<QuestionInput>` (INV-008), the gap view, the plan — and `<GapBar>` catalogued first. **The last "Soon" tag came off with it** | `44`, `24` §3 |
| T-085 | B | T-070…T-084 | **Un-disable the sidebar.** Five items lose their `Soon` tag as their pages land, one at a time. `navItems.ts` is the last edit of each task, not a task of its own — an item that navigates to a half-built page is what `design_specs/design/02` §7 forbids | `20` §2 |

## Stage 8 — what each tier actually sees · opened 2026-08-24

**From the owner, verbatim:** *"student / lowest tier shouldn't see roles, people and
department pages at all (even if they see nothing actually in it). only courses list. similar
logic for upper tiers."*

Translated out of the education shape (INV-002): **the lowest role level should not see
Roles, People or Structure in the sidebar at all — only the Subjects list.** Their words map
to `Subject` (courses), `Unit` (department) and the L4 role (student).

**Why now, and it is a consequence of `T-072` rather than a new idea.** `50` §1 says of the
L4 row: *"this row only matters for the rare case of someone at that level who does hold an
account."* Provisioning an account for anybody in the graph became a one-click action on
24 Aug. The case stopped being rare, and nobody had designed what those people see.

**The mechanical finding, which is the actual bug underneath the ask.** `navItems.ts` already
gates every item on a capability (`needs`), and `authz/held.ts` deliberately **discards
scope** — a capability counts as held when there is *any* live allow for it. So:

| Item | `needs` | What L4 actually holds | Today |
|---|---|---|---|
| Structure | `unit.read` | nothing | hidden ✓ |
| Roles | `role.read` | nothing | hidden ✓ |
| **People** | `person.read` | **`person.read: self`** — the UNIVERSAL grant every role gets (`50` §1) | **visible, and lists exactly one person: themselves** |
| **Settings** | `org.read` | **`org.read: all`** — seeded to all four levels so the vocabulary can load | **visible — and a scope gate will NOT fix it, see below** |
| **Subjects** | `subject.read` | **`own_unit` since `T-086`** — it held nothing at all before | **visible ✓** |

**Updated 2026-08-24, after `T-086`.** Subjects is fixed — the seeded matrix now gives L4
`subject.read: own_unit`, and the existing `needs` gate does the rest with no new machinery.
People and Settings are still visible for everybody, and are still `T-087`'s to fix: `T-086`
carried the scope to the client, which is what a gate needs to read, but did not change a
single `needs` — that is one task deliberately, so the mechanism and the per-tier policy can
be reviewed apart.

**And they need two different fixes.** Verified live against a real L4 account, whose whole
capability map is four entries:

| Item | `needs` | bare verb | beyond `self` | what `T-087` does |
|---|---|---|---|---|
| **People** | `person.read` | true | **false** | tighten to `person.read` **beyond `self`** — the scope gate is the fix |
| **Settings** | `org.read` | true | **true** | **a scope gate does nothing.** `org.read` really *is* `all` at L4, correctly — it is seeded to all four levels so the vocabulary loads on first paint. Settings is the **wrong capability**, not a too-wide one: the table above puts it at L1, and `org.update` is L1. Change `needs` to `org.update` |

That distinction is the reason `T-087` is a task rather than a one-line edit, and it would not
have been visible from the doc — it took reading a real account's map.

Two of the three the owner named are already right. **People is wrong for every account in
the product**, not only L4, and it is wrong for the same reason Settings is: `needs` means
*"can act on the organisation"* while the grant it tests can be `self`-scoped or seeded
universally. `held.ts`'s own header admits the class of error (*"a confusing button, not a
security hole"*); this is that error landing on a whole page.

**None of this is an authorisation change.** INV-003 is untouched — `requireCapability`
already refuses these routes correctly and the list endpoints already scope-filter to nothing.
This is `design_specs/design/02` §5's rule — *an action the caller cannot perform is absent,
not disabled* — applied to the sidebar, where it is currently only half true.

| Task | Lane | Needs | What | Spec |
|---|---|---|---|---|
| **T-086** ✅ | A | — | **BUILT 2026-08-24. Scope-aware capability set — `DEC-050`.** `MeResponse.capabilities` is now a **map of capability → widest held scope**, not a list of verbs, so a nav gate can say *"`person.read` **beyond `self`**"*. `authz/held.ts` reports the widest live allow (unchanged key set — `me.test.ts` asserts that on purpose, because carrying the scope was meant to change what the client KNOWS, never which capabilities it is told about); `useCan(cap, atLeast?)` defaults to `self`, so every existing call site means what it always did. **Added `subject.read: own_unit` to L4 in `50` §1**, closing the smaller half of `OPEN-009` — the level that should see the Subjects list now can, and `org.test.ts` asserts the L4 row exactly so a fifth row cannot join it quietly. `test-utils.tsx` still takes an array of capabilities, meaning `all`, so the fourteen component test files that only ask "does this button render" were untouched | `13` § Auth, `50` §1, `20` §6 |
| **T-087** ✅ | B | T-086 | **BUILT 2026-08-24. Per-tier sidebar — `DEC-051`, and `OPEN-009` is closed by the owner's own answer.** `NavItem.minScope` (default `self`) says how far `needs` must **reach** before an item is worth showing. **Two gates changed and nothing else**, and the seeded matrix is untouched: People → `person.read` at `own_unit`; Settings → **`org.update`**, which is a capability change rather than a scope one — `org.read` is `all` at every level including the lowest, so no minimum could ever have hidden it. **L3 keeps People** (owner's call: their roster is real). Four tests, one per level, asserting the **exact** item list — and the L1 list is unaffected, which is what stops them being *"everything must change"*. The rest of the L3 row is deliberately left alone: `OPEN-010` | `20` §2, `24` |

**Decided 2026-08-24 by the owner — `DEC-051`, and `OPEN-009` is closed.** The table below is
the first proposal as written; **it was wrong in three cells** and is kept because the
corrections are the useful part. What shipped is in the two rows beneath it.

| | L1 owner | L2 section head | L3 reviewee-level | L4 lowest |
|---|---|---|---|---|
| Home | ● | ● | ● | ● |
| Structure | ● | ● subtree | — | — |
| Roles | ● | — (`grant.update` is L1) | — | — |
| People | ● | ● subtree | **?** holds `person.read: own_unit` legitimately | — |
| Subjects | ● | ● | ● own_unit | **● read-only — the only one** |
| Templates | ● | ● | — | — |
| Campaigns | ● | ● | ● own_unit | — |
| Analysis / Inbox | ● | ● | — | — |
| Reflect (P3) | ● | ● | ● their own | — |
| Settings | ● | — (`org.update` is L1) | — | — |
| Profile | ● | ● | ● | ● |

**Where that table was wrong.** *"The other cells follow from grants that already exist"* held
for most of it and not for three:

| Cell | The draft said | What shipped, and why |
|---|---|---|
| **L3 × People** | `?` | **Stays.** The owner's call, asked directly and answered: an L3 holds `person.read: own_unit`, so the page lists their real colleagues rather than themselves. A reviewee-level account is a *manager of a small area* at L3 |
| **Settings** | *"— (`org.update` is L1)"* | Right about the level and wrong about the mechanism. `org.read` is `all` at **every** level, seeded so the vocabulary loads on first paint — so **no minimum scope could ever hide Settings**. It was the wrong capability, not a too-wide one. `needs` is now `org.update`. Only reading a real L4 account's map showed this |
| **L3 × Structure, L3 × Templates** | `—` | **Not done.** L3 genuinely holds `unit.read: own_unit` and `template.read: all`, and `template.read` cannot be narrowed by scope at all (`50` §1: templates are org-wide and have no unit, so a unit scope would mean nobody could read them). Deferred by the owner — `OPEN-010` |

Treat the table above as a sketch rather than a spec: it was written before anyone had read a
real account's capability map, and it has now been wrong three times.

**Ordering that matters, in one place:**

```
T-074  before  T-076      the IP fix before the page that would expose it
T-071  before  T-072      the guard before the route that needs it most
T-057  before  T-082      a real subscription row before a 402 can be demonstrated
T-057  before  T-083      or the whole improve loop 402s for everyone, demo included
T-069  before  T-070      the gate before the toggle that sets it
T-085  after   everything the sidebar is un-disabled last, per page
T-086  before  T-087      the scope has to reach the client before a gate can read it
T-088  before  T-082      a real chosen tier before a 402 can be demonstrated on an account
T-088  before  T-083      it is D-012 that 402s the improve loop, and T-088 is what repays it
T-088  not-after T-057    THE POINT OF SPLITTING IT. the picker needs one row written, not
                          the seat meter, the usage breakdown or the billing page
```


## Stage 9 — the second ask · opened 2026-08-24 · CONF-021

**From the owner, verbatim**, after opening the running app and looking at the sidebar:

> *"1. sign in button on homepage is broken — error loading dynamically imported module …
> 2. roles, analytics, inbox and reflect still need to be built (i asked for this before and
> you didnt do it) 3. logging should be visible to admins (i havent seen pages for endur
> admin and superuser yet — so they too)"*

**Item 2 is a repeat instruction and the ledger agrees with the complaint.** `CONF-019` (23
Aug) was the same ask. It was answered by writing specs — `43` and `44` re-tagged buildable,
`58` written from nothing — and then sequencing every one of those tasks behind M0. No code
followed. A spec is not the deliverable; the page is. `CONF-021` records the correction and
promotes the work above the rest of Stage 6.

Nothing in this stage is new specification. Every task below already existed with a complete
spec doc; what changes is **the order**, and one genuinely new task (`T-089`) for the bug.

### 9a · The bug — DEC-054

| id | lane | needs | what | spec |
|---|---|---|---|---|
| **T-089** ✅ | A | — | **BUILT 2026-08-24. A failed lazy import must offer a hard reload.** `PublicBoundary` renders the raw `Error.message` and its only affordance is a client-side `<Link to="/">` — which re-renders inside the same dead module graph and fails identically. `ConsoleBoundary` already gets this right and its comment says why. `describe()` gains one branch for the import-failure class, and the public boundary's affordance becomes `<a href>`. Repays `D-029`. **Proved by reverting:** put the `<Link>` back and exactly one test goes red — the one that clicks the anchor and asserts the event was not `preventDefault`ed. Every other assertion passes against the broken version, because `<Link>` renders an `<a href>` too | `20` §2, `25`, `DEC-054` |

**This is a lane-A task and it is small, but do not fold it into another one.** It is the
first thing the owner listed and it is the failure mode with the widest blast radius on demo
day: every page is lazy, so *any* stale tab loses the *next* route it navigates to, and the
message it currently shows names a `.tsx` file at a `localhost` URL.

### 9b · The four sidebar pages — the promoted order

Unchanged specs, unchanged task ids, unchanged `needs`. Only the position moved.

| # | id | lane | needs | what | spec |
|---|---|---|---|---|---|
| 1 | **T-052** ✅ | B | — | **BUILT 2026-08-24. Roles and the powers grid.** ~~The only one of the four with no backend work at all~~ — **that was wrong and it is worth saying why.** Every route has existed since `T-017`, but **two of the three refusals `33` specifies had never been implemented**: `PUT /grants` carried `requireCapability('grant.update')` and nothing else. Anyone the grid was delegated to could write any role every capability in the catalogue (`DEC-056`), and any administrator could leave the org unadministrable with no undo (`DEC-057`). **A route existing is not a rule existing.** Also repays `D-008` via `DEC-055` — 64 written phrases replacing a four-line derivation that was not merely un-localised but produced *"read resultses"* (`N-059`) | `33`, `11` §3 |
| 2 | **T-079** ✅ | A | — | **BUILT 2026-08-25. Inbox backend** — `inbox_state`, five routes, and the part that mattered: `features/inbox/` **cannot reach `responses`**. It imports `readComments()` from `features/results/service.ts` and `prisma.inboxState`, and touches nothing else (`DEC-058`) — `38` § "Not built" already refused a second ungated path to individual comments, and this is the same mistake made larger. The threshold is applied **per campaign before the merge**, so two below-threshold campaigns do not become a readable sum. `assertVisible` and `readableCampaigns` now share one predicate, which is how "matches `40`'s scope" is true by construction. The write routes are gated too, or `POST /inbox/:id/read` on a guessed uuid is an oracle. DTO gained `questionId` and `scoreMax` (`DEC-059`), both forced by the table rather than chosen. **Found `N-061`/`D-032`**: response scope is decided at the campaign, not the subject — `40`'s behaviour, not this task's | `58` |
| 3 | **T-080** ✅ | C | T-079 | **BUILT 2026-08-25. `/app/inbox`** — four tabs, optimistic marking that reverts **on the card**, `j`/`k`/`e`/`u` with a button for each, and three genuinely different empty screens of which two are deliberately identical (`52` §2). `<ResponseCard>` extended past its catalogued props for state the page must own; **`<ScoreBadge>` built** — `CONF-016` refused it and was right about `40`, but `58`'s number is one person's own rating rather than an average, so the badge got a legitimate caller while the threshold colours stayed refused (`CONF-022`). `DEC-060` came from its own test: opening a card marks it read, which the first version used to evict it from Unread in the frame it expanded. **Also un-disabled `/app/roles`** — `T-052`'s last edit had been missed, so a page live since 24 Aug was reachable only by typing the address | `58`, `24` §3 |
| 4 | **T-081** ✅ | A | — | **BUILT 2026-08-25.** Analysis backend, rule-based (`DEC-042`) — themes by co-occurrence, lexicon sentiment, drivers by Pearson r over `numeric_value`. **Two k-anon gates**, per campaign and over the filtered slice, the second one because `?subjectId=` is otherwise the per-subject breakdown `38` refused. The drill-through carries **`response.read` as well**, so analysis cannot become a way around `40`'s split. **Four engine flaws only the seeded corpora showed** — see `PROGRESS.md` | `43` |
| 5 | **T-082** ✅ | C | **T-081 ✅** | **BUILT 2026-08-25. `/app/analysis`** — the 402-vs-403 screen, demonstrable (`T-088`) and reachable (`D-033`). 29 tests. `<TrendChip>` finally built, `<TrendLine>` and `<ThemeTable>` catalogued in `24` §3 first, **no dependency added** (`DEC-064`). The drivers panel says in words that nothing moves the score on demo data, which is the honest reading of a seed that draws tone and rating independently | `43`, `16` §3, `24` §3 |
| 6 | **T-083** ✅ | A | — | **BUILT 2026-08-25.** Three tables, three **triggers**, and the ordering constraint enforced by an absent route as well as a 404 (`DEC-067`). `reflection.read` seeded **`self` and nothing wider** — `44`'s "supervisor reads the subtree's reflections" narrowed on purpose, because the same doc says that exposes a private self-assessment to a peer (`DEC-066`). 10 tests | `44` |
| 7 | **T-084** ✅ | B | T-083 | **BUILT 2026-08-25. `/app/reflect`** — form, gap, plan, in that order, decided by what the server returns. `<GapBar>` names no winner and has no `valence` prop. `<UpgradeCard>` lifted out of `43` on its second caller | `44`, `24` §3 |
| — | **T-085** ✅ | B | each of the above | **DONE 2026-08-25 — there is no "Soon" tag left in the sidebar.** Still the *last edit of each task*, never a task of its own. Roles ✅ and Inbox ✅ at `T-080`, **Analysis ✅ at `T-082`**, **Reflect ✅ at `T-084`**. **The Roles miss is the argument for the rule:** its page shipped 24 Aug and the item stayed greyed for a day, because nothing asserted the *positive* direction. `Sidebar.test.tsx` now does, per built page | `20` §2 |

**Why Roles first when the owner listed it first anyway.** It is also the cheapest and the
only one that needs no new table, no new route and no new capability. If the two days before
M0 buy exactly one of these four, this is the one that lands.

### 9c · Logs, and Endur's own two consoles — the third item

The owner's third item is **two separate things wearing one word**, and they were already
specified separately because `19` §4 draws the line: an organisation's administrator sees
*their own org's* activity; an Endur operator sees the estate and the log **files**. They are
different principals, different stores, different routes (`INV-011`).

| id | lane | needs | what | spec |
|---|---|---|---|---|
| **T-075** ✅ | A | — | **BUILT 2026-08-25. `GET /audit`** — filters, cursor, `outcome`, and denial rows. `audit_log.outcome` did not exist in the database: `10` §5 has carried it since 23 Aug and the table had not, because **a column no writer sets is a column no reader can trust**, so it landed with its reader. Denials are written when the method is not GET **and** the capability is not a `*.read` (`DEC-068`) — two conditions catching different mistakes, and `writeDenial()` sits beside `flushAudit` in `db/tx.ts` so `ip` and `actor` stay decided in ONE place (`DEC-040`'s lesson). **404s are recorded too**: indistinguishable from a 403 to the caller, but the more interesting of the two to the organisation. Scope filtering is over the TARGET, in SQL, before the page query, so `meta.total` is not a lie (`DEC-070`). Found `DEC-069`: `DecidedBy` was two shapes under one name | `56`, `13` §Trust |
| **T-076** ✅ | B | T-075 | **BUILT 2026-08-25. `/app/logs`** — the table, expand-to-trace, refusals-only toggle, and **`<DecisionTrace>` built at last**, catalogued since 23 Aug with no caller. `T-054` **extends it, never forks it** (INV-009), and it took a `tense` prop so one component can say *"Allowed by"* of a real event and *"Would be allowed by"* of a hypothetical one. The row expands **inside its own cell** rather than into a second `<tr>`: `<ResponsiveTable>` renders one DOM in both shapes and a spanning row would need two. **WRAPPED in `RequireCapability`, unlike Analysis and Reflect** — there is no 402 on a log, so a route guard can say everything there is to say | `56`, `24` §6c |
| **T-059** ✅ | A | — | **BUILT 2026-08-26.** `platform_users`, the separate login and cookie, `requirePlatform()`, the aggregate-only db seam. **`INV-011` asserted by a test that tries.** `N-058` checked and confirmed: `DEC-071` drops the `T-057` dependency. Three new decisions came out of it — `DEC-071` (the dependency), `DEC-072` (its own session store, not a second express-session), `DEC-073` (suspension enforced on the resolution source) | `19` |
| T-066 | B | T-059 | **`/ops` — the Endur admin console.** Estate list, one org's counts, plan override, suspend, message an org's administrators. A **fourth route tree** with its own error boundary | `70` |
| T-067 | B | T-059 | **`/ops/analytics` — the superuser page.** Tier mix, movement, trials, quiet organisations. Counts, never money (`DEC-035`) | `71` |
| T-077 | A | T-059 | **Platform log routes** — `platform.logs.read`, the file list, the bounded read, the three-way path guard | `72`, `19` §4 |
| T-078 | B | T-077 | **`/ops/logs`** — `<LogViewer>`, filters in the URL, `requestId` collapse-to-one-request | `72` |

**"I haven't seen pages for endur admin and superuser yet" is correct and expected** — there
is no way to reach them, by design. `/ops` is a fourth route tree behind a **separate login
and a separate cookie**, and no link from the customer console points at it. `19` §4 is the
doc; `T-059` is what makes the door exist at all, and `T-066`/`T-067` are the two pages
behind it. Until `T-059`, there is nothing to have seen.

**`T-059` landed 26 Aug, so the door exists now.** Everything on the `/api/v1/platform`
prefix is reachable today with `curl` and a cookie — which is exactly what that means. The
four remaining tasks are the rooms: `T-066`, `T-067` (and its `/platform/analytics`
endpoint, deliberately left with the page that argues its four decisions), `T-077`,
`T-078`.

**Ordering inside 9c is not negotiable:** `T-059` is a hard prerequisite for four of the six.
`T-075`/`T-076` had no dependency on it whatsoever and are the half that could start today —
**both are done.** What is left of 9c is the four behind `T-059`.

**Ordering added by this stage:**

```
T-089  first        it is the owner's first item and every lazy route shares the fault
T-052  before  T-079..T-084   cheapest of the four, and the only one with no backend at all
T-075  before  T-076          the read surface before the page that renders it
T-074  before  T-075          ALREADY DONE. the IP fix landed 23 Aug, ahead of both
T-059  before  T-066, T-067, T-077, T-078    no door, no rooms behind it  [DOOR OPEN 26 Aug]
T-085  after   each page      unchanged: the tag comes off as the page lands, never before
```

## After Stage 7

Coarser on purpose; re-plan once M0 lands and the real pace is known.

**Remainder of P1** — RLS (`T-055`) · `17` written properly · password reset · audit read
surface. *Idempotency middleware and scoped rate limits were on this list and are now built —
`middleware/idempotency.ts` is mounted on the public, people, templates and campaigns routers.*

**Rest of P2** — `48` uploads · accessibility pass (`26`) · error handling (`25`) · component
tests (`28`) · `54` kept current. *`41` settings was on this list and landed early as `T-046`.*

**P3** — **resolve `OPEN-001` by 15 Oct** (the Redux shape, `23` §4), then the store
migration · public API (`45`) · the P3 *deepening* of `43` and `44`: themes over time,
drill-through quality, and cycle-over-cycle measurement. *Analysis and the improve loop
themselves moved into Stage 7 by `CONF-019`; `OPEN-003` was resolved by `DEC-042` to unblock
the first of them.*

### 9c · The log export — DEC-074

| id | lane | needs | what | spec |
|---|---|---|---|---|
| **T-090** ✅ | A | T-077, T-078 | **BUILT 2026-08-26. An operator can export a log file, and the copy is audited.** Asked for by the owner directly, and it **supersedes `72` § Out of scope's "no download" row** — whose objection was never *"diagnostics must not leave"* but *"with no audit of where it went"* (`DEC-074`). New capability `platform.logs.export` (BOTH roles, its own capability rather than folded into `platform.logs.read`, because a read is a page on a screen and an export is a file that outlives the session and the retention window), one route, `ndjson` and `csv`, the **same** filters as the view and the **same** name allowlist as the read — a guard applied on one of two routes is not a guard. Chronological and capped, and a capped export says so. Also: `<LogViewer>`'s classes had **no CSS at all** since `T-078`, and the page now names the directory the files are written to (`18` §2) | `72`, `19` §4, `DEC-074` |

### 9d · Four demo surfaces on one engine — `Mithil/plan.md`, `DEC-087` … `DEC-091`

The product showed **one** thing: feedback campaigns. The engine underneath was already
generic, and what was missing was a second and third way to PRESENT it — not a second
engine. Two of these cost almost no new code; two exist to make the tier ladder and a real
write path visible on screen. Build order is the id order, and each is demoable alone, so
the demo survives stopping anywhere along the line.

| id | lane | needs | what | spec |
|---|---|---|---|---|
| **T-091** ✅ | A | — | **BUILT 2026-08-29. Polls, and no new anything.** `POST /campaigns/quick` composes template + one question + the organisation subject + campaign + token in ONE transaction (`DEC-089`), gated on `campaign.launch` — the strictly most privileged verb in the sequence. No question kind, no table, no column, no capability (`DEC-088`). `<QuickDialog>` and two buttons on `/app/campaigns`; success lands on the detail page, which already shows the QR | `Mithil/plan.md`, `DEC-088`, `DEC-089` |
| **T-092** ✅ | A | T-091 | **BUILT 2026-08-30. The suggestion box, and the sentence that stops it looking broken.** The endpoint was already built by `T-091`; what was missing was the **below-threshold state on screen**. `CampaignSummary` now carries `templateCategory` and `resultsThreshold`, so the card can say *"Answers appear once N people have responded. 2 so far."* — the number is the SERVER'S, and the gate is not lowered for the demo. Reading is the **existing Inbox**, whose campaign filter was already there; there is no second reader, which is what INV-006 exists to prevent | `58`, `Mithil/plan.md`, INV-005 |
| **T-093** ✅ | C | T-091 | **BUILT 2026-08-30. `/app/start`, five lanes, one product.** `<StartCard>` has FOUR states because there are four different reasons a lane cannot be pressed, and they are answered differently: a missing **capability** disables the card **with the reason**; a missing **entitlement** keeps it live with a tier chip that lands on `/app/plan`; a surface not built yet says so and does not navigate. Capability first, tier second — the chain's own order (`DEC-091`). Two `TemplateSeed`s per preset so the gallery is never empty and a hotel's poll is not a university's. The Announcement and Booking lanes go live at `T-096` | `Mithil/plan.md`, `24`, `DEC-091` |
| **T-094** ✅ | B | T-088 | **BUILT 2026-08-30. Announcements, at silver.** Two tables, four capabilities (`read` / `create` / `publish` / `delete` — publish is its own verb because publishing is what reaches people), receipts written **at publish time** so the read count has an honest denominator. Audience reuses `features/campaigns/audience.ts` — `audienceUsers()` and a shared `positionFilter()` were extracted there rather than written a second time — and `anyone` deliberately means *every account in the organisation* here, where on a campaign it means *whoever holds the link* and has no denominator at all. The seeded matrix gives `create` to L1–L2 and `publish` to L1, so the gap between the two verbs is real out of the box. Bronze keeps `announcement.read`: 402 on write, 200 on read. Delivery is in-product only and the composer says so | `61`, `Mithil/plan.md` |
| **T-095** ✅ | B | T-088 | **BUILT 2026-08-30. Booking / slot picker, at gold.** Three tables, five capabilities (`read` / `create` / `update` / `delete` / **`cancel`** — cancel is its own verb because it reaches into a decision somebody else made), and a public `/book/:token` served by the **respondent** layout and boundary rather than a fifth world. Capacity is a `SELECT … FOR UPDATE` row lock — in `db/graph.ts`, the one file DEC-007 permits raw SQL — and a **409** for the loser, because a well-formed request that lost a race is not a malformed one. The N+1-concurrent test is the feature, and it found the one real bug in the task: `isolationLevel: 'Serializable'` **on top of** the lock aborts a rightful winner with `40001`, so it was removed (`DEC-092`). Bookings are **identified and live in their own tables** and never join `responses` (`DEC-090`, INV-006), asserted by a grep test over the whole feature directory. Remaining places are **derived**, never stored. The public payload carries remaining and omits capacity and every name | `13` § Booking, `Mithil/plan.md`, `DEC-090`, `DEC-092` |
| **T-096** ✅ | C | T-093, T-094, T-095 | **BUILT 2026-08-30. The gallery's last two lanes go live.** `/app/start`'s Announcement and Booking cards stop being `soon` and become real links gated on `announcement.create` and `booking.create`, keeping their tier chip — **capability first, tier second** (`DEC-091`), so a reader who may not write is told that rather than sold an upgrade. The sidebar gains both, neither gated on the tier: a Bronze administrator reaches the page's own 402 with an upgrade card, which is the demonstration `43` exists for. `/app/plan` and `16` §2 now NAME announcements under silver and booking under gold — a tier that withholds a feature the plan page does not mention looks arbitrary. Demo seed: one published announcement with receipts for every member of staff and a third of them read, and — on gold and above only — one open bookable whose middle slot is **nearly full**, so the *"1 left"* state is on screen before anybody books on stage | `Mithil/plan.md`, `49`, `50` |

---

## Stage 11 — the owner's third pass · opened 2026-08-31 · **BUILT 2026-08-31**

**Twelve reports from one sitting with the running app, sorted into nine tasks.** They are
recorded as `DEC-096`…`DEC-106` and `D-043`…`D-045`, and they are not all the same kind of
thing — which is the first thing to know before picking one up:

| Kind | Which | What it means for you |
|---|---|---|
| **A live bug** | `T-103`'s reinstate, `T-102`'s date window, `T-104` | Something is broken now. It has a reproduction written down |
| **A product decision** | `T-097`, `T-098`, `T-099`, `T-100`, `T-101` | Nothing is broken; the owner changed what the product does |
| **A figure with no source** | `T-102`'s removals | It was never going to work, and printing it was the mistake |

**Two of the twelve were misread on the way in, and the corrections are the reason to read the
`DEC-` entries rather than this table.** *"Enterprise plan is not working"* is one line in
`<PlanPicker>`, not a missing feature (`DEC-099`); *"suspending is suspending every org"* was
checked and **not reproduced**, and is most likely the reinstate bug wearing a second face
(`N-067`).

Build order is id order. **ALL NINE ARE BUILT** (31 Aug). Three things this stage produced that
were not in the change order:

- **`T-097` found the billing period hardcoded in FOUR places, not three**, and two of them
  already disagreed by a day in a leap year (`+ 365 * DAY` versus `setFullYear(+1)`). Nothing
  read the difference, which is why it survived — and `DEC-098` was about to make `period_end`
  the date a downgrade fires on.
- **`DEC-102` had to be corrected against itself.** It says movement is read from `payments`
  *rather than* from `plan.override` audit rows; its own `not` clause requires operator
  overrides to still count, and those deliberately write no `payments` row. It reads **both** —
  disjoint by construction, so nothing is double-counted. See the `built` note on the entry.
- **`T-101` needed the platform WRITE seam widened**, which is the only part of Stage 11 that
  touches `INV-011`. `Notification` and `EnterpriseRequest` join `platform/db.ts`'s allowlist;
  the read surface is unchanged — `Answer` unreachable, `Response` count-only.

| id | lane | needs | what | spec |
|---|---|---|---|---|
| **T-097** ✅ | B | — | **BUILT 2026-08-31. The ladder goes one-way and the period becomes a month.** `POST /billing/tier` refuses a lower or equal rank with a 409 — **server-side, because the missing button is not the rule** (`INV-003`) — and an upgrade captures `priceOf(to) − priceOf(from)` rather than the full new price, which also stops `/ops/earnings` overstating every customer who has ever upgraded. `period_end` moves to one **calendar** month, from **three** separate hardcoded 365-day expressions that must become one constant. `<PlanPicker>` prints `/ month`, and a card below the current tier renders without an action | `16` §7a/§7c/§8, `49`, `DEC-096`, `DEC-097`, ~~`OPEN-015`~~ answered |
| **T-098** ✅ | B | T-097 | **A scheduled downgrade, applied on read.** `subscriptions.pending_tier` + `POST /billing/downgrade`; nothing is captured and nothing changes today; the **first read after `period_end`** moves the tier and clears the column — the same evaluate-on-read trick `readBilling` already uses to repair a missing row (`D-012`). No scheduler, so no `17` dependency. One line of copy on `/app/plan` with a date in it | `16` §7b, `10` §5, `49`, `DEC-098` |
| **T-099** ✅ | B | T-097 | **Enterprise starts working, and it is one line plus a price.** `<PlanPicker>` disables `!selectable` in **all three modes**, including `override` — so the one tier `DEC-048` routes through the operator is unassignable in the only UI that can assign it. Read it as `mode !== 'override'`. Then `priceMinor: 499900`, ₹4,999/month, and the `Priced with you` / `Arranged with us` copy goes with the sentinel it was protecting | `16` §2, `24` §6b, `DEC-099` |
| **T-100** ✅ | B | T-099 | **Request Enterprise → a queue the owner works.** `POST /billing/enterprise-request` (`billing.update`), one `enterprise_requests` row with `open`/`contacted`/`closed`, a partial unique index so a second request is a 409 under two simultaneous clicks, and `<EnterpriseQueue>` on `/ops` behind two new **owner-only** platform capabilities. **A work item, not a bell** — reading it changes nothing. Explicitly **not** `63`, which is outbound multichannel and needs a provider | `49`, `70`, `19` §4, `10` §5, `DEC-100` |
| **T-101** ✅ | B | — | **The operator's message actually reaches the customer.** `messageAdministrators` writes only a `platform_audit_log` row today — **the operator's own table** — so `{ sentTo: 3 }` is returned while nothing has been sent to anybody. One `notifications` row per recipient in the same transaction, surfaced as a **From Endur** tab on `/app/inbox` reusing `58`'s read/unread mechanic. **No capability**, and no `notification.*` module: the row names a `user_id` | `58`, `70`, `10` §5, `DEC-101` |
| **T-102** ✅ | A | — | **`/ops/analytics` prints only figures with a source.** Remove Trials started and Conversion rate — `DEC-048` means nothing writes `trialing`, and `converted` is a hardcoded `0`, so **two of six headline cards could never move**. Remove seats (`D-013`: `subscriptions.seats` has never been written and nothing is billed on it). Move `movement`'s upgrade/downgrade counts onto `payments`, because the `plan.override` source counts **only what operators did**. Make `to` inclusive to end-of-day (`D-044`) and label every point-in-time figure *as of today*. Drop `— never read`; rename *Quiet 30 days* → *Gone quiet* | `71`, `DEC-102`, `DEC-103`, `D-044` |
| **T-103** ✅ | A | — | **Reinstate, and the staff view of `/ops`.** `confirmSuspend()` guards **both** verbs on the typed-name check and the reinstate dialog has no name field, so it returns **silently** — no request, no error (`D-043`). The typed name belongs to suspend alone, and the `disabled` button is the guard; the early return must never be the thing a user meets. Then the suspend **section** goes absent for staff, heading and copy included — `DEC-104`, which makes `70` agree with its own analytics-tab rule | `70`, `D-043`, `DEC-104`, `N-067` |
| **T-104** ✅ | C | — | **`Enter` stops leaving the setup wizard.** The global handler exempts `BUTTON` and `TEXTAREA` only, so naming a unit on step 3 — into an input the `+` button just focused — advances the step instead of adding a row. Exempt every element that takes text. The two properties it must not cost: `Enter` still advances on steps 1 and 4, and still does nothing behind a confirm dialog | `31`, `DEC-105` |
| **T-105** ✅ | C | — | **Dark mode gets its edge back, and `endur.css` loses 157 duplicated lines.** `design_specs/design/01` §4's surface table was light-only, written before dark shipped; the dark token block's own comment says *"the lift has to come from the edge instead"* and the components never followed. Add the border under `[data-theme="dark"]`. Separately, `/* Industry Split Layout */` appears **twice**, so `.preset-grid` is declared three times with different `minmax()` and `gap` — the setup step's spacing is currently decided by cascade order (`D-045`) | `31`, `design_specs/design/01` §4, `DEC-106`, `D-045` |

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
