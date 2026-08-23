# Endur — progress

**The live state of the build.** Any Claude session, on any account, reads this first and
updates it before finishing. `architecture/55-BUILD-ORDER.md` is the plan; this file is what
has actually happened.

```
UPDATED   2026-08-24  (T-072 BUILT — AN ORGANISATION CAN NOW MAKE ITS OWN ACCOUNTS. An
                       administrator provisions a sign-in for somebody already in the
                       graph, hands over a one-time link, and never knows a credential
                       that works. Activation sets the password and signs them in;
                       revocation ends live sessions on the NEXT REQUEST. Bounded by
                       INV-012 on both minting routes. 312 backend tests (was 284).
                       VERIFIED AGAINST THE RUNNING API, end to end, probe org deleted.
                       !! IT FOUND TWO LIVE HOLES IN SHIPPED CODE, both closed.
                       D-024 — PATCH /people/:id { status: 'disabled' } was a FAKE REVOKE:
                         weaker capability, live sessions untouched, old password kept.
                       D-026 — A PERSON YOU HAD JUST CREATED WAS INVISIBLE TO YOU. POST
                         /people 201, then the list did not contain them and the detail
                         404'd. Every organisation, the most common action in 34.
                       Read both in § Debt before touching people visibility or PATCH.
                       DEC-046, DEC-047. 61 docs, 64 capabilities.
                       !! STAGE 8 OPENED THE SAME DAY, DOCS ONLY, from an owner ask about
                       what the LOWEST TIER sees. It found D-027, which is wider than the
                       ask: `person.read: self` is a UNIVERSAL seeded grant and
                       authz/held.ts discards scope, so EVERY ACCOUNT IN THE PRODUCT sees
                       a People item that lists exactly one person — themselves. Settings
                       is the same via `org.read: all`. Structure and Roles are already
                       correctly hidden for L4; Subjects, the one they SHOULD see, is
                       hidden because L4 has no subject.read row. T-086/T-087, and
                       OPEN-009 has one cell the owner has to decide (L3 × People).
                       !! IF YOU ARE ABOUT TO ASK "WHY IS ANALYSIS STILL SOON" — there is
                       now a table for it: § "Why is that item still greyed?". Short
                       version: nothing is dropped, and T-057 (the tiers) gates TWO of
                       the four greyed pages. D-012 is why — no org has ever had a
                       subscription row, so every Gold surface 402s for everyone. There
                       are no PRICES because DEC-035 removed them on the owner's own
                       instruction; the tier machinery it kept is simply unbuilt.
                       !! DEC-048 + T-088 — THE TIER PICKER AT SIGN-UP, asked for by name.
                       Three buttons, bronze/silver/gold, pressed = assigned, register
                       writes the row. It REPAYS D-012 and therefore un-greys Analysis and
                       Reflect, and it needs NONE of T-057: billing/entitlements.ts and
                       requireEntitlement already exist and are correct. No trial —
                       DEC-035 killed it, not DEC-048, because both arguments for it were
                       arguments about price. 16 §7 annotated, not deleted.
                       Previously, 2026-08-23: T-069 + T-070 BUILT — THE FOURTH ASK IS COMPLETE END TO END. A
                       feedback cycle can be open to everyone or open only to the
                       organisation, chosen from the wizard, warned about on the share
                       sheet, enforced at the gate, and explained to the respondent on the
                       form. VERIFIED AGAINST THE RUNNING API.
                       284 backend + 698 frontend tests.
                       !! IT FOUND D-022, A LIVE HOLE, AND DEC-045 CLOSES IT. The audit
                       row for a submission was about to carry the SUBMITTER'S USER ID.
                       Read D-022 in § Debt before touching db/tx.ts.
                       Earlier the same day: T-050 BUILT — /app/people is real, so a cold
                       start can add a person for the first time. STAGE 7 SPECIFIED, ITS TWO SECURITY
                       TASKS BUILT, D-020 CLOSED TOO.
                       T-074 + T-071 + D-020 DONE — THREE live holes closed, each
                       proven by reverting the fix and watching the test fail.
                       265 backend tests (was 248).
                       The rest of the four asks are DOCUMENTED, NOT BUILT.
                       Four new docs 56/57/58/72, sixteen amended, DEC-037..DEC-043,
                       INV-012, CONF-019, OPEN-003 resolved. 17 tasks T-069..T-085.
                       !! TWO REAL HOLES FOUND IN SHIPPED CODE — D-018 and D-019. Read
                       them in § Debt BEFORE building anything else.
                       Earlier the same day: STAGE E BUILT (T-061..T-065), DEC-035
                       removed pricing, DEC-036 resolved OPEN-008, five docs written)
PHASE     P1 MIDDLEWARE
MILESTONE M0 = 2026-08-26  ·  2 days  ·  demo 27 Aug  ·  GRADED
STATUS    50/80 (49/49 for M0 minus the fonts). STAGES 0-4 DONE BUT FOR THE FONT FILES.
          EVERY M0 SCREEN IS BUILT.
          !! EVALUATION 1 IS COVERED. All five mandatory middleware types are implemented
          and asserted by tests, and logs and errors are written to rotating files.
            logging        requestLogger + pino, redact list, never a body
            error handling errorFunnel, one exit, four-arg, registered last
            FILE UPLOAD    middleware/upload.ts — multipart, images only, magic bytes,
                           dimension cap, size refused AS THE BYTES ARRIVE, metadata
                           stripped. 15 tests. Was ABSENT this morning (T-061, T-062)
            security       helmet, two CORS policies, CSRF, rate limits, argon2id
            ROUTER-LEVEL   middleware/chains.ts — FOUR different chains, applied with
                           router.use(). Was ONE line this morning (T-064)
            logs to files  lib/logFile.ts — app-<date>.log + error-<date>.log, daily and
                           size rotation, 14-day retention, fails OFF (T-063)
          !! WHAT TO DEMONSTRATE, in this order: app.ts (application-level, links 0-5) ->
          any feature router (router-level, links 6-8, and they DIFFER per router) -> any
          route (per-route, links 9-13) -> errorFunnel (error-handling, four arguments).
          12 §2 now has a table naming which Express middleware kind each box is.
          !! EVERY REMAINING TASK NOW HAS A SPEC. 18 was written from placeholder, 19/49/
          70/71 are new, 48 is re-tagged P1, and 11 §3 / 13 / 24 were amended first.
          61 docs, audit:drift clean. The placeholder PAGES were never unspecified —
          33, 34, 42, 43, 47 have been complete since round 1; they are unbuilt.
          !! INV-011 IS NEW AND IT IS ABSOLUTE. A platform operator reads COUNTS, NEVER
          CONTENT — no operator capability in any role resolves to a response, an answer,
          a comment or a respondent identity, enforced at the db seam and not in the UI.
          !! DEC-034 CLOSED A REAL HOLE. billing.update as written in 16 §8 would have let
          an org administrator SET THEIR OWN TIER. It now means "request a change"; only
          platform.plan.override sets one.
          !! 70 AND 71 ARE EXEMPT FROM INV-001 (19 §12) and audit:vocab WILL FAIL on them
          until pages/platform/ joins its exclusion list. Same reasoning as N-049.
          !! STAGE 6 WAS OPENED 23 AUG AND IS NOT M0. Eleven P2 tasks, T-050..T-060, from
          a read-only survey. NONE of them is on the path to the demo, and the one with
          the largest blast radius (OPEN-007, what an Endur operator IS) is a decision
          that must be written into a 19- doc before any of it is code. Finish T-043,
          T-045 and D-005 first. Read the 23 Aug session log entry before starting any
          T-05x — it records what was already checked so it is not checked twice.
          859 tests, all green — 213 backend + 646 frontend. THE FRONTEND FIGURE WAS
          MEASURED IN TWO RUNS, NOT ONE (status.md §6); a single full-suite run has not
          been done. Do not chain the two workspace suites in one shell command — the
          backend shares one database and fails spuriously if started mid-teardown.
          TESTS NOW RUN AGAINST endur_test, NOT endur (D-004, T-048). It is created
          and migrated automatically; nothing to set up.
          60 endpoints · 4 seeded demo orgs · 3,382 responses · migrate+seed ~14 s.
          !! READ CONF-013 IN _MEMORY.md BEFORE TOUCHING AUTH. A cross-tenant account
          lockout was found and closed on 19 Aug; the schema question behind it is
          still open and somebody has to decide it.
          !! FOLDERS WERE RENAMED 19 Aug. apps/api -> src/backend, apps/web ->
          src/frontend, prisma -> database, and neither app has an inner src/ any
          more. If you had a branch open, rebase before doing anything else.
NEXT      !! STAGE 7 IS SPECIFIED AND UNBUILT. 2026-08-23, four owner instructions in one
          message: complete every disabled sidebar page · both kinds of admin can see logs ·
          an organisation can make accounts for its own levels · a feedback cycle can be open
          to everyone or to the organisation only. THE DOCS ARE DONE AND THE CODE IS NOT.
          17 tasks, T-069..T-085, in 55 § Stage 7. Nothing in it is M0.
          !! TWO LIVE HOLES IN SHIPPED CODE WERE FOUND WHILE WRITING THOSE DOCS. Neither
          was introduced by this session; both were found by specifying a feature that
          would have made them reachable. Both are in § Debt with the reasoning.
            D-018  CLOSED (T-071). Anyone with assignment.create could make themselves an
                   owner: addAssignment checked the capability on the target unit and
                   NOTHING ELSE. requireNoEscalation now bounds it — AND the CSV import,
                   which creates positions too and would have made the first guard
                   bypassable in one call.
            D-019  CLOSED (T-074). flushAudit wrote ip for EVERY principal, so audit rows
                   for response.submit carried the respondent's IP next to a response
                   written in the same transaction. One line. Reverting it fails the test
                   with `expected '::ffff:127.0.0.1' to be null`.
            D-020  CLOSED (DEC-044). A per-person deny at a unit scope did NOTHING —
                   collect.ts never anchored a person-node grant, so scopeCovers correctly
                   refused it a unit claim. The per-person ALLOW was inert too, which made
                   33's per-person override a control that writes a row and changes
                   nothing. Every existing denyPerson test used `all`, which needs no
                   anchor, which is why nobody caught it.
                   FIXED THE CODE, NOT THE DOC, and the deciding fact was MEASURED: every
                   grant in the database is on a ROLE node, so there was nothing to move.
                   DEC-044 adds one clause 11 §4 lacked — a LONE UNFLAGGED POSITION counts
                   as home, because isPrimary DEFAULTS TO FALSE and a strict rule would
                   have left the commonest shape in the product still inert. Two unflagged
                   positions gets NO anchor: isPrimary exists to resolve that ambiguity and
                   guessing would make the resolver non-deterministic.
            !! AND IT DRAGGED OUT A PRE-EXISTING ONE IN held.ts. It subtracted an org-wide
                   deny only when the grant had NO anchor — but `all` scope is decided
                   before an anchor is consulted, so an `all`-scoped deny on a ROLE was
                   never subtracted from the UI capability set. Role grants are always
                   anchored. Caught by a me.test.ts regression the moment person grants
                   gained an anchor. Scope is the test; the anchor is irrelevant to it.
          !! THE ORDERING THAT MATTERS, if you build any of Stage 7:
            T-074 before T-076   DONE — the IP fix landed before any page renders a row
            T-071 before T-072   DONE — the guard exists for the account routes to reuse
            T-057 before T-082   a real subscription row before a 402 can be demonstrated
            T-057 before T-083   or the WHOLE improve loop 402s for everyone, demo included
            T-069 before T-070   the access gate before the toggle that sets it
            T-085 last           the sidebar is un-disabled per page, as each page lands
          !! FOUR DOCS ARE NEW AND THE CATALOGUES WERE AMENDED FIRST, as the ground rule
          requires: 11 §3 gained an Accounts module (account.create/revoke/reset), 24 gained
          <DecisionTrace> <InviteLink> <ResponseCard> <LogViewer> + the <AccessNotice>
          pattern, 13 gained the accounts, inbox, audit and platform-logs routes.
          THE THREE ACCOUNT CAPABILITIES ARE NOW IN capabilities.ts (T-072), so the
          `account` module is real and audit:drift actually CHECKS those tokens rather
          than skipping them: 61 docs, 64 capabilities. 50 §1 gained their seeded row —
          create/reset reach L2, revoke stops at L1, which is the whole reason 57 splits
          one verb into three.
          !! DEC-042 RESOLVED OPEN-003 — the analysis engine is RULE-BASED, no LLM. It was
          forced early: the owner asked for the Analysis page and it could not be built
          while its engine was undecided. The decider was privacy, not cost.
          !! CONF-019 IS WORTH READING BEFORE TOUCHING ANY "SOON" PAGE. The five disabled
          items were blocked for THREE DIFFERENT REASONS and a blanket "it is P2 now" would
          have hidden the hard one: Reflect (44) is entirely Gold-entitled and NO ORG HAS
          EVER HAD A SUBSCRIPTION ROW (D-012), so that surface 402s for every user in the
          product today. T-057 first, or the screens open for nobody.
          !! INBOX HAD NO ARCHITECTURE DOC AT ALL — the same gap 46 was, a sidebar route
          nothing owned. Now 58, and pulled to P2 on design_specs/design/08 §8.3's own
          advice that the read/unread mechanic works today on raw comments.

          !! ACCESS IS COMPLETE — SERVER AND SCREEN (T-069, T-070). A campaign
          carries `access` = public | organization. `public` is the default, the demo path
          and every seeded campaign — DEC-009 is amended, not overturned, and a stranger
          with a link still needs nothing at all. `organization` demands a staff session
          FOR THAT ORG: 401 SIGN_IN_REQUIRED to a stranger, 403 NOT_A_MEMBER to somebody
          signed in elsewhere, and the form renders for a member holding NO capability,
          because membership is the whole check.
          THE ORDER IS THE SECURITY PROPERTY AND IT IS ENFORCED, NOT JUST WRITTEN DOWN.
          resolveCampaign 404s a bad token before requireMembership ever reads `access`,
          so the 401 discloses nothing the working token did not. The gate reads the
          campaign through campaignOf(), which THROWS if the resolver did not run —
          swapping the two lines gives a loud 500 on every request, not a quiet gate
          deciding on a campaign it never loaded. Proven by swapping them.
          !! WHAT IT COSTS, AND THE PRODUCT SAYS IT OUT LOUD IN THREE PLACES NOW: on an
          `organization` campaign PARTICIPATION IS NOT ANONYMOUS. campaign_participants
          records THAT Priya answered and Sam did not — same shape and same guarantee
          `invitations` has always had, three columns, no response reference. The ANSWER
          stays anonymous. Said at the point of CHOOSING ("You'll see who responded, never
          what they said"), at the point of SHARING (the share sheet replaces "they don't
          need an account", which is a LIE about a restricted campaign), and at the point
          of ANSWERING (<AccessNotice>, above Submit).
          !! <AccessNotice> IS THREE SENTENCES AND ONE DELIBERATE SILENCE, not the four
          24 §7 asked for. The silent pair is !anonymous on an open link: no source gives
          copy for it, and both things the page could invent are wrong — a promise it
          cannot keep, or a warning about a linkage the schema does not make. THE SILENCE
          IS ASSERTED BY A TEST so "somebody forgot" stays distinguishable from "somebody
          decided". 24 §7 was amended to say so rather than left describing something
          nobody could honestly build.
          !! THE CSRF EXEMPTION ON THE RESPONDENT CHAIN NOW RESTS ON THE COOKIE. chains.ts
          argued those routes hold no ambient authority; DEC-037 gave the submit route
          some. What stops a forged cross-site POST burning a member's one submission is
          sameSite:'lax' on endur.sid — NOT the chain. Loosen that flag to `none` and
          csrfProtection has to be mounted on the submit route IN THE SAME COMMIT. There
          is a test asserting the flag so the coupling cannot break silently.

          !! /app/people IS BUILT AND THE SIDEBAR ITEM IS LIVE (T-050). The cold-start
          hole is closed: create a person, then give them a Role — Unit position from two
          inline dropdowns. VERIFIED AGAINST THE RUNNING API, not just mocks.
          TWO PIECES OF T-050's LINE ARE NOT BUILT AND ARE TRACKED AS DEBT, NOT DONE:
            D-021  the CSV import WIZARD. Both endpoints exist, are guarded and are
                   INV-012-bounded; there is no UI. Import is how a 500-person org is
                   populated, so the cold start works but does not SCALE.
            (invite) the account panel is T-073. NO LONGER BLOCKED — T-072 built the
                   backend on 24 Aug, and PersonSummary.account now carries the state the
                   row action needs. It was in T-050's one-line description; it is next.
          !! THE SIDEBAR COUNT IS AN ASSERTION. Sidebar.test.tsx expects exactly 4 "Soon"
          items now (was 5). If it goes UP something regressed; if it goes DOWN, check the
          page behind it is real BEFORE changing the number. A new test also asserts
          People DOES navigate — nothing checked that half before.

          THREE M0 ITEMS STILL LEFT AND THEY OUTRANK ALL OF STAGE 7. D-005 (vendor the two woff2 files — YOURS, and the highest
          visual return of anything remaining), T-043 (OPEN-002 — yours, below) and
          T-045 (three rehearsals + the 390px checks + a QR scan on two phones).
          No screen work is left, and since T-046 that claim is actually true: nothing
          in the console navigates to <Placeholder> any more.
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
          !! THE FIRST WALKTHROUGH FOUND THREE THINGS, 21 Aug. TWO ARE FIXED.
            D-009  FIXED (T-047). The CSRF cookie had no lifetime beside a 7-day
                   session, so reopening the browser left you signed in with no token
                   and every mutation failing forever with "Reload and try again" —
                   advice that could not work, because only login issued the cookie.
                   It now matches the session's lifetime AND csrfProtection re-issues
                   it on any safe method, so the boot GET /auth/me heals it. If you
                   pair a readable cookie with an httpOnly one anywhere else, read
                   N-050 first: they must expire together.
            D-010  FIXED (T-046), and it was not what it looked like. Settings was NOT
                   post-M0 — the cut-list keeps its Words card and <VocabularyChips>
                   links #words from EVERY console page — so the most-linked
                   destination in the console was a stub. Built it. Roles and People
                   are Soon-disabled; the TopBar's "My account", the structure panel's
                   person links and the subjects linked-person column are text or gone
                   until 34/47 exist. FOLLOW THE LINKS INTO A PAGE BEFORE YOU CALL IT
                   POST-M0 — a cut-list entry in design_specs decided this one.
            D-005  STILL OPEN, AND NOW THE LARGEST THING LEFT. The fonts. Caprasimo is
                   on every heading, KPI and button label per design_specs 01 §5, and
                   public/fonts/ is empty — so the product renders in system-ui. This
                   is why it reads as generic. It is two files.
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
          !! OPEN-002: DEFERRED, NOT ANSWERED (21 Aug). Local URLs for now, no tunnel.
          That is fine for building and for clicking through. It is NOT fine for the
          demo: a QR encoding localhost resolves to the PHONE, so the scan beat cannot
          work until PUBLIC_BASE_URL points somewhere the room can reach. The share
          sheet says so on screen, so it cannot fail silently. Still due before T-045.
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
[x] T-046  B  settings — the Words card             ← D-010. Was an M0 route behind a stub
[x] T-047  A  CSRF cookie lifetime + self-heal      ← D-009. N-050
[x] T-048  A  a separate test database              ← D-004. N-053
[x] T-049  A  register retries a slug collision     ← D-006. Found N-055 on the way
```

### Stage E — THE FIRST EVALUATION. Top priority, above everything below it
Opened 23 Aug when the graded criteria for evaluation 1 arrived. **These outrank Stage 6 and
they outrank most of Stage 5.** The criteria are: a complete working application · five
mandatory middleware types — **logging, error handling, file upload, security,
router-level** · and **logs and error information written to files at regular intervals**.

**All six are now done.** Three were already strong on 23 Aug morning (logging, error
handling, security); file upload did not exist in any form and nothing was written to a file.
Both were built the same day, along with the router-level pass.
```
[x] T-061  A  MULTIPART + FILE UPLOAD. middleware/upload.ts, lib/imageBytes.ts,
              lib/storage.ts, features/files/**. 4 routes + serving. 15 tests. DEC-036
[x] T-062  B  <FileUpload> + apiUpload() + logo in Settings + /app/profile (partial, 47)
[x] T-063  A  LOG + ERROR FILES. lib/logFile.ts, pino.multistream, rotation, retention
[x] T-064  A  router-level pass. middleware/chains.ts — 4 chains, 12 routers. D-017 repaid
[x] T-065  A  CSV size: ONE number, CSV_MAX_CHARS, BELOW the parser's. D-016 repaid
```
**Doc work for Stage E and Stage 6 is DONE as of 23 Aug** — `18` written from placeholder,
`19` new, `49` new, `70` and `71` new, `48` re-tagged P1, and the three catalogues (`11` §3,
`13`, `24`) amended first as the ground rule requires. Every `T-0xx` above now has a spec to
build from. `audit:drift` clean at 57 docs.

| Criterion | Status |
|---|---|
| Complete web application | **Yes, with two known holes**, both already on the board and neither new: five console routes render `<Placeholder>` (`T-050`–`T-054`), and a cold start cannot add a person (`T-050`). Seeded, the whole path runs |
| Middleware — **logging** | **Done.** `middleware/requestLogger.ts`, structured pino, hand-rolled rather than `pino-http` so a request body can never reach a log, with `cookie`, `authorization`, `password`, `passwordHash` on a redact list behind it |
| Middleware — **error handling** | **Done.** `middleware/errorFunnel.ts` is a true single exit: four-arg Express error handler, registered last, no handler anywhere calls `res.status(500)`, no stack crosses the boundary, `headersSent` handled. Plus `notFound` ahead of it |
| Middleware — **file upload** | **DONE 23 Aug (`T-061`).** `middleware/upload.ts` — a hand-written multipart parser, images only: boundary parse, size counted **as the bytes arrive** (unpipe and drain, so a 413 still gets back), magic-byte sniff, header dimension cap, metadata stripped (`lib/imageBytes.ts`, DEC-036), tenant-partitioned disk store. Four upload routes plus `GET /files/:id`. 15 tests |
| Middleware — **security** | **Done.** helmet, two CORS policies that never both apply to one request, `csrfProtection`, global + scoped rate limits, argon2id, session regeneration on login |
| Middleware — **router-level** | **DONE 23 Aug (`T-064`).** `middleware/chains.ts` — links 6–8 composed into **four different chains** and applied with `router.use()`: `tenantChain` (10 console routers, tenant required + CSRF), `authChain` (tenant optional, the only router honouring `X-Org-Slug`), `respondentChain` (own CORS, no CSRF), `assetChain` (nothing but CORS). The differences are the point; if they were all the same it would belong in `app.ts`. 10 tests |
| Logs + errors **written to files** | **DONE 23 Aug (`T-063`).** `pino.multistream` over stdout + `logs/app-<date>.log` + `logs/error-<date>.log`. Daily **and** 10 MB rotation, 14-day retention by the date in the filename, synchronous writes so the last line before a crash survives, and a logging failure **fails off to stdout rather than taking the app down**. 9 tests |

**All six rows are finished as of 23 Aug**, and nothing had to be unpicked — `T-061` was
additive, `T-063` was a destination and a rotation policy, `T-064` was a refactor toward what
`12` §2 already claimed. `12` §2 now also carries a table naming which **kind** of Express
middleware each box is (application-level, router-level, per-route, error-handling, built-in,
third-party), which is the thing the criterion is actually asking to see.

### Stage 6 — P2 build-out, the platform surface, and the cold-start flow
Opened 23 Aug from a four-item survey. Nothing here is M0: **do not start any of it before
`T-043` and `T-045`.** Stage 6 is what P2 is, written down.
```
[~] T-050  B  people — list, create, assignments (34)   ← THE E2E HOLE, CLOSED.
              CSV import wizard and the invite/account panel are NOT built (see Debt)
[ ] T-051  B  person detail + my account (34, 47)
[ ] T-052  B  roles + the powers grid (33)                     ← repays D-008
[ ] T-053  A  POST /authz/simulate — the route does not exist  ← blocks T-054
[ ] T-054  C  permission simulator page (42)                   ← needs T-053
[ ] T-055  A  RLS policies                                     ← repays D-001 + D-003
[x] T-056  X  DECIDE: what an Endur operator IS (OPEN-007)     ← DEC-033. Doc 19 written
[ ] T-057  A  billing read surface + seat metering (16 §5, §8) ← repays D-012, D-013
[ ] T-058  B  plan + billing page, JOIN buttons, over-limit banner (49)  ← DEC-035
[ ] T-059  A  platform backend — platform_users, requirePlatform, seam (19)  ← needs T-057
[ ] T-066  B  /ops console — estate, plan override, messaging (70)   ← needs T-059
[ ] T-067  B  /ops/analytics — tier mix, movement, trials, quiet (71) ← needs T-059
[x] T-068  X  DROPPED 23 Aug — DEC-035. No pricing, no plan_prices table at all
[ ] T-060  X  cold-start end-to-end pass                       ← needs T-050. NOT T-045
```

### Stage 7 — the four asks · SPECIFIED 23 Aug, NOT BUILT
Four owner instructions in one message. **The documentation is done; none of it is code.**
Full table with `needs` and specs in `55` § Stage 7. Nothing here is M0.
```
[x] T-069  A  campaigns.access + campaign_participants + requireMembership (38, DEC-037)
              ← THE GATE IS LIVE. Found and repaid D-022 on the way (DEC-045)
[x] T-070  C  the access toggle, ShareSheet access line, 2 new respondent dead-ends (39)
              ← THE FOURTH ASK IS COMPLETE, END TO END. <AccessNotice> is 3 sentences and
                ONE DELIBERATE SILENCE, not the 4 that 24 §7 said. Found D-023
[x] T-071  A  requireNoEscalation — INV-012.  ← D-018 REPAID. Also covers /people/import
[x] T-072  A  account_invites + 3 routes + /auth/activate (57, DEC-038)   ← needs T-071
              ← AN ORGANISATION CAN MAKE ITS OWN ACCOUNTS. Found and repaid TWO live
                holes on the way: D-024 (a fake revoke) and D-026 (a person you created
                was INVISIBLE to you). DEC-046, DEC-047. Verified against the running API
[ ] T-073  B  Invite action, account panel, <InviteLink>, /activate page  ← needs T-050
[x] T-074  A  audit_log.ip NULL for non-user principals  ← D-019 REPAID
              ← RE-KEYED THE SAME DAY BY DEC-045: the rule is on the ACTION, not the
                principal, because DEC-037 made a respondent a `user` principal
[ ] T-075  A  GET /audit — filters, cursor, outcome, denial rows (56, DEC-041)
[ ] T-076  B  /app/logs + <DecisionTrace>   ← T-054 needs the SAME component. Extend it
[ ] T-077  A  platform.logs.read + the file routes + path guard (72)     ← needs T-059
[ ] T-078  B  /ops/logs + <LogViewer>                                    ← needs T-077
[ ] T-079  A  inbox_state + 5 routes, read THROUGH results/service.ts (58)
[ ] T-080  C  /app/inbox + <ResponseCard> + <ScoreBadge>  ← ScoreBadge has NEVER been built
[ ] T-081  A  analysis backend, RULE-BASED (43, DEC-042)
[ ] T-082  C  /app/analysis                              ← needs T-057 for a real 402
[ ] T-083  A  improve-loop backend (44)                  ← needs T-057. NOT NEGOTIABLE
[ ] T-084  B  /app/reflect                               ← needs T-083
[ ] T-085  B  un-disable the sidebar, one item per page as it lands

Stage 8 — WHAT EACH TIER SEES.  Owner ask, 24 Aug.  DOCS ONLY so far (55 § Stage 8).
[ ] T-086  A  scope-aware MeResponse.capabilities + subject.read for L4 (13, 50 §1)
[ ] T-087  B  per-tier sidebar — People/Settings stop showing to self-only accounts
              ← BLOCKED ON OPEN-009: the L3 × People cell is the owner's to decide
[ ] T-088  B  THE TIER PICKER AT SIGN-UP (DEC-048)   ← asked for by name, 24 Aug
              ← bronze/silver/gold, pressed = assigned, register writes the row.
                REPAYS D-012, so it unblocks T-082 AND T-083. Needs none of T-057:
                billing/entitlements.ts and requireEntitlement already exist and are
                correct — the row has simply never been written by anything
```

### Why is that item still greyed? — one row per "Soon"

Asked by the owner 24 Aug. **Nothing is on the chopping block; everything below has an id and
a spec.** The table exists because the board could not answer the question at a glance, which
is a fault of the board rather than of the plan.

| Sidebar item | Lands with | Blocked by | Status |
|---|---|---|---|
| **Roles** | `T-052` | nothing — sequenced after M0 | spec is `33`, complete since round 1. Repays `D-008` |
| **Inbox** | `T-079` → `T-080` | nothing — sequenced after M0 | spec is `58`. Reads **through** `features/results/service.ts` so the k-anonymity gate is not forked |
| **Analysis** | `T-081` → `T-082` | **`T-088`** (was `T-057`) | `T-081` (rule-based engine, `DEC-042`) is unblocked. `T-082`'s screen needs a real `402` path — the 402-vs-403 demonstration *is* the point of it |
| **Reflect** | `T-083` → `T-084` | **`T-088`, hard** (was `T-057`) | every capability in the improve loop is Gold, and `D-012` means no organisation has ever had a subscription row. Built today, this surface `402`s for **every user in the product**, demo included |

**So the tiers are not a separate missing thing — they are the blocker for half the list.**
That gate was filed as `T-057`, a large Stage-6 API task, which made it look far away. It is
not: the only part those two pages need is **a subscription row that exists**, and `DEC-048`
carved that out as `T-088`. The seat meter, the usage breakdown and the billing page can stay
where they are.

### The revenue question, precisely

**Clarified by the owner 24 Aug**, and it is narrower and much smaller than the section below
first read it as: *"when you login — pick between option. rn, no pricing, just pick the option
(bronze, silver and gold) and you get assigned that. its basically revenue tiers but no actual
pricing for now."* That is `DEC-048` and `T-088`: **one step at sign-up, three buttons, the one
you press is the one you are on.** It needs none of the billing page, the seat meter or the
usage breakdown.

**There are no prices because the owner removed them** — `DEC-035`, 23 Aug: *"leave out
pricing cause this aint an actual product anyway, just add a button to join and directly make
them join that tier."* No amounts, no currency, no checkout, no processor, no `plan_prices`
table, and `71` was renamed off revenue onto growth counts. That is settled and is not what is
missing.

**What is missing is the tier machinery itself**, which `DEC-035` explicitly kept:

| Survives `DEC-035` | Built? |
|---|---|
| the entitlement gate (`16` §3) and `requireEntitlement`'s `402` | **yes** — middleware exists and is correct |
| `subscriptions.tier`, `GET /billing`, `/billing/usage`, `/billing/plans`, `POST /billing/tier` | **no** — `T-057`. `billing.read`/`billing.update` have been in the catalogue since `T-003`; the routes have never existed |
| the seat meter and `billable_seats` (`16` §5) | **no** — `T-057` |
| the 14-day Gold trial (`16` §7) | **no, and worse** — `D-012`: nothing writes a `Subscription` row, so `requireEntitlement` falls back to Bronze and **every organisation in the product, including all four demo orgs, is silently Bronze**. The trial in `16` §7 has never once happened |
| `<PlanPicker>` with a **Join** button per tier, `<OverLimitBanner>` | **no** — `T-058` |

`D-012` was the one to read first, **and `DEC-048` has now answered it.** The middleware is
right and was being handed a tier nobody ever set; three documents gave three answers (`16` §7:
new orgs start `trialing` on Gold · `requireEntitlement`'s own comment: Bronze is *"the trial
default"* · the code: nothing writes either). There is now one answer — **the row is written at
registration with the tier the person chose, `status: 'active'`, and there is no trial.**

`DEC-048` also retires the trial on the sign-up path, and `DEC-035` is what retired it rather
than this decision: both arguments for it in `16` §7 and `49` are arguments about **price**,
and price was removed the day before. A 14-day free trial of Gold, when Gold is one free click,
is a countdown to nothing — and expiring it would need a scheduler that `OPEN-005` says nothing
in this product owns. `16` §7 is annotated, not deleted; whether `trialing` survives anywhere
else is left open.

**More of this exists than the table above suggests.** `src/backend/billing/entitlements.ts`
already has `TIERS`, `TIER_ENTITLEMENTS` and `tierIncludes()`, and `requireEntitlement` is
mounted and correct. The missing piece is one row. That is why `T-088` is carved out of
`T-057`/`T-058` instead of waiting behind them — it is the smallest change on the board that
un-greys two pages.

**Progress: 50 / 80 done (T-027 partial). Stages 0-4 complete but for the font files.
Stage 5 is what stands between here and the graded demo: one decision (`T-043`), the fonts
(`D-005`), `D-007`, `D-011`, and three rehearsals. The demo runs end to end: scan, fill,
submit, and the results count moves.**

**Stage 6 exists because a survey on 23 Aug asked four questions and got four different
kinds of answer.** They are worth keeping distinct, because only one of them is a hole:

| Asked | Found |
|---|---|
| Missing middleware, logging etc. | **Nothing missing.** All 16 links of `12` §2 are wired in `app.ts` in the documented order, `requestLogger` is structured pino with a redact list and never touches a body, and both rate limiters, CSRF, idempotency and the audit writer are live. The only genuine gap at this layer is `D-001` — RLS, layer 2 — which was already debt. `T-055` |
| Do all pages work | **Five console routes still render `<Placeholder>`** — roles, people, person detail, simulator, my account. All five are P2, all five are sidebar-disabled or unlinked so nobody walks into one, and all five have their backend already built and tested — except the simulator, whose route was never mounted. `T-050`–`T-054` |
| Endur admin, operator stats, revenue model | **The largest of the four, and the only one that needs architecture before code.** See `OPEN-007`, `D-012`, `D-013`. `T-056`–`T-059` |
| Does the end-to-end flow work | **Not from cold.** Seeded, yes — that is what `T-045` rehearses. From `/start` with an empty org it breaks at *add people*: the API has full people CRUD and CSV import, the UI has read-only search. `T-050`, then `T-060` |

---

## Decisions needed from the team

Blocking or dated. Move to `_MEMORY.md` as a `DEC-` entry once resolved, and tick it here.

| Ref | Question | Needed by | Blocks |
|---|---|---|---|
| `OPEN-002` | What public URL does the QR encode? `localhost` will not scan from a phone. **Deferred 21 Aug — local for now, by decision.** That unblocks development and unblocks nothing else: the scan-to-respond beat still cannot run until this is answered, so it is deferred rather than resolved | **before `T-045`** | T-038, T-043 |
| ~~`OPEN-008`~~ | **RESOLVED 23 Aug — `DEC-036`.** File upload **strips metadata, it does not re-encode.** `lib/imageBytes.ts` sniffs the real format from magic bytes, reads dimensions from the header, and removes JPEG APP1/APP13/COM, PNG `eXIf`/`tEXt`/`zTXt`/`iTXt`/`tIME`, and WebP `EXIF`/`XMP ` chunks with the VP8X flag bits that advertise them — without decoding anything, and therefore **without an image library nobody approved**. The privacy property `48` wanted re-encoding for survives: GPS, device ids and author names do not reach disk, asserted by a test that uploads a GPS-tagged JPEG and greps the stored bytes. What is not bought is polyglot neutralisation, and that risk is written into `48` and `DEC-036` rather than left quiet — stored bytes are only ever *served*, with a sniffed `Content-Type`, `nosniff` and `inline`, and respondent uploads stay out of scope, which is where a hostile file would come from. **If an image library is ever approved, `stripMetadata()` is the one function to replace** | ~~before `T-061`~~ — **done** | ~~T-061~~, ~~T-062~~ |
| `OPEN-001` | Phase-3 Redux shape (`23` §4). Recommendation on file: RTK Query + hand-written slices | 15 Oct | nothing before P3 |
| ~~`OPEN-003`~~ | **RESOLVED 23 Aug — `DEC-042`. Rule-based, no LLM in P1–P3.** Forced early by `CONF-019`: the owner asked for the Analysis page to be completed and it could not be built while its engine was undecided. **The decider was privacy, not cost** — `52` promises respondents anonymity, and shipping their free-text comments to a third party is a disclosure that must be *surfaced* to the customer, and there is no consent mechanism in the product to surface it with. Building one to enable a feature nobody asked for in those terms is the wrong order. Three secondary reasons, each sufficient alone: an API key is a dependency the owner has reserved before (`DEC-036` is the same shape); non-determinism makes `43`'s acceptance list untestable; and a lexicon is *honest about being weak*, which § Reliability already made this page's differentiator. LLM stays available as a per-org opt-in behind one interface — the seam `stripMetadata()` occupies in `48`. `REVISIT:2026-11-01` stands but blocks nothing | ~~1 Nov~~ — **done** | ~~T-081~~ |
| `OPEN-004` | Third member's lane assignment (`02` §6) | — | scheduling only |
| ~~`OPEN-007`~~ | **RESOLVED 23 Aug — `DEC-033`, and `19-PLATFORM-OPERATORS.md` is written.** A separate principal kind, two fixed roles, a separate account table, login, cookie, capability catalogue and db seam, with `INV-011` over all of it. Original question, kept because the reasoning is the answer: There is no platform-level actor anywhere in the architecture — not a capability, not a principal kind, not a row. `GrantScope` stops at `all`, which means *this whole organisation*; `db/tenant.ts` stamps `orgId` on every query by construction and lint forbids importing the raw client outside that seam; INV-010 forbids taking an org from anywhere but `tenantResolver`. So an Endur-side admin is **not a big grant** — every mechanism the product has for saying "may do more" is org-shaped, and a cross-tenant operator is the one thing they were built to make impossible. It needs its own principal kind, its own seam past the tenant client, and its own audit story, and that is a `19-PLATFORM-OPERATORS.md` plus a `DEC-`, not a handler. **Nothing about the revenue model can be built correctly before this is answered**, because "who may set a tier" is the same question — and it was the same question: answering it produced `DEC-034`, which found that `billing.update` as specified in `16` §8 would have let an org administrator set their own tier | ~~before `T-057`~~ — **done** | ~~T-056~~, T-057, T-059 |

**Also non-blocking but time-sensitive:** mention to the React teacher that the project is
already a SPA (`54` §1). A courtesy, not a risk — see `DEC-013`.

---

## Debt

Shortcuts taken deliberately, to be repaid. Empty is good.

| id | What | Why | Repay by |
|---|---|---|---|
| `D-001` | RLS policies not written (`10` §8 layer 2) | **Raised in severity by T-006.** Layer 1 cannot scope `findUnique`/`update`/`delete` by-id calls; RLS is what actually closes that. Until then, by-id handlers must check `orgId` themselves | before P1 closes |
| `D-003` | Every by-id read checks `orgId` by hand | Stage 2 repeats that check in eleven services (`assertVisible`, `assertOwned`, `assertUnitInOrg`). Each one is correct; one forgotten call is a cross-tenant read. RLS (`D-001`) is what makes it structural rather than remembered | with `D-001` |
| ~~`D-004`~~ | **REPAID 21 Aug by `T-048`.** `vitest.config.ts` gained a `globalSetup` (create `endur_test` if absent, then `prisma migrate deploy`) and a `setupFiles` that points each worker's `DATABASE_URL` at it **before `lib/config.ts` reads `.env`** — which works because `process.loadEnvFile()` does not overwrite an already-set variable. `TEST_DATABASE_URL` is optional; absent, it derives by appending `_test`. Two guards in `test/database.ts` refuse to run rather than trust the config: the name must end in `_test`, and it must not be the `DATABASE_URL` written in `.env`. `test/test-database.test.ts` asserts both by their failure. **The leak is closed; the puddle is not mopped** — `endur` still holds 2,880 organisations, and `npm run db:reset` is yours to run because it also drops anything you made by hand | ~~before `T-045`~~ — **done** |
| ~~`D-006`~~ | **REPAID 21 Aug by `T-049`.** A P2002 on `slug` is now caught and retried with the next slug, up to five attempts, so nobody gets an error page for choosing a name somebody else chose a millisecond earlier. `uniqueSlug()` still cannot move inside the transaction — it reads committed rows, and a transaction cannot see what it is racing. **The retry uses a random suffix, not the next number:** re-running the sequential scan makes every contender pick the same next value, so one collision becomes a queue as deep as the field, and the first version still 500ed one of six. The uncontended path still scans, so registering "Acme" next week when `acme` exists still gets the readable `acme-2`. `register-rollback.test.ts` inverted with it — all six contenders now succeed on six distinct slugs, which is also what proves the retry ran | ~~before `T-045`~~ — **done** |
| `D-007` | `CONF-013` is **mitigated, not resolved** | Login filters `passwordHash: not null` and orders by `createdAt`, which closes the cross-tenant lockout. It does not answer whether an email address is global or per-tenant, and two *activated* accounts on one address are still ambiguous. Three options are written out in `CONF-013`; pick one and supersede it | **24 Aug** |
| ~~`D-009`~~ | **REPAID 21 Aug by `T-047`.** The CSRF cookie now carries `SESSION_TTL_DAYS`, matching the session cookie, and `csrfProtection` re-issues it on any safe method for a cookie principal — so the boot `GET /auth/me` heals a browser that came back without one, and *"reload and try again"* is true for the first time. An existing token is re-set rather than rotated, so the expiry slides with the rolling session without killing a mutation already in flight. Two regression tests in `org.test.ts` (the cookie has a `Max-Age`; a reload with only the session cookie gets a working token back) and verified live with curl | ~~before `T-045`~~ — **done** |
| ~~`D-010`~~ | **REPAID 21 Aug by `T-046`.** Settings turned out not to be post-M0 at all — `41` § Route & access has `<VocabularyChips>` linking `#words` from every console page and `design_specs/design/11` §1 keeps the Words card — so it was **built**, not disabled. Roles and People are now `Soon`-disabled like the P3 items. The other three link sites went with them: the TopBar's *My account*, the structure panel's person links, and the subjects table's linked-person column are text or gone until `34`/`47` exist. Nothing in the console now navigates to `<Placeholder>` | ~~before `T-045`~~ — **done** |
| `D-011` | **Two genuinely concurrent submits can both run the handler** | Found 21 Aug while checking `T-049` for flakiness (`N-055`). The `Idempotency-Key` row is now committed before the response is sent, which closes the window for any retry that follows a delivered response. The real flaky-network case is narrower and still open: the client never got the first response, both requests arrive together, both miss the read. The unique index still allows only one key row, so the replay stays correct — but both handlers ran, and on respondent submit that means two responses. Closing it means RESERVING the key before the handler instead of writing it after, which introduces an in-flight case that has to answer something (409, or wait-and-replay). Not a thing to invent five days from a graded demo | after M0, or before `T-045` if a rehearsal ever shows a duplicate |
| `D-008` | The capability catalogue's power labels are English | `roles/service.ts` `describe()` turns `campaign.launch` into *"launch campaigns"* — a domain noun, for `33`'s powers grid. Found by the T-044 audit and deliberately not fixed: the grid is not built, and the object → label mapping for `role`, `person`, `template` and `org` — none of which HAS a label — is `33`'s design work, not something to invent from outside it. `audit:vocab` does not scan it, because the string is assembled from a capability key rather than written | with `T-033` |
| ~~`D-018`~~ | **REPAID 23 Aug by `T-071`.** ~~Anyone holding `assignment.create` can make themselves an owner~~ | Found 23 Aug while writing `57`, and it was a **live hole in shipped code**, not a spec gap. `features/people/service.ts` `addAssignment()` checks `assignment.create` on the target unit and **nothing else**. So a departmental coordinator — whose job genuinely is to put people into positions, and who would legitimately be granted exactly that one capability — can assign the **Owner** role at the root unit to a colleague, or to a second account of their own, and hold the organisation an hour later. **Every check passes.** There is no bug to point at: the resolver worked exactly as specified, because nobody had ever specified that creating an actor is different from acting. It is the same shape as the `billing.update` hole `DEC-034` found — a capability safe to *hold* becomes unsafe to *hand out* the moment a route hands things out, and `57` is that route. Fixed by `INV-012` + `requireNoEscalation` (`11` §5b, `12` §4.10b), which is **middleware and not a service check** because INV-003 says authorisation is decided in middleware and *"may you hand this power out"* is an authorisation decision. **Closed by `authz/escalation.ts` + `middleware/requireNoEscalation.ts`**, mounted on `POST /people/:id/assignments` **and `POST /people/import`** — because building it turned up that **the CSV import creates positions too**, behind `person.import` alone, so a guard on the first route only would have been *worse than none*: the board would have said the hole was repaid while it stayed bypassable in one call by naming a senior role in a one-row CSV. Both routes share one resolution of *"which role does this row mean"* (`features/people/positions.ts`); two copies drift into a row the guard did not check and the handler did create. 8 tests, and **removing the guard fails 5 of them while the 3 "does not over-refuse" tests still pass** | ~~`T-071`~~ — **done** |
| ~~`D-019`~~ | **REPAID 23 Aug by `T-074`.** ~~The audit log records the respondent's IP address~~ | Found 23 Aug while writing `56`. `db/tx.ts` `flushAudit()` writes `ip: req.ip ?? null` for **every principal alike**, and `features/public/service.ts` correctly pushes an audit row on every submission (INV-007 covers every state change). `responses.submitted_at` is written in the same transaction. So sorting `audit_log` and `responses` by time and zipping them yields **IP addresses against answers** — INV-006 defeated through a table it never mentions, built out of two tables that each keep the promise on their own. **It is dormant only because nothing has ever read `audit_log`**, which is exactly why it survived four security passes; `/app/logs` is the reader that would make it live. Fixed at the **writer** (`ip` only for `principal.kind === 'user'`), not filtered at the reader — a reader fix protects one screen, a writer fix protects every screen anybody builds later. `AuditEntry` additionally has no `ip` field at all. **Fixed:** one line in `db/tx.ts`, and reverting it fails the test with `expected '::ffff:127.0.0.1' to be null` — the leak, printed in the test output. The inverted test (a staff mutation *does* write `ip`) still passes with the fix reverted, which is what stops *"never write `ip`"* from satisfying the pair. `DEC-040` | ~~`T-074`~~ — **done** |
| ~~`D-020`~~ | **REPAID 23 Aug by `DEC-044`.** ~~A per-person deny at a unit scope does nothing~~ | Found 23 Aug while writing `T-071`'s deny-corollary test, which used `denyPerson(…, 'subtree')` and got a `201`. `11` §4 says a grant on a **person** node anchors at *"the person's primary position's unit; absent ⇒ `self` only"*. `authz/collect.ts` does not do that — it registers the person node with no `unitId` at all. `scopeCovers()` then correctly refuses an unanchored grant a unit scope (*"no anchor means no claim"*), so the deny is **silently inert**. INV-004 says a deny beats an allow unconditionally; a deny that never applies never beats anything. The same is true of a per-person **allow** at a unit scope, which simply never grants — so `33`'s per-person override row is, today, a control that writes a row and changes nothing unless it is `self` or `all`. **Every existing test of `denyPerson` uses scope `all`**, which needs no anchor, which is why four audits missed it. The direction was a real question — anchor at the primary position (`11` §4 as written), or narrow `11` §4 to say a person grant must be `self` or `all`. **Fixed the code, not the doc**, and the deciding fact was *measured, not argued*: every grant in the database — 1,545 rows across four demo orgs — is on a **role** node, so there was nothing to move. `DEC-044` adds one clause `11` §4 lacked: a **lone unflagged position counts as home**, because `isPrimary` defaults to `false` and a strict primary-only rule would have left the commonest shape in the product still inert. Two unflagged positions gets **no** anchor — `isPrimary` exists to resolve that ambiguity, and guessing would make the resolver non-deterministic. 7 tests; reverting the anchor fails 6 while the two correctly-inert cases still pass. **It also dragged out a pre-existing bug in `held.ts`** — see the note above | ~~after M0~~ — **done** |
| ~~`D-022`~~ | **REPAID 23 Aug by `DEC-045`, in the same task that would have widened it.** ~~A signed-in staff member answering a form writes their user id onto the submission's audit row~~ | Found 23 Aug while building `T-069`. `DEC-040` had just narrowed `flushAudit()` to write `ip` only for a `user` principal — correct for exactly as long as a respondent could never **be** one. But `respondentChain` has always run `authenticateOptional`, so a staff member answering a **public** link from their own signed-in browser was already a `user` principal, and `audit_log` recorded **their id and their address** on the `response.submit` row — with `responses.submitted_at` written in the same transaction. Zip the two by time and the answers have **names** against them, which is strictly worse than the IP leak `D-019` closed three hours earlier. `DEC-037` turns that from an accident (the demo presenter scanning their own QR) into **the designed path**: an `organization` campaign is *only ever* answered by a signed-in member. Fixed by re-keying the rule on **the action** rather than the principal — `ANONYMOUS_ACTIONS` in `db/tx.ts` — because the principal was never the thing that mattered, and a third patch on principal kind would break the next time a respondent became something else. A list at the writer, not a flag at the call site: a flag is a thing the next handler forgets. **Measured before building: every `response.submit` row in the dev database has `actor_user_id` NULL**, because nobody has ever answered a form while signed in — so zero rows to repair. Reverting it fails with the member's uuid where null was expected | ~~`T-069`~~ — **done** |
| ~~`D-024`~~ | **REPAID 24 Aug by `DEC-046`.** ~~`PATCH /people/:id` was a second, worse way to disable an account~~ | Found 24 Aug while building `T-072`, deciding what `AccountStatus.disabled` could honestly report. `UpdatePersonBody` had accepted `status: 'active' \| 'invited' \| 'disabled'` since `T-033`, behind **`person.update`** — seeded to L2 `subtree` — where `57` puts revocation behind **`account.revoke`**, L1 only, *precisely* so it can be withheld from a coordinator while the other two verbs are granted. And it did two thirds of the job: it left `sessions` untouched, and **`authenticate` never reads `users.status`**, so the target's open browser kept working until the session expired on its own — the administrator saw *"disabled"* and believed access had ended. It also left `password_hash` in place, so flipping the status back restored their **old password**, the thing `57` says cannot exist. Fixed by **removing the field**, not by teaching `PATCH` to do the other two things: an account's lifecycle belongs to `account.*`, and two routes that both end access is two places for the next one to be forgotten. Deliberately did **not** make `authenticate` re-read `users.status` per request — real defence in depth, but a query on every request in the product to close a window that now has no opener. **The hole had no user and no test**: the frontend has never sent `status` | ~~`T-072`~~ — **done** |
| ~~`D-026`~~ | **REPAID 24 Aug by `DEC-047`.** ~~A person you had just created was invisible to you~~ | Found 24 Aug when `T-072`'s first test run failed on every case involving a person with no positions — and `57` says explicitly that *"a person with no positions can always be given an account… invite first, assign afterwards"* is **the common one**. `POST /people` creates a person and **no position** (`14` §8 requires that), so the person it returned had no unit, matched no unit-scoped caller, and vanished. **Verified end to end before the fix**, on a brand-new organisation, as its founder: `POST /people` → `201` with an id; `GET /people` → total 2 and the new person is not in it; `GET /people/:id` → `404`. The founder holds `person.read: subtree` at the root, **not `all`**, which is the ordinary shape — so this was every organisation, on the most common action in `34`, and every route that could give them a position had first to see them. **A deadlock, not a policy.** It had no test because the create test never read the person back. Fixed by adding one clause — **no member edges at all** — to a predicate that is now written **once** in `features/people/visibility.ts` and evaluated by the database for both the list and the detail route; the two used to be hand-written copies and had already drifted in wording. The asymmetry with `11` §4 is deliberate and is written down: for a **grant**, no anchor means no claim; for a **target**, no anchor means nobody's territory | ~~`T-072`~~ — **done** |
| `D-025` | **`$executeRaw` slips past the DEC-007 lint rule** | Noticed 24 Aug while writing `revokeAccount()`. `DEC-007` confines raw SQL to `db/graph.ts`, and `eslint.config.js`'s selector matches **`$queryRaw`/`$queryRawUnsafe` only** — `$executeRaw` is raw SQL and is not checked. The one call that uses it today is legitimate and unavoidable: revocation deletes the target's rows from `sessions`, which is connect-pg-simple's table and **deliberately not a Prisma model** (`10` §5), so there is no ORM path to it at all. But it passes because of a **gap in the rule, not an exemption**, and that is worth writing down rather than quietly relying on. The fix is one selector plus one `eslint-disable` with a reason — small, and it belongs to whoever next touches `DEC-007` rather than to a feature task | with `DEC-007`'s scheduled revisit (2026-10-01), or sooner if a second `$executeRaw` appears |
| `D-027` | **Every account in the product sees a `People` item that lists only itself** | Raised 24 Aug by the owner (*"lowest tier shouldn't see roles, people and department pages at all, even if they see nothing actually in it"*), and the mechanism turned out to be wider than the tier they asked about. `navItems.ts` gates each item on a bare capability (`needs`), and `authz/held.ts` **deliberately discards scope** — a capability is held when *any* live allow exists. So `person.read: self`, the **universal** grant every role gets (`50` §1, and `11` §10 has a test insisting it is never omitted), satisfies `People`'s gate for **everybody**; the page then renders one row. `org.read: all` does the same for `Settings`, seeded to all four levels so the vocabulary can load on first paint. Of the three pages the owner named, **Structure and Roles are already correctly hidden for L4** — the matrix gives that level neither `unit.read` nor `role.read`. The one they want *shown*, `Subjects`, is hidden, because L4 has no `subject.read` row at all. **Not a security hole and INV-003 is untouched**: `requireCapability` refuses these routes and the list endpoints already scope-filter to nothing — `held.ts`'s own header admits the class (*"a confusing button, not a security hole"*); this is that error landing on a whole page. Fix is `T-086` (carry scope to the client so a gate can say *"`person.read` beyond `self`"*) then `T-087`. **Why it surfaced now:** `50` §1 says the L4 row *"only matters for the rare case of someone at that level who does hold an account"* — `T-072` made that one click, so the case stopped being rare | `T-086`/`T-087`, and `OPEN-009` has to be answered first for the L3 row |
| `D-023` | **`campaigns.anonymous` changes copy and nothing else** | Found 23 Aug while building `<AccessNotice>` (`T-070`), which needed to know what each half of the `anonymous` × `access` pair actually guarantees. **`anonymous` branches nowhere in the backend** — grep it: every occurrence is a `select`, a DTO mapping, or a copy string. That is not itself a bug, because `52` §1 is explicit that the answer is anonymous **"Always. It is INV-006 and it is in the schema"** — `responses` has no respondent column to populate either way, so the flag *cannot* make a response attributable. It means the toggle is a **promise switch, not a behaviour switch**, and two places imply otherwise: the wizard's hint reads *"We never store who submitted what"*, which invites the reader to conclude that turning it off means we do; and an administrator who turns it off gets **exactly the same data** they would have got with it on, having been led to expect more. `copy.ts` reached half of this independently at `T-039` and left the non-anonymous sentence deliberately blank for the same reason. **Never exercised**: all 13 campaigns in the dev database are `anonymous: true`, so the misleading path has no user. The fix is a copy decision plus a line in `38` saying what the flag is for — not code, and not something to invent from outside the doc that owns it | with `T-051`, or whenever `38`'s copy is next revisited |
| `D-021` | **The CSV import wizard has no UI** | `T-050` built the people list, create and assignments; `34` § Interactions also specifies a column mapper, a five-row preview and a "did you mean" dropdown for every unmatched role, and none of it exists. **Both endpoints do** — `POST /people/import/preview` and `POST /people/import`, guarded, idempotent, and INV-012-bounded since `T-071`. The consequence is bounded and worth stating precisely: a cold start now **works** (add a person, give them a position) but does not **scale** — `34`'s own framing is that a 500-person organisation is populated by import, not by typing. Not on the M0 path, and it is a wizard rather than a form: mapper state across two steps, per-row error reporting, and an all-or-nothing commit | with `T-051`, or when somebody has a real CSV |
| `D-005` | The two woff2 faces are not vendored — **and this is why the UI reads as generic** | `tokens.css` declares both; `public/fonts/` holds only a README. `design_specs/design/01` §5 puts **Caprasimo on every `h1`–`h4`, card title, KPI number, button label and badge** and Figtree on everything else — so with the files absent, *every heading and every number in the product is `system-ui`*. The spec is explicit that the personality is concentrated in the type (*"Caprasimo has one weight and a lot of personality… a paragraph set in it instantly cheapens the page"*), and the fonts README says it plainly: *"until the files land… nothing breaks — it just does not look like Endur."* Confirmed as the main cause of the 21 Aug walkthrough's *"too simple, too AI-like"*. `endur.css` (1,451 lines) and the vendored `organic.css` are in place and doing their job; the two files are the missing input | **24 Aug** (`21` §4) — **highest visual return of anything left** |
| `D-012` | **No organisation has ever had a subscription row, so the trial in `16` §7 has never once happened** | Found 23 Aug. `16` §7 says a new org starts `trialing` on **Gold for 14 days**, *"so the improvement loop is seen before it is sold"*. Nothing creates a `Subscription`: not `register`, not `/org/setup`, not the seed. `requireEntitlement` reads `subscription?.tier ?? 'bronze'` — and its own comment above that line calls bronze *"the trial default"*, which is a third answer again. The effect is that **every org in the product, including all four demo orgs, is silently Bronze**, so `analysis.read`, `results.export`, `response.export` and the whole `reflection`/`actionplan`/`checkin` surface return 402 to everyone, forever. The entitlement middleware is correct; it is being handed a tier nobody ever set. Pick one of the three answers, make `register` write the row, and seed one org per tier so the 402 path and the paid path are both demonstrable | with `T-057` |
| `D-013` | **`billable_seats` is specified and not implemented** | `16` §5 defines it — active users, plus non-person subjects, never respondents — and says it is *"recomputed on a schedule and on membership change, cached on `subscriptions.seats`, and shown in settings with a breakdown so a bill is never a surprise"*. `subscriptions.seats` defaults to `0` and is never written by anything. With it absent, `16` §6's over-limit behaviour cannot exist either: there is no count to be over. Neither is M0, and neither should be invented in a hurry — but *"the revenue model is architecture, not a slide"* is `16`'s own opening line, and right now the metering half of it is a slide | with `T-057` |
| `D-014` | `POST /authz/simulate` is in `13` §Trust and is not mounted | `authz/simulate.ts` exists and exports `simulate()`; `roles/router.ts` mounts only `GET /authz/capabilities`. So the resolver's explain path — the thing `42` renders and `_MEMORY.md` N-005 calls the cheapest trust-builder in the product — has no route to reach it. It is a handler and a DTO, not a design problem: the decision it returns is the same `Decision` `requireCapability` already builds | with `T-053` |
| `D-015` | The liveness route is `/healthz`; `13` §Unauthenticated utility says `GET /health` | Cosmetic, one line, and listed only because `13` is meant to be the single authority on paths and this is the one place a reader would be told something untrue. `tenantResolver`'s bypass list, `routes.test.ts`'s allowlist and `chain.test.ts` all say `/healthz`, so the code is self-consistent and the doc is the odd one out — but fix whichever, not neither | with `T-057` |
| ~~`D-016`~~ | ~~**Three different maximum CSV sizes, and the smallest one wins silently**~~ | **REPAID 23 Aug, `T-065`.** One number now: `CSV_MAX_CHARS` (150,000) in `packages/shared`, and it sits **below** the parser's 256 kb on purpose — so anything a person plausibly pastes fails `validate()` with a field error naming the CSV, and the body parser is left as the outer backstop for a body that is malicious rather than merely large. `12` §4.4 rewritten: it claimed a streaming CSV parser with a 5 MB cap that was never written, and now states what is actually true (the import is a string in a JSON body) and names the one real bypass (`48`'s multipart). Asserted by a test that sends an oversized CSV and checks the error is `VALIDATION_FAILED` on `body.csv`, not `PAYLOAD_TOO_LARGE` | done |
| ~~`D-017`~~ | ~~**`12` §2 draws links 6–8 in a `per-router` box; `app.ts` mounts all three with `app.use()`**~~ | **REPAID 23 Aug, `T-064`.** `middleware/chains.ts` composes links 6–8 into four chains, applied with `router.use()` in twelve routers. `tenantResolver` became a factory in the process and **lost both its path-regex exception lists** — "which routes may have no tenant" and "which routes may use the slug header" are now mount-point decisions, which is a much harder thing to get wrong than a regex kept in step with `app.ts` by hand. Side effect worth having: a mistyped `/api/v1/...` now 404s instead of answering 401 | done |

---

## Session log

Newest first. One entry per working session. Keep entries short — what moved, what was
decided, what the next session should know.

### 2026-08-24 (latest) · T-072 — the organisation can make its own accounts

`57` built end to end. `account_invites`, `users.disabled_at`, three capabilities in the
catalogue and in `50` §1's seeded matrix, three console routes, two unauthenticated ones, and
a fifth middleware chain. **312 backend tests (was 284), 698 frontend, typecheck, lint,
`audit:drift` (61 docs / 64 capabilities) and `audit:vocab` all clean.** Nothing committed.

**The rule the whole feature is written around — an administrator never knows a credential
that works.** `34` § Out of scope has said *"invite links only — an admin who sets passwords
can impersonate"* since round one, and `57` says it was re-examined rather than inherited. It
survives: the administrator creates the account, chooses nothing about the password, and hands
over a link. An administrator who can set a dean's password can sign in as the dean, and every
audit row from that session names the dean — the org chart intact and the audit log fiction,
which is `56`'s entire subject destroyed to save one step.

Verified live against the running dev API rather than only against mocks, then the probe org
deleted:

```
create person   201  account { state: 'none' }
  ↳ visible?    list contains them: True   ·   detail 200      ← D-026, live
provision       201  http://localhost:5173/activate/vT2SoS…CW1
  ↳ state now   { state: 'invited', expiresAt: …, invitedAt: … }
  ↳ link in any later payload?  False
inspect (no session)  200  { personName: 'Anita Rao', organizationName: 'Probe Org …' }
activate        200  → GET /auth/me 200 as Anita Rao          ← signed in already
link again      404  "That link is not active. Ask whoever invited you for a new one."
revoke          204  → her session: 401 on the very next request
  ↳ state now   { state: 'disabled', disabledAt: … }  · person still readable 200
```

and the audit rows it wrote:

```
person.create    | actor 17dc11bd | ip ::1  | req 83d6fce0
account.create   | actor 17dc11bd | ip ::1  | req c3c0900b
account.activate | actor null     | ip null | req 694dec15     ← and that is correct
account.revoke   | actor 17dc11bd | ip ::1  | req 15f0f489
```

**`account.activate` carries no actor and no IP, and that is accuracy rather than a gap.** The
request arrived with no principal — it could not have arrived with one, the entire situation
is that this person has no way in yet — and `flushAudit` records what the chain decided, not
what became true afterwards. `target_id` names who activated, and `request_id` joins the row
to the request log, which does hold the address. The activation chain omits
`authenticateOptional` deliberately for the same reason: any session in that browser belongs
to **somebody else**, and attaching them would write a stranger's user id onto another
person's activation — the same shape of mistake `DEC-045` closed on `response.submit`.

#### It found two live holes, and neither was introduced by this task

**`D-024` — `PATCH /people/:id { status: 'disabled' }` was a fake revoke.** Found while
deciding what `AccountStatus.disabled` could honestly report. The field had been on
`UpdatePersonBody` since `T-033`, behind `person.update` (seeded L2 `subtree`) where `57` puts
revocation behind `account.revoke` (L1) *precisely* so it can be withheld from a coordinator.
And it did two thirds of the job: `sessions` untouched, and **`authenticate` never reads
`users.status`**, so the target's browser kept working until the session expired on its own —
the administrator saw *"disabled"* and believed access had ended. It also kept the password
hash, so flipping the status back restored their old password, the thing `57` says cannot
exist. **Removed the field** rather than teaching `PATCH` to do the other two things: two
routes that both end access is two places for the next one to be forgotten. `DEC-046`.

**`D-026` — a person you had just created was invisible to you.** The first test run failed on
every case involving somebody with no positions, which is the case `57` calls *the common
one*. `POST /people` creates a person and no position (`14` §8 requires that), so the person it
returned had no unit, matched no unit-scoped caller, and vanished. Reproduced end to end on a
brand-new organisation, as its founder, before changing anything:

```
POST /people      201, id returned
GET  /people      total 2 · contains the new person: False
GET  /people/:id  404
```

The founder holds `person.read: subtree` at the root, **not `all`** — the ordinary shape. So
this was every organisation, on the most common action in `34`, and every route that could
have given them a position had first to see them. **A deadlock, not a policy.** It had no test
because the create test never read the person back. Fixed by one clause — *no member edges at
all* — in a predicate now written **once** and evaluated by the database for both the list and
the detail route; they were hand-written copies and had already drifted. The asymmetry with
`11` §4 is deliberate and now written down: for a **grant**, no anchor means no claim; for a
**target**, no anchor means nobody's territory. `DEC-047`.

#### Four guards, each proven by reverting it

| Reverted | Failure |
|---|---|
| `requireNoEscalation` off the create route | *refuses to hand a key to somebody who outranks the inviter* |
| `requirePersonVisible` moved **after** the bound | *404s for a person outside the caller's scope* — `WOULD_ESCALATE` becomes an oracle for who outranks you |
| the `sessions` DELETE | *ends a live session on the very next request* |
| the *no member edges* clause | *can still see somebody it just created* |

#### Five places the build could not follow `57` as written

- **`SELECT … FOR UPDATE` → a conditional `UPDATE`.** One statement whose `WHERE` carries
  `accepted_at IS NULL` is the concurrency control: the loser blocks, re-evaluates against the
  committed row, matches nothing. Same guarantee, no raw SQL — and therefore no exception to
  `DEC-007`, which the two-statement version would have needed.
- **Two acceptance lines contradicted each other.** *"one `200` and one `410`"* against *"an
  expired, a used and an unknown token return identical responses"*. A `410` distinguishes
  *"this link was real and somebody used it"* from *"no such link"*, which is a fact about an
  account the asker does not own. The uniform dead end wins, same argument as `CONF-015`.
- **`account.reset` carries the escalation bound too**, which `11` §5b's table named only for
  `account.create`. Re-issuing mints an equally working link for the same account — a bound on
  one and not the other is a bound with a second door. Same shape as `POST /people/import`.
- **Revocation is four things, not three.** An unaccepted invite **is** an issued credential;
  leaving one alive would let the revoked person set a password and walk straight back in.
- **`AccountStatus` had to move to `PersonSummary`, and `disabledAt` had to become nullable.**
  `57` § States puts `Invite` on a list row and `Pending` on another, and `users.status` cannot
  tell those apart. The date needed a new column (`users.disabled_at`) — the only other source
  is the `account.revoke` audit row, which is one audit query per person in a list of two
  hundred to render one line.

Also: the token module lives in `auth/inviteToken.ts`, not in the feature `57` owns.
`tenantResolver` has to hash an activation token to find its organisation, and middleware
importing from a feature is the dependency arrow pointing the wrong way — the alternative was
a second `sha256` in the resolver, whose disagreement would surface as a link that silently
resolves no tenant. Recorded in `_MEMORY` § MAP.

`D-025` recorded and **not** fixed: `eslint.config.js`'s `DEC-007` selector matches `$queryRaw`
only, so the `$executeRaw` that deletes `sessions` rows passes because of a gap in the rule
rather than an exemption. The call itself is unavoidable — `sessions` is deliberately not a
Prisma model — but it should pass for a stated reason, and that is a one-selector change
belonging to whoever next touches `DEC-007`.

**Next:** `T-073` — the UI half. It is no longer blocked, and `PersonSummary.account` already
carries the state the `Invite` row action and the account panel need.

### 2026-08-23 · T-070 — the toggle, and the sentence that could not be written

*"go go"*. `T-069` built the gate; this puts it on screen, which is what makes the fourth ask
something a person can use rather than an API call.

**Built:** step 2's own question — *"Who gets in?"*, under its own heading, deliberately not
folded into *"Who can respond?"* (`38` exists partly to keep those apart: one is a denominator,
the other is a gate). `access` on `<ShareSheet>`, the two respondent dead-ends, and
`<AccessNotice>`. 28 tests.

**The consequence is stated in all three places it matters** — choosing (*"You'll see who
responded, never what they said"*), sharing, and answering. The share-sheet line **replaces**
rather than adds: *"{Respondents} don't need an account"* is a lie about a restricted
campaign, and a warning sitting beside a falsehood is worse than either alone.

**`<AccessNotice>` is three sentences and one deliberate silence, not the four `24` §7 asked
for.** The silent pair is `!anonymous` on an open link. No source gives copy for it, and both
things the page could invent are wrong — a promise it cannot keep, or a warning about a
linkage the schema does not make. `copy.ts` had already reached that conclusion at `T-039` on
the `anonymous` half alone. The silence is now asserted by a test, so *"somebody forgot"* stays
distinguishable from *"somebody decided"*, and `24` §7 was amended rather than left describing
something nobody could honestly build.

**One doc line could not be built as written.** `39` § States drafted the wrong-organisation
screen as *"You're signed in to {your org}"* — which that screen cannot say. The respond world
mounts no store and holds no session concept, and the `403` carries the campaign's name and
nothing else by `13` §5. Filling in that word would put a `/auth/me` call on a dead-end screen
to tell the reader something they already know. Same fact, said from the side the page has;
`39` updated.

**A test caught a copy collision that reading had not.** Both radios on the screen said
*"Anyone with the link"* — the audience one and the new access one. Two identical labels undo
the section break that exists to say these are different questions, and a screen reader hears
the label, not the heading above it. The access option now says *"Open to everyone"*.

**Found `D-023`, and it is a copy problem rather than a bug.** `<AccessNotice>` needed to know
what each half of the pair actually guarantees, which meant checking what `anonymous` does:
**nothing.** It branches nowhere in the backend. That is not itself wrong — `52` §1 says the
answer is anonymous *always*, because `responses` has no column to populate either way — but it
makes the toggle a **promise switch, not a behaviour switch**, and the wizard's hint invites
the opposite reading. Never exercised: all 13 campaigns in the database are `anonymous: true`.

**Verified live:** a restricted campaign on the dev API hands the member
*"Your answers are anonymous. Northfield University will see that you responded, but not what
you said."* and hands a stranger `SIGN_IN_REQUIRED` with the org named and a `next` back to the
form. Probe deleted.

**Next:** Stage 7's remaining lanes — `T-072`/`T-073` (accounts, and `T-071` already built the
guard they need), or `T-075`/`T-076` (the org activity log, whose `T-074` prerequisite is done).

### 2026-08-23 · T-069 — the access gate, and the hole it uncovered

*"lets move to next one"*. `T-069` is the fourth of the four asks: a feedback cycle that is
open to everyone, or open only to people in the organisation. The **server half** is built and
live; the toggle is `T-070` and is not.

**Built:** `campaigns.access` (TEXT + `CHECK`), `campaign_participants` (three columns, no
response reference), the immutability trigger extended to both columns and renamed —
`endur_anonymous_is_immutable` was a lie the moment it guarded two. `CampaignAccess` in the
DTO and on the public payload. `features/public/resolve.ts` (`resolveCampaign`) and
`middleware/requireMembership.ts` (link 10c). 19 tests.

**The order is the security property, and it is enforced rather than documented.** The gate
reads its campaign through `campaignOf()`, which throws if the resolver did not run. Swapping
the two router lines was tried: every request becomes a loud `500`, not a quiet gate deciding
on a campaign it never loaded.

**It found `D-022`, and `DEC-045` closes it.** `T-074` narrowed `flushAudit` this morning to
write `ip` only for a `user` principal. `DEC-037` makes a respondent *be* one — so the audit
row for `response.submit` was about to carry **the member's user id** beside a response
committed in the same transaction. Worse than the IP leak, through a different door, three
hours later. And it was **already reachable**: the respondent chain has always resolved an
optional session, so a staff member answering a *public* link from their own browser — the
demo presenter scanning their own QR — already wrote it. Measured first: every
`response.submit` row in the database had `actor_user_id` NULL, because nobody had ever done
it. The rule is now keyed on **the action** (`ANONYMOUS_ACTIONS` in `db/tx.ts`), because the
principal was never the thing that mattered.

**The lesson worth carrying:** a rule keyed on *who the caller is* has to be re-examined every
time the set of callers changes. This one was patched twice in three hours because the first
fix answered *which principal* when the question was *which action*.

**Also corrected:** `chains.ts` argued the respondent routes need no CSRF because they hold no
ambient authority. They hold some now. `sameSite: 'lax'` is what actually protects the submit
route, and there is a test asserting the flag so the coupling cannot break silently.

**Verified live**, not only in tests: created and launched a restricted campaign on the dev
API, then — stranger `401 SIGN_IN_REQUIRED` naming Northfield University; a Grand Palace
session `403 NOT_A_MEMBER`; the member `200`; submit `201`, second submit `409`; one response
row, one participant row, and an audit row for `response.submit` with **no actor and no ip**
four seconds after the same person's `campaign.launch` row that has both. Probe deleted.

**Noticed while cleaning up:** the two pre-`T-074` `response.submit` rows still carried an IP
— loopback from this morning's own test runs, so no real exposure, and nulled. The general
point stands and is not obvious: **a writer-side fix does not repair what was already
written.** If this pattern recurs on real data, the repair is a migration, not a code change.

**Next:** `T-070` — the toggle, `<AccessNotice>`'s four sentences and the two new respondent
dead-ends. Until it lands, `access` is settable only by an API call, and a restricted form
does not tell the respondent that participation is not anonymous.

### 2026-08-23 · T-050 — /app/people, and the cold-start hole is closed

*"T 50 first"*. The API has had nine people endpoints and CSV import since `T-018`; the
console had two read-only hooks. So an organisation created from `/start` could build a
structure, add subjects and launch a campaign — and **could not add a second human being.**
That is what this closes.

**Built:** `lib/people.ts` gained a full list controller (create, update, remove, assign,
unassign) and `useRoles()`; `pages/console/People/` is the list, `PersonForm` the create
dialog, `PositionEditor` the two inline dropdowns and the `Role — Unit` chip. 17 tests.
The sidebar item is live — **the last edit of the task, not a task of its own**, per
`design_specs/design/02` §7.

Four decisions inside it worth keeping:

**Creating and assigning stay two calls, and the screen hides the seam without removing
it.** `CreatePersonBody` accepts no role, level or capability (`14` §8) because granting a
position is a permission change that has to appear in the audit log as one. But an
administrator's expectation from every other product is that "add user" asks for a role, so
the form *says* the position comes next rather than silently omitting the question — and
creating somebody opens the position editor on their new row immediately. A person with no
position can do nothing at all; leaving them on a list with a new row that does nothing is
leaving the job half done.

**The primary checkbox is now consequential, because of `DEC-044`.** A per-person grant
anchors at the primary position's unit, and two positions with none flagged leaves no anchor
at all. So the first position is primary by default and the checkbox appears from the second
onwards. That is this morning's decision reaching the UI three hours later, which is the
argument for making it rather than documenting around it.

**An `assignment.create` refusal is shown inline and verbatim.** It is usually INV-012's
`WOULD_ESCALATE`, whose whole value is the sentence naming the capability that would have
been handed out. Replacing it with generic copy throws away the only actionable part, and a
toast takes it away after four seconds (`24` §6). There is a test asserting the server's
words survive to the screen.

**The assign call is deliberately NOT optimistic**, unlike the rename beside it. A position
is a permission change: showing it as applied before the server agreed would have the screen
claim somebody holds powers they may not, and INV-012 means this call can legitimately be
refused. An optimistic chip that then vanished would read as a bug rather than as the rule.

**Verified against the running API, not only against mocks:** logged in as the seeded
administrator, listed 40 real people with their `Role — Unit` positions, created a person
(0 positions, as the DTO guarantees), read the four seeded roles the dropdown offers, gave
them `Faculty — Computer Science`, and deleted the probe row afterwards so nothing was left
in the dev database.

**Two pieces of `T-050`'s one-line description were NOT built**, and they are Debt rather
than done:

- **`D-021` — the CSV import wizard has no UI.** Both endpoints exist, guarded and
  INV-012-bounded. So the cold start *works* but does not *scale*: `34`'s own framing is
  that a 500-person organisation is populated by import, not by typing.
- **The invite / account panel is `T-073`, blocked on `T-072`** — accounts have no backend
  yet. It was in `T-050`'s line and could not be built from there.

**Also worth knowing:** `Sidebar.test.tsx` asserts the "Soon" count, which is now **4**.
A new test asserts People *does* navigate — nothing checked that half before, so an item
could have stayed disabled indefinitely after its page existed.

**Checks:** typecheck, lint, `audit:drift` (61 docs / 61 capabilities), `audit:vocab` clean.
**265 backend + 670 frontend** (was 652). Nothing committed.

---

### 2026-08-23 (latest) · T-074 + T-071 + D-020 — three live holes closed

*"ok start"*, after the documentation pass below. Took the two security tasks first, as
planned: neither depends on anything else in Stage 7, and both were reachable holes.

**`T-074` — `audit_log.ip` (D-019).** One line in `db/tx.ts`. Two tests, and the discipline
that matters here is that **reverting the fix fails one of them with the leak printed**:
`expected '::ffff:127.0.0.1' to be null`. The inverted test — a staff mutation *does* write
`ip` — still passes with the fix reverted, which is what stops *"never write `ip`"* from
satisfying the pair. Checked both ways, deliberately.

**`T-071` — `requireNoEscalation` (D-018).** `authz/escalation.ts` computes what a candidate
position would confer and compares its **reach** with the actor's, capability by capability,
through `visibleUnits()` — the same primitive every list filter uses, so there is no second
permission model. The middleware is `middleware/requireNoEscalation.ts`. 8 tests; removing
the guard fails 5 of them and the 3 "does not over-refuse" tests still pass, which is what
proves those 3 are not merely asserting the guard exists.

Three things came out of building it that the spec did not anticipate:

**The CSV import creates positions too**, behind `person.import` alone. A guard on
`/:id/assignments` only would have been **worse than no guard**, because the board would
have recorded D-018 as repaid while it stayed bypassable in one call by naming a senior role
in a one-row CSV. Both routes now carry the bound and share one resolution of *"which role
does this row mean"* (`features/people/positions.ts`) — two copies would drift into a row the
guard did not check and the handler did create.

**What it catches first is reach, not possession.** A Section Head holding
`assignment.create: own_unit` who assigns the Principal role *in their own unit* is refused
on `assignment.create` **itself**, because that role carries it at `subtree`. The capability
is one they hold; the distance is not. So the message names the **unit** as well as the
capability — naming only the capability would read as a bug in the commonest case.

**A third divergence — `CONF-020` / `D-020`, fixed in the same session (see the entry
above).** The deny-corollary test used `denyPerson(…, 'subtree')` and got a `201`. `11` §4
says a person-node grant anchors at the primary position's unit; `collect.ts` never set an
anchor; `scopeCovers()` then correctly refused an unanchored grant a unit scope. **So a
per-person deny at `own_unit` or `subtree` was inert — and so was a per-person allow.** Every
existing `denyPerson` test used scope `all`, which needs no anchor, which is why four audits
missed it.

#### Then `D-020`, on the owner's *"do whatever you feel is best"*

**Fixed the code, not the doc — and the deciding fact was measured rather than argued.** The
worry was blast radius: anchoring person grants changes resolver behaviour for *both*
effects, and currently-inert allows would start granting. So the first thing was to count.
**Every grant in the database — 1,545 rows across four demo orgs — is on a `role` node.**
Zero person grants, zero group grants, zero of the inert shape. `all` and `self` person
grants consult no anchor either way, so the only behaviour that could move was unit-scoped
person grants going from inert to working, and there were none. Nothing to break.

The alternative — narrowing `11` §4 to *"a person grant must be `self` or `all`"* — would
have left `T-052` building `33`'s per-person override on a control that writes a row and
changes nothing. That is the wrong direction for a product whose novelty claim is that the
permission system explains itself.

**`DEC-044` adds one clause `11` §4 did not have.** `isPrimary` **defaults to `false`** on
`CreateAssignmentBody`, so the ordinary *"give this person a position"* call produces no
primary at all — 2 of 151 people in the dev database are already in that state. A strict
primary-only rule would have left per-person overrides inert for the **commonest shape in the
product**, which is the bug it was meant to fix. So: a **lone unflagged position counts as
home**. Two or more unflagged positions gets **no anchor** — `isPrimary` exists to resolve
exactly that ambiguity, and picking one would anchor an override at whichever row the
database returned first. *A permission system that answers non-deterministically is worse
than one that answers narrowly.*

**It dragged out a pre-existing bug in `held.ts`**, caught by a `me.test.ts` regression the
moment person grants gained an anchor. It subtracted an org-wide deny only when the grant had
**no anchor** — but `all` scope is decided *before* an anchor is consulted, so an `all`-scoped
deny reached through a **role** was never subtracted from the UI capability set either, and
role grants are always anchored. Scope is the test; the anchor is irrelevant to it. That one
had been wrong since `T-010` and nothing had ever exercised it.

7 tests in `test/person-anchor.test.ts`. Reverting the anchor fails 6 — including
`expected true to be false` on the deny, which is the deny not denying — while the two
**correctly-inert** cases still pass, which is what stops them from merely asserting the fix
exists. `escalation.test.ts`'s deny corollary is back on `subtree`, the shape an
administrator would actually reach for.

**Checks:** typecheck, lint, `audit:drift` (61 docs / 61 capabilities) and `audit:vocab` all
clean. **265 backend tests** (was 248) and **652 frontend** — run in separate commands, per
the standing warning. Nothing committed.

---

### 2026-08-23 (later) · STAGE 7 SPECIFIED — the four asks. DOCS ONLY, NO CODE

Four owner instructions in one message, with *"first update all documentation for it, then
lets code"*. This session did the first half only. **Nothing was built** *(the two security
tasks were built immediately after — see the entry above).*

1. *"img — complete these pages too (all)"*, pointing at the five `Soon` sidebar items
2. *"admins of endur and organization must be able to see logs"*
3. *"allow organization to make accounts for level like university admin making dean accounts"*
4. *"the above point is important cause have a toggle (like in google forums) where a feedback
   is open to all or open to all in the part of organization (configurable)"*

**Four new docs**, catalogues amended first as the ground rule requires (`11` §3 gained an
Accounts module, `24` gained four components and a pattern, `13` gained the routes):

| Doc | What it settles |
|---|---|
| `56-PAGE-activity-log.md` | `/app/logs` — the org's own log: `audit_log`, scope-filtered, with the deciding grant on every row |
| `57-FEATURE-accounts-and-invites.md` | Provisioning sign-ins. Three capabilities, a one-time hashed activation link, and the escalation bound |
| `58-PAGE-inbox.md` | `/app/inbox` — **had no architecture doc at all.** The same gap `46` was |
| `72-PAGE-platform-logs.md` | `/ops/logs` — the rotating files, for operators |

**Sixteen docs amended:** `10` `11` `12` `13` `14` `15` `18` `19` `24` `33` `34` `38` `39`
`43` `44` `52`, plus `README` and `55`. Seven decisions, one invariant, one conflict.

#### The two holes, which are the real output of this session

Neither was introduced here. Both were found by **specifying a feature that would have made
them reachable**, which is the argument for writing the doc before the code.

**`D-018` — anyone with `assignment.create` can make themselves an owner.** `addAssignment()`
checks the capability on the target unit and nothing else, so a coordinator can assign the
Owner role at the root to a second account of their own. Every check passes; the resolver
worked exactly as specified, because nobody had specified that **creating an actor is a
different question from acting**. `INV-012` + `requireNoEscalation`. Same shape as the
`billing.update` hole `DEC-034` found, and worth noticing that this is the second time: a
capability safe to *hold* becomes unsafe to *hand out* the moment a route hands things out.

**`D-019` — the audit log records the respondent's IP.** `flushAudit()` writes `ip` for every
principal, and a submission writes an audit row. Zip `audit_log` against `responses` by
timestamp and INV-006 is defeated through a table it never mentions. **Dormant only because
nothing has ever read `audit_log`** — which is precisely why four security passes missed it,
and why the fix belongs with `56` rather than after it. The general lesson is written into
`52` §6: *the question to ask of a new read surface is not "does this expose something" but
"what does this make readable that was only written".*

#### The four asks, and what each actually required

**The access toggle (`DEC-037`) was the most architectural.** `AudienceRule` already had an
`anyone` kind, so the obvious move was a fourth kind — and it is wrong. `audience_rule` is a
**denominator** (it is what the response-rate card divides by) and `access` is a **gate**; a
campaign can perfectly well be *"open to anyone with the link, and we expect Housekeeping to
answer"*, which folding them together makes unsayable. It amends `DEC-009` narrowly: no
respondent account, no new principal kind — a member answering signs in as **staff**, and the
check is membership only. **Membership is checked at the gate; identity is discarded at the
door.** The cost is real and is now stated in three places: participation stops being
anonymous even though the answer does not, so `52` §1 names the **two promises separately** and
the form tells the respondent which one they are getting.

One ordering detail is load-bearing and easy to get backwards: **the gate runs after token
resolution.** Gating first would turn a restricted campaign into an existence oracle and
undo `13` §6's uniform 404.

**Accounts (`DEC-038`) mostly confirmed what the schema already anticipated** — `users.status`
has had `'invited'` and a nullable `password_hash` since `T-004`. The interesting part was
re-examining `34`'s *"an admin who sets passwords can impersonate"* rule rather than
inheriting it, and **keeping it**: an administrator who can set a dean's password can sign in
as the dean, and every audit row from that session names the dean. The org chart would be
intact and the audit log would be fiction — which is exactly what `56` exists to prevent, so
the two features constrain each other. Also confirmed by grep: **there is no mailer anywhere
in the app**, so the link is copied by hand, and that is written down as a limitation rather
than left implied.

**The logs ask has two different answers and they are not interchangeable (`DEC-043`).** An
org admin gets `audit_log` — evidence, per-row tenant-scoped by construction, forever. An
operator gets the files — diagnostics, every tenant in one file, 14 days. **An org admin does
not read the files**, and that refusal is stated out loud in `18` §9 rather than left as an
omission: serving a customer a filtered slice of a shared file is one filter bug away from
serving somebody else's traffic, and what a customer actually wants is not in there anyway.
`72` is INV-011-safe **only because `18` §3 already made it safe at the writer** — the viewer
inherits that property and must never be the thing enforcing it.

**Completing the sidebar (`CONF-019`) needed three different answers, not one re-tag.** Roles
and People were never unplanned, only unbuilt. Analysis was blocked on `OPEN-003` → resolved,
rule-based. Inbox had no doc. And **Reflect turned out to be blocked on `D-012` in a way
nobody had noticed**: every capability in `44` is Gold-entitled and no organisation has ever
had a `subscriptions` row, so that whole surface returns `402` to every user in the product
today. A blanket *"it is P2 now"* would have hidden that behind the easy items.

#### What the next session should know

- **`T-074` and `T-071` are one line and one middleware, and they are the two most valuable
  things on the board.** Neither needs any of the rest of Stage 7.
- **`packages/shared/src/capabilities.ts` does not have `account.create/revoke/reset` yet.**
  `audit:drift` passes at 61 docs / 61 capabilities only because it skips tokens whose module
  is unknown. Add them with `T-072` or `DRIFT-004` is a lie.
- `<DecisionTrace>` is needed by **both** `T-076` and `T-054`. Whoever is second **extends**;
  the `INV-009` rule applies to it.
- `<ScoreBadge>` is in the `24` catalogue and has never been built. `T-080` needs it.
- `58` must read through `features/results/service.ts`. A second query against `responses`
  forks the k-anonymity gate, which is the whole risk of that page.
- Stage 7 is **not M0**. `T-043`, `T-045` and `D-005` still come first.
- `audit:drift` and `audit:vocab` are both clean. No code changed, so no tests were run.

### 2026-08-23 · STAGE E BUILT — every mandatory middleware type, plus DEC-035 (no pricing)

Two instructions, in order: *"leave out pricing cause this aint an actual product anyway,
just add a button to join and directly make them join that tier"*, then *"begin with our new
plan"* — Stage E, the evaluation-1 criteria.

**Pricing removed — `DEC-035`.** A tier is now **joined**, not bought: one button per tier,
`POST /billing/tier`, the row is written, and the entitlement gate answers differently on the
next request. No amounts, no currency, no checkout, no processor, and **no `plan_prices`
table** — `T-068` is dropped rather than deferred. `DEC-034`'s split of `billing.update` had
nothing left to hang on and is superseded: the capability writes the tier again, deliberately,
and the protection that remains is the one that was always doing the work — it is a
capability, so it is grantable, denyable, deny-wins, audited, and seeded to administrators
only. `71` stopped being a revenue page and became
[`71-PAGE-platform-analytics.md`](architecture/71-PAGE-platform-analytics.md): organisations,
seats, tier mix, movement, trials, quiet orgs. MRR would have been a constant times a count,
which is a count with false confidence attached. `<RevenueChart>` → `<GrowthChart>`,
`platform.revenue.read` → `platform.analytics.read`.

**Then Stage E, all five tasks.**

| | What landed |
|---|---|
| `T-063` | `lib/logFile.ts` + `pino.multistream`. `logs/app-<date>.log` (everything) and `logs/error-<date>.log` (warn and above), **alongside stdout, never instead of it**. Daily *and* 10 MB rotation, 14-day retention decided by the date in the filename rather than mtime, synchronous writes so the last line before a crash survives, and a broken log directory **fails off to stdout instead of taking the app down**. Verified end to end against the real module, not only in tests |
| `T-064` | `middleware/chains.ts`. Links 6–8 moved out of `app.ts` into **four different `router.use()` chains**. `tenantResolver` became a factory and lost both path-regex exception lists — the mount point knows what a regex was being kept in step to know. A mistyped `/api/v1/...` now 404s instead of 401ing |
| `T-061` | `middleware/upload.ts` — a hand-written multipart parser, one file, one field, images only. Size counted **as the bytes arrive**, and on refusal it unpipes and drains rather than destroying the request, so a 413 actually gets back. `lib/imageBytes.ts` sniffs format and dimensions from headers and strips metadata; `lib/storage.ts` writes tenant-partitioned to disk. Four upload routes plus `GET /files/:id` |
| `T-062` | `<FileUpload>`, `apiUpload()`, the logo card in Settings, and `/app/profile` — which stops being a placeholder and becomes **partially real**: the avatar works, the rest is still `T-051` and the page says so |
| `T-065` | One CSV number, `CSV_MAX_CHARS`, and it sits **below** the parser's so a field error wins over `PAYLOAD_TOO_LARGE`. `12` §4.4 rewritten — it described a streaming CSV parser that was never written |

**`OPEN-008` resolved — `DEC-036`, and it is the one thing to read before touching uploads.**
`48` said *"Re-encode: **Always**"*. Re-encoding needs an image library, which is a dependency
nobody approved and not an install to make unasked. What is built instead **strips the
metadata segments without decoding** — JPEG APP1/APP13/COM, PNG text chunks, WebP EXIF/XMP —
so GPS, device ids and author names never reach disk, which is the property `48` wanted
re-encoding *for*. What that does **not** buy is polyglot neutralisation, and that is written
into `48` and `DEC-036` rather than left quiet. `stripMetadata()` is the one function to
replace if a library is ever approved.

**Checks:** `npm run typecheck` clean · `npm run lint` clean · `audit:drift` clean (57 docs)
· `audit:vocab` clean · **248 backend tests** (was 213) and **652 frontend tests** (was 646),
run as two separate commands as the warning above says.

Three pre-existing failures were fixed on the way, all outside this work: three `tsc` errors
in `test/org.test.ts` that broke `npm run typecheck` on a clean tree, and eight `eslint`
errors in `test/database.ts` and `Settings.test.tsx`. The `eslint --fix` for the last of those
removed casts that `tsc` needs, so they are written as `getByRole<HTMLButtonElement>(...)`
instead — both checkers are happy with the generic form.

**Nothing committed. The tree is dirty, as always.**

**What the next session should know.** Stage E is done, so the top of the board is Stage 5
again — `T-043` (blocked on `OPEN-002`, the user's), `T-045`'s three rehearsals, and the
fonts. `70`/`71` are still exempt from INV-001 and `audit:vocab` **will fail on
`pages/platform/`** the moment that directory exists, until it joins the exclusion list.

### 2026-08-23 · FIVE DOCS WRITTEN — 18, 19, 49, 70, 71. No code.

Third entry today. Asked to write the specs for the five task groups, *"if not already"*.
**One of the five was already written and four were not**, so the first useful output was
finding which.

**Item 5 needed nothing.** Every placeholder page already has a complete spec: `33` roles and
the powers grid (173 lines), `34` people (135), `42` simulator (163), `47` profile (130), `43`
analysis (133) — all with the full ten-section page template from `README` § The
page/feature doc template. The one sidebar item with no doc of its own is the **response
inbox**, and it is referenced as P3 by `40`, `43` and `20` and pointed at
`design_specs/design/08` §8.3. That is deliberately deferred, not missing, so it was left
alone. **The placeholder pages are unbuilt, not unspecified** — `T-050`–`T-054` can start from
the docs that already exist.

**Half of item 4 needed nothing either, and the half that did is a trap worth naming.**
*"Assign levelled roles"* is `33` § Interactions plus `11` §8 plus `10`'s `Node.level`, and
those already say the important thing: a level is **ordering and seeding only, never consulted
at authorisation time**. `DEC-002` replaced an integer permission ladder with the GRANT engine
and `CONF-002` records it. `49` § "Assigning levelled roles" points at all four places rather
than restating any of them, and says out loud that making a level decide an access question
would supersede `DEC-002`.

**What was actually written:**

| Doc | Was | Covers |
|---|---|---|
| `18-OBSERVABILITY-AND-OPS.md` | a reserved placeholder | Item 1's file half — two rotating streams, retention, what is never written, and `logs/` |
| `19-PLATFORM-OPERATORS.md` | did not exist | Items 2 + 3's model. **Resolves `OPEN-007`** |
| `49-PAGE-plan-and-billing.md` | did not exist | Item 4 — the customer's plan, usage, **one-click join** (DEC-035), and the sign-up plan step |
| `70-PAGE-platform-console.md` | did not exist | Item 3's screen — estate, plan override, messaging org admins |
| `71-PAGE-platform-analytics.md` | did not exist | Item 2's screen — tier mix, movement, trials, quiet orgs. **Renamed from `-revenue` by DEC-035**; counts, never money |

**The catalogues were amended first**, per the ground rule that has kept the docs consistent
through three revisions: `11` §3 gained the section saying platform capabilities are a
*separate* catalogue and why, `13` gained the billing, platform and multipart route tables,
`24` went from twenty-one components to twenty-six.

**Three decisions came out of the writing rather than going into it.**

`DEC-033` — an operator is a separate principal kind, not a bigger grant. The reasoning is in
`19` §2 and it is the same three mechanisms every time: `GrantScope` stops at one org,
`tenantClient` stamps `orgId` by construction, INV-010 forbids it from anywhere else. Those
are the isolation guarantee, so the answer is a second system rather than a hole in the first.

**`INV-011` is the one to remember**: an operator reads counts, never content. No operator
capability in any role resolves to a response, an answer, a comment or a respondent identity,
and it is enforced at the database seam rather than by a UI that declines to render. The
support consequence is real and is stated rather than hidden — when a customer says *"results
look wrong"*, an operator cannot look at their results.

`DEC-034` — **a live hole found while writing `19` §8.** `16` §8 put `POST /billing/tier`
behind `billing.update`, an **org** capability. As written, an org administrator could be
granted the power to set their own tier — a free Enterprise upgrade in a product whose revenue
model is tiers, with no bug to point at, because the grant system would have worked exactly as
designed. Split into: `billing.read` see it · `billing.update` *request* a change through the
`49` checkout · `platform.plan.override` actually set it. The powers grid can hand out
`billing.update` safely now; it could not before.

`DEC-032` — logs and errors to two rotating files, in addition to stdout and never instead.
`18` §2 has the reasoning; the sharp edge is `18` §3, that persisting logs widens a logging
mistake from one terminal session to fourteen days of retained files, so the redact list stops
being belt-and-braces.

**`CONF-018` is resolved:** `48` is re-tagged **P1**. The other half of it is not — `12` §4.4
still claims a streaming CSV parser that was never written, and that stays `D-016`.

**One thing left deliberately undone.** `70`/`71` have **no `design_specs` entry** — `70`
§ Design note says so plainly and restricts both pages to existing tokens and existing
component anatomy, because inventing colour or spacing in `architecture/` breaches `DEC-012`
and fails `audit:drift`.

*(The other one, `plan_prices`, stopped existing an hour later: **`DEC-035` removed pricing
from the product entirely** at the user's instruction. `T-068` is dropped, the table is gone,
`71` reports in organisations rather than money, and `POST /billing/tier` joins a tier with one
button. See the 23 Aug DEC-035 log entry below.)*

**One thing the next session must not miss:** `70` and `71` are exempt from INV-001 (`19`
§12) — they are Endur's own furniture, they have no `organization.labels` to resolve against,
and they legitimately say "Organizations" and "Revenue". `audit:vocab` scans
`src/frontend/pages/**` and **will fail on them** until `pages/platform/` is added to its
exclusion list, in the same spirit as `presets/` and `database/` (`N-049`).

### 2026-08-23 · THE EVALUATION-1 CRITERIA — checked the docs against all six

Second entry today. The graded criteria for the first evaluation arrived after the survey
above, and they re-rank everything: a complete working application, five mandatory
middleware types (**logging, error handling, file upload, security, router-level**), and
**logs and error information stored in files at regular intervals**. Read-only pass; nothing
outside `PROGRESS.md`, `_MEMORY.md` and `55` was touched.

**The result is four done, two not, and the two are additive.** The § Board Stage E table
carries the per-criterion verdict. What follows is only what would otherwise be re-derived.

**File upload is the serious one, and the tag is why it was missed.** `48-FEATURE-file-upload.md`
is a complete spec — endpoints, the validation order, magic-byte checking, re-encoding,
storage layout, an acceptance list — and it is tagged **`Phase: P2`**. `02` §4 lists it under
the Phase-2 checklist; `02` §3, the Phase-1 deliverables, does not mention uploads at all. So
every doc we have files this *after* the evaluation that requires it. That is `CONF-018`.

The groundwork is further along than the tag suggests: the `File` model is in `10` and
migrated, `src/backend/storage/` exists and is gitignored, `<FileUpload>`'s props are in the
`24` catalogue. **What does not exist is any multipart parsing at all** — no multer, busboy or
formidable in `src/backend/package.json`, no route, no service, `File` referenced by nothing,
`storage/` empty.

**And `12` §4.4 describes code that was never written.** It says CSV import *"bypasses this
with a streaming parser and its own 5 MB cap"*. The import takes a CSV as a **string in a
JSON body** — `ImportPreviewBody.csv` is `z.string().max(1_000_000)` — through
`express.json({ limit: '256kb' })`. Three numbers, and the smallest wins silently: a CSV
between 256 kb and 1 MB is accepted by the DTO and rejected by the body parser before
validation runs, surfacing as `PAYLOAD_TOO_LARGE` rather than a field error. `D-016`.

**Nothing is written to a file anywhere.** `lib/logger.ts` constructs pino with a level and a
redact list and **no destination**, so every log line and every error `errorFunnel` records
goes to stdout and is gone. No transport, no rotation, no `logs/`. `*.log` sits in
`.gitignore`, which reads like somebody intended this and it never happened. `18` is the
reserved slot that would own it and it is an explicit placeholder — *"reserved rather than
written because writing it now would be speculation"* — a deferral that was reasonable in
June and is wrong now that a criterion names it. `T-063` writes both.

**Router-level middleware: one line.** `publicRouter.use(publicCors)`. Thirteen routers are
created with `express.Router()` and twelve never call `.use()`; everything else is
application-level via `app.use()` or route-level via the middleware array. The useful part is
that **`12` §2 already draws links 6–8 in a `per-router` box** — `tenantResolver`,
`authenticate`, `csrfProtection` — and `app.ts` mounts all three globally. So the published
diagram is simultaneously wrong and describing the better answer, and `T-064` is a refactor
toward a doc that already exists rather than anything invented for a rubric. `D-017`.

**Three criteria need no work and should be said out loud in the viva, because they are
stronger than the rubric asks for.** `requestLogger` is hand-rolled rather than `pino-http`
*specifically* so a request body can never reach a log, with a redact list behind it as a
second line. `errorFunnel` is a genuine single exit — four-arg handler, registered last, no
handler anywhere calls `res.status(500)`, no stack crosses the boundary, `headersSent`
handled by delegating to Express rather than emitting half a JSON body. Security is helmet
plus two CORS policies that never both apply to one request, plus CSRF, two rate limiters,
argon2id and session regeneration on login.

**One decision is the user's and it blocks `T-061`:** `OPEN-008`, whether `48`'s *"re-encode:
always"* survives into P1. It needs an image library, there is no image dependency in the API
today, and it changes what the task is. Recommendation on file is to add it — the part of
file upload that is interesting *as middleware* is the validation chain, and a route that
rejects a renamed `.exe` by magic byte during streaming is worth more than one that accepts
bytes. Not an install to make unasked.

**Suggested order:** `T-063` and `T-064` start immediately and depend on nothing. `T-061`
waits on `OPEN-008`. `T-062` and `T-065` follow `T-061`.

### 2026-08-23 · survey of four questions — STAGE 6 OPENED, NO CODE WRITTEN

Asked to look over the state of the build rather than add to it, against four questions:
missing middleware, do all the pages work, the Endur-operator and revenue surface, and
whether the flow runs end to end. Read only — nothing was edited outside this file.

**The four answers were four different shapes, and that is the useful finding.** One is
already done, one is a known list, one is a genuine architectural hole, and one is a single
missing screen wearing a bigger costume. The Stage 6 table above states each; what follows
is only what a later session would otherwise have to re-derive.

**Middleware: complete.** All 16 links of `12` §2 are present in `app.ts` in the documented
order, with the two deliberate refinements already commented in place (cookie parsing and
the session *load* sit above `tenantResolver`, because resolving the org reads
`req.session.orgId` — loading a session is not authenticating, and link 7 still runs after
link 6). `requestLogger` is hand-rolled pino rather than `pino-http` precisely so a body can
never reach a log, with `cookie`, `authorization`, `password` and `passwordHash` on a redact
list as a second line. `helmet` plus two CORS policies that never both apply to one request.
Both rate limiters, CSRF, `validate`, `requireCapability`, `requireEntitlement`,
`idempotent`, `auditWriter`, `notFound`, `errorFunnel` — all live, all mounted, 60 routes
across 11 feature routers. **There is nothing to add here.** The one real gap at this layer
is `D-001`, which predates the survey. `compression` is absent and is not in `12` and does
not need to be.

**Pages: five placeholders, and only one of them is in anybody's way.** Roles, People, person
detail, simulator and my account still render `<Placeholder>`. That was already in
`status.md` §4 and it is still accurate. What that section does not say is that **four of the
five have a complete, tested backend waiting behind them** — `people` alone has nine
endpoints including CSV preview and import, `roles`/`grants` have nine more. The exception is
the simulator: `authz/simulate.ts` exports `simulate()` and no router mounts it (`D-014`).

**The Endur operator does not exist, and cannot be added by granting somebody more.** This is
`OPEN-007` and it is the largest item found. Every mechanism the product has for expressing
authority is org-shaped by construction: `GrantScope` stops at `all`, meaning this whole
organisation; `tenantClient` stamps `orgId` on every read and every create and lint forbids
importing the raw client outside `db/tenant.ts`; INV-010 forbids an org id arriving from
anywhere but `tenantResolver`. Those are not obstacles to route around — they are the
product's central claim, and the eventual answer has to be a **new principal kind with its
own seam and its own audit story**, written into a `19-` doc and a `DEC-` before a line of it
is typed. Slot `19` is free; `17` and `18` are the reserved neighbours.

**The revenue model is half-built, and the missing half is the half that runs.** The
entitlement *architecture* is genuinely complete and enforced — `TIER_ENTITLEMENTS`,
`requireEntitlement`, 402-with-`requiredTier`, capability-before-entitlement so nobody is
ever told to buy something they still could not use. But **nothing ever writes a
`Subscription` row** (`D-012`), so every org including all four demo orgs falls to the
`?? 'bronze'` default and the Gold trial in `16` §7 has never happened once; `billable_seats`
is specified and unimplemented (`D-013`), which also means `16` §6's over-limit behaviour has
no number to be over; and `/api/v1/billing` does not exist though `billing.read` and
`billing.update` have been in the capability catalogue since `T-003`. **The correct order is
`OPEN-007` first** — "who may set a tier" and "what is an operator" are one question, and
answering the second first would mean building the billing surface twice.

**End to end: seeded yes, cold no.** Sign in to a seeded org and the whole path runs, which
is what `T-045` rehearses and what the 21 Aug entry already established. Start at `/start`
with a new empty organisation and it runs create org → setup wizard → subjects → templates →
builder → campaign → launch → respond → results, and breaks at exactly one point: **there is
no way to add a person.** The API has had full people CRUD and CSV import since `T-018`; the
frontend `lib/people.ts` exports `usePeopleIn` and `usePeopleSearch` and nothing else, both
read-only, consumed only by the structure detail panel and the subject form. So the org graph
can be built and subjects can be created, but the people who would hold roles in it cannot
be. `T-050` is therefore the first Stage 6 task and the only one that unblocks another.

**Do not start Stage 6 yet.** M0 is 26 Aug and the demo is 27 Aug; `T-043`, `T-045` and
`D-005` are what stand in front of it, and none of the eleven tasks opened today is on that
path. This entry exists so that the day after the demo does not begin with this survey being
run again.

### 2026-08-23 · share sheet frame, and the theme wipe softened

The share sheet inherited the vendored `.dialog`'s own padding and gap on top of its three
bands' padding, and had no height cap — so on a laptop viewport the backdrop centred a sheet
taller than the screen and clipped both ends, taking the campaign name with it. The sheet now
has `padding: 0`, `max-height: min(760px, calc(100dvh - var(--space-8)))`, a header and footer
pinned with `flex: none` and a body that scrolls. The code scales down on short windows
(`min(300px, 44vh, 100%)`) and never up past the 300px it was encoded at; the plate gained a
hairline and a shadow so pure white does not float on the dark theme; the footer sits on a 4%
band; the localhost warning gained a status-ramp left edge.

The theme swap kept the circular reveal but lost its hard edge: the clip-path is now a radial
mask feathered over `--wipe-feather` (120px), declared in CSS against
`.is-theme-wiping::view-transition-new(root)` and driven by a registered `--theme-wipe`
length, so the compositor runs it instead of a WAAPI call from `lib/theme.ts`. Also fixed
there: re-picking a choice that resolves to the theme already on screen now returns instead of
wiping one theme over itself, and the transition promise has a rejection handler (a second
click used to skip the transition and log an unhandled rejection, leaving the wipe class on).

No task id — presentation only, no contract touched.

### 2026-08-23 · light-theme ambient field rebuilt as a continuous wash

The light ambient layer read as three separate blurred discs on a visible page ground rather
than as one field. Rebuilt it: five corner-anchored, oversized fields instead of three, with
the falloff painted as a `radial-gradient` stop instead of produced by `filter: blur()` on a
solid disc — a blurred disc keeps a locatable ring at its edge, a gradient stop does not.
Default opacity `.45` → `.72`, blur `72px` → `48px` (the gradient now does the falloff, the
blur only kills banding), and the lattice comes down `.5` → `.38` so it does not compete.

New tokens `--ambient-4` / `--ambient-5` in both themes. Hues unchanged — the whole set is
still accent, accent-2 and the rose whisper. Dark keeps its old character: 4 and 5 are faint
there, because a fully washed dark ground loses the depth the glass edge depends on.

Touched: `design-system/tokens.css`, `design-system/endur.css`, `components/AmbientBackground.tsx`.
No `DEC-` superseded — DEC-029 already owns this layer and the change is a retune within it.

### 2026-08-23 · `frontend_upgrade.md` — five visual fixes, radius, glass, share sheet restyle

Implemented the five-item brief in `frontend_upgrade.md` against `src/frontend`, in the
order it specifies. No task id — a targeted visual-fixes pass, not board work.

**1 · Dropdown menus were see-through.** `.menu` (`design-system/endur.css`) is a child of
`.topbar`, and `.topbar` has its own `backdrop-filter` — an ancestor with `backdrop-filter`
is a backdrop root, so the menu's own blur never reached the page it overlapped. Fixed both
halves: the glass `.menu` block now uses a near-opaque `color-mix` surface instead of
`var(--glass-tint)`, and both menu panels in `TopBar.tsx` now render through
`createPortal(..., document.body)`, positioned from the anchor's `getBoundingClientRect()`
and recomputed on resize/scroll. `useMenu()` grew a `panelRef` alongside `anchorRef` so the
outside-click check still closes correctly once the panel is no longer a DOM descendant of
the anchor. A `.menu.is-portal { position: fixed; }` rule carries the portal variant.

**2 · Template quick-look and every dialog had the same defect**, one level up: `.tpv` sits
under `.tpv-backdrop`/`.dialog-backdrop`, which is itself the backdrop root, so `glass-strong`
on the panel had nothing of its own to blur. `.tpv` and the generic `.dialog` glass rule both
moved from `var(--glass-tint)` to a near-opaque `color-mix(in srgb, var(--color-card) 96–97%,
transparent)`; the edge, sheen and shadow still carry the glass read.

**3 · `<ShareSheet>` restyled to match the quick-look's anatomy** — header band / scrolling
body / footer action band, modeled directly on `.tpv-head` / `.tpv-body` / `.tpv-foot`. The
`<h2>` dropped the three-way sentence ("X is collecting.") in favor of the campaign name
alone, with the state carried by a new status tag instead (`tag-good` / `tag-neutral` /
`tag-muted` — the last one didn't exist yet, added next to `.tag-good`/`tag-warn`/`tag-bad`
in `endur.css`, quieter than `.tag-neutral` since a closed campaign is over, not merely
inactive). `.share-sheet` narrowed to 560px, lost `text-align: center` (only `.share-body`
centers now), the close button became `btn btn-icon` with `<Icon name="close">`, the `<hr>`
was dropped in favor of the footer's own border, and the "Copying was refused" error moved
into `.share-body` so it can't shift the footer. Every N-037 rule (280px+ QR, pure ink on
pure white, 24px quiet zone, `Full` for the projector, copy-in-place, Escape leaving
presentation mode first) is untouched — none of that markup moved, only its wrapper anatomy
did. `ShareSheet.test.tsx` updated: the dialog's accessible name stayed an explicit
`aria-label="Share {campaignName}"` (the visible `<h2>` no longer says "Share", so
`aria-labelledby` alone would have changed what a screen reader announces); the "is
collecting" / "has closed" text assertions became tag-text assertions; `.share-actions`
renamed to `.share-foot-actions` throughout.

**4 · Preview segmented control now defaults to Desktop.** `PREVIEW_WIDTHS` in
`FormPreview.tsx` reordered widest-first (desktop, tablet, phone) and the initial
`useState<PreviewWidth>` changed from `'phone'` to `'desktop'`. `Detail.test.tsx`'s "the
three widths" suite asserted the old phone-first default by name — both tests rewritten to
assert desktop-first rather than deleted, per the brief's instruction to update the
assertion, not the source.

**5 · Corner radius pulled in globally**, done first per the brief's ordering (widest blast
radius). `tokens.css`: `--radius-sm: 8px→6px`, `--radius-md: 16px→10px`, `--radius-lg:
28px→16px` (the `* 1.15` card/dialog multiplier is untouched and now resolves to 18.4px, on
the brief's 14–16px target). Every other radius in the codebase already reads from these
tokens or is a `999px` pill, confirmed by grepping every `border-radius` hit in
`src/frontend` — nothing needed a direct edit except one literal: `.topbar-mark`'s glass
override (`endur.css` ~2039) hardcodes `11px` rather than reading `--radius-sm`, and next to
the now much-tighter neighbouring corners it read rounder than everything around it —
dropped to `8px` with a comment explaining why it's a literal, not a token reference.

**Verified:** `npm run typecheck` clean. `npx vitest run` — 645/646 passing; the one
failure (`pages/respond/bundle.test.ts`, "shares the ONE `<QuestionInput>` set") is
pre-existing and unrelated to this pass — `relative()` from Node's `path` module returns
backslash-separated paths on Windows, so the test's own `toContain('components/form/
QuestionInput.tsx')` (forward slash) fails on this OS regardless of what the import graph
actually contains; confirmed by walking the same graph manually and finding the file
present, just under a `components\form\QuestionInput.tsx` key. Not touched — it is a test
bug orthogonal to this brief, and fixing cross-platform path handling wasn't in scope.
`npm run build` succeeds (dist emits normally, `ShareSheet` chunk 29.4 kB / 11.5 kB gzip).

**Not done, and worth carrying forward:** `frontend-design` skill was invoked per the
instruction to use it, but this was a spec-driven implementation brief with exact CSS/values
given throughout, not an open design brief — so the skill's brainstorm/critique process
didn't apply; the five fixes were built to `frontend_upgrade.md`'s letter instead. The two
"leave alone" exceptions the brief named (`.sidebar-item.is-active` pill, and the QR colours
in `ShareSheet.tsx`) were left untouched, as instructed. Nothing committed — per `CLAUDE.md`,
the user commits.

### 2026-08-22 · Visual overhaul — type, dark mode, glass, illustrations

Owner-requested pass over the whole frontend. Four decisions recorded as `DEC-027`…`DEC-030`
in `_MEMORY.md`; each one supersedes something and says what it supersedes.

**What moved**

- **Type.** Outfit (display) + Inter (body), both variable, both self-hosted in
  `public/fonts`. A named scale (`--text-*`) and tracking tokens replace the vendored
  layer's fixed px sizes, overridden in `endur.css` because `organic.css` is re-vendored
  mechanically. Body is 16px, up from 15. `<Icon>` stroke-width 2.75 → 2.1.
- **Dark mode.** Every colour token declared twice; `[data-theme]` on `<html>`, set before
  first paint by an inline script in `index.html`. Three-valued choice (light/dark/system)
  in `localStorage`, never in the store. The swap is a View Transitions circular wipe from
  the control that was pressed, degrading to an instant set.
- **Glass.** Tint + blur + hairline edge + inset sheen on chrome and cards, with a
  `@supports not (backdrop-filter)` branch back to opaque. `<AmbientBackground>` is part of
  it, not decoration: it is the field the blur needs, and it draws the org graph.
- **Landing.** Rebuilt. The vocabulary switcher is now the hero mechanic — it rewrites the
  headline, so the product claim is demonstrated rather than described. Added the noun
  grid, three steps, the anonymity and grants claims, and a closing call.
- **Illustrations.** A line-art house style, authored in SVGator, inlined with `?raw` so
  `var(--illus-*)` resolves and one drawing serves both themes. CSS keyframes, not the JS
  player.
- **Auth.** Larger type, deeper cards, and a three-point aside beside the form.
- **Structure.** Added an overview band (four counts, units-per-level chart) and
  `<UnitMap>` — the tree drawn as a node-link graph, tidy-tree layout, edges drawn on with
  `pathLength="1"`. The indented tree remains the editing surface; the map only selects.
- **Templates.** Cards carry a drawing of the form so twelve templates are comparable at a
  glance, and Preview opens a glass quick-look that fetches the real questions instead of
  navigating away from the grid.

**What the next session should know**

- `pages/respond/bundle.test.ts` caught a real regression: `<ThemeToggle>` imported
  statically into `router/layouts.tsx` put lucide-react in the entry chunk. It is `lazy()`
  there now, same as `<AppShell>`. Recorded as `N-026` — check that test before adding
  anything to `layouts.tsx`.
- Six tests were updated, none weakened: nouns and unit names now legitimately appear more
  than once per page (headline + grid, map + tree), so `getByText` became `getAllByText`,
  and template Preview is a button rather than a link.
- 619/619 frontend tests pass; `audit:vocab` and `audit:drift` are clean. Eight lint errors
  remain in `Settings.tsx` / `Settings.test.tsx` — pre-existing on this branch, untouched
  by this pass, and worth a separate fix.
- `tokens.css` is no longer a verbatim copy of any `design_specs` section. `design_specs/`
  is absent from this branch; when it returns, §2 has to be reconciled against the token
  block rather than re-copied over it (`DRIFT-001`).

### 2026-08-21 · T-049 — the slug race, and a worse bug found on the way to it

`D-006`. `uniqueSlug()` runs outside register's transaction and cannot move inside it: it reads
**committed** rows, and a transaction cannot see the one it is racing. So two people naming
their organisation the same thing in the same second both read "that slug is free" and the
loser collided on the unique index and got a 500.

The collision was correct, the rollback was correct, the 500 was not — a slug is derived from a
name the caller is allowed to reuse, so it is neither their mistake nor theirs to fix. Register
now catches a P2002 **on `slug` only** and tries again.

**The first version of the fix still failed, and the reason is worth keeping.** Retrying by
re-running the sequential scan makes every contender pick the same next value: six requests
re-read, six find `acme-2` free, five collide again. Sequential retry needs as many attempts as
there are contenders, so one of six still got a 500 at five attempts. A retry now takes a
**random suffix**, and the field spreads out in one round however many are racing. The
uncontended path still scans, so registering "Acme" next week when `acme` exists still gets the
readable `acme-2` — that path is not racing anything.

The retry path deliberately does **not** read first. Under contention that read is precisely
the thing that lies; the unique index and the loop are a better guard than a SELECT already
proven stale.

**`register-rollback.test.ts` inverted, which is correct.** It was built on the collision
producing a 500. Now all six contenders succeed on six distinct slugs — and those distinct
slugs are what prove the retry ran, since all six derive the same base before any of them
commits. The rollback property is still tested, by every retry: an attempt that left half an
organisation behind would show as an org count exceeding the number of winners.

**Then the suite went intermittent, and it was not this.** One run in six failed on
`public.test.ts` — *"creates ONE response when a flaky network retries with the same key"*.
`middleware/idempotency.ts` wrote the key row with `void prisma…create()` inside the `res.json`
wrapper, so **the response went out before the row landed**. A retry arriving in that gap missed
the read, ran the handler again, and created a second response — the exact duplicate the
middleware exists to prevent, on the respondent submit path, which is the one a phone takes in
front of the evaluator.

The code even argued it was fine: *"its response is identical anyway because it ran the same
handler on the same input."* That is false when the handler **creates** something. The second
response has a different id.

The row is now committed before the body is sent — one indexed insert of latency — and
`public.test.ts` asserts the ordering directly instead of depending on timing. Six consecutive
full runs, clean.

**Two things worth carrying forward.** A flaky test is a bug report nobody has read yet; this
one had been passing since T-022. And it surfaced the day the suite moved to a small, fast test
database (`T-048`) — the same work in less time widened the window relative to it, which is a
reminder that making the tests faster changes what they can see.

**`D-011` is what is left**, and it is the harder half: two genuinely concurrent requests can
both miss the read — the real flaky-network case, where the client never received the first
response. At most one key row exists, so the replay stays correct, but both handlers ran.
Closing it means reserving the key *before* the handler rather than writing it after, which
introduces an in-flight case that has to answer something. Not worth inventing five days out.

210 backend tests green (209 + 1), typecheck clean, `audit:vocab` and `audit:drift` clean.
Docs: `13` §7 and its acceptance list, `55` gained `T-049`, `_MEMORY.md` `N-054` and `N-055`.
Nothing committed.

---

### 2026-08-21 · T-048 — the tests stopped writing to the development database

`D-004`. The board's remaining items are `T-043` (deferred by the team) and `T-045` (needs the
public URL and real phones), so this was the topmost unblocked one — and it is the one that
would have made a rehearsal meaningless.

209 integration tests register organisations and submit responses, and they were doing it in
`endur`. Two hooks in `vitest.config.ts`:

- `globalSetup` — creates `endur_test` if it is not there, then `prisma migrate deploy`. A
  fresh clone runs `npm test` with no setup step, which is the only version of this people
  keep using.
- `setupFiles` — points each worker's `DATABASE_URL` at it.

**The ordering is the whole mechanism.** `lib/config.ts` parses `DATABASE_URL` at module load,
and `process.loadEnvFile()` does **not** overwrite a variable that is already set — so a value
assigned in `setupFiles` wins over the repo `.env` for the entire worker. I verified that Node
behaviour before building on it rather than assuming it.

`migrate deploy`, never `migrate dev`: `dev` offers to GENERATE a migration from a drifted
schema, and a test run is the last place that should be possible.

**Two guards, and the second one is the subtle one.** `test/database.ts` refuses to run rather
than trusting configuration, because this suite truncates:

1. the database name must end in `_test`
2. it must not be the `DATABASE_URL` **written in `.env`**

Rule 2 reads the file, not `process.env`. My first version compared against the live value and
refused to start — correctly, by its own logic: `globalSetup` had already pointed the process
at `endur_test`, so the two matched. A guard that fires for the exact reason everything is
correct is worse than no guard, and the same trap was hiding in `derive()`, which turned a
second call into `endur_test_test`. Both fixed; both have tests.

**Write the test for the guard.** `test/test-database.test.ts` asserts both rules by their
**failure** — a guard that never refuses anything is not a guard, and this one decides what 209
tests may truncate. It found the `derive()` bug on its first run.

**Still true after the fix, and it is yours:** `endur` holds **2,880 organisations**. The leak
is closed, the puddle is not mopped. `npm run db:reset` drops, migrates and re-seeds — it is
also the live-demo recovery path, so it is worth running once before rehearsals. I have not
run it: it would drop anything you created by hand while clicking around.

209 backend tests green (201 + 8 new), typecheck clean, `audit:drift` clean. Docs: `03` §5 has
a new *The test database is a different database*, `.env.example` carries `TEST_DATABASE_URL`,
`55` gained `T-048`, `_MEMORY.md` `N-053`. Nothing committed.

---

### 2026-08-21 · T-047 and T-046 — the two fixable findings, fixed

Picked up the three findings from the walkthrough entry below. Two were code; the third
(`D-005`, the fonts) is two binary files and stays yours.

**1 · `T-047` — the CSRF failure, and the general rule underneath it.** `endur.csrf` was set
with no `maxAge`, making it a browser-session cookie, next to a session cookie carrying seven
days. Close the browser, come back: signed in, no token, every mutation dead. Two changes, and
both are needed:

- The cookie now carries `SESSION_TTL_DAYS`, so the pair expires together.
- `csrfProtection` issues it on **safe** methods for a cookie principal — a fresh token when
  there is none, the **existing** token again when there is. Re-setting rather than rotating
  is deliberate: it slides the expiry with the rolling session without invalidating a mutation
  already in flight holding the old value.

The second change is what makes the error message honest. Nothing outside login and register
issued that cookie, and the SPA never called `GET /auth/csrf`, so *"reload and try again"* was
previously impossible to act on. Now the boot `GET /auth/me` heals it.

Issuing a token on a GET is not a hole — double-submit rests on the attacker being unable to
**read** the cookie cross-origin, and a random value they cannot see buys them nothing.

Two regression tests in `org.test.ts`: the register response's `Set-Cookie` carries a
`Max-Age`, and a request holding **only** the session cookie gets a working token back from a
plain GET and can then mutate. Also verified live against the running API with curl — login,
drop `endur.csrf`, `GET /auth/me`, `PATCH /org/labels` → 200. Before, that last call was 403
forever.

**Worth keeping:** 807 tests were green while this was live. Every one of them starts a fresh
agent — **nothing in the suite ever reopened anything**, so nothing could see a bug whose whole
shape is "what survives between sessions". `N-050`.

**2 · `T-046` — the dead ends, and the one that was not post-M0.** The plan was to grey out the
five P2 routes the way the three P3 items already are. Reading `41` first changed that:

> `/app/settings` … the `#words` anchor is linked from `<VocabularyChips>` on every console
> page, so it must land on the right card.

and `design_specs/design/11` §1 keeps the Words card while cutting billing, the danger zone and
the logo. So the **most-linked destination in the whole console** was a `<Placeholder>`, on an
M0 path, while `PROGRESS.md` said in good faith that no placeholder was behind one. Nobody had
followed a link out of a component into a cut-list.

Built it. `<WordsEditor>` was **extracted** from wizard step 4 rather than copied — `41` asks
for "the same five fields and the same live preview", which is only true if it is the same
component (`24` §4, `N-052`). Saving dispatches `labelsLoaded`, so the sidebar and the chip row
change with no reload, which is the ten-second proof repeated outside the wizard.

One thing that is deliberately not stored server-side: **which plurals are overridden**. A saved
plural that differs from `derivePlural(singular)` *is* the override. That is what makes the
hotel's "Staff / Staff" survive a reload instead of quietly becoming "Staffs" the next time
somebody edits the singular. There is a test for exactly that.

The rest of the sweep: Roles and People are `Soon`-disabled; the TopBar's *My account* is gone;
the structure panel's person links and the subjects table's linked-person column are plain text
until `34` and `47` exist. **Greying the sidebar item is only the visible half** — three other
places pointed at the same unbuilt pages and would have kept doing it. `N-051`.

Three existing tests failed on this and all three were asserting the old behaviour, which is
what you want a test to do. Updated, not deleted.

**Not touched:** `D-005`. Judging the design before its typography exists is judging something
nobody has seen — every heading and number in the product is still `system-ui`. Two woff2 files.

819 tests green (201 backend, 618 frontend), `audit:vocab` and `audit:drift` clean. Docs
updated: `12` §4.8 and §2 diagram, `15` § Session hygiene, `24` §4 + §8 + §9, `55` Stage 5,
`_MEMORY.md` MAP and `N-050`–`N-052`. Nothing committed.

---

### 2026-08-21 · First walkthrough of the running app — three findings, none fixed

Ran both servers and clicked through. **No code was changed**; this entry and `D-009`,
`D-010`, `D-005` are the whole output.

**1 · `D-009` — the CSRF failure is not flakiness, it is permanent, and the message lies.**
`endur.csrf` is set with no `maxAge`, so it dies with the browser. The session cookie has a
7-day `maxAge`, so it does not. Reopen the browser and you are **still signed in with no CSRF
token**, and every mutation answers *"Your session token was missing or invalid. Reload and
try again."* Reloading does nothing — the SPA never calls `GET /auth/csrf`, and the token is
only issued on login and register. Sign out and back in is the only remedy, and the message
does not say so. Reproduced with curl.

**2 · `D-010` — Roles, People and Settings are live links to "Not built yet".** The sidebar
already has the right mechanism — `disabled` + a `Soon` tag — and uses it for the three P3
items. `router/index.tsx` states the rule in its own header: *a stub page behind a dead link
is worse than a disabled item.* That rule was written for P3 and never extended to the five
P2-after-M0 routes, so the code is consistent with the rule as written and the rule is what
is wrong.

**3 · `D-005` — the "too simple, too AI-like" verdict has a concrete cause, and it is the
fonts.** `design_specs/design/01` §5 puts **Caprasimo on every heading, card title, KPI
number, button label and badge**. `public/fonts/` contains a README and nothing else, so all
of that is rendering in `system-ui` right now. The design layer itself is not thin —
`endur.css` is 1,451 lines over a vendored `organic.css` taken from the mockups — it is
running without the one input that carries the personality. The fonts README predicted this
sentence: *"until the files land… it just does not look like Endur."*

On the question of the frontend-design skill: it has not been used, deliberately. `CLAUDE.md`
makes `design_specs/` authoritative for visual design, and that skill gives generic aesthetic
direction that would pull against a spec this specific. **That call is worth re-opening once
the fonts are in**, because judging the design before its typography exists is judging
something nobody has seen yet.

`OPEN-002` stays open by decision — local URLs for now, no tunnel (21 Aug). The share sheet's
localhost warning is therefore expected, not a bug.

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
