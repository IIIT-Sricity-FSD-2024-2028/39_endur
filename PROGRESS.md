# Endur — progress

**The live state of the build.** Any Claude session, on any account, reads this first and
updates it before finishing. `architecture/55-BUILD-ORDER.md` is the plan; this file is what
has actually happened.

```
UPDATED   2026-08-18  (T-010 + T-011 — the GRANT resolver works)
PHASE     P1 MIDDLEWARE
MILESTONE M0 = 2026-08-26  ·  8 days  ·  demo 27 Aug  ·  GRADED
STATUS    9/45. The engine is done: chain 0-6/9/15/16 + the GRANT resolver + graph CTEs.
NEXT      T-007 sessions + argon2id (tenantResolver already reads req.session.orgId), then
          T-012 requireCapability — which is now a thin wrapper, since resolve() exists.
```

---

## Start here — cold session checklist

1. Read `CLAUDE.md` (auto-loaded) and **`architecture/_MEMORY.md`** — decisions and invariants
2. Read this file, top to bottom
3. Pick the topmost task in § Board whose `needs` are met and whose lane is free
4. Read that task's spec doc, then build
5. **Before finishing: update § Board, § Session log, and any decision you made**

Do not re-derive architecture. If something seems wrong, check `_MEMORY.md` first — most
surprising choices are deliberate and have a `DEC-` entry explaining why.

---

## Board

Status: ` ` not started · `>` in progress · `x` done · `!` blocked · `~` partial (see Debt)

### Stage 0 — foundation
```
[x] T-001  X  monorepo scaffold, tsconfig, lint
[x] T-002  X  docker postgres, .env, config-at-boot   ← native install, not docker (N-011)
[x] T-003  X  packages/shared: capabilities, errors, labels, dto/common
[x] T-004  A  prisma schema + first migration
```
### Stage 1 — middleware chain  ← the P1 graded artifact
```
[x] T-005  A  context, requestId, logger, security, bodyParser, rateLimit
[x] T-006  A  tenantResolver + tenant-bound prisma
[ ] T-007  A  sessions, argon2id, login/logout/me, atomic register
[ ] T-008  A  csrfProtection
[x] T-009  A  validate(Dto) + errorFunnel + envelope
[x] T-010  A  GRANT resolver  ← largest single task
[x] T-011  A  db/graph.ts recursive CTEs
[ ] T-012  A  requireCapability + requireEntitlement
[ ] T-013  A  auditWriter + ctx.tx
[ ] T-014  A  route-enumeration test + chain integration tests
```
### Stage 2 — API features
```
[ ] T-015  A  org, presets, /org/setup
[ ] T-016  A  units CRUD, reparent, impact
[ ] T-017  A  roles, grants matrix, warnings
[ ] T-018  A  people, assignments, CSV import
[ ] T-019  A  subjects
[ ] T-020  A  templates, clone, bulk questions
[ ] T-021  A  campaigns, launch, audience
[ ] T-022  A  public respondent endpoints
[ ] T-023  A  results + k-anonymity gate
[ ] T-024  A  GET /home
[ ] T-025  A  SEED — 5 presets + 4 demo orgs        ← due 22 Aug
```
### Stage 3 — frontend foundation
```
[ ] T-026  X  vite + react + TS, three route trees
[ ] T-027  X  design system css + self-hosted fonts
[ ] T-028  X  labels.ts + store            ← before any page
[ ] T-029  X  lib/api.ts (cookies + CSRF)
[ ] T-030  B  AppShell, Sidebar, TopBar, PageHeader, VocabularyChips  ← hand-off to lane C
```
### Stage 4 — M0 screens
```
[ ] T-031  B  landing, sign in, create org
[ ] T-032  B  setup wizard 5 steps          ← never cut
[ ] T-033  B  UnitTree + structure page
[ ] T-034  B  subjects
[ ] T-035  C  template library
[ ] T-036  C  QuestionEditor ×6 + QuestionInput ×6
[ ] T-037  C  form builder + autosave + preview
[ ] T-038  C  campaigns + ShareSheet + QR    ← due 22 Aug, never cut
[ ] T-039  C  respondent flow + 4 edge states ← never cut
[ ] T-040  C  results
[ ] T-041  B  home dashboard
```
### Stage 5 — M0 hardening
```
[ ] T-042  A  resolve OPEN-005 (campaign status)   ← decision, do early
[ ] T-043  X  resolve OPEN-002 (public URL / QR)   ← decision, do early
[ ] T-044  X  vocabulary nonsense audit            ← 24 Aug
[ ] T-045  X  three demo rehearsals
```

**Progress: 9 / 45 done.**

---

## Decisions needed from the team

Blocking or dated. Move to `_MEMORY.md` as a `DEC-` entry once resolved, and tick it here.

| Ref | Question | Needed by | Blocks |
|---|---|---|---|
| `OPEN-005` | Campaign status: derived-on-read, or a scheduler? Leading answer is derived-on-read — no timer, no stuck state, nothing extra to fail on stage | **22 Aug** | T-021, T-042 |
| `OPEN-002` | What public URL does the QR encode? `localhost` will not scan from a phone | **24 Aug** | T-038, T-043 |
| `OPEN-001` | Phase-3 Redux shape (`23` §4). Recommendation on file: RTK Query + hand-written slices | 15 Oct | nothing before P3 |
| `OPEN-003` | Analysis engine: rule-based or LLM-assisted (`43`) | 1 Nov | nothing before P3 |
| `OPEN-004` | Third member's lane assignment (`02` §6) | — | scheduling only |

**Also non-blocking but time-sensitive:** mention to the React teacher that the project is
already a SPA (`54` §1). A courtesy, not a risk — see `DEC-013`.

---

## Debt

Shortcuts taken deliberately, to be repaid. Empty is good.

| id | What | Why | Repay by |
|---|---|---|---|
| `D-001` | RLS policies not written (`10` §8 layer 2) | **Raised in severity by T-006.** Layer 1 cannot scope `findUnique`/`update`/`delete` by-id calls; RLS is what actually closes that. Until then, by-id handlers must check `orgId` themselves | before P1 closes |
| `D-002` | `db:reset` never actually run end to end | Prisma requires interactive consent to drop data. Migrations were proved clean against a throwaway database instead (1.2 s) | before the first rehearsal — `50` §4 wants it under 30 s |

---

## Session log

Newest first. One entry per working session. Keep entries short — what moved, what was
decided, what the next session should know.

### 2026-08-18 · T-010 GRANT resolver + T-011 graph CTEs
The largest task in the build. `authz/` is `collect` → `scope` → `params` → `resolve`, with
`cache` and a three-line `simulate` that **calls resolve and must never re-implement it**
(N-005). `db/graph.ts` holds the four recursive CTEs and is the only file allowed `$queryRaw`.

Verified against a live org modelling the exact scenario from `11` §4 — Rahul is Director on
Ayaan and Editor on Night Bus:

| Question | Answer |
|---|---|
| `campaign.launch` on **Ayaan** | **allowed** — via Director, `subtree`, anchored @ Ayaan |
| `campaign.launch` on **Night Bus** | **denied**, `out_of_scope` — *"target is outside the anchor unit's subtree"* |
| `campaign.delete` anywhere | denied, `no_grant` — default deny holds |
| Add a person-level `deny` at scope `all`, re-ask Ayaan | **denied**, `explicit_deny` — INV-004 beats a narrower allow |
| `unitSubtree(root)` on a 3-level tree | 4 units |
| `wouldCreateCycle(deep → root)` · `(nightbus → deep)` | `true` · `false` |

That second row is the whole model in one line: **a senior hat somewhere does not become
senior powers everywhere** (INV-005). The anchor comes from the *position*, never the role.

Design notes worth keeping:
- **An unanchored grant cannot satisfy a unit scope.** A group with no `scopeUnitId`, or a
  person node with no primary position, has no unit to compare against — and no anchor means
  no claim, so it is denied rather than silently treated as org-wide
- **`no_grant` / `out_of_scope` / `expired` are distinguished** because they mean different
  things to whoever reads the message: one is "ask someone else", the other is "nobody gave
  you this at all"
- **The cache TTL is not what makes it correct.** `authzVersion` is part of the key, so a
  permission change invalidates instantly; the 30 s TTL is only a backstop

`requireCapability` (T-012) is now thin — it resolves the target from the *validated*
request and calls `resolve()`.

### 2026-08-18 · T-006 tenant isolation
`tenantResolver` (link 6) plus the tenant-bound Prisma client. Proved against the live
database with two orgs and one subject each:

| | Result |
|---|---|
| Org A's client lists subjects | `['A-subject']` |
| **A's client with a forged `where.orgId = B`** | **`['A-subject']`** — the forgery is overwritten, not merged |
| `create({ data: { orgId: B } })` through A's client | stored with **orgId = A** |
| The raw client, unscoped | sees all 3 — which is exactly why lint confines it |

Resolution priority is the documented one: API key → session → respondent token (read from
the PATH, never a body) → `X-Org-Slug`, and the slug is honoured **only** on the tenantless
routes so it can never widen a caller who already holds a credential. No org and not a
tenantless route → `401 UNRESOLVED_TENANT`.

**One honest limit.** The wrapper scopes list/count/aggregate/updateMany/deleteMany and
stamps `create`. It does NOT touch `findUnique` / `update` / `delete`, because Prisma will
not accept a non-unique field in a by-id `where`. A by-id read of another tenant's row is
therefore still possible at this layer — that is precisely the case RLS exists to catch
(`D-001`), and it raises that debt from "nice redundancy" to **the thing that closes a real
hole**. Until it lands, by-id handlers must check `orgId` themselves.

`tenantResolver` already reads `req.session.orgId`, so T-007 wires sessions in without
touching it.

### 2026-08-18 · T-009 validation pipe + the single error exit
`validate()`, `notFound`, `errorFunnel` and the typed error classes. Every response the API
can produce now has the envelope shape from `13` §5. Verified live:

| Request | Response |
|---|---|
| Valid body | `{"data":{"body":{"name":"Ada"}}}` |
| **`{"name":"Ada","orgId":"attacker-org"}`** | **`orgId` STRIPPED** — INV-010 is mechanical, not a rule people follow |
| Missing field | `422` · `path: "body.name"` · *"Name is required."* |
| Over max length | *"Name must be 40 characters or fewer."* |
| Unmatched route | `404` envelope — **never** Express's HTML page |
| Malformed JSON | `400 BAD_REQUEST` |
| Oversized body | `413 PAYLOAD_TOO_LARGE` |

`humanise()` rewrites Zod's developer-facing messages into the copy rules from
`design_specs/design/10` §4 — *"String must contain at least 1 character(s)"* is not what a
respondent should read. The `path` stays machine-addressable so the React form can render
the error against the right input.

Two deliberate properties of the funnel:
- **An unknown error's message is never forwarded.** It could carry a query, a path, or a
  credential. The client gets a generic 500 plus the requestId; the detail goes to the log
- **`headersSent` is checked.** A response already streaming cannot be replaced with an
  envelope, so it is handed back to Express rather than emitting half a JSON body

There is a temporary `POST /api/v1/_echo` route in `app.ts` exercising the pipe. **Delete it
when the first real router mounts (T-015).**

### 2026-08-18 · T-005 chain foundation
Links 0–5 in `app.ts`, in the documented order, each in its own file behind the barrel so
`app.ts` reads as a list of names. Verified against the running server, not just compiled:

| Behaviour | Result |
|---|---|
| `X-Request-Id` round-trips | `my-trace-123` echoed back |
| A malformed inbound id | replaced with a fresh UUID, not echoed |
| Body over 256 kb | `413` |
| helmet headers · `x-powered-by` | 3 present · hidden |
| CORS from the SPA origin · from an unknown origin | allowed with credentials · refused |
| Global rate limit (tested at max=2) | `429` on the third request |
| Log line | method, path, status, duration, requestId — **no body** |

Three things worth knowing:
- **`/healthz` sits ABOVE the rate limiter deliberately.** A monitor polling every few
  seconds must not be able to lock itself out
- **`trust proxy` is set.** Without it the limiter sees one IP for everyone behind the Vite
  proxy and, at demo time, the tunnel
- **The rate limiter does not write its own 429 body.** It calls `next(error)` so the
  response leaves through the single funnel once T-009 lands (`12` §4.16)

`publicCors` (wide, no credentials — a QR scan must work from any network) is written and
exported but not mounted: it belongs on the respondent routes, which are T-022.

### 2026-08-18 · T-004 data model — Stage 0 complete
**Postgres 16.14 installed natively** (`scripts/install-postgres.sh`), because this machine
has no Docker. Same version and credentials as `docker-compose.yml`, which stays committed
and correct for anyone who does. **WSL does not start services at boot** — after a Windows
restart, `sudo service postgresql start` or every db command fails with what looks like a
config error and isn't. That is `N-011`.

**19 tables migrated**, `_prisma_migrations` and `sessions` included. Two migrations: the
generated `init`, and a plain-SQL one for `sessions` because `10` §5 requires that table to
be owned by connect-pg-simple and never modelled in Prisma.

**The init migration is prisma-generated PLUS ~90 hand-written lines.** Prisma cannot
express CHECK constraints, partial indexes, INCLUDE or GIN indexes, DEFERRABLE unique, or
triggers — and if the schema is ever regenerated from `schema.prisma` alone, all of it
vanishes silently and the app still runs. That is `N-013`, and it is the single most
important thing to know about this migration.

Every one of them was verified against the live database rather than assumed:

| Checked | Result |
|---|---|
| `responses` has no respondent column (INV-006) | `id, campaign_id, subject_id, submitted_at, channel, duration_ms, meta` — nothing identifying |
| Flipping `anonymous` after draft | rejected by trigger |
| Role node with no level / position with no role+unit | both rejected by CHECK |
| Same child, second parent, same dimension | rejected |
| Same child, different dimension | **allowed** — "no single global tree" holds |
| Swapping two question positions in one UPDATE | works, via DEFERRABLE |
| Migrate from a genuinely empty database | 1.2 s, 19 tables, 43 indexes |

Also added: `prisma.config.ts` (undocumented but necessary — Prisma reads `.env` from its
own directory, ours is at the root; `N-012`), the Prisma singleton in `db/client.ts`, and a
seed stub so `db:reset` has something to call.

Not done, now in § Debt: RLS policies (`D-001`), and `db:reset` has never been run end to
end because Prisma demands interactive consent to drop data (`D-002`).

### 2026-08-18 · T-003 shared package
`packages/shared` is real: **61 capabilities** (`11` §3 transcribed exactly, grouped by
module because the powers grid renders those groups and deriving them twice would drift),
the 12 error codes with their statuses and envelope type, the label contract, and
`dto/common.ts`.

Two judgement calls worth knowing:
- **`resolveLabels()` merges per key, not per set.** `22` §3 shows `?? DEFAULT_LABELS`,
  but a whole-set fallback would discard the renames an org *does* have when one key is
  missing. Per-key fallback satisfies both that line and §2's "a missing label renders a
  generic word"
- **`CAPABILITY_CATALOGUE` is an object, not a flat array.** Phase and module travel with
  each capability, so the grid can grey out P3 rows without a second table

Both audit scripts from `03` §7 now exist and pass: `audit:drift` (53 docs, 61 capabilities)
and `audit:vocab`. **Check 1 of the drift script is deliberately narrower than `03` §7's
wording** — it bans design *token names*, not every px value, because the page docs
legitimately state behavioural constraints that carry units (a 44px tap target, the 16px
input font that stops iOS zooming). Flagging those produced 21 findings that were all the
check's fault, and a check that cries wolf gets ignored.

### 2026-08-18 · T-001 scaffold, T-002 config — first code
**`T-001` done.** npm workspaces (`@endur/shared`, `@endur/api`, `@endur/web`), TypeScript
project references, ESLint flat config, Prettier. `npm run typecheck` and `npm run lint` are
both green; the API boots and answers `/healthz`; the web app builds.

The four custom lint rules from `03` §6 and `14` §3 are written **and each was proved to
fire** against a throwaway probe file before it was deleted — `INV-002` banned nouns,
`DEC-007` `$queryRaw` confinement, `14` §3 `req.body`, `DEC-012` inline hex. A rule that is
configured but silent is worse than no rule, so this check is worth repeating whenever one
is added.

**`T-002` partial.** `docker-compose.yml`, `.env.example` and `lib/config.ts` (Zod over
`process.env`, parsed at module load) are done and the failure path is verified — booting
without the environment prints the four missing variable names and exits. Empty-string
values are treated as unset, because `.env.example` ships required-but-blank lines.

**What is NOT done: there is no database.** This machine has neither Docker nor a local
Postgres, so `db:up` cannot run and **T-004 is blocked on installing one** (see below).
Nothing else in Stage 0 is blocked — T-003 is pure TypeScript.

Deviations from `03` worth knowing:
- Each app has a `tsconfig.node.json` covering `*.config.ts`; without it typed linting
  cannot see the Vite/Vitest configs
- Vite dev-proxies `/api` to `:4000` so dev is same-origin. That is load-bearing for
  `DEC-014` cookies + CSRF, not a convenience
- `react-router` 6 carries a moderate advisory whose only fix is v7. Staying on 6 as
  specified; revisit if it becomes exploitable in our usage

### 2026-08-18 · pre-build audit — buildability pass
Deeper pass than the structural greps: *is this actually buildable from the docs alone?*
**Seven gaps found and fixed**, all of which would have blocked or corrupted early tasks:
- **`sessions` table was missing from `10`.** `DEC-014` switched staff auth to cookie
  sessions and the schema was never updated. Would have blocked T-004 and T-007
- **`files` table + `logo_file_id` / `avatar_file_id` were missing.** Doc `48` returned a
  `fileId` that nothing stored. Blocked T-004 and uploads
- **The preset grant matrix was a circular reference** — `11` §8 said "the matrix is in `50`",
  `50` said "the level rule, `11` §8". Neither held it. **T-015 and T-025 were unbuildable.**
  Written out in full in `50` §1 as the authoritative table
- **`.env.example` and the config schema still had `JWT_SECRET`** and TTLs — replaced with
  `SESSION_SECRET` / `SESSION_TTL_DAYS` / `COOKIE_SECURE`
- **`CLAUDE.md`'s stack table still said "JWT (staff)"** — the auto-loaded file, so the most
  visible leftover of all
- `CSRF_FAILED` was defined in `12` but absent from `13`'s error-code table
- `storage/` missing from the `03` layout; `auth/` still described as "jwt, tokens"
Also: `14`'s DTO layout dropped `Refresh`, gained `home` / `profile` / `upload`

**Nothing else changed.** Structural checks (links, capabilities, routes, index, MAP, drift,
templates) all still pass. **Ready to build — start at T-001.**

### 2026-08-18 · architecture round 3 — audit + progress system
- Full integrity audit of all 52 docs. **Three defects found and fixed:**
  - `13-API-CONTRACT` was missing the endpoints introduced by docs `46`/`47`/`48`
    (`/home`, `/profile/*`, uploads, `/files/:id`) — the contract is the endpoint authority, so
    this was a real break. Also added an explicit P3 prefix-deferral table.
  - `22` referenced a bare `` `09` `` that reads as an architecture doc but meant
    `design_specs/design/09`
  - README claimed every 30+ doc follows the page template; placeholders deliberately do not.
    Exempted them explicitly rather than making placeholders look like specs
- Verified clean: cross-references, capability catalogue, route map, README index, `MAP` lock
  table, design-value drift, `INV`/`DEC`/`CONF`/`OPEN` resolution, template compliance
- Added `55-BUILD-ORDER.md` (45 tasks, lanes, dependencies) and this file
- **Next session: start T-001.** No code exists yet

### 2026-08-18 · architecture round 2 — React course requirements
- Teacher's pre-preparation message required an existing MPA to convert to a SPA
- Decided **SPA only** (`DEC-013`) — project is from-scratch, React not graded until P2
- **Auth changed to cookie sessions** (`DEC-014`), replacing JWT for staff. Added
  `csrfProtection` to the chain — 16 links now
- New docs: `46` home dashboard (a real gap — route existed, no doc owned it), `47` profile,
  `48` file upload, `54` course deliverable
- Renumbered P3 stretch placeholders `46`–`49` → `60`–`63`

### 2026-08-16 · architecture round 1
- Created `CLAUDE.md` + 37 docs. Resolved three source conflicts: Express over NestJS
  (`DEC-001`), GRANT engine over integer levels (`DEC-002`), TypeScript + Zod DTOs (`DEC-003`)
- Later added placeholders `17`,`18`,`25`–`29` and the stretch set. `17` surfaced `OPEN-005`

---

## Conventions

- **Task ids are permanent.** Reference them in commits: `feat: T-010 grant resolver`
- **Update this file in the same commit as the work.** A stale progress file is worse than
  none, because the next session trusts it
- **A task is done when its spec's `## Acceptance` list passes**, not when it renders
- **Decisions go to `architecture/_MEMORY.md`** as `DEC-` entries, not here. This file records
  *that* a decision was made and links to it
- Check the `MAP` lock table in `_MEMORY.md` before creating source files — two people build
  in parallel
