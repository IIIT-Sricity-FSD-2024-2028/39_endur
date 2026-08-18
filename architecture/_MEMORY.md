# _MEMORY — Endur architecture ledger

```
FORMAT   append-only. never delete an entry; supersede it.
IDS      DEC decision · INV invariant · CONF source conflict · OPEN unresolved
         MAP doc→path lock · DRIFT staleness check · GLOSSARY term mapping
STATUS   ACTIVE | SUPERSEDED-BY:<id> | REVISIT:<date>
ORIGIN   U=user directive · A=analysis · S=source doc · D=derived from another DEC
READ     before any architectural change. cite the DEC id in the commit body.
SEED     2026-08-16 · repo 39_endur · branch vishv
```

---

## DEC — decisions

```
DEC-001  ACTIVE  2026-08-16  origin:U
  Express 5 + TypeScript for the API. NOT NestJS.
  driver   user directive; P1 evaluation grades middleware explicitly, and an explicit
           app.use() chain is legible in a way decorators are not.
  consequ  no DI container, no decorators, no @nestjs/*.
           DTO       -> zod schema  (was: class-validator class)
           Guard     -> middleware factory returning RequestHandler
           Pipe      -> validate() middleware
           Interceptor -> post-handler middleware (audit, envelope)
           Module    -> feature folder + router
  supersed BUILD_PLAN_EVAL1.md §5 "NestJS"; design_specs/design/* stack references
  see      12-MIDDLEWARE-STACK.md, 14-DTO-AND-VALIDATION.md

DEC-002  ACTIVE  2026-08-16  origin:U
  Full NODE/EDGE/GRANT permission engine, not the integer-level rule.
  driver   user asked for novelty + adjustable RBAC; it is also the P1 middleware showcase.
  consequ  requireCapability() is the single richest middleware in the chain.
           the integer-level "sees below their level within their subtree" rule survives
           only as a DERIVED DEFAULT that seeds grants at org creation — never as the
           enforcement mechanism itself.
  supersed BUILD_PLAN_EVAL1.md §2 "the one visibility rule"
  see      11-PERMISSION-ENGINE.md, customization.md §3 §5

DEC-003  ACTIVE  2026-08-16  origin:U
  TypeScript everywhere. Shared zod DTOs in packages/shared, imported by both apps.
  consequ  z.infer<> is the ONLY way types cross the wire. no hand-written duplicate
           interfaces. a DTO change breaks the client at compile time — intended.
  see      03-REPO-AND-TOOLING.md, 14-DTO-AND-VALIDATION.md

DEC-004  ACTIVE  2026-08-16  origin:U
  Three phases, aligned to evaluation: P1 MIDDLEWARE, P2 REACT, P3 REDUX.
  dates    P1 2026-08-16 -> 2026-09-20 | P2 -> 2026-11-01 | P3 -> 2026-12-13
  note     dates are estimates; the PHASE ORDER is the fixed part.
  see      02-PHASES-AND-EVALUATION.md

DEC-005  AMENDED-BY:DEC-015  2026-08-16  origin:U
  M0 = 2026-08-26 is a live graded checkpoint (demo 27 Aug).
  AMENDED 2026-08-18: the "React for M0 is deliberately thin" clause below is SUPERSEDED by
  DEC-015. the SPA is built in full. everything else in this entry still stands.
  tension  M0 needs React screens, but React is P2. ACCEPTED AND EXPLICIT:
           M0 is a VERTICAL SLICE. the React built for it is deliberately thin and is
           re-deepened in P2. do not treat M0 React as finished work.
  see      02-PHASES-AND-EVALUATION.md §M0, 50-SEED-AND-DEMO.md

DEC-006  ACTIVE  2026-08-16  origin:A
  PostgreSQL. alternatives considered and rejected:
    mongo  - org graph becomes app-side joins; no transactional grant writes. REJECT.
    neo4j  - fits edges, loses relational reporting + adds ops burden for a graph that is
             only ~10^2-10^3 nodes per tenant. REJECT.
    sqlite - no jsonb ops at the level needed, single-writer. REJECT (dev fixture only).
  need     WITH RECURSIVE (subtree scope) · JSONB (labels, meta, params, answer.value)
           · GIN indexes · real transactions (grant + audit written atomically)

DEC-007  ACTIVE  2026-08-16  origin:A
  Prisma as ORM, with a raw-SQL seam for graph queries.
  driver   BUILD_PLAN_EVAL1.md §5 recommends it; migration ergonomics matter under M0.
  seam     prisma cannot express recursive CTEs. ~4 queries go through $queryRaw behind
           typed wrappers in server/src/db/graph.ts. THIS IS THE ONLY PLACE raw SQL is
           allowed. see 10-DATA-MODEL.md §recursive.
  risk     if the graph query set grows past ~8, revisit drizzle. REVISIT:2026-10-01

DEC-008  ACTIVE  2026-08-16  origin:A  DEPENDS:DEC-004
  RTK store exists from P1 but stays thin. two slices only: authSlice, vocabularySlice.
  driver   makes P3 additive rather than a rewrite. user has not decided the P3 shape.
  forbid   do NOT put server data in the store during P1/P2 beyond those two slices.
           fetching in P1/P2 is a plain typed fetch wrapper (lib/api.ts).
  see      23-STATE-AND-REDUX.md, OPEN-001

DEC-009  ACTIVE  2026-08-16  origin:A
  Respondents never authenticate. opaque campaign token in the URL, no account, no cookie
  that identifies a person. anonymity is a schema property, not a UI setting.
  see      15-AUTH-AND-SESSIONS.md, 52-SECURITY-AND-PRIVACY.md

DEC-010  ACTIVE  2026-08-16  origin:S
  Six question types, frozen: rating, single, multi, text, yesno, nps.
  A poll is a one-question form. There is no separate poll entity, ever.
  forbid   date, file upload, matrix, ranking, branching, conditional logic, page sections.
           the Google-Forms artefacts in the mockup are NOT scope.
  source   BUILD_PLAN_EVAL1.md §4, design_specs/design/05 §5.3
  see      37-PAGE-form-builder.md

DEC-011  ACTIVE  2026-08-16  origin:A
  Entitlements (subscription tier) are enforced as a SEPARATE middleware from capabilities.
  driver   they answer different questions. capability = "may this person?";
           entitlement = "has this org paid for it?". conflating them makes the 402-vs-403
           distinction impossible and pollutes the grant table with billing concerns.
  see      12-MIDDLEWARE-STACK.md, 16-TENANCY-BILLING-ENTITLEMENTS.md

DEC-012  ACTIVE  2026-08-16  origin:A
  architecture/ never contains hex colours, font names, or spacing values.
  driver   design_specs/design/01-DESIGN-SYSTEM.md is the single source; duplication is
           guaranteed drift.
  verify   DRIFT-003

DEC-013  ACTIVE  2026-08-18  origin:U
  React SPA ONLY. no EJS, no MPA, no islands, no second frontend.
  context  the react course (already started) expects students to bring an EXISTING
           multi-page app and convert it to a SPA in class. we will have nothing to convert.
  offered  EJS MPA in P1 -> convert in P2. then: islands (EJS shell + react components
           growing into a SPA, matching the teacher's own "React Components => React SPA").
  decided  user rejected both. SPA only, built in full for M0.
  status   the tension is ACCEPTED KNOWINGLY. do not re-litigate. do not "helpfully" add an
           EJS baseline later.
  mitigat  54-COURSE-DELIVERABLE.md - the teacher's checklist mapped to our routes, plus a
           per-page MPA-vs-SPA contrast. one doc, not a second frontend.
  see      CONF-009

DEC-014  ACTIVE  2026-08-18  origin:U
  cookie sessions for STAFF auth. replaces JWT access+refresh.
  impl     express-session + connect-pg-simple. httpOnly Secure SameSite=Lax, rolling.
  why      same-origin SPA. no silent-refresh dance, no in-memory token, closes the whole
           XSS token-theft class. and it makes CSRF real -> a genuine extra link in the P1
           middleware chain instead of a line in its out-of-scope table.
  unchang  respondent opaque tokens (DEC-009) · API-key JWT (45) · argon2id · uniform login
           failure · per-IP+email rate limit
  KEEP     permissions resolved PER REQUEST from grants, never from a session claim.
           this property survives the auth change and is the reason it was safe to make.
  supersed 15 §2 token table · 20 §5 · 13 auth routes · 30 data contract
  consequ  + csrfProtection middleware (12) · session fixation regenerate-on-login
           - /auth/refresh endpoint deleted

DEC-015  ACTIVE  2026-08-18  origin:U  AMENDS:DEC-005
  the React SPA is built IN FULL for M0 (2026-08-26). not a thin slice.
  supersed DEC-005's "the React built for M0 is deliberately thin and is re-deepened in P2".
  note     M0 is still a vertical slice in the sense that it cuts all layers; what changed is
           that the React is not deliberately provisional. P2 deepens, it does not rebuild.
  risk     10 days. the M0 cut-list in 02 §2 is now load-bearing, not advisory.

```

---

## INV — invariants

```
INV-001  every user-facing domain noun resolves via useLabels(). zero hardcoded.
  exempt   structural product words: Home Settings Save Cancel Delete Results Template
           Question Response Campaign(as product concept) Sign in Preview
  verify   set all labels to nonsense, walk every screen, any english domain noun = bug.
  script   npm run audit:vocab
  source   design_specs/design/02 §4

INV-002  no education-specific identifier anywhere in code.
  banned   Course Faculty Student Semester Batch CourseOffering FacultyMember Marks
  allowed  ONLY as seed DATA values inside the university preset.
  verify   grep -riE '\b(course|faculty|student|semester)\b' apps/ packages/ --include=*.ts
           --include=*.tsx  ->  hits must all be in seed/presets/university.ts
  source   BUILD_PLAN_EVAL1.md §1

INV-003  authorisation decided in middleware only. never in a handler, never in React.
  corollar the API returns pre-filtered data. the UI never filters for permission reasons.
           out-of-scope rows are ABSENT, not greyed.

INV-004  deny beats allow, unconditionally. no scope, level, group, or delegation overrides.
  source   customization.md §5

INV-005  powers are scoped to the UNIT OF THE ASSIGNMENT, not to the person.
  meaning  Director-of-ProjectA gets nothing on ProjectB. Dean-of-Engineering gets nothing
           over Science. this is the single most important behavioural detail in the model.
  source   customization.md §5, §15 screen 4

INV-006  anonymity enforced in SQL. an anonymous response row has NO column that can be
  joined back to a person, not even hashed. results below k-anon threshold do not render.
  see      52-SECURITY-AND-PRIVACY.md

INV-007  every state-changing request writes an audit row IN THE SAME TRANSACTION,
  recording which grant decided it.

INV-008  one <QuestionInput> implementation, parameterised by readOnly. the builder preview
  and the live respondent form are the SAME components. never two.
  source   design_specs/design/11 §6

INV-009  one <UnitTree> component, three placements (wizard step 3, /app/structure,
  campaign audience picker). never fork it.

INV-010  tenant isolation: every query touching tenant data filters by orgId, injected by
  tenantResolver middleware, never taken from a request body.
```

---

## CONF — source conflicts and resolutions

```
CONF-001  stack.  BUILD_PLAN_EVAL1.md §5 + design_specs/design/* say NestJS.
  RESOLVED -> Express. see DEC-001. BUILD_PLAN_EVAL1.md is SUPERSEDED on stack only;
  it REMAINS AUTHORITATIVE for the demo script (§6) and the risk table (§7).

CONF-002  permission model. BUILD_PLAN_EVAL1.md §2 integer-level rule
  vs customization.md §3 NODE/EDGE/GRANT.
  RESOLVED -> GRANT engine. see DEC-002. the level rule survives as a seeded default.

CONF-003  accent value. design_specs README §"the one conflict" already records this: the
  analysis dashboard and the form builder use different blue overrides.
  RESOLVED upstream -> the form-builder token set wins (design_specs/design/01 §2).
  architecture/ deliberately does not restate either value; it only records that the
  conflict is closed. see DEC-012.
  consequ  when porting the analysis mockup, swap its :root block wholesale, do not merge.

CONF-004  negative sentiment painted in brand accent (analysis mockup).
  RESOLVED upstream -> semantic status ramp added in design_specs/design/01 §2b.
  architecture consequence: results/analysis DTOs carry an explicit `valence` field so the
  client never infers good/bad from a number's sign. see 40-PAGE-results.md.

CONF-005  redux absent from design_specs entirely, but is a P3 evaluation criterion.
  RESOLVED -> DEC-008 thin store now, OPEN-001 for the P3 shape.

CONF-006  scope breadth. SCOPE.md describes communities, announcements, voting, multichannel
  delivery. BUILD_PLAN_EVAL1.md §4 declares them out.
  RESOLVED -> out for P1/P2. P3 stretch at best. they appear in the sidebar DISABLED with a
  "Soon" tag (design_specs/design/02 §7) and nowhere else. no stub pages.

CONF-007  root docs (README.md, definitions.yaml, DomainExpertInteraction.md, SRS.pdf)
  describe the education-only v1 scope.
  RESOLVED -> STALE. superseded by design_specs/SCOPE.md + 01-PRODUCT-CONTRACT.md.
  definitions.yaml survives ONLY as the source of GLOSSARY below. do not cite it as current.

CONF-008  customization.md §14 says "build the board (Tier 2) before the wizard (Tier 1)".
  BUILD_PLAN_EVAL1.md and design_specs/design/03 make the wizard the centrepiece and build
  it first.
  RESOLVED -> wizard first, BUT it writes into the same canonical objects the board will
  later edit. the wizard is a generator, never a parallel store. this satisfies the real
  concern behind customization.md §13 "a wizard that produces unmaintainable state".
  the Tier-2 board itself is P3.
```

CONF-009  react course vs our stack. teacher's pre-preparation message (2026-08-18) requires
  an EXISTING MULTI-PAGE APP to convert to a SPA in class; course objective is literally that
  conversion. our architecture builds a SPA directly -> nothing to convert.
  RESOLVED -> SPA only. see DEC-013. user decided after being offered an EJS MPA and an
  islands path, both declined.
  WHY NOT A PROBLEM (user, 2026-08-18):
    1. the project is being rebuilt FROM SCRATCH. there is no pre-existing app of any kind to
       bring, MPA or otherwise. the course accepts a from-scratch project.
    2. react/SPA are not graded until P2. building them in P1 is work done EARLY, not work
       done out of order.
    -> the conversion is a teaching device we skip, not a deliverable we miss.
  RESIDUAL  low. every other teacher requirement is met and met strongly (express backend,
  working API+DB, page inventory, git). mention it to the teacher as a courtesy; it is not a
  risk to manage. talking points in 54-COURSE-DELIVERABLE.md §1.
  NOTE      an earlier draft framed this as urgent and time-sensitive. that was overweighted;
  corrected here so the framing is not re-inherited.

---

## OPEN — unresolved

```
OPEN-001  REVISIT:2026-10-15  blocks:nothing-before-P3
  P3 redux shape. user: "i dont know about redux rn".
  recommendation on file: RTK Query for server state + hand-written slices for
  builder draft / wizard / ui, plus 2 custom store middlewares (autosave, capability
  cache) so the middleware theme carries through to the redux evaluation.
  alternative: thunks-only, more visible reducer work, more boilerplate.
  see 23-STATE-AND-REDUX.md

OPEN-002  REVISIT:2026-09-20
  hosting / deploy target for the M0 demo QR code. localhost will not scan from a phone.
  candidates: cloudflare tunnel, ngrok, LAN IP + hotspot. must be decided by 2026-08-24.
  risk carried in BUILD_PLAN_EVAL1.md §7 "venue network failure".

OPEN-003  REVISIT:2026-11-01
  analysis engine: themes/sentiment. rule-based vs LLM-assisted. affects 43-PAGE-analysis.md
  and whether an API key/cost enters the stack. not needed before P3.

OPEN-004  team member 3 does not use Claude. their work split is unassigned in
  02-PHASES-AND-EVALUATION.md §work-split. fill in when known.

OPEN-005  REVISIT:2026-08-22  blocks:M0
  NOTHING OWNS SCHEDULED WORK. found 2026-08-16 while filling reserved slots.
  affected: campaign scheduled->open->closed (M0-CRITICAL, a campaign that never opens has
  no working QR), temporary unit + position expiry, delegation windows, seat recompute,
  webhook retry, refresh-token cleanup.
  leading answer: derive campaign status ON READ from starts_at/ends_at/closed_at instead of
  running a scheduler. no timer, no stuck state, no new demo-day failure mode.
  IF ADOPTED: campaign_status stops being a stored column -> amends 10 §4.3 and 38.
  record as a DEC when decided. see 17-BACKGROUND-JOBS.md.
```

---

## MAP — doc → source path lock

Two people drive Claude in parallel. Before creating or heavily editing a path, confirm the
owning doc. One doc owns a path; a second doc may read it but must not restructure it.

```
CLAUDE.md                        -> /CLAUDE.md
_MEMORY.md                       -> architecture/_MEMORY.md
03-REPO-AND-TOOLING.md           -> /package.json /tsconfig*.json /.env.example /.github
10-DATA-MODEL.md                 -> apps/api/prisma/** apps/api/src/db/**
11-PERMISSION-ENGINE.md          -> apps/api/src/authz/**
12-MIDDLEWARE-STACK.md           -> apps/api/src/middleware/** apps/api/src/app.ts
13-API-CONTRACT.md               -> apps/api/src/routes/** (router wiring only)
14-DTO-AND-VALIDATION.md         -> packages/shared/src/dto/**
15-AUTH-AND-SESSIONS.md          -> apps/api/src/auth/**
16-TENANCY-BILLING-ENTITLEMENTS  -> apps/api/src/billing/**
17-BACKGROUND-JOBS.md            -> PLACEHOLDER. no path owned yet. see OPEN-005.
18-OBSERVABILITY-AND-OPS.md      -> PLACEHOLDER. no path owned yet.
20-FRONTEND-ARCHITECTURE.md      -> apps/web/src/main.tsx router/** lib/api.ts
21-DESIGN-SYSTEM-BINDING.md      -> apps/web/src/design-system/**
22-VOCABULARY-SYSTEM.md          -> apps/web/src/lib/labels.ts
23-STATE-AND-REDUX.md            -> apps/web/src/store/**
24-COMPONENT-INVENTORY.md        -> apps/web/src/components/**
25..29                           -> PLACEHOLDERS. 29 is unassigned. no paths owned.
30..45 page docs                 -> apps/web/src/pages/<world>/<Page>/**
                                    + apps/api/src/features/<feature>/**
46-PAGE-home-dashboard.md        -> apps/web/src/pages/console/Home/**
47-PAGE-profile.md               -> apps/web/src/pages/console/Profile/**
48-FEATURE-file-upload.md        -> apps/api/src/features/uploads/**
                                    apps/web/src/components/form/FileUpload*
54-COURSE-DELIVERABLE.md         -> docs only. hand to the react teacher.
55-BUILD-ORDER.md                -> docs only. the T-### task backlog. PLAN.
/PROGRESS.md                     -> repo root. THE LIVE STATE. every session updates it.
                                    board + session log + open decisions + debt.
                                    stale PROGRESS is worse than none - sessions trust it.
60..63                           -> PLACEHOLDERS, P3 stretch. no paths owned.
                                    these are the 4 disabled "Soon" sidebar items. CONF-006.
                                    RENUMBERED from 46..49 on 2026-08-18 to free the page
                                    block. do not renumber back.
50-SEED-AND-DEMO.md              -> apps/api/prisma/seed/** apps/api/src/presets/**
51-TESTING-STRATEGY.md           -> **/*.test.ts apps/api/test/** e2e/**
52-SECURITY-AND-PRIVACY.md       -> cross-cutting; owns no path, constrains all
53-NOVELTY-CLAIMS.md             -> docs only

CONTESTED  apps/web/src/components/** is written by 24 but consumed by every page doc.
           rule: a page doc may NOT add a component. it requests one in 24 first.
           source: design_specs/design/09 preamble.
```

---

## DRIFT — checks to re-run when a source changes

```
DRIFT-001  design_specs/design/01 changed -> re-verify 21-DESIGN-SYSTEM-BINDING.md token
           names still match; no values were copied (DEC-012).
DRIFT-002  design_specs/design/02 route map changed -> re-verify 13-API-CONTRACT.md and
           every page doc's `Route & access` line.
DRIFT-003  npm run audit:drift  scans architecture/ for literal design values: hex colours,
           the two font family names, and spacing token references (patterns live in
           scripts/audit-drift.mjs, NOT here, so the check cannot match its own definition).
           expected: ZERO hits. any hit violates DEC-012.
DRIFT-004  capability strings. every `capability:` line in a page doc must exist in the
           catalogue in 11-PERMISSION-ENGINE.md §3. cross-check before each phase gate.
DRIFT-005  customization.md changed -> re-verify 11-PERMISSION-ENGINE.md resolution
           algorithm and 33-PAGE-roles-and-powers-grid.md grid semantics.
DRIFT-006  a new question type is proposed -> it violates DEC-010. reject or supersede.
```

---

## GLOSSARY — v1 education terms → v2 generic terms

`definitions.yaml` (2026-03-11) is education-only and stale (CONF-007). This is the mapping.
The left column may appear only as seed data in the university preset.

```
v1 education term        v2 generic model        notes
--------------------------------------------------------------------------------
Course                   Subject                 the thing being reviewed
CourseOffering           Subject (unit-scoped)   subject already carries unitId
Faculty / FacultyMember  Reviewee                a Subject with linkedUserId set
Student                  Respondent              never an account holder
HOD / Dean               Role at a level         rows, not enum values
Department / School      OrgUnit                 self-referencing tree
Semester                 —                       dropped. campaigns carry their own dates
FeedbackCycle            Campaign                one template + audience + window
EvaluationParameter      Question                a row in the form
PerformanceScore         Answer.value            typed by question kind
GapAnalysis              P3, improve loop        44-FEATURE-improve-loop.md
SelfReflection           P3, improve loop        must be submitted BEFORE results visible
ActionReport             ActionPlan (P3)
ReviewCheckIn            CheckIn (P3)
ComplianceAudit          audit_log               INV-007
Attendance weighting     —                       DROPPED. no v2 requirement carries it.
Review of Reviews        a Campaign whose Subject is the feedback process itself
                                                 — falls out of the generic model for free,
                                                   needs no feature. good viva answer.
```

---

## NOTES — things that cost time if forgotten

```
N-001  git working tree at seed had 305 deletions staged (all of v1). that was deliberate.
       do not "restore missing files".
N-002  design_specs/design/*.dc.html + _ds/ are MOCKUP EXPORTS, not source. read them for
       component anatomy; never import from them.
N-003  the vocabulary chip row is the demo's ten-second proof. it renders on EVERY console
       page and nothing else occupies that position.
N-004  the share sheet / QR is the highest-risk component in the whole build
       (design_specs/design/09 §2.16). build it before the respondent flow, not after.
N-005  the simulator ("why was this allowed?") is the cheapest trust-builder and the best
       viva artefact. it is a thin read-only wrapper over the SAME resolver the middleware
       uses — if it is ever a second implementation, it is worthless.
N-006  "a poll is a one-question template" (DEC-010) is worth stating out loud in the viva.
       it is the clearest example of generality replacing a feature.
N-007  NAMING COLLISION, deliberate: capabilities are present-tense verbs (campaign.launch,
       campaign.close); webhook events are past-tense (campaign.launched, campaign.closed,
       response.submitted). they share a namespace shape and are NOT the same list.
       never resolve a webhook event name against the capability catalogue. see 45.
N-010  PRE-BUILD AUDIT 2026-08-18 found 7 buildability gaps the structural greps could not
       see. pattern worth remembering: a DECISION CHANGE (DEC-014 auth) propagated to the
       docs that DISCUSS it but not to the ones that IMPLEMENT it — schema, env, config
       example, and the auto-loaded CLAUDE.md stack table.
       WHEN A DEC CHANGES, GREP FOR THE OLD MECHANISM, NOT THE TOPIC.
       also found: 11 §8 <-> 50 §1 grant matrix was a CIRCULAR reference, each pointing at
       the other, neither holding the table. 50 §1 now holds it and is authoritative.
       lesson: "specified in X" is only true if X actually contains it. check both ends.
N-009  WORKING MODEL for multi-session builds, set 2026-08-18:
       /PROGRESS.md          live state. read first, update last, same commit as the work.
       55-BUILD-ORDER.md     the plan. T-### ids are permanent, never reused.
       _MEMORY.md            decisions. PROGRESS records THAT one was made and links here.
       three catalogues are authoritative and additions go in them BEFORE code:
         capabilities -> 11 §3   components -> 24   endpoints -> 13
       that rule is what kept 52 docs consistent across three revisions. an audit on
       2026-08-18 found the ONE place it was skipped: docs 46/47/48 added endpoints without
       registering them in 13. fixed. do not skip it again.
N-011  LOCAL DEV DATABASE, 2026-08-18. 03 §5 specifies Postgres 16 via docker compose and
       docker-compose.yml is committed and still correct. but the machine this was built on
       has NO DOCKER, so postgres 16.14 is installed natively via
       scripts/install-postgres.sh (same version, same endur/endur credentials, same
       DATABASE_URL — nothing downstream can tell which one it is talking to).
       WSL DOES NOT START SERVICES AT BOOT: `sudo service postgresql start` after a restart,
       or every db command fails with a connection error that looks like a config problem
       and is not.
N-012  prisma.config.ts exists in apps/api and is NOT in any doc. two reasons it had to:
       prisma reads .env from its OWN directory and ours lives once at the repo root, and
       package.json#prisma is deprecated in prisma 7. it deliberately lets a REAL env var
       win over the .env file, so `DATABASE_URL=... prisma migrate` against a scratch
       database is not silently redirected at the main one.
N-013  the init migration is prisma-generated PLUS ~90 lines of hand-written SQL appended
       to the same file: CHECK constraints, partial indexes, INCLUDE and GIN indexes, the
       DEFERRABLE unique on questions(template_id, position), and the anonymity trigger.
       PRISMA CANNOT EXPRESS ANY OF THESE. if the schema is ever regenerated from
       schema.prisma alone, all of it silently disappears and the app still runs — which is
       exactly what makes it dangerous. 10 §11 has acceptance items for them; they were all
       verified against a live database on 2026-08-18.
N-008  DRIFT-003/004 must be implemented in scripts/audit-drift.mjs and NOT restated as
       literal grep patterns inside architecture/, or the check matches its own definition.
       this already bit once on 2026-08-16.
```
