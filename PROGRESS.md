# Endur — progress

**The live state of the build.** Any Claude session, on any account, reads this first and
updates it before finishing. `architecture/55-BUILD-ORDER.md` is the plan; this file is what
has actually happened.

```
UPDATED   2026-08-20  (T-044 — the vocabulary nonsense audit. Four leaks found and closed)
PHASE     P1 MIDDLEWARE
MILESTONE M0 = 2026-08-26  ·  6 days  ·  demo 27 Aug  ·  GRADED
STATUS    41/45. STAGES 0-4 DONE BUT FOR THE FONT FILES. EVERY M0 SCREEN IS BUILT.
          807 tests across 70 files, all green (199 backend + 608 frontend).
          60 endpoints · 4 seeded demo orgs · 3,382 responses · migrate+seed ~14 s.
          !! READ CONF-013 IN _MEMORY.md BEFORE TOUCHING AUTH. A cross-tenant account
          lockout was found and closed on 19 Aug; the schema question behind it is
          still open and somebody has to decide it.
          !! FOLDERS WERE RENAMED 19 Aug. apps/api -> src/backend, apps/web ->
          src/frontend, prisma -> database, and neither app has an inner src/ any
          more. If you had a branch open, rebase before doing anything else.
NEXT      TWO ITEMS LEFT. T-043 (OPEN-002 — yours, below) and T-045 (three rehearsals
          + the 390px checks + a QR scan on two phones). No screen work is left: every
          route in 20 §2 renders a real page, and no placeholder is behind an M0 path.
          !! THE VOCABULARY AUDIT IS DONE AND IT FOUND FOUR LEAKS — none of them an
          education word, which is the whole class audit:vocab was built around. The
          worst was <ShareSheet> saying "Respondents don't need an account." since
          T-038, on the component that IS the demo, through four audits. THE DEFAULT
          VOCABULARY IS THE LIKELIEST THING TO BE HARDCODED, because it does not look
          like a domain word. audit:vocab has three passes now and covers the SERVER
          too (03 §7). Read N-048 and N-049 before writing user-facing copy anywhere.
          !! SERVER MESSAGES SPEAK THE ORG'S NOUNS NOW. req.ctx.labels, set by
          tenantResolver in the query it already ran; lib/vocabulary.ts has nounsOf(req)
          and counted(n, label). 17 sites across 7 services. If you add a message that
          names a unit/subject/campaign, use it — pass 3 of audit:vocab fails otherwise.
          !! THE DEMO NOW RUNS END TO END. Scan -> fill -> submit -> the results
          number moves, and the two counts agree because they are the same COUNT
          read in the same transaction. Rehearse it (T-045).
          !! ONE SEED DECISION IS YOURS, AND IT NOW AFFECTS TWO SCREENS. All four demo
          orgs use audience `anyone`, which has no denominator, so the RESPONSE RATE
          card is a dash on BOTH the home page and the results page — correctly, see
          N-043 and N-046. Giving ONE seeded campaign a `unit` audience makes both
          show a real number. That is 50's data, not 40's or 46's page.
          !! IF YOU FIX A NUMBER, GREP FOR THE ARITHMETIC AND NOT FOR THE FUNCTION.
          N-043 fixed the response rate at the results service; features/home held its
          own copy and rendered 2610-4675% on the FIRST SCREEN AFTER SIGN-IN until
          T-041 read it. `_count.subjects` as a divisor was greppable. N-046.
          !! OPEN-002 IS STILL OPEN AND STILL YOURS. The build never needed it — the
          URL comes from the API — but somebody has to set PUBLIC_BASE_URL to an
          address a phone can reach. The share sheet SAYS SO on screen when it is
          localhost, so it cannot fail silently. Due 24 Aug. THE WHOLE FLOW BEHIND
          THAT URL NOW EXISTS — scan it and you get a form, not a placeholder.
          !! ANYTHING YOU IMPORT NEAR router/layouts.tsx SHIPS TO A PHONE. The
          console shell was in the ENTRY chunk until T-039 measured the build;
          <AppShell> is lazy now and pages/respond/bundle.test.ts fails if it comes
          back. Read N-040 before adding an import there.
          !! THE WHOLE FORM ENGINE IS BUILT AND IN USE by three screens: the template
          preview, the builder preview and the live respondent form. One
          <QuestionInput> set, INV-008 — never write a second.
          !! LISTS RETURN { data, page, meta } — 13 §4. The shared Page<T> said
          `items` until T-034 and lied to one caller for 16 days (N-029).
          !! <UnitTree> IS EXTENDED, NEVER FORKED. T-032 built it, T-033 extended it
          (five optional props), and the campaign audience picker is its third
          placement — see _MEMORY.md N-025 and INV-009.
          Open a page with <PageHeader>; do not hand-roll a title.
          ALSO DUE 24 AUG: vendor the two woff2 files (see src/frontend/public/fonts).
```

---

## Read this first if you have been away

**The folder layout changed on 19 Aug.** Every doc, config and path reference was updated in
the same pass, so the docs are correct — but your muscle memory is not:

| Was | Is |
|---|---|
| `apps/api/src/middleware/` | `src/backend/middleware/` |
| `apps/api/prisma/` | `src/backend/database/` |
| `apps/web/src/` | `src/frontend/` |
| `packages/shared/` | unchanged |

Package names are still `@endur/api` and `@endur/web`, so every `npm run … -w @endur/api`
still works.

**Setup on a fresh machine:** `npm install`, then Postgres 16 either via
`sudo bash scripts/install-postgres.sh` or `npm run db:up` if you have Docker, then
`cp .env.example .env` and set `SESSION_SECRET` to 32+ characters, then `npm run db:migrate`,
then `npm run db:seed`. On WSL, `sudo service postgresql start` after every Windows restart.

**The checkout has to sit on a filesystem that supports symlinks.** npm workspaces link
each package into `node_modules`, so an exFAT drive fails the install outright with
`EISDIR: illegal operation on a directory, symlink src/frontend -> node_modules/@endur/web`.
NTFS, ext4 and APFS are all fine; `--install-links` does not help, and neither does WSL if
the repo is under `/mnt/<letter>`. Build on a supported volume and keep the other copy
source-only (`_MEMORY.md` `N-018`).

**Seeded logins**, printed at the end of `npm run db:seed` and the same ones the
development login affordance prefills: `admin@northfield.endur.test`,
`admin@grand-palace.endur.test`, `admin@riverside.endur.test`, `admin@meridian.endur.test`
 — password `endur-demo-password`.

**Before you commit anything:** `npm run typecheck && npm run lint && npm run audit:drift`
&& `npm run audit:vocab && npm test`. That last one runs both workspaces — **807 tests
across 70 files**, 199 backend + 608 frontend. All five are green right now, so anything red
is yours.

`audit:vocab` prints how many files it scanned — **frontend AND server since T-044** — and
how many test files it skipped. It stopped scanning `*.test.tsx` at T-035, on purpose and
with the proof written down — see `N-032` before assuming that is a hole. It now runs three
passes (`03` §7); if it fails on a server file, the fix is `nounsOf(req)` from
`src/backend/lib/vocabulary.ts`, not a rephrase.

**Claude does not commit.** The user commits, always — stated 19 Aug and written into
`CLAUDE.md` § Working conventions. Finish, run the checks, report, stop.

The backend tests need Postgres running and they **write into the dev database** (`D-004`),
so if the demo logins stop working, `npm run db:seed` — it is idempotent and takes ~4 s.

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
[x] T-007  A  sessions, argon2id, login/logout/me, atomic register
[x] T-008  A  csrfProtection
[x] T-009  A  validate(Dto) + errorFunnel + envelope
[x] T-010  A  GRANT resolver  ← largest single task
[x] T-011  A  db/graph.ts recursive CTEs
[x] T-012  A  requireCapability + requireEntitlement
[x] T-013  A  auditWriter + ctx.tx
[x] T-014  A  route-enumeration test + chain integration tests
```
### Stage 2 — API features
```
[x] T-015  A  org, presets, /org/setup
[x] T-016  A  units CRUD, reparent, impact
[x] T-017  A  roles, grants matrix, warnings
[x] T-018  A  people, assignments, CSV import
[x] T-019  A  subjects
[x] T-020  A  templates, clone, bulk questions
[x] T-021  A  campaigns, launch, audience        ← DEC-016 resolved OPEN-005
[x] T-022  A  public respondent endpoints
[x] T-023  A  results + k-anonymity gate
[x] T-024  A  GET /home
[x] T-025  A  SEED — 5 presets + 4 demo orgs        ← landed 19 Aug, 3 days early
```
### Stage 3 — frontend foundation
```
[x] T-026  X  vite + react + TS, three route trees
[~] T-027  X  design system css + self-hosted fonts  ← CSS done, WOFF2 NOT VENDORED
[x] T-028  X  labels.ts + store            ← before any page
[x] T-029  X  lib/api.ts (cookies + CSRF)
[x] T-030  B  AppShell, Sidebar, TopBar, PageHeader, VocabularyChips  ← lane C UNBLOCKED
```
### Stage 4 — M0 screens
```
[x] T-031  B  landing, sign in, create org
[x] T-032  B  setup wizard 5 steps          ← never cut
[x] T-033  B  UnitTree + structure page
[x] T-034  B  subjects
[x] T-035  C  template library    ← also built <QuestionInput> ×6 (N-031)
[x] T-036  C  QuestionEditor ×6   ← + <QuestionCard> + kinds.ts
[x] T-037  C  form builder + autosave + preview  ← + <FormPreview>
[x] T-038  C  campaigns + ShareSheet + QR    ← landed 19 Aug, 3 days early
[x] T-039  C  respondent flow + 3 edge states ← CONF-015: three, not four
[x] T-040  C  results        ← full view, not the cut-down table. N-043, N-044
[x] T-041  B  home dashboard  ← STAGE 4 DONE. N-046, N-047, CONF-017
```
### Stage 5 — M0 hardening
```
[x] T-042  A  resolve OPEN-005 (campaign status)   ← DEC-016, derived on read
[ ] T-043  X  resolve OPEN-002 (public URL / QR)   ← decision, do early
[x] T-044  X  vocabulary nonsense audit            ← 4 leaks, N-048/N-049. 3 now mechanical
[ ] T-045  X  three demo rehearsals
```

**Progress: 40 / 45 done (T-027 partial). Stages 0-4 complete but for the font files —
every M0 screen is built. What is left is Stage 5: one decision, one audit, and three
rehearsals. The demo runs end to end: scan, fill, submit, and the results count moves.**

---

## Decisions needed from the team

Blocking or dated. Move to `_MEMORY.md` as a `DEC-` entry once resolved, and tick it here.

| Ref | Question | Needed by | Blocks |
|---|---|---|---|
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
| `D-003` | Every by-id read checks `orgId` by hand | Stage 2 repeats that check in eleven services (`assertVisible`, `assertOwned`, `assertUnitInOrg`). Each one is correct; one forgotten call is a cross-tenant read. RLS (`D-001`) is what makes it structural rather than remembered | with `D-001` |
| `D-004` | Integration tests write into the **dev** database — **THIS NOW FAILS THE BUILD** | 249 junk users and 168 throwaway orgs had accumulated in `endur`, and the demo seed had been pushed out of it entirely — the advertised logins did not work until re-seeded on 19 Aug. A rehearsal against a polluted database is not evidence about the demo. **On 19 Aug it stopped being theoretical**: `chain.test.ts` registered a fixed org name every run, `uniqueSlug()` gives up after twenty variants, and the twenty-first run of the suite failed — a test about stripping unknown keys, failing with a conflict about slugs. That test was made independent of history; the next one to depend on it will not be found as quickly | before `T-045` |
| `D-006` | `uniqueSlug()` runs **outside** register's transaction | Two registrations naming the same organisation in the same second both read "that slug is free"; the loser then collides on the unique index and gets a 500. The rollback is correct — `register-rollback.test.ts` proves nothing is left behind — but the caller deserves a retry, not an error page. Fix: retry the transaction on a P2002 against `slug` | before `T-045` |
| `D-007` | `CONF-013` is **mitigated, not resolved** | Login filters `passwordHash: not null` and orders by `createdAt`, which closes the cross-tenant lockout. It does not answer whether an email address is global or per-tenant, and two *activated* accounts on one address are still ambiguous. Three options are written out in `CONF-013`; pick one and supersede it | **24 Aug** |
| `D-008` | The capability catalogue's power labels are English | `roles/service.ts` `describe()` turns `campaign.launch` into *"launch campaigns"* — a domain noun, for `33`'s powers grid. Found by the T-044 audit and deliberately not fixed: the grid is not built, and the object → label mapping for `role`, `person`, `template` and `org` — none of which HAS a label — is `33`'s design work, not something to invent from outside it. `audit:vocab` does not scan it, because the string is assembled from a capability key rather than written | with `T-033` |
| `D-005` | The two woff2 faces are not vendored | `tokens.css` declares both; the files are absent, so the product renders in `system-ui`. Nothing breaks, but nothing looks right either. `src/frontend/public/fonts/README.md` names the two files | **24 Aug** (`21` §4) |

---

## Session log

Newest first. One entry per working session. Keep entries short — what moved, what was
decided, what the next session should know.

### 2026-08-20 · T-044 — the vocabulary nonsense audit

`22` §5 says the manual walk *"always finds something"*. It found four things, and **not one
of them was an education word** — which is the entire class `audit:vocab` had been built
around since T-003.

| Where | Said | Why the grep could not see it |
|---|---|---|
| `<ShareSheet>` | *"Respondents don't need an account."* | "Respondent" is the **Custom preset**, not an education noun. Live since T-038, on the component that IS the demo |
| The API, 17 sites | *"That unit does not exist."*, *"That campaign has launched."* | `audit:vocab` scanned the frontend only. Ten console pages render `error.message` verbatim |
| `/app/campaigns/new` | *"About 1 frimbles can respond."* | The plural passed as **both** forms — the agreement case `22` §5 names |
| `/app/subjects/:id` | *"3 cycles so far"* | `cycle` is the DTO's internal word for a campaign. It sat under a kicker reading "Active {campaign.many}" |

**The generalisation, and it is `N-048`: the default vocabulary is the likeliest thing to be
hardcoded, precisely because it does not look like a domain word.** Nobody types "Guests
don't need an account" while building generic UI. Everybody types "Respondents". A banned
list made only of words a developer would have to go out of their way to write catches
nothing.

**Three of the four are now mechanical.** `audit:vocab` has three passes (`03` §7): the
original banned-noun grep, now over `lib/` and `router/` as well; the five default labels in
**user-facing text only** — JSX text nodes and copy-bearing attributes, because `Campaign` is
also a type, a table and a route segment; and the server's own message strings. Template
interpolations are blanked first, so `${nounsOf(req).unit.one}` reads as the mechanism it is.
Each pass was proved by planting a real violation and watching it fail, which is the T-035
discipline. The fourth finding stays manual and cannot be otherwise — nothing but a reader
knows that "cycle" and "{campaign}" are the same thing.

**The server half is built, and `22` §6 had specified it since revision one** (`N-049`).
`tenantResolver` puts the resolved label set on `req.ctx` in the query it was *already*
running for `authzVersion`, so it costs nothing. `src/backend/lib/vocabulary.ts` holds
`nounsOf(req)` and `counted(n, label)` — the latter takes a `Label` rather than two strings,
because the delete-unit message used to build its plural with `+ 's'` and "Faculty"
pluralises to "Faculty". Three decisions came out of it:

- **A 404's uniformity is about the answer, not the language.** `assertVisible` throws the
  same message on both branches — no row, and out of scope — so they stay indistinguishable
  (`13` §5). The org's noun does not change that.
- **The setup wizard reads the body, not `ctx`.** It validates a structure while the reader is
  looking at words they picked two steps ago that the database has not been told about.
- **A structural word stays structural in the same sentence:** *"That template is used by 1
  review round."*

**Found, not fixed, and written down so it is not rediscovered:** `roles/service.ts`
`describe()` builds *"launch campaigns"* for `33`'s powers grid. That grid is after M0, and
the object → label mapping for `role`, `person`, `template` and `org` — none of which *has* a
label — is `33`'s design work. **Whoever builds `T-033` owns it.**

**One test was pinning the bug.** `units.test.ts` asserted `/1 unit/`: the message said "unit"
because the code hardcoded it, and the test agreed with it.

Docs: `22` §5 (§ What T-044 found), §6, § Acceptance, § Out of scope; `03` §7; `12` §3 and
§4.6; `55`; `_MEMORY.md` `N-048`, `N-049`, MAP.

All five checks green. **807 tests across 70 files** (199 backend + 608 frontend, up from
797/69); `vite build` succeeds with the entry chunk unchanged at 308.64 kB / 96.54 kB gzip.

**Next: `T-043` and `T-045`, and nothing else.** `T-043` is yours — set `PUBLIC_BASE_URL` to
an address a phone can reach. The share sheet says so on screen when it is `localhost`, so it
cannot fail silently.

### 2026-08-20 · T-041 — the home dashboard. **STAGE 4 IS COMPLETE**

`/app` is real: `pages/console/Home/` (`index.tsx`, `cards.ts`, `CampaignCard.tsx`,
`Recent.tsx`) and `lib/home.ts`. **Every M0 screen is now built.** No placeholder remains
behind any route in `20` §2, and what is left before the demo is one decision, one audit and
three rehearsals.

**Read this before touching `features/home/service.ts` or `features/results/service.ts`.**
`N-043` fixed the response rate at the results service on 20 Aug. It did not know that
`readStats` in the home service held **its own copy** of the same substitution — sum the
campaigns' subject counts, divide the responses by it, render as a percentage. Measured
against the seeded demo before changing anything: **Northfield 3161%, Grand Palace 2654%,
Meridian 2610%, Riverside 4675%** — on the *first screen after sign-in*. Verified against the
same data afterwards: all four now report no denominator. `N-046`.

The generalisation is the part to keep: **a fix applied at the call site is not a fix.**
`countAudience()` already existed, was correct, and was documented as the honest counter, and
a second caller three files away still divided by the wrong thing. When a wrong number is
corrected, grep for the **arithmetic** — `_count.subjects` as a divisor was greppable and
nobody grepped it.

Also worth knowing:

- **`<TrendChip>` is refused, not deferred** (`CONF-017`). `46` § Components put one on the
  "today" card; `46` § Out of scope rules trends off this page by name (*"that is `43`, and
  it is P3"*), § Purpose forbids the page becoming an analysis surface, and the payload
  carries no yesterday to point an arrow at. `<StatCard>` says the same in one line — a delta
  *"only ever appears where a direction is real"*. **Second time a P2 page has borrowed a
  component from `24` that its own document forbids**, after `<ScoreBadge>`; `24`'s list was
  written from `43`'s needs, so check what the rest of a page doc says before building one.
- **The QR is in the payload** (`N-047`). A campaign card's Share opens `<ShareSheet>`, which
  cannot render without the URL — so `HomeView` carries `url` and `anonymous`, two fields off
  columns the query already read, rather than firing a second request on the click, on venue
  wifi, while somebody holds a phone up. `status` is deliberately **not** carried: every
  campaign here is open by definition.
- **Two things design draws are deliberately absent.** The campaign card's `612 / 800`
  progress bar — the 800 is the same invented denominator `N-046` just removed — and the
  recent strip's *"View all →"*, because those comments come from several campaigns, the
  payload does not say which, and a cross-campaign inbox is P3 by name.
- **`undefined` and `[]` say different things, and this page is where it pays.** A withheld
  section arrives as a missing key; an empty one arrives as an empty array. So *"Nothing
  assigned to you yet"* and *"Add your first {subject}"* land on the right readers, and
  neither is a wall of greyed-out cards.
- **A new org never sees four zeroes.** The test asserts the RESPONSE RATE card is not on the
  page at all — zeroes look broken, an empty state looks intentional.

Tests 761 → **797** (backend 188 → 191, frontend 573 → 606), across 69 files. Entry chunk
unchanged at 308.6 kB / 96.5 kB gzip.

### 2026-08-20 · T-040 — results, and a response rate of 4675%

`/app/campaigns/:id/results` is real: `pages/console/Results/` (`index.tsx`,
`QuestionResult.tsx`, `Comments.tsx`, `stats.ts`), `lib/results.ts`, and
`components/data/StackedBar.tsx`. **Stage 4 has one screen left.**

**The demo's decisive beat now closes.** Scan the QR, fill in the form, submit — and the count
on this page moves. The two numbers agree because they are the same `COUNT`, read inside the
transaction that wrote the response.

**Read this before touching the campaigns or results service.** `readResults` took
`audienceEstimate` from `campaign.subjects.length`, which made the response rate
responses-per-**subject** and rendered it as a percentage. Measured against the seeded demo
*before* changing anything: Northfield's Spring term feedback **3517%**, Riverside's patient
survey **4675%**, all eight seeded campaigns with real data between 1750% and 4675% — on the
screen an evaluator opens straight after scanning.

The cause was two different questions sharing one answer. `audiencePreview` substitutes the
subject count for an `anyone` rule **on purpose**, and says so: the create screen needs a
number, and `0` beside an open audience reads as a broken rule. `readResults` reused it as a
divisor, where the honest answer is that there is no such number. `countAudience()` now returns
`null` for an open link, and the card renders a dash **and the reason**. `N-043`.

**One seed decision is yours.** All four demo orgs use `anyone`, so that card is a dash for the
whole demo — correctly. Giving **one** seeded campaign a `unit` audience makes it show a real
number. That is `50`'s data, not this page's, so it has not been changed.

Also worth knowing:

- **The CSV header said "Subject"** (`N-044`). `22` §6 warns in as many words that an export
  header is "the one nobody thinks to check" — and it shipped at T-023 saying the English
  noun. Nobody checked it for exactly the reason the doc predicted: `audit:vocab` only scans
  the frontend. The generalisation is the useful part — `22` §6 lists three kinds of
  server-produced string and **only one of the three has ever been audited.**
- **`<ScoreBadge>` is refused, not deferred** (`CONF-016`). `40` § Components lists it; `40`
  § Purpose and § Interactions forbid exactly what it does, and `design_specs/design/08` sides
  with the prohibition. A threshold colour on an average is the interpretation this page
  exists to refuse. Catalogued in `24` as not built, with the reason.
- **A pure function inside a mocked module is a function every mock reimplements** (`N-045`).
  `flattenUnits` existed twice already; lifting it into `lib/units.ts` turned two suites red
  with *"No flattenUnits export is defined on the mock"*. It lives in `lib/tree.ts` now, which
  nothing mocks. The failing mock was the signal, not the obstacle.
- **Export is fetched, not linked.** An `<a href>` would answer a `402` — export is a Silver
  feature — by showing the reader a page of raw JSON instead of the plan message.
- **The comment flash has a baseline.** Only comments that arrived while somebody was watching
  light up; without that, opening a campaign with 287 of them flashes all 287, which reads as
  a rendering bug rather than as news.
- `audience_rule` is JSONB and the dev database holds `{}` in it on old rows. Both readers go
  through `ruleOf()` now — a results page that 500s because of a pre-union row is worse than
  one that assumes the open case and stays up.

Tests 705 → **761** (backend 186 → 188, frontend 519 → 573), across 66 files.

### 2026-08-20 · T-039 — the respondent flow. **THE HERO SCREEN IS BUILT**

`/r/:token` and `/r/:token/done` are real: `pages/respond/` (`Fill.tsx`, `Done.tsx`,
`Unavailable.tsx`, and the two pure modules `answers.ts` and `copy.ts`) plus `lib/respond.ts`.
**The demo now runs end to end** — scan the QR, fill in a form, and the count on the thank-you
is the same number the results screen will show, because the server reads it inside the
transaction that wrote the row.

**Read this before touching `router/layouts.tsx`.** *"The respondent bundle must not include
the console"* (`20` §8) was **false**, and the pages were never the leak. I wrote a static
import-graph walk out of the two respondent pages — `pages/respond/bundle.test.ts` — and it
passed immediately. Then I built, and the **entry chunk** contained `lucide-react`:
`router/index.tsx` imports `layouts.tsx` statically, because the three layouts are route
elements, and `layouts.tsx` imported `<AppShell>` statically, which pulls the sidebar, the top
bar and `<Icon>`'s thirty glyphs. Route-level splitting of *pages* cannot help with anything
the entry itself imports. `<AppShell>` is lazy now; the entry chunk went 322.9 → 308.5 kB
(101.5 → 96.5 kB gzip) and the test walks `main.tsx` too. Reverting the fix fails it — checked
both ways. `N-040`.

**Still in that entry chunk and NOT fixed here:** redux, immer and zod, roughly 40 kB gzip a
respondent never uses, because `main.tsx` wraps all three worlds in one `<Provider>`. Moving
it into the console layout is a `20` §3 / `23` §2 decision, not a page task. A respondent
today downloads ~102 kB gzip of JS and 9 kB of CSS. `qrcode` was already confined correctly.

**`39` contradicted itself and only one half could be built — `CONF-015`.** § States and
`design_specs/design/07` §7.6 draw four screens, two of which name facts about the campaign
(*"opens on 1 Sep at 09:00"*, *"it ran from 11 to 26 August"*). § Data contract, `13` §6,
`tenantResolver`'s `TENANTLESS` list and § Acceptance all require invalid, unlaunched,
not-yet-open and closed tokens to return **one identical 404**, because a difference is an
existence oracle. The data contract wins — the client cannot render what the server refuses to
say. Three screens ship, and the merged one names all three possibilities rather than claiming
the link is broken, because *"this link doesn't work"* is a lie in two of the three cases. A
fourth exists that neither source drew: a load **failure**, which offers Try again, because a
phone on a venue network is this page's stated risk and rendering that as "not active" sends
somebody away from a form that is fine.

Also worth knowing:

- **The idempotency key is per FILL, not per token** (`N-041`). `13` §7 says "keyed on the
  invitation token", which is right for an invitation and exactly wrong for an open link:
  everyone in the room holds the same token, so that key would replay the first person's 201
  to the second and the campaign would collect **one** response in front of the evaluator.
- **A subject picker that neither source draws** (`N-039`). A campaign may carry many subjects
  (`38` step 2) and the submit endpoint 422s without one. Absent when there is exactly one —
  the server resolves that case, and choosing from a list of one is noise.
- **The anonymity lines are silent when the campaign is not anonymous.** Rule 6 is written for
  the anonymous case; inventing either a promise or a warning would be wrong, and the schema
  has no respondent column either way. A test pins the silence.
- **`var(--font-display)` was never defined** (`N-042`) — the token is `--font-heading`. Eight
  rules in `endur.css` asked for the wrong name, five of them mine from T-037 and T-038,
  including the 42px line that goes on the **projector**. Undefined custom property → invalid
  at computed-value time → silently inherits the body face. Invisible only because the woff2
  files are still not vendored; it would have appeared the day somebody repays `D-005`, which
  is due **24 Aug**.
- **No `<Icon>` in the respond world** — thirty glyphs to draw two shapes. Inline SVG instead.
- Both respondent tests mount with **no `<Provider>` at all**, which is what makes "the
  vocabulary comes from the payload, not the store" a property rather than an intention.

Tests 641 → **705** (frontend 455 → 519), across 62 files. Backend untouched.

### 2026-08-19 · T-038 — campaigns, and the QR the whole demo rests on

`/app/campaigns`, `/app/campaigns/new` and `/app/campaigns/:id` are real, plus
`components/feedback/ShareSheet.tsx` — **the highest-risk component in the build**, landed
three days before its 22 Aug deadline.

**`OPEN-002` never blocked this and does not block anything now.** The URL is not a client
decision: `POST /:id/launch` returns it, computed server-side from `PUBLIC_BASE_URL`, and the
sheet renders what it is handed. Deciding it is one environment variable. What changed is that
**the failure can no longer be silent** — the sheet inspects its own URL and says, on screen,
that a `localhost` address resolves to the phone and nobody can scan it. A LAN address passes.
Somebody still has to set the variable, and that is still due 24 Aug.

**The share sheet's tests assert the things a screenshot cannot show**: error-correction level
M, the quiet zone, ≥ 280px, and pure ink on pure white. Those four decide whether a phone
decodes it, and none of them are visible by looking. The scan itself needs two phones and is
`T-045`.

Also worth knowing:

- **New dependency: `qrcode`**, rendered locally to a canvas. An external image service would
  fail exactly when the network does.
- **The QR's two colours are the only hex literals outside `design-system/`** and DEC-012 was
  right to flag them. They are not brand colours: a QR is decoded by thresholding luminance,
  so re-theming the product must not change the contrast a camera works with. `N-037`, and
  the test PINS the literals so anybody who later tokenises them breaks a test, not the demo.
- **A test found a real gap in the launch path.** The sheet was rendering from the refetched
  campaign, so "the QR is on screen within one second" depended on a second round trip
  landing. It now uses the URL the launch response itself carries.
- **Five things design_specs draws are not built** (`N-038`): the sparkline, average
  completion time, per-subject breakdown, `Duplicate`, and the progress-bar toggle. None have
  a contract. The per-subject one is **refused** rather than deferred — those numbers live
  behind the k-anonymity gate on `40`, and a second ungated path is what INV-007 exists to
  prevent.
- **The subject picker is not `<UnitTree mode="select">`**, which `38` § Components named.
  Subjects belong to units but are not in the tree, so the tree cannot answer "which
  subjects". `38` records the correction.

**`D-004` stopped being theoretical while running this.** `chain.test.ts` registered the
fixed org name "Strip Test Org" on every run; `uniqueSlug()` tries twenty variants and then
409s; the suite has now run twenty-one times against the dev database. A test about stripping
unknown keys failed with a conflict about slugs. Its name is generated per run now — but a
test that depends on how many times it has been run before is not a test, and the real repair
is the separate test database.

Tests 574 → **641** (frontend 388 → 455), across 56 files.

### 2026-08-19 · T-037 — the form builder. Autosave, and a preview that is a component

`/app/forms/:id/build` and `/app/forms/:id/preview` are real: `pages/console/Builder/`
(`index.tsx`, `useBuilder.ts`, `SaveIndicator.tsx`, `Preview.tsx`) plus
`components/form/FormPreview.tsx`.

**`useBuilder.ts` is the file to read before touching this screen.** Its whole reason to
exist is one acceptance line — *autosave never loses typed input* — and the case that needed
care is a keystroke arriving mid-request: the dirty flags are cleared BEFORE the request, so a
late success cannot swallow it, and the indicator then says `Unsaved changes` rather than
`Saved`. A failed save retries once silently, then hands over a button, and never touches the
draft. It is written as one immutable draft object so P3's `builderSlice` is a move rather
than an untangling of a dozen `useState`s.

**Two things this page deliberately does not have, and it is a real source conflict:
`CONF-014`.** design_specs draws a **Publish** button and **Responses / Settings** tabs;
architecture has no publish endpoint, no campaign rule that consults a published flag, and
exactly two routes for this screen. Building them would mean inventing a contract. The lock
design attributes to Publish already exists and is enforced server-side: a template used by a
launched campaign is read-only.

Also worth knowing:

- **`<FormPreview>` is new (`N-035`).** Two screens preview a form — the template library and
  the builder — and INV-008's argument applies one level up. T-035 had written that shell
  inline on the template page; it is now a component and that page uses it. Its 15 tests
  passed unchanged through the refactor, which is what made the move safe.
- **A row of controls cannot itself be a control (`N-036`).** The collapsed question card was
  `role="button"` and T-037 hung the reorder buttons inside it — nested interactive content,
  invalid ARIA. **A test found it**: one query matched three elements, and the ambiguity was
  the bug reporting itself. When a query cannot tell two things apart, neither can a screen
  reader.
- **Reorder works without a mouse.** Same rule as `<UnitTree>` and `<RoleRow>`: HTML5 drag
  does not exist on touch, and `37` § Acceptance asks for 390px. `onMove` is catalogued in
  `24`.
- **Every derivation from spec across T-035 – T-037 is written down**: `N-031`, `N-033`,
  `N-034`, `N-035`, `N-036` and `CONF-014`, plus the doc each one amends.

Tests 540 → **574** (frontend 354 → 388), across 52 files. Backend untouched.

### 2026-08-19 · T-036 — the six editors, and the rules behind the type select

`components/form/` now holds the whole form engine except the page: `QuestionEditor.tsx`
(six, one file), `QuestionCard.tsx`, and `kinds.ts`. **Nothing imports them yet** — T-037 is
their first caller — so they are tested but in no bundle.

**Read `kinds.ts` before starting T-037.** "Change type" is a rule, not a select handler:
`changeKind()` keeps the text always, carries options across single ↔ multi, and returns one
sentence when something cannot survive. The card holds that sentence with `Keep it as it is` /
`Change anyway` and calls `onChange` **only** if accepted — warning after the options are gone
is not a warning. The builder must not restate any of it.

It warns about one thing `37` does not name: replacing hand-written rating anchors on the way
to NPS. Same class of loss, and hand-written anchors are hand-written work. It stays quiet
when the anchors are still the defaults — warning about losing a default is how people learn
to click through warnings.

Also worth knowing:

Every departure from `24` §5 and `37` is written up as **`N-034`** in `_MEMORY.md`, and the
one from T-035 — extending the contract rather than faking a number — is **`N-033`**. Short
version of the pair: substitute when the missing number is informational, extend the contract
when a required behaviour depends on it, and write it down before the code either way.

- **The editors are ONE file, mirroring `QuestionInput.tsx` line for line.** `24` §5 wanted
  six files so two people could take three each; that never happened, and the real risk is
  the editors drifting from the inputs they author. Twelve files would make that drift
  harder to see, not easier. `24` records the change.
- **`NpsEditor` does not say "No settings for this type."** It says what is fixed and why,
  and points at the rating scale — which is the question the reader is about to ask. `24` §5
  only fixes that copy for `YesNoEditor`.
- **`<QuestionCard>` gained `index` and `readOnly`**, both catalogued in `24` first. `index`
  gives a card with no text yet an accessible name; without it a blank new question is
  unreachable by name, for a reader and for a test.
- **No question images.** `design_specs/design/05` §5.2 draws an image button in the card
  header; `QuestionConfig` has nowhere to put one, and adding a field to the frozen union is
  a DEC-010 conversation rather than a button. Not built, not stubbed.
- **The option list refuses to build a 422.** Two is the DTO's floor and ten its ceiling, so
  the remove button disables at two and the add row disappears at ten with a line saying why.

Tests 493 → **540** (frontend 307 → 354), across 50 files. Backend untouched.

### 2026-08-19 · T-035 — the template library, and the six inputs it could not fake

`/app/templates` and `/app/templates/:id` are real: `pages/console/Templates/` (library,
preview, the card, the blank-form dialog, and the delete sentence as a pure module),
`lib/templates.ts`, and **`components/form/QuestionInput.tsx` — all six of them**.

**Read this before starting T-036.** `55-BUILD-ORDER` pairs the six inputs with the six
editors; T-035 built the inputs anyway, because the whole job of the preview is to be
*exactly* what a respondent gets and INV-008 allows one implementation, not a read-only
lookalike. **T-036 is now editors-only, and T-039 — the hero screen — no longer waits on
it**, since what it needed was the input set. `N-031`, and the file says so at the top.

Also worth knowing:

- **`TemplateSummary` gained `campaignCount`** (`N-033`), derived like the other two counts. It gives
  the card the *"Used in 2 campaigns"* line `design_specs/design/05` §5.1 has always drawn,
  and — the half that matters more — it lets the delete dialog state a real consequence
  **before** the button is pressed instead of the reader discovering the `409` by pressing
  it. An in-use template opens the dialog with `confirmDisabled`; the 409 path is still
  handled, because the count can be stale by the time somebody presses.
- **`audit:vocab` no longer scans test files** (`N-032`). Every one of the 18 findings it
  produced against this task was a template NAME in a fixture — customer data, in a file
  that renders nothing. That is the fourth narrowing of a check firing outside its subject,
  and it was proved rather than assumed: a real hardcoded noun added to `TemplateCard.tsx`
  still fails it. The output now prints the skipped count.
- **`<Toast>` is built** and only the delete uses it. There is no app-level toast host, so a
  success that navigates away — clone, blank form — shows nothing; and it carries no
  `undo`, because undoing a delete needs a restore endpoint.
- **Clone lands on T-037's placeholder for now.** `/app/forms/:id/build` is correct and does
  not change; the page behind it is still the one that says "not built yet".

Two acceptance boxes in `36` are `[~]` rather than ticked. "Preview uses the same
`<QuestionInput>` as the respondent form" is half-provable — there is exactly one
implementation and the preview uses it, but the respondent form does not exist until T-039.
"Preview renders correctly at three widths" has its frames (390 / 720 / unbounded) and its
toggle tested; whether the content reads right at 390 is the same device check as everywhere.

Tests 408 → **493** (backend 185 → 186, frontend 223 → 307), across 47 files.

### 2026-08-19 · T-034 — subjects, and a shared type that had been lying since T-003

`/app/subjects` and `/app/subjects/:id` are real: `pages/console/Subjects/`,
`lib/subjects.ts`, `lib/people.ts`, and the three data components from `24` §3 —
`<ResponsiveTable>`, `<StatCard>`, `<BarRow>`. The create form picks its unit with
`<UnitTree mode="select">`, which is the tree's **third placement** and the first use of
that mode (INV-009 holds: one implementation, three pages).

**Read this before writing another list page.** `Page<T>` in `packages/shared` said
`{ items }`; every list endpoint returns `{ data, page, meta }`, and `13` §4 agrees with the
endpoints. Nothing had imported the shared type since T-003, so nothing noticed — until
T-033's people list read `.items` off it, got `undefined`, and **passed its test anyway**,
because the mock repeated the same wrong shape. Fixed by correcting the shared type and
making the backend's `Paged<T>` an alias of it, so there is one declaration. `N-029`.

Also worth knowing:

- **`GET /subjects/:id` now returns `SubjectDetail`** — the summary plus `cycles[]`, every
  campaign the subject was in with the responses that came back *about that subject*. Doc 35
  specified it in revision one; nothing had implemented it. It carries **no scores** on
  purpose (`N-030`): aggregates live behind the results endpoints where the k-anonymity gate
  is, and an average here would be a second path with no gate in front of it.
- **Doc 35 was wrong about billing and now says so.** It read as though linking a person
  makes a subject billable. `16` §5 is the other way round: a linked subject IS a user and is
  already counted; an UNLINKED one is the seat. The create form states the correct rule.
- **`<PersonChip>` was deliberately not built.** Its contract needs a `PersonSummary` with a
  role level; the subjects API carries a name and an id. Half a person rendered through it
  would invent the level or drop it silently, so the linked person is a plain link until `34`.

Two acceptance boxes are not ticked. "Collapses to cards at 390px" is a device check — the
contract underneath it is tested. **`billable_seats` does not exist**: `16` §5 gives the
formula, `subscriptions.seats` is a column defaulting to 0, and nothing computes it. That is
`16`'s P3 metering work, not this page's.

Tests 369 → **408** (backend 182 → 185, frontend 187 → 223), across 40 files.

### 2026-08-19 · T-033 — the structure page. The tree got extended, not forked

`/app/structure` is real: `pages/console/Structure/` (page, detail panel, and the delete
sentence as a pure module), `lib/units.ts`, `<EmptyState>`, and `<UnitTree>` **extended**
with five optional props rather than a second tree (`N-025`, INV-009). The wizard's call
site did not change by one character, which is the test of whether extending was the right
call.

What is worth knowing next session:

- **The range grammar moved into `packages/shared`** (`N-027`). `parseUnitRange()` and
  `expandUnitNames()` sit next to the schema that caps them, and the server now expands
  through the same function the client previews with. `Wing A..F` works too — it needed a
  `letters` flag on `RepeatRange`, added additively so the numeric form and its tests were
  untouched.
- **The delete sentence is a pure function with its own test file.** "Never *are you sure?*"
  is an acceptance criterion, and a sentence assembled inside a component is one nobody can
  check without rendering a dialog. Writing the tests found a real bug in it: *"1 Quaxel
  **are** left without a unit"*. Verb agreement is not a detail on a projector.
- **`confirmDisabled` on `<ConfirmDialog>`** (catalogued in `24` first). Doc `32` requires
  that confirming a delete with unknown consequences be *impossible*, not discouraged — the
  dialog opens while `GET /units/:id/impact` is in flight. It also focuses Cancel while
  disabled, because `focus()` on a disabled button is a no-op and a modal that opens with
  focus behind it traps nobody.
- **`/app/structure` is the second route-level capability gate** (`N-028`). `32` § States
  asks for a full-page 403 on direct navigation without `unit.read`. The comment in
  `router/index.tsx` claiming setup was the only one is corrected.

Two acceptance boxes in `32` are deliberately unticked. "Usable with touch at 390px" needs a
device. **"A temporary unit's children carry end dates and expire positions on schedule" is
not built**: the row badges it and warns inside 30 days, but the scheduled expiry has no
owner — `17-BACKGROUND-JOBS.md` is still a placeholder. That is a real gap, and it is not
this page's to close.

Also substituted, and recorded in `32`: the detail panel's third stat is **Inside** (units
directly below) where `design_specs/design/04` §4.2 shows RESP. There is no per-unit
response count in the API, and inventing a query nobody specified is worse than showing a
true number.

Tests 311 → **369** (backend 165 → 182, frontend 146 → 187), across 37 files.

### 2026-08-19 · read-back over T-031/T-032 — three real bugs, all in what I had just written

No new features. A pass over the two screens looking for defects, and three were there. All
three had a comment above them claiming the opposite, which is the useful part: a comment is
not evidence.

1. **`Esc` in an inline rename COMMITTED instead of reverting.** `setDraft(value)` is async
   and `blur()` is not, so the blur handler ran first with the draft the user had just asked
   to throw away. Renaming a role, changing your mind and pressing Esc saved the wrong name.
   Fixed with a ref the blur handler reads. **The first test of it passed for the wrong
   reason** — `.blur()` on an element that was never focused is a no-op, so the bug only
   appears once the test calls `input.focus()`. `components/org/InlineName.test.tsx`, 7 tests.
2. **Every "Move here" target in the unit tree was invisible.** `.unit-here { opacity: 1 }`
   was nested inside `.unit-actions { opacity: 0 }`, and a child cannot out-opacity a zero
   parent — opacity is a compositing group, not a cascade. The keyboard and touch re-parent
   path, the one built *because* drag does not exist on touch, was decorative. The tree now
   carries `.is-relocating` and the Setup test asserts the class, because jsdom has no
   computed opacity and could never have caught it directly.
3. **Enter advanced the wizard behind the confirm dialog.** The global Enter handler kept
   firing while the modal was up, so the dialog stayed open over a screen that was no longer
   the one it was asking about. A modal owns the keyboard.

**One gap left deliberately, not fixed:** step 2's Continue greys out for a duplicate or
empty role name and says nothing about why. Doc `31` specifies the validation and not a
message, so this is a judgement call rather than a bug — but "why is Continue grey?" is
exactly the kind of stall that page exists to prevent. Worth a line of copy before `T-045`.

Frontend tests 138 → 146.

### 2026-08-19 · T-032 — the setup wizard. **THE M0 CENTREPIECE IS BUILT**

Five steps, one atomic `POST /org/setup`, and it works against the live server. Verified end
to end with curl, not only in jsdom:

| Checked live | Result |
|---|---|
| Levels derived from array order | `Provost 1 · Head 2 · Tutor 3 · Learner 4` |
| Three-deep tree from flat `tempId`/`parentTempId` | `Northfield → Engineering → Physics` |
| Vocabulary applied, and `/auth/me` returns it | `Studios · Courses · Students · Staff` |
| Starter templates seeded | 4 |
| `configured` flips | `false → true`, so T-031's login redirect lands right |
| **Forced failure leaves the org untouched** | orphan `parentTempId` → 409, still `configured: false`, still only the `Owner` scaffolding row |
| `Skip setup` afterwards | 201 — the emergency exit works even after a failed finish |

**Six components were built here that other tasks catalogue.** `<UnitTree>`, `<InlineName>`,
`<RoleRow>`, `<ProgressRail>`, `<Toggle>`, `<ConfirmDialog>`. The tree is the one that
matters: `55-BUILD-ORDER` lists it under **T-033**, but step 3 needs it and INV-009 says
there is exactly one of it. **T-033 extends it; T-033 does not write one.** `N-025`.

It has a keyboard/touch re-parent path — press Move, then choose a destination — beside
HTML5 drag. That is not polish: drag does not exist on touch at all, and `31` § Acceptance
requires the tree to be usable there. Same reasoning put Move-up/Move-down buttons on the
role rows.

`AppShell` gained `focused`: no sidebar during setup (`N-026`). Every sidebar item during
setup leads to a page that is empty *because setup has not happened*, so offering them
invites the one click that makes the product look broken.

**`audit:vocab` now strips comments before scanning** — it was failing the build on four
lines that were *explaining* INV-001 ("the button label uses the vocabulary: Add a
Department here"). INV-001 is about what renders, and a comment renders nothing. Proved the
strip did not blind it: a real `<p>Departments</p>` still fails. Third time this repo has
learned that lesson (`N-023`), so write the next check with it already applied.

**Still open on this page, and only a stopwatch can close them:** the under-100-seconds run
and the three rehearsals. Both are `T-045`. `Works at 390px` needs a real phone or a browser,
which this session did not have.

**Next:** `T-033` structure page, then `T-034` subjects. Lane C has been unblocked since
T-030 and is still idle — `T-035`..`T-040` can run in parallel with nothing to coordinate
except the tree.

### 2026-08-19 · T-031 — landing, sign in, create org. **AND A CROSS-TENANT LOCKOUT**

The three public screens are real pages now, not placeholders. `/` has the vocabulary
switcher from `design_specs/design/03` §3.1 — four segments, the noun row cross-fades,
auto-advance stops for good at the first click and never starts under
`prefers-reduced-motion`. `/login` and `/start` are 400px cards with an inline reveal, an
inline spinner that never relabels the button, and errors placed where the problem is.

**Read this if you touch auth.** While working through 30's acceptance list I found, and
reproduced end to end, a cross-tenant account lockout:

> Amara registers Org A with `amara@x` and can sign in. **Any** user holding
> `person.create` in **any** other organisation posts `/people { email: "amara@x" }` — no
> special privilege, and legal under the schema, because `users` is unique on
> `(org_id, email)`. That writes an `invited` row with a null password hash. Login's
> `findFirst({ where: { email } })` matched it, and Amara was locked out of her own
> account. Measured 200 → 401 on one unrelated request.

Closed in `features/auth/router.ts`: login now filters `passwordHash: { not: null }` and
orders `createdAt asc`. Verified live against the running server, 200 → 200. Regression:
`test/cross-tenant-login.test.ts`, which asserts the victim lands in **their** org, not the
stranger's. **This is a mitigation, not a resolution** — whether an email address is global
or per-tenant is a schema decision nobody has made. `CONF-013` writes out three options;
`D-007` says pick one by 24 Aug. Do not let silence choose.

Two more findings, both from checking rather than from reading:

- **Login was rate limited per IP only**, though `15` § Rate limiting has specified
  `IP + email` since revision one. Per-IP alone is broken in both directions on a campus:
  ten sign-ins behind one NAT lock out the eleventh person, and raising the ceiling lets a
  stuffing run through. Now keyed on the pair, lowercased, with `ipKeyGenerator` for IPv6.
  Four tests in `test/login-rate-limit.test.ts`, including the campus-NAT case.
- **`uniqueSlug()` runs outside register's transaction**, so simultaneous registrations of
  the same organisation name collide inside it. That turned out to be a free forced-failure
  test — `register-rollback.test.ts` proves a failed registration leaves nothing behind,
  using a real collision rather than an injected one. The 500 the loser gets is `D-006`.

Two spec conflicts resolved rather than papered over, both in `_MEMORY.md`:

- `CONF-011` — **`/start` has no industry picker.** 30 asked for one; design_specs §3.3
  says four fields and nothing else. Design wins: asking on `/start` means asking blind,
  and wizard step 1 asks the same question better a moment later with the presets' contents
  visible. It also removed a contract that could not have been implemented — 30 had `/start`
  calling `GET /org/presets`, which is behind `authenticate` + `org.read`.
- `CONF-012` — the password minimum is **ten**, not the eight in design_specs' helper copy.
  That string is quoting a contract value, and architecture owns contracts.

`PRESET_VOCABULARIES` moved into `packages/shared` so the landing pitch reads the same data
the presets do, with `test/vocabularies.test.ts` failing if the two drift (`DRIFT-007`).
`packages/shared` is now scanned by the INV-002 education-noun check in `seed.test.ts` —
it is imported by both apps and was the one source tree nobody was checking.

**Cost an hour:** `beforeEach(() => mock.mockReset())`. `mockReset()` returns the mock, and
vitest treats a function returned from a hook as a *teardown callback* — so the concise
arrow form registered the rejecting mock to be **called after every test**, and the
unhandled rejection was reported against whichever test built the error. Use braces.

**Next:** `T-032`, the setup wizard. Lane C is unblocked and idle — `T-035`..`T-040` can run
in parallel. Still open from before: the woff2 files (`D-005`, **24 Aug**), which is why
every screen still renders in `system-ui`.

### 2026-08-19 · T-030 — the console shell. LANE C IS UNBLOCKED

`AppShell`, `Sidebar`, `TopBar`, `PageHeader`, `VocabularyChips`, plus `<Icon>`. Every
Stage-4 screen renders inside this, which is why it was the hand-off.

**Open a page with `<PageHeader>`.** Title, optional subtitle, the vocabulary chip row, the
scope chip, filter chips, one primary action. Hand-rolling a title is how differently-shaped
screens stop feeling like one product. The scope chip is a **dropdown for a top-level role
and a plain tag for a constrained one** — a disabled dropdown would imply the choice exists
and is being withheld, which is the opposite of legible.

**The sidebar is where two invariants meet.** Its `Subjects` and `Campaigns` items read
`useLabels()`, so Northfield's sidebar says *Courses* and *Feedback cycles* — verified live.
Items the caller lacks the capability for are **absent, not greyed**; the three "Soon" items
are a different thing entirely and say so, as inert `<span>`s with a hover hint and no page
behind them.

**`<Icon>` is new and is in `24` §1.** `design_specs/design/01` §5 fixes stroke-width 2.75
and a closed concept → icon vocabulary, and neither survives being remembered eighteen times.
`IconName` is that vocabulary as a union, so a concept nobody has agreed an icon for does not
compile. Never emoji.

**A real gap, now `OPEN-006`: the org switcher has no data behind it.** `24` §2 gives
`<TopBar>` an `orgs[]` prop and `design_specs/design/02` §3 calls it the second most important
control in the demo — but **a user belongs to exactly one organisation**. `users.org_id` is
non-null, `(org_id, email)` is the unique key, there is no membership table, and `13` has no
endpoint that could list switchable orgs. The four demo orgs are four separate accounts.

What is built is honest rather than a stand-in: the switcher lists the seeded demo orgs and
**switches by re-authenticating**, gated at *build time* exactly as `30`'s login prefill is.
`DEMO_ORGS` is `[]` in a production bundle, so the branch and its credentials vanish as dead
code. Where there is nowhere to switch to, it renders as plain text — not a chevron that
opens an empty menu. `OPEN-006` lists the three real fixes for whoever picks one.

**Worth keeping:** the first attempt at that gating left the password behind. `import.meta.env.PROD`
did eliminate the org array, but `export const DEMO_PASSWORD` next to it was reachable,
therefore kept by the minifier — a credential string sitting in `dist/` with no accounts
attached. Moving it *inside* each array entry made it vanish with the array. **A build-time
guard only covers what is inside it**, and the way to know is to grep the bundle, which is
now `21`-style acceptance in `lib/demo.ts`.

`test-utils.tsx` now exists — `28`'s stated trigger was three component test files with
visible setup duplication, which this reached. It carries `renderWithProviders()` and the
**nonsense-label fixture** that makes INV-001 testable at component level rather than only by
the manual walk (`22` §5).

Not screenshotted — there is no browser or Playwright cache on this machine, and the user
chose to look themselves rather than install one. **`51` §6 still needs Playwright for four
E2E flows before M0**, so that install is coming regardless; it is not yet scheduled.

New dependency: `lucide-react`. Green: typecheck · lint · audit:drift · audit:vocab · build ·
**214 tests across 23 files**.

### 2026-08-19 · STAGE 3 FOUNDATION — T-026, T-028, T-029 (T-027 partial)

The frontend stopped being a scaffold. `src/frontend` now boots, routes, styles itself and
talks to the API.

**T-026 — three route trees.** `router/index.tsx` carries public / console / respond as
three sibling trees with **three layouts and three error boundaries**, not one shell with
conditionals. Every page is `React.lazy`, so the respondent bundle does not contain the
console — the build emits 25 page chunks around a shared core. Every M0 route from `20` §2
exists; the four P3 routes deliberately do **not**, because a stub page behind a "Soon" item
is worse than a link that visibly does not navigate.

Each route resolves to a placeholder naming the task that replaces it. **Replace the file;
do not add a route** — `router/routes.test.tsx` asserts the path set against `20` §2, and a
renamed path breaks a printed QR code, which is the one failure nobody can fix on demo day.

**T-027 — design system, with one thing outstanding.** `tokens.css` is `design_specs/design/01`
§2 + §2b copied verbatim; `organic.css` is the vendored component layer; `endur.css` holds
Endur's layer and the single documented `.card` override.

The vendored file ships its **own `:root`** — the original warm palette — and the documented
import order would have let it win and repaint the product terracotta. Resolved as
**`CONF-010`**: vendor the component layer only, from `body {` onward, since `21` §2 defines
that file as the component layer and `21` §4 gives `tokens.css` ownership of `@font-face`.
The import order in `21` §2 is untouched. Re-vendoring stays one command.

**The two woff2 files are NOT vendored** — `T-027` is `~`, not `x`. Both faces fall back to
`system-ui` and nothing breaks, but the product does not look like itself. The deadline is
**24 Aug**, and `src/frontend/public/fonts/README.md` says exactly which two files and where
they go. There is deliberately no `fonts.googleapis.com` import anywhere: a font that works
in dev and not on the projector is the worst of both.

**T-028 — store, before any page exists.** `authSlice` + `vocabularySlice` and nothing else,
per `DEC-008`. `lib/labels.ts` is four lines and is the most important file in the frontend:
no component ever gets the chance to hardcode a domain noun. `audit:vocab` caught a hardcoded
one **in a comment** in the placeholder file during this session, which is a fair advert for
the check.

**T-029 — `lib/api.ts`.** Same-origin, `credentials: 'include'`, the `X-CSRF-Token` echo on
unsafe methods only, and the error envelope unpacked into an `ApiError` that carries the
field errors a form renders inline and the decision trace that makes a 403 actionable. No
token, no refresh dance. A 401 raises `SessionExpiredError` and fires one registered handler,
so an expired session routes to `/login` from wherever the user was rather than stranding one
page on a spinner.

**Backend change: `/auth/me` now returns the capability set.** `13` § Auth has always
specified it and it was never implemented, so `useCan()` had nothing to read. `authz/held.ts`
derives it — and is **deliberately not the resolver**, recorded as `DEC-019`. The rule and
its honest cost are written at the top of that file; the short version is that a
unit-anchored deny is not subtracted, because doing so would hide a button the person can
legitimately use in the unit next door. `test/me.test.ts` closes with a test proving the
route still 403s regardless of what the list says — if that one ever fails, the bug is in the
route, not in the list.

**Verified against a live server, not just a compiler.** Signed in through the Vite proxy as
each of the four demo orgs: `endur.sid` arrives `httpOnly` and `endur.csrf` readable, and the
same code renders Department/Course/Student, Property/Restaurant/Guest, Ward/Service/Patient
and Team/Project/Employee. That is the ten-second proof (`N-003`) working end to end before a
single screen exists.

**Two things the next session should know.**

1. **The integration tests write into the dev database.** It held 249 junk users and 168
   throwaway orgs from previous runs, and the demo seed was not present at all — the logins
   `PROGRESS` advertises did not work until re-seeded this session. The seed is idempotent
   and takes ~4 s, so re-run it rather than wondering. A separate test database is worth
   doing before `T-045`; logged under Debt.
2. `router/layouts.tsx` holds the console frame **only until `T-030`**. Taking it over with
   `AppShell` is the intended move, not a conflict.

Green: typecheck · lint · audit:drift · audit:vocab · frontend build · **199 tests across 20
files** (149 backend + 50 frontend).

New devDependencies in `@endur/web`: `jsdom`, `@testing-library/react`, `@testing-library/dom`,
`@testing-library/user-event` — `51` §5 already names Vitest + Testing Library as the choice.

### 2026-08-19 · merge repair — READ IF YOU PULLED BEFORE THIS
`3312cdf6`, the merge of `mithil-patidar` into `vishv`, **was committed with its conflicts
unresolved.** If you pulled between that commit and `1fb0656b`, you have a tree that does not
build: 92 typecheck errors, 14 of 15 test files failing to load. Pull again.

20 files carried conflict markers. Two were mangled with **no markers at all**, which is the
half that actually hurt:

- `authz/index.ts` was **emptied**, so every `from '../authz/index.js'` import failed with
  "not a module" — an error that points nowhere near the cause
- `database/schema.prisma` kept **both** sides: the `CampaignStatus` enum and
  `campaigns.status` came back alongside `closed_at`, directly contradicting `DEC-016`

Everything resolved to `95a69183`. That side already contained the Stage-1 work
byte-for-byte, so it is a strict superset — `git diff 7b8e09db 95a69183` reports no
deletions. Nothing from either branch was lost.

**The lesson worth keeping:** a conflict scan over `*.ts` and `*.md` reported the repo clean
while `schema.prisma` was still broken. Scan every tracked file, not the extensions you
expect. That is `N-022`.

Verified green after the repair: typecheck · lint · audit:drift · audit:vocab · frontend
build · **141 tests across 15 files**.

### 2026-08-19 · STAGE 2 COMPLETE — the whole API surface, T-015 to T-025

**60 endpoints, 141 tests across 15 files, four seeded demo organisations.** Every screen in
Stage 4 now has a real endpoint to call, and `02` §2's "a seeded demo alone can pass" is
satisfied three days before its 22 Aug deadline.

**Three decisions were taken before any code, and they are in `_MEMORY.md`:**

| | |
|---|---|
| `DEC-016` | **Campaign status is derived on read.** Resolves `OPEN-005`. The column and the `campaign_status` enum are dropped; `closed_at` is the only stored transition. No scheduler, no timer, nothing to be stuck |
| `DEC-017` | Public token is **8 characters** from a 31-letter alphabet with `0 O 1 I L` removed. Doc `38` said six; six is ~30 bits for a link that needs no credential |
| `DEC-018` | `/templates/library` and `/authz/capabilities` are guarded rather than added to the route-enumeration allowlist. No M0 screen reaches either without a session |

**Two migrations.** `campaign_status_derived` drops the column and **re-keys the anonymity
trigger onto `public_token`** — the same statement said against the column that now carries
the truth, because minting the token *is* leaving draft. `idempotency_keys` backs `13` §7.
Both verified against the live database: 19 tables, the trigger's new body read back out of
`pg_proc`.

**The one genuinely new piece of authorisation logic is `authz/visibility.ts`.** `resolve()`
answers *"may this caller act on THIS target"*; every list asks the inverse, *"WHICH targets
may they see"*. Guarding a list with a target-based check 403s every scoped role — a
`subtree` grant cannot reach an org-level target by design (`11` §4) — so list routes carry
`requireCapability(..., { target: 'any' })` and the handler filters through `visibleUnits()`.
Out-of-scope rows are absent and `meta.total` counts only what the caller may see. Deny still
wins: a deny at scope `all` empties the visibility entirely.

**`requireCapability` grew the 404-versus-403 rule `13` §5 always specified.** A denial with
reason `out_of_scope` on a target the caller cannot even read is now a 404 — a 403 would
confirm the resource exists. A denial on something they *can* see stays a 403 with the trace,
because that is actionable.

**Three bugs found by building on top of Stage 1, all pre-existing:**

1. **`authzVersion` was never passed to the resolver**, so the grant cache key was a constant
   and a permission change stayed invisible for the TTL. `tenantResolver` now reads it
   alongside the tenant. `roles.test.ts` proves it: a grant removed in one request makes the
   next request 403 with no sleep and no cache clear.
2. **`tenantResolver`'s public-token pattern captured the literal word `campaigns`** — it
   matched the segment after `/api/v1/public/`, not after `/campaigns/`. Invisible until a
   public route existed. `N-017`.
3. **ESLint flat config REPLACES rule options rather than merging them**, so the
   `features/**` block had silently switched off DEC-007's `$queryRaw` confinement for every
   file under it since T-001. Found by writing a probe file to prove the rule fired and
   watching it not fire. Both rules re-proved by probe afterwards. `N-019`.

**Three specs disagreed with themselves and were amended, not worked around:**

- `50` §2 gave university and hospital no one-question form while `50` §7 required every
  preset to ship one. The acceptance list wins; both gained a `Quick pulse`.
- `50` §7's INV-002 check was a bare `grep` for the banned words, which flags the sentences
  that *explain* the invariant. Now scoped to identifiers, strings and paths, with comments
  stripped — the same lesson the drift script learned at T-003.
- `rateLimit.ts` said respondent submits were "deliberately NOT tight" and then set 5/minute
  per IP. A lecture hall behind one NAT is the SUCCESS case; raised to 120.

**k-anonymity is enforced by absence.** Below `K_ANON_THRESHOLD` the results body carries no
`questions` key at all — not an empty array, not zeroes. The same gate covers the comments,
the CSV export and every number on `/home`, so the dashboard cannot become a way to read a
suppressed campaign one aggregate at a time.

**The seed is real.** `npm run db:seed` builds 4 orgs, 48 subjects, 12 campaigns and **3,250
responses in ~8 s**; migrate + seed from an empty database is **~14 s**, inside `50` §4's 30 s
target. Ratings use order statistics rather than a blended uniform — the first attempt gave
every subject an average near 2.5, which is exactly the flat distribution `50` §3 warns reads
as fake. Now the mode sits at 4 with a tail to 1, and `Databases` averages 2.28 against
3.6-4.25 for everything else, so the results screen has something to show. Each org also
carries a `Live pulse` campaign left open with 1-2 responses, so **k-anon suppression is
reachable during the demo** rather than only described in a doc.

**`D-002` is discharged** — drop, migrate and seed were run end to end against a database
created for the measurement, so the working database was never destroyed. `D-003` is new and
takes its place: eleven services check `orgId` by hand because the tenant client cannot scope
a by-id `where`, and one forgotten call is a cross-tenant read. RLS is what makes that
structural.

**Read before touching the chain:** `visibleUnits()` and `resolve()` must keep reading the
same grants through the same `collectGrants()`. Two permission models that agree today is a
coincidence; one model asked two questions is a design (`N-005`, `N-016`).

### 2026-08-19 · hand-off note — SUPERSEDED by the Stage 2 entry above

Kept for the record. Everything it lists as "next" is now done, and the three things it
left waiting in `app.ts` were all handled at T-015 and T-022: the `_echo` probe is
deleted, every router is mounted through `mount()`, and scoped rate limits and
idempotency are attached per route.

Vishv finished for the day. **Everything below is committed and pushed.** State:

**What works end to end right now.** Register an organisation, sign in, get a session, have
the tenant resolved from it, pass CSRF, be validated, and be authorised by the GRANT
resolver — with the decision traced and the audit row written in the mutation's own
transaction. `npx vitest run` in `src/backend` proves it: 20 tests, 4 files.

**What to build next, and how to split it.** Lanes A and C are both free:

| Task | Lane | Why it is startable |
|---|---|---|
| **T-015** org + presets + `POST /org/setup` | A | Guards and the grant matrix exist; `presets/grant-matrix.ts` already holds `50` §1 |
| **T-025** SEED — 5 presets + 4 demo orgs | A | **DUE 22 AUG.** `02` §2 is blunt: a seeded demo alone can pass, an unseeded live build cannot |
| **T-026–T-029** frontend foundation | X | `src/frontend` is a bare Vite scaffold. Nothing in it conflicts with backend work |

If two people work at once, **one takes `src/backend/features/**`, the other takes
`src/frontend/**`.** They share only `packages/shared`, and only additively.

**Three things waiting in `app.ts`:**
1. `POST /api/v1/_echo` is a temporary probe. **Delete it at T-015**, and drop its entries
   from `PUBLIC_ROUTES` in `test/routes.test.ts` and from `TENANTLESS` in `tenantResolver.ts`
2. The first real router is mounted with `mount(app, prefix, router)` from `lib/mount.ts` —
   use that, not `app.use`, or the route-enumeration test cannot see the routes
3. Links 12 (scoped rate limits) and 13 (idempotency) are written or specced but not yet
   applied to any route; they attach per route in Stage 2

**Two decisions still need the team** — `OPEN-005` (campaign status, due 22 Aug) and
`OPEN-002` (the QR's public URL, due 24 Aug). Both block Stage-4 work and neither has moved.

**Read before touching the chain:** `_MEMORY.md` `N-014`. Session loading must precede
`tenantResolver`, and there is a test that fails loudly if that is undone.

### 2026-08-19 · T-014 finished — the ordering and isolation tests
`test/ordering.test.ts` and `test/tenant.test.ts` close the two open items. **20 tests
across 4 files, all passing.**

The ordering tests build deliberately WRONG chains and assert they break — which is what
makes `12` §5 a requirement rather than a comment. If one ever starts passing, the
constraint it protects has quietly stopped being real:

| Mis-ordering | Asserted failure |
|---|---|
| `errorFunnel` registered before the route | Express's HTML handler answers; no envelope |
| `errorFunnel` registered last | envelope, requestId, **no stack** |
| No `bodyParser` before `validate` | 422 — loud, not a silent pass |
| `tenantResolver` before the session loads | `401 UNRESOLVED_TENANT` — pins `N-014` |

Tenant isolation is asserted mechanically now, including the forged-`orgId` case INV-010
exists for, and the raw-client case that documents *why* lint confines it.

**One behavioural change made while writing these.** `tenantResolver` demanded a tenant on
EVERY path, so a mistyped `/nope` returned `401 UNRESOLVED_TENANT` rather than a 404. It is
now scoped to `/api/v1/**`: an API route with no resolvable tenant is still 401 (INV-010
runs before routing, deliberately), but anything else falls through to `notFound`. "That
page does not exist" is the honest answer to a typo.

Also: typed-lint is relaxed for `no-unsafe-*` inside test files only. supertest types
`res.body` as `any`; asserting on it is the file's whole purpose, and a wrong assumption
fails the test loudly anyway.

### 2026-08-19 · T-013 audit + T-014 route enumeration — Stage 1 complete
**`ctx.tx` writes the audit row inside the mutation's own transaction** (`db/tx.ts`). That is
the whole of INV-007: a post-response writer with its own transaction can succeed when the
mutation rolled back, and an audit log that disagrees with reality is worse than none.
`auditWriter` is only the safety net — it asserts after the response that a mutating request
produced a row, and **throws in development**, so a forgotten audit call is caught by whoever
wrote it rather than months later.

**The route-enumeration test passes, AND it was proved to fail.** Adding an unguarded
`GET /api/v1/secrets` produced exactly the intended failure; removing it went back to green.
A test that cannot fail proves nothing, so this check should be repeated whenever the
enumeration logic changes.

`requireCapability` now tags its handler with a symbol, so the test reads the router stack
rather than parsing source — source-parsing checks rot.

**`lib/mount.ts` is new and not in any doc.** Express 5 removed the `regexp` that v4 put on
a router layer, so a mount path cannot be recovered by walking internals any more. `mount()`
records the prefix explicitly; it costs one line per router and makes T-014 independent of
framework internals that change between majors.

`PUBLIC_ROUTES` in the test is an allowlist where **every entry carries its reason**. When a
new route makes this fail, the fix is almost never a new allowlist entry — it is the guard.

Still outstanding on T-014 (marked `~`): the ordering tests (deliberately mis-order two links
and assert a loud failure) and the tenant-isolation integration test. The enumeration test —
the highest-value one — is done.

### 2026-08-19 · T-007 auth + T-008 CSRF — the chain works end to end
Sessions (`express-session` + `connect-pg-simple`), argon2id, `/register` `/login`
`/logout` `/me` `/csrf`, and the double-submit CSRF check. Verified live:

| | Result |
|---|---|
| `/register` | 201, and the org is built in ONE transaction |
| `/me` | user + organization + **resolved labels** |
| Wrong password vs unknown email | **byte-identical** responses |
| `POST /logout` with no CSRF token | `403 CSRF_FAILED` |
| `POST /logout` with the token | `{"ok":true}`, session destroyed server-side |
| `endur.sid` · `endur.csrf` | HttpOnly · readable, as the double-submit pattern requires |

The founder's real powers, resolved through the engine after registering:
`campaign.launch → Owner subtree` · `grant.update → Owner all` · `audit.read → Owner all` ·
`person.read self → self`. That last one is the row `50` §1 warns about — without the
universal self grants, a default-deny model silently produces an unopenable profile page.

**ORDERING FINDING, worth reading before touching `app.ts`.** `12` §5 says
`tenantResolver → authenticate`, and that still holds — but tenantResolver resolves the org
*from* `req.session.orgId`, so the session record must already be LOADED when it runs.
Putting `sessionMiddleware` where `authenticate` sits made every authenticated request fail
`UNRESOLVED_TENANT`. The distinction that resolves it: **loading a session is not
authenticating.** `cookieParser` + `sessionMiddleware` go above tenantResolver; principal
selection stays at link 7. Documented in `app.ts` at the call site.

`/register` builds org + root unit + Owner role + user + person + position + membership edge
+ the level-1 grants in a single transaction. A half-created org is the worst failure
available here: a user who exists, can see nothing, and cannot retry because their email is
taken.

`presets/grant-matrix.ts` now holds the `50` §1 matrix as data. T-015/T-025 build the five
presets on top of it rather than restating it.

**Known rough edge:** `/me` without a session returns `401 UNRESOLVED_TENANT` rather than
`401 UNAUTHENTICATED`, because tenantResolver runs first and legitimately cannot find an org.
Same status, less precise code. Harmless for the SPA (any 401 routes to `/login`); tidy it
when the auth routes get their final pass.

### 2026-08-19 · T-012 the guards
`requireCapability` and `requireEntitlement`, plus the tier map in `billing/entitlements.ts`.
Both are thin, which is the point — the thinking lives in `resolve()`.

`requireCapability` reads the target id from `req.data`, the **validated** request. That is
why `validate` must run first (`12` §5): reading raw input here would let a caller point the
permission check at one resource and the handler at another.

403 bodies carry `reason` and `decidedBy` always, and `considered` only outside production —
a series of 403s carrying the full trace would let an outsider map the org's permission
structure from outside.

`requireEntitlement` verified against `16` §3:

| | Result |
|---|---|
| Bronze includes `grant.update`, `person.delete`, `simulator.run`, `campaign.launch` | **all true** |
| Bronze includes `analysis.read` / `audit.read` | false → upgrade to silver / enterprise |
| Gold includes a silver feature · Silver includes an enterprise one | true · false |

The first row is the one that matters: **the entire permission surface is in the cheapest
tier.** Correct handling of who-can-see-what is never an upgrade (`01` §6), and `simulator.run`
is Bronze too — gating it would mean the customers least able to configure permissions are
the ones who cannot check their work.

Also fixed: `context.ts` carried a placeholder `Decision` type from before `authz/` existed.
It now imports the real one — two definitions of one shape is exactly the drift the shared-DTO
approach exists to prevent.

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
