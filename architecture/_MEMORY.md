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

DEC-016  ACTIVE  2026-08-19  origin:U  RESOLVES:OPEN-005
  campaign status is DERIVED ON READ. there is no scheduler and no stored status column.
  rule     closed_at set          -> closed
           public_token null      -> draft
           starts_at in future    -> scheduled
           ends_at in past        -> closed
           otherwise              -> open
  driver   a scheduler is a timer that can be down, be late, or leave a campaign stuck
           between states. the M0 demo cannot afford a failure mode whose symptom is
           "the QR code 404s and nobody knows why". derivation cannot drift from the
           dates because it IS the dates.
  consequ  campaigns.status column DROPPED, campaign_status enum dropped.
           + campaigns.closed_at added.
           the anonymity trigger keyed on status is re-keyed on public_token: a campaign
           holding a minted token has left draft, which is the same statement against the
           column that now carries the truth.
           status is computed in ONE place, features/campaigns/status.ts, and every read
           path calls it. a second copy of these five lines is the drift this avoids.
  supersed 10 §4.3 stored status · 38 status handling · 17's campaign section
  see      17-BACKGROUND-JOBS.md, 38-PAGE-campaigns.md

DEC-017  ACTIVE  2026-08-19  origin:U
  the campaign public token is 8 characters from a 31-character unambiguous alphabet:
  23456789ABCDEFGHJKMNPQRSTUVWXYZ  (no 0 O 1 I L).
  driver   38 asked for "6 characters and typeable aloud", but tenantResolver already
           required 8-128 in its path pattern, and 6 characters of this alphabet is ~30
           bits — guessable often enough to matter for a link that needs no credential.
           8 characters is ~40 bits and still reads aloud without spelling corrections.
  supersed 38 § Acceptance "the URL token is 6 characters"

DEC-018  ACTIVE  2026-08-19  origin:A
  GET /templates/library requires template.read; GET /authz/capabilities requires org.read.
  driver   13 §3 lists both with no capability, which would force an entry in the
           route-enumeration test's PUBLIC_ROUTES allowlist. that allowlist exists to be
           hard to add to — every entry is a route no guard protects forever.
  fact     no M0 screen reaches either without a session: the wizard, the library browser
           and the powers grid are all inside the console. org.read is seeded to every
           role including L4, so the catalogue stays readable by everyone who can log in.
  supersed 13 §3 "—" on those two rows

DEC-019  ACTIVE  2026-08-19  origin:A
  the capability set on GET /auth/me is "held ANYWHERE in the org", not "held on a target".
  a capability is listed when the caller has >=1 live allow grant for it, minus any
  capability denied ORG-WIDE (scope=all, no anchor unit). authz/held.ts.
  driver   the UI's question is weaker than the resolver's. useCan() asks "is this button
           worth rendering at all"; resolve() asks "may you act on THIS row". computing the
           strong answer per capability would be ~60 resolver calls per boot for a cosmetic
           result.
  fact     a UNIT-ANCHORED deny is deliberately NOT subtracted. subtracting it would hide a
           button the person can legitimately use in the unit next door.
  cost     the caller can occasionally see an action the server then refuses with a 403 and
           its trace. that is a confusing button, not a hole: INV-003 holds because
           requireCapability() decides on every route and this list decides nothing.
  see      13 § Auth, 20 §6, src/backend/authz/held.ts, src/backend/test/me.test.ts

DEC-027  ACTIVE  2026-08-22  origin:owner
  the display and body faces were both replaced. WHICH faces is a design value and is NOT
  recorded here — tokens.css owns the @font-face blocks and the family tokens beside them,
  and that file is the only place the names appear. (audit:drift enforces this; an earlier
  draft of this entry named all four faces and the audit failed on it.)
  driver   requested by the owner. the outgoing display face carried a single weight and
           had no usable body companion at reading size, which is why every heading in the
           product was one weight and every attempt at hierarchy had to be made with size
           alone. the incoming pair is variable across four weights.
  fact     both faces stay SELF-HOSTED, subset, and served from public/fonts.
  fact     the new display face runs wide and needs negative tracking at display sizes;
           --track-display and --track-heading exist for that and are applied in
           endur.css, never inline.
  fact     <Icon>'s stroke-width came down in the same pass. the old weight was chosen to
           match the old display face; against the new one every icon read as a bold
           accent beside its own label.
  supersed 21 §4's named faces. the SELF-HOSTED rule in 21 §4 is unchanged and is why
           there is still no @import of a font CDN.

DEC-028  ACTIVE  2026-08-22  origin:owner
  the product ships light AND dark. every colour token is declared twice — once on :root,
  once under [data-theme="dark"] — so no component ever learns which theme it is in.
  driver   requested by the owner.
  fact     the choice is THREE-valued: light | dark | system, stored in localStorage under
           `endur.theme`. system is the default and keeps following the OS; picking a side
           stops that. a two-state switch would have to lie about one of the three.
  fact     theme is a property of the DEVICE, not the session — it never touches the store
           or the API, so a shared machine does not carry one person's theme to the next.
  fact     an inline script in index.html sets data-theme BEFORE first paint. without it a
           dark-mode machine renders light and flips, which is a white flash in a dark
           room. that script and lib/theme.ts duplicate the same key and the same fallback
           ON PURPOSE and must be changed together.
  fact     the swap is a View Transitions circular wipe from the control that was pressed.
           it degrades to an instant set where the API is missing or reduced-motion is on.
  see      lib/theme.ts, components/ThemeToggle.tsx, tokens.css, index.html

DEC-029  ACTIVE  2026-08-22  origin:owner
  surfaces are translucent — tint + backdrop blur + hairline edge + inset top sheen, all
  four together. chrome (top bar, rail, menus, dialogs, drawer) sits at ~58% tint; content
  cards sit at ~88% and still read as paper.
  driver   requested by the owner ("apple glass theme on the whole website").
  fact     THE ONE OVERRIDE survives. white still means "the thing you are working on";
           content cards were made glass at a tint that reads as white rather than being
           left opaque, so the rule holds and the material is consistent.
  fact     <AmbientBackground> is part of this decision, not decoration on one page. a blur
           with nothing behind it is a grey rectangle, so the glass needs a field with
           colour and variation under it. it draws the org graph — nodes and edges, with a
           pulse travelling one now and then — because the field may as well say something
           true.
  cost     @supports not (backdrop-filter) drops every surface back to opaque. without that
           branch, Firefox <103 and old iOS render the tint alone: unreadable text over a
           moving background.

DEC-030  ACTIVE  2026-08-22  origin:owner
  illustrations get their own ramp (--illus-*): an ink, a paper, and three fills, with rose
  as a rare accent. line art — dark outline, flat fill, drawn on by animating
  stroke-dashoffset.
  driver   requested by the owner, with a reference style. the status ramp is strictly
           semantic (01 §2b, CONF-004) and could not be borrowed for artwork; the two brand
           accents alone are not enough to draw a scene with.
  fact     rose NEVER appears in chrome, navigation or a control. one or two elements per
           drawing, and nowhere else in the product.
  fact     the SVGs are INLINED (?raw + dangerouslySetInnerHTML), not <img> or <object>,
           so var(--illus-*) resolves against tokens.css and one drawing serves both
           themes. through <img> the SVG is a separate document and would stay light.
  fact     the animation is CSS keyframes, not SVGator's JS player: CSS runs on injected
           markup where an injected <script> does not, and the global reduced-motion rule
           neutralises it for free — leaving the finished drawing, which is the correct
           still.
  see      components/illustrations/, tokens.css § Illustration ramp

DEC-031  ACTIVE  2026-08-22  origin:owner
  every number on the home dashboard is measured over a RANGE the reader picks — today,
  7 days, 30 days, all time — and 30 days is the default. GET /home takes ?window=.
  driver   requested by the owner: "a lot of stats are unintuitive, like who cares how many
           responses had been received all time". an all-time total only goes up, prompts
           no action, and by month three is large enough to read as decoration.
  fact     stats.responsesTotal and stats.responsesToday are GONE. today is a range now, and
           the total was the thing being complained about. two cards were replaced: subjects
           covered (distinct subjects with >=1 response in the range, which says whether
           feedback is spread or concentrated) and the response rate, now windowed.
  fact     stats.activeCampaigns is deliberately NOT windowed. it is a fact about the
           present, and the card says "collecting right now" so it cannot be misread as
           "open at some point in the last 30 days".
  fact     stats.responsesEver survives, is never rendered, and exists for ONE decision:
           whether the org has ever collected anything. the "you are new here" empty state
           reads that and not the windowed count — otherwise a two-year-old organisation
           gets the welcome screen, with its range control hidden, every quiet month.
  fact     the response-rate DENOMINATOR is restricted to campaigns that were actually
           collecting during the range (features/home/service.ts collectedDuring). charging
           a campaign closed last year against this week is N-043's mistake in the time
           dimension — a denominator from one period over a numerator from another.
  fact     the k-anon gate still keys off the ALL-TIME campaign total, not the windowed one.
           gating on the window would make a campaign enter and leave the rate as the range
           moved, which reads as a bug and leaks the same aggregate to anyone who presses
           two buttons.
  fact     window is validated with .default AND .catch, the only DTO here that tolerates
           junk. a range is a display preference; a stale bookmark must not 400 the first
           screen after sign-in. nothing is written or authorised from it.
  fact     midnight is the SERVER's midnight, as the old "today" card already assumed. exact
           boundaries need a timezone on the organisation, which is a schema change and was
           not taken here.
  holds    CONF-017 STILL STANDS. a window makes a previous period measurable, which removes
           one of CONF-017's three reasons and neither of the other two — 46 § Out of scope
           rules trends off this page by name and § Purpose forbids it becoming an analysis
           surface. counts, never directions; <TrendChip> remains unbuilt.
  supersed 46 § Data contract's stats shape, and 46 § Components' four cards.
  see      dto/home.ts, features/home/service.ts, pages/console/Home/cards.ts

DEC-032  ACTIVE  2026-08-23  origin:eval-1 criteria
  what     LOGS AND ERRORS ARE WRITTEN TO ROTATING FILES ON DISK, IN ADDITION TO STDOUT.
           two streams via pino.multistream: logs/app-<date>.log (everything) and
           logs/error-<date>.log (warn and above). daily + 10MB rotation, 14-day retention.
  why      the first evaluation requires logs and error information stored in files at
           regular intervals, and lib/logger.ts had a level and a redact list and NO
           DESTINATION -- everything went to stdout and died with the process.
           IN ADDITION TO, never instead of: stdout is what a container platform and
           npm run dev read. a separate error file is not duplication -- "error
           information should be stored" is a distinct requirement with a distinct
           reader, and it must not require grepping megabytes of 200 OK.
  cost     a logging mistake now persists for 14 days instead of one terminal session.
           the redact list stops being belt-and-braces and becomes load-bearing.
  holds    a logging failure must NEVER take the app down. unopenable stream -> say so on
           stdout and keep serving.
  see      18-OBSERVABILITY-AND-OPS.md (written from placeholder by this decision)

DEC-033  ACTIVE  2026-08-23  origin:owner  resolves:OPEN-007
  what     A PLATFORM OPERATOR IS A SEPARATE PRINCIPAL KIND WITH A SEPARATE ACCOUNT TABLE,
           A SEPARATE AUTH SURFACE, A SEPARATE CAPABILITY CATALOGUE AND A SEPARATE DB SEAM.
           two fixed roles: owner (business, sees revenue) and staff (support, does not).
           never a User, never a Grant, never an is_superuser flag.
  why      every mechanism the product has for expressing authority is org-shaped BY
           CONSTRUCTION: GrantScope stops at `all` = one org; db/tenant.ts stamps orgId on
           every query and lint forbids the raw client outside that seam; INV-010 forbids
           an orgId from anywhere else. those three ARE the isolation guarantee we sell.
           a bypass ordinary services could reach would turn a structural guarantee back
           into a remembered one -- the trade D-003 already regrets making once.
  cost     a second account table, a second login, a second guard, a second audit table.
           accepted: the payoff is that no grant and no column can make an org admin into
           an operator, so the question cannot be got wrong later.
  holds    INV-011. requireCapability and requirePlatform NEVER appear on the same route.
           MFA is required for operators and is NOT deferred like other security work --
           one stolen operator password exposes every customer at once.
  see      19-PLATFORM-OPERATORS.md, 70, 71

DEC-034  SUPERSEDED-BY-DEC-035  2026-08-23  origin:owner
  what     `billing.update` NO LONGER MEANS "SET A TIER". it means "start a plan change
           from inside the org" -- the 49 checkout, which REQUESTS a change and never
           writes subscriptions.tier. the authoritative write is platform.plan.override
           (19 §4) or the checkout's own server-side completion.
  why      16 §8 put POST /billing/tier behind billing.update, which is an ORG capability.
           as written, an org administrator could be GRANTED the power to set their own
           tier -- a free upgrade to Enterprise, in a product whose revenue model is
           tiers. there was no bug to point at: the grant system would have worked
           exactly as designed. found 2026-08-23 while writing 19.
  supersed 16 §8's capability column for the POST /billing/tier row.
  holds    the powers grid may now hand out billing.update safely. it could not before.
  status   SUPERSEDED SAME DAY by DEC-035, which deletes the checkout this split hung on.
           kept in full because the HOLE it names is real and would come straight back if
           pricing ever returned. read DEC-035 with it, never instead of it.
  see      19 §8, 49-PAGE-plan-and-billing.md, 16 §8

DEC-035  ACTIVE  2026-08-23  origin:user
  what     ENDUR HAS NO PRICES. no amounts, no currency, no checkout, no payment
           processor, no invoice, NO plan_prices TABLE. an organisation JOINS a tier:
           one button per tier in 49, POST /billing/tier, subscriptions.tier is written,
           and the entitlement gate answers differently from the next request.
           billing.update writes the tier again -- deliberately.
  why      user, 2026-08-23: "leave out pricing cause this aint an actual product anyway,
           just add a button to join and directly make them join that tier". a course
           project cannot take money, and a faked checkout demonstrates nothing the
           middleware chain does not already demonstrate.
  supersed DEC-034 (the billing.update split -- no checkout left to split around).
           16 §8's "payment collection is absent" framing: it is now ABSENT BY DESIGN,
           not deferred. 19 §10's plan_prices table: DELETED, not unseeded.
           71 stops being a revenue page -- see the rename below.
  holds    THE PARTS THAT WERE EVER INTERESTING SURVIVE UNTOUCHED: the entitlement gate
           (16 §3), requireEntitlement's 402, the seat meter and billable_seats (16 §5),
           the over-limit asymmetry (16 §6, collection never stops), and the trial
           (16 §7). a plan with no price still has a SIZE and still gates SURFACES.
           the protection that remains on billing.update is that it is a CAPABILITY:
           grantable, denyable, deny-wins, audited, seeded to administrators only,
           resolved in middleware and never in a handler.
           a join is audited -- with no invoice, audit_log is the ONLY record it happened.
  renamed  71-PAGE-platform-revenue.md -> 71-PAGE-platform-analytics.md
           platform.revenue.read       -> platform.analytics.read
           <RevenueChart>              -> <GrowthChart>
           reports in ORGS, SEATS and ACTIVITY. MRR would have been a constant times a
           count, which is a count with false confidence attached.
  see      49, 71, 19 §8, 19 §10, 16 §8, 24 §6b

DEC-036  ACTIVE  2026-08-23  origin:claude  resolves:OPEN-008
  what     FILE UPLOAD STRIPS METADATA, IT DOES NOT RE-ENCODE. lib/imageBytes.ts sniffs
           the real format from magic bytes, reads dimensions from the header, and removes
           JPEG APP1/APP13/COM, PNG eXIf/tEXt/zTXt/iTXt/tIME, and WebP EXIF/XMP chunks
           (clearing the VP8X flag bits with them). the pixel data is untouched.
  why      re-encoding needs an image library (sharp, and it is a native build). there is
           no image dependency in the API today and installing one unasked is not a call
           to make -- the user has said so before, and OPEN-008 recorded it as theirs.
  supersed 48 § Validation's "Re-encode: ALWAYS. Never store the uploaded bytes".
  holds    THE PRIVACY PROPERTY SURVIVES: GPS, device ids, author names and embedded
           thumbnails do not reach disk, and a test uploads a GPS-tagged JPEG and greps
           the stored bytes for it.
  risk     STATED, NOT HIDDEN: stripping does not neutralise a polyglot whose payload is
           inside the image data. what makes that survivable is the rest of the design --
           stored bytes are only ever SERVED, with a sniffed Content-Type, nosniff and
           Content-Disposition: inline, never executed and never parsed as anything else --
           plus 48's standing rule that RESPONDENT UPLOADS ARE OUT OF SCOPE, which is
           where a hostile file would actually come from.
  reverse  if a library is approved, stripMetadata() is the ONE function to replace and
           48 § Acceptance is the checklist it has to keep passing.
  see      48 § "Re-encode -> strip", OPEN-008, src/backend/lib/imageBytes.ts

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
  verify   grep -riE '\b(course|faculty|student|semester)\b' src/ packages/ --include=*.ts
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

INV-011  a platform operator reads COUNTS, NEVER CONTENT. no operator capability, in any
         role, resolves to a response body, an answer, a free-text comment or a respondent
         identity -- enforced by the platform db seam returning aggregates only, not by a
         UI that declines to render them. an Endur employee with a "read any response"
         button makes 01 §6, 52 and INV-006 all false at once. see 19 §5.

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

CONF-018  RESOLVED  2026-08-23  48-FEATURE-file-upload.md  vs  the evaluation-1 criteria
  48 IS TAGGED "Phase: P2". THE FIRST EVALUATION MAKES FILE UPLOAD MANDATORY, AND THAT
  EVALUATION IS P1.
  the criteria name five middleware types that must be implemented "wherever applicable"
  and list file upload among them. 02 §3 Deliverables does not mention uploads at all;
  02 §4 lists 48 under the PHASE 2 checklist. so every doc we have puts this after the
  evaluation that requires it.
  WHAT ALREADY EXISTS, WHICH IS MORE THAN THE TAG SUGGESTS: the File model is in 10 and
  migrated; src/backend/storage/ exists and is gitignored; <FileUpload> is in the 24
  catalogue with its props; 48 itself is a complete spec down to the acceptance list.
  WHAT DOES NOT EXIST: any multipart parser. no multer, no busboy, no formidable in
  src/backend/package.json. no route. no service. the File model is referenced by nothing.
  storage/ is empty. AND 12 §4.4 claims "CSV import uploads bypass this with a streaming
  parser and its own 5 MB cap" — that describes code that was never written; the import
  takes a CSV as a STRING in a JSON body (D-016).
  RESOLVED 2026-08-23 -> 48 IS RE-TAGGED P1 and pulled into evaluation scope; README's
  page table and 13 § Uploads carry the multipart routes. it is the only reading that does
  not leave a mandatory criterion unbuilt.
  12 §4.4 STILL CLAIMS A STREAMING CSV PARSER THAT DOES NOT EXIST -- that half is D-016 and
  is repaid with T-065, when a real multipart path arrives and the sentence becomes true
  for uploads even though it never was for CSV.
  BLOCKED ON OPEN-008 for scope: whether 48's "always re-encode" survives into P1 decides
  whether this is a parser plus a disk write, or a parser plus an image pipeline.
  see PROGRESS.md Stage E, T-061, T-062, D-016, D-017.

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

CONF-010  the vendored organic styles.css carries its OWN :root — the original WARM
          palette — and 21 §2 orders tokens.css FIRST, which would let the warm block
          win the cascade and repaint the entire product terracotta.
          design_specs/design/01 §2 already says the answer: "when porting, swap its
          :root block for this one."
          RESOLVED 2026-08-19: design-system/organic.css vendors the COMPONENT LAYER only
          — the source file from `body {` onward. Its :root block and its
          fonts.googleapis.com @import are dropped, because 21 §2 defines this file as
          "the base component layer" and 21 §4 gives tokens.css ownership of @font-face.
          The documented import order is therefore kept intact and the palette is correct.
          Re-vendoring stays mechanical: `tail -n +66 <source> >> organic.css`.
          amended  21 §9's "byte-identical to the vendored source" -> "byte-identical from
                   `body {` onward", and 21 §2's endur.css row, which listed the status
                   ramp that 21 §3 puts in tokens.css. properties are tokens; the classes
                   that consume them are components.

CONF-011  /start's field list. 30 § Create organization says "org name, industry picker,
          owner name, email, password" and to redirect to /app/setup "with the chosen
          industry preselected". design_specs/design/03 §3.3 says the opposite in the same
          number of words: "two fields and nothing else. Everything about the org itself is
          decided in the wizard; this screen only creates the account."
          Both are chasing the SAME sentence — 30's own "do not make the user pick it
          twice".
          RESOLVED 2026-08-19 (T-031) -> DESIGN WINS, no industry picker on /start.
          Reasons, in order of weight:
            1. asking on /start means asking BLIND. wizard step 1 shows each preset's role
               chain and vocabulary pair, which is what makes the choice take four seconds
               (design_specs/design/03 §3.4). a bare select before that is a worse question
               asked earlier.
            2. step 1 is THE CENTREPIECE of the 90-second demo. it cannot be skipped, so
               anything asked on /start is asked twice by construction.
            3. 30's data contract could not be implemented as written anyway: it has /start
               calling `GET /org/presets`, and that route is behind `authenticate` +
               requireCapability('org.read'). nobody on /start has a session. loosening
               that endpoint to satisfy a marketing screen would have been the wrong fix.
          RegisterBody.industry has `.default('custom')`, so the wire shape is unchanged
          and step 1 overwrites it. amended 30 § Create organization and § Data contract.

CONF-012  password minimum. design_specs/design/03 §3.3 helper copy says "At least 8
          characters."; `Credentials` in packages/shared says `.min(10)` and 30 §
          Acceptance says ten, mirrored client-side.
          RESOLVED 2026-08-19 (T-031) -> TEN. This is not a visual-vs-contract split of
          the usual kind: the design file is quoting a CONTRACT VALUE inside display copy,
          and architecture owns contracts (CLAUDE.md § Where design lives). The "8" is
          stale from before the DTO was written. The UI now renders the number from a
          single `MIN_PASSWORD` const that mirrors the DTO, so the two cannot drift by
          hand-editing a string.

CONF-017  <TrendChip> IS THE SECOND ONE. 46 § Components puts a trend chip on the
          "today" delta. THREE THINGS DISAGREE WITH THAT LIST ENTRY, and they are not
          subtle: 46 § Out of scope says "charts, trends, sentiment - that is 43, and it
          is P3. Home is a hub"; 46 § Purpose says the page "must not become a second
          analysis dashboard"; and HomeView carries no yesterday, so the direction an
          arrow would point is not in the payload at all.
          <StatCard>'s own contract says the same thing in one line - a delta "only ever
          appears where a direction is real".
          RESOLVED to the prohibitions. Today's count renders as a count with a context
          line. <TrendChip> is NOT BUILT and NOT STUBBED; 24 records it, and its remaining
          caller is 43, which is P3.
          The pattern is now worth naming, because this is twice: 24's component list was
          written from 43's needs, and P2 pages have been borrowing entries from it that
          only LOOK like things they need. A component listed by a page is not the same as
          a component that page can use — check what the rest of that document says about
          the thing before building it.

CONF-016  <ScoreBadge> IS A COMPONENT THAT DOES THE THING ITS OWN PAGE FORBIDS.
          24 §3 defines it as `{ score, max }` with "threshold colours", and 40 §
          Components lists it among the results page's components.
          40 § Purpose opens with "Results states what happened; it does not judge it", and
          40 § Interactions is explicit: "Distribution bars are single-colour. Do not colour
          rating 1 red and rating 5 green — that is interpretation." A threshold colour on
          an average is the same inference wearing a badge. design_specs/design/08 §8.1
          sides with the prohibition rather than with the list — its per-question card spec
          draws the average as display type beside the answer count, no badge, no colour.
          RESOLVED -> the no-interpretation rule wins. It is stated twice in 40 and once in
          the design spec; the component appears in one list. T-040 renders the average as
          a number and <ScoreBadge> is NOT BUILT and not stubbed — its only would-be caller
          is the one place the docs rule it out, and a component with no legitimate caller
          is a component that will eventually acquire an illegitimate one.
          Nothing is lost: the Analyze layer (43, P3) is where a judged score belongs, and
          it can define its own thresholds against a rubric rather than against arithmetic.
          status   ACTIVE. revisit when 43 is built, with a rubric.

CONF-015  39 CONTRADICTS ITSELF ABOUT THE EDGE STATES, and the two halves cannot both
          be built.
          39 § States (and design_specs/design/07 §7.6) draw FOUR screens, two of which
          name facts about the campaign: "Not open yet — {Campaign} opens on 1 Sep at
          09:00" and "Closed — it ran from 11 to 26 August".
          39 § Data contract, 13 §6 and the service say the opposite: invalid, unlaunched,
          closed and expired tokens all return the SAME 404, because a difference between
          them is an existence oracle — try a token, and the wording tells you whether that
          campaign exists and what state it is in. tenantResolver was written for this too
          (TENANTLESS includes /api/v1/public/ specifically so a bad token cannot 401 where
          a closed one 404s), and 39 § Acceptance asks for byte-identical 404s.
          RESOLVED -> the data contract wins, and it is not close. The client cannot render
          what the server refuses to say, and making the server say it would break a
          security property that has its own acceptance line, its own middleware exemption
          and its own test. Building the two screens would mean asking for a status the
          endpoint deliberately does not return.
          T-039 therefore ships THREE screens, not four. The three server-indistinguishable
          cases share one honest screen that names all three possibilities rather than
          claiming the link is broken ("It may have closed, it may not have opened yet, or
          the code may be wrong") — because "This link doesn't work" is a lie in two of the
          three cases and the reader's next action differs. "Already responded" stays
          separate because the CLIENT knows it: the localStorage marker (39 § State) is
          local knowledge, not something the server was asked.
          A fourth screen exists that neither source draws: a load FAILURE that is not a
          404. A phone on a venue network is the stated risk of this page, and a transient
          failure rendered as "this link isn't active" would send the reader away from a
          form that is fine. It offers Try again; the 404 screen offers nothing, because
          there is nothing to retry.
          status   ACTIVE. revisit only if the 404 policy changes, which is a 13 §6 DEC.

CONF-014  PUBLISH. design_specs/design/05 §5.2 says the builder has NO Save button and
          that "the only explicit commit is Publish, which locks the structure and makes
          the form usable by a campaign". Its top bar also draws four tabs:
          Build · Preview · Responses · Settings.
          ARCHITECTURE HAS NEITHER. 13 lists no publish endpoint; 37's data contract is
          load / PATCH meta / PUT questions and nothing else; 38 lets a campaign use any
          template the org owns, published or not; and 37 § Route names exactly two
          routes, /build and /preview. `templates.published_at` exists as a column and
          nothing reads or writes it.
          RESOLVED: architecture wins, because this is a CONTRACT question and not a
          visual one — the doc split in CLAUDE.md is explicit about which authority owns
          which. Building Publish would mean inventing an endpoint, a state machine and a
          rule about what a campaign may use; building the two extra tabs would mean two
          routes 20 §2's route test does not know about, and that test exists because a
          renamed path breaks a printed QR code.
          T-037 therefore ships autosave with a save indicator and no explicit commit at
          all. The lock that design attributes to Publish already exists and is real:
          a template used by a LAUNCHED campaign is read-only (37 § States), enforced
          server-side by assertEditable(). If Publish is wanted later it needs a DEC and
          an endpoint first, not a button.
          status   ACTIVE. revisit only with a DEC.

CONF-013  IS AN EMAIL ADDRESS GLOBAL OR PER-TENANT? The schema and the login contract
          disagree, and the disagreement was exploitable.
          10 makes `users` unique on `(org_id, email)` — the same address may exist in two
          organisations. 15 §2 and 13 § Auth define login as email + password with NO
          organisation hint, which only works if an address identifies exactly one account.
          FOUND 2026-08-19 (T-031), reproduced end to end, not theorised:
            1. Amara registers Org A with amara@x. Login: 200.
            2. ANY user holding `person.create` in ANY other organisation posts
               /people { email: "amara@x" }. Legal under the schema; no special privilege;
               people/service.ts guards `{ orgId, email }`, deliberately org-scoped.
            3. That writes an `invited` row with passwordHash NULL. Login's
               findFirst({ where: { email } }) — no order, no org — matched it, argon2
               compared against null, and Amara was locked out of her own account.
               Login: 401. One request, cross-tenant, from a stranger.
          MITIGATED, NOT RESOLVED (features/auth/router.ts, T-031): login now filters
          `passwordHash: { not: null }` and orders `createdAt asc`. The lockout is closed
          and the choice is deterministic — oldest real account wins, and an invited row
          can never be matched. Regression: src/backend/test/cross-tenant-login.test.ts,
          which asserts the victim lands in THEIR org, not the stranger's.
          STILL OPEN, and it is a schema/product decision, not a bug fix:
            a) make users.email globally unique — matches 15's login shape, but forbids one
               person legitimately belonging to two organisations, which the model allows
               today and DEC-009 does not forbid. Needs a migration plus guards in
               people/service.ts (invite AND csv import).
            b) keep it per-tenant and give login an organisation — a slug field, or a
               disambiguation step when an address matches more than one. Honest about the
               model, worse on stage.
            c) keep it per-tenant and keep the mitigation as the rule, documented.
          -> whoever picks must supersede this entry. Do NOT leave it as (c) by silence.
          BLAST RADIUS if left as-is: two activated accounts on one address remain
          ambiguous. The adversarial case is closed; the honest collision is not.

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
  NARROWED BY T-038, 2026-08-19: it never blocked the BUILD and it does not block it now.
  The URL is not a client decision at all — `POST /campaigns/:id/launch` returns it,
  computed from `config.PUBLIC_BASE_URL` by `publicUrlFor()` (T-021), and the share sheet
  renders what it is given. Deciding this is one environment variable, not a code change.
  What T-038 added is that the failure can no longer be silent: the share sheet inspects
  its own URL and says, in place, that a localhost address will not scan from a phone.
  A checklist item nobody reads on the morning is how this risk actually lands.
  STILL OPEN, and still the team's: somebody has to pick the tunnel and set the variable.

OPEN-003  REVISIT:2026-11-01
  analysis engine: themes/sentiment. rule-based vs LLM-assisted. affects 43-PAGE-analysis.md
  and whether an API key/cost enters the stack. not needed before P3.

OPEN-004  team member 3 does not use Claude. their work split is unassigned in
  02-PHASES-AND-EVALUATION.md §work-split. fill in when known.

OPEN-005  RESOLVED-BY:DEC-016  2026-08-19
  NOTHING OWNS SCHEDULED WORK. found 2026-08-16 while filling reserved slots.
  affected: campaign scheduled->open->closed (M0-CRITICAL, a campaign that never opens has
  no working QR), temporary unit + position expiry, delegation windows, seat recompute,
  webhook retry, refresh-token cleanup.
  leading answer: derive campaign status ON READ from starts_at/ends_at/closed_at instead of
  running a scheduler. no timer, no stuck state, no new demo-day failure mode.
  IF ADOPTED: campaign_status stops being a stored column -> amends 10 §4.3 and 38.
  RESOLVED 2026-08-19 -> DEC-016. campaign status is derived on read; the column is gone.
  STILL UNOWNED, and deliberately so for M0: temporary unit + position expiry, delegation
  windows, seat recompute, webhook retry. each of those is either P3 or degrades to a
  stale row rather than a broken demo, and each can be derived on read the same way if it
  ever needs to be. see 17-BACKGROUND-JOBS.md.

OPEN-006  REVISIT:2026-08-24  blocks:nothing-for-M0  found 2026-08-19 building T-030
  THE ORG SWITCHER HAS NO DATA BEHIND IT. 24 §2 gives <TopBar> `orgs: OrgSummary[]` and
  design_specs/design/02 §3 calls it the second most important control in the demo — "how
  you go from University to Hotel in one click". but a user belongs to exactly ONE
  organisation: users.org_id is non-null and (org_id, email) is the unique key (10), there
  is no membership join table, and 13 has no endpoint that could list switchable orgs. the
  four demo orgs are four separate accounts.
  DONE FOR NOW, and it is honest rather than a stand-in: the switcher lists the seeded demo
  orgs and switches by RE-AUTHENTICATING, gated at BUILD TIME the same way 30's login
  prefill is — DEMO_ORGS is [] in a production bundle, so the branch and its credentials are
  eliminated as dead code. verified by grepping dist/. when there is nowhere to switch to it
  renders as plain text, not a dropdown that opens an empty menu.
  THE REAL CHOICES, for whoever picks one:
    a. leave it. one account per org is a defensible product statement, and the demo works.
    b. a memberships table (user, org, role) — the correct multi-tenant answer, and a schema
       change plus a session-scoped current_org. too big before M0.
    c. one demo super-account with positions in all four orgs. cheapest of the real fixes,
       but it makes the demo path differ from the product's.
  see  src/frontend/lib/demo.ts, components/layout/TopBar.tsx, 24 §2

OPEN-007  RESOLVED-BY:DEC-033  2026-08-23   (raised and answered the same day)
  THERE IS NO ENDUR OPERATOR, AND ONE CANNOT BE ADDED BY GRANTING SOMEBODY MORE.
  the product has no platform-level actor anywhere: not a capability in 11 §3, not a
  principal kind in 12 §3, not a row in 10. asked for as "endur admin, superuser/owner
  stats".
  WHY IT IS NOT A BIG GRANT, WHICH IS THE OBVIOUS WRONG ANSWER: every mechanism for
  expressing authority here is org-shaped BY CONSTRUCTION, not by omission.
    - GrantScope stops at `all`, and `all` means THIS WHOLE ORGANISATION. there is no
      scope above it and INV-005 ties powers to the unit of an assignment, which is
      inside an org by definition.
    - db/tenant.ts stamps orgId onto every read and every create, and lint forbids
      importing the raw client outside that one seam. a service CANNOT express a
      cross-tenant query.
    - INV-010 forbids an orgId arriving from anywhere but tenantResolver.
  those three are the product's central claim (16 §1, 52), so the answer is a NEW
  PRINCIPAL KIND with its own seam, its own auth path, and its own audit story — not a
  fourth GrantScope and not a boolean on users.
  QUESTIONS THAT HAVE TO BE ANSWERED TOGETHER, because answering them apart builds it twice:
    1. where does an operator authenticate? the same /auth/login (and then users.org_id
       means what?), or a separate surface with no tenant at all?
    2. what may an operator SEE? aggregate counts across orgs is a very different
       promise from reading one org's responses, and 52 + INV-006 constrain the second
       hard. recommendation on file: COUNTS AND TIERS ONLY, never response content —
       it is the only version that does not contradict the anonymity claim we sell.
    3. who may set a tier? 16 §8 puts `billing.update` behind a capability, which is an
       ORG capability — meaning an org admin can currently be granted the power to
       upgrade themselves for free. that is the revenue model's actual hole and it is
       the same question as 1 and 2.
    4. how is an operator action audited, when audit_log has org_id NOT NULL?
  OUTPUT IS A DOC, NOT CODE: 19-PLATFORM-OPERATORS.md (slot 19 is free; 17 and 18 are the
  reserved neighbours) plus a DEC-. catalogue-first applies — any new capability goes in
  11 §3 first, any endpoint in 13 first.
  NOT M0. raised 3 days before a graded demo and deliberately parked behind T-043/T-045.
  RESOLVED 2026-08-23 -> DEC-033. a separate principal kind, not a bigger grant. two fixed
  roles (owner, staff), a separate platform_users table, a separate login and cookie, a
  separate capability catalogue, a separate db seam, and INV-011 over all of it. the four
  questions listed above are each answered in 19: §7 auth, §5 what may be seen (COUNTS
  ONLY), §8 who may set a tier (-> DEC-034, then DEC-035), §10 audit (platform_audit_log,
  because audit_log.org_id is NOT NULL and belongs to the customer).
  see 19-PLATFORM-OPERATORS.md, 70, 71. PROGRESS.md Stage 6, T-056..T-059.

OPEN-008  RESOLVED 2026-08-23 -> option (b), narrowed. see DEC-036. kept in full because
          the ARGUMENT for (a) is still the right one if a library is ever approved.
          found 2026-08-23 from the eval-1 criteria
  DOES FILE UPLOAD RE-ENCODE? this decides what T-061 IS, so it comes before the code.
  48 § Validation is unambiguous today: "Re-encode: ALWAYS. Never store the uploaded
  bytes", and the paragraph under it says why in the strongest terms the doc set uses —
  "Re-encoding is not an optimisation, it is the security control". decoding to a bitmap
  and re-encoding strips EXIF, embedded payloads and polyglot files in one step, and it
  removes any question of whether a stored file could execute. it also strips GPS and
  device ids, which is 48's stated reason respondent uploads are out of scope (INV-006).
  THE COST: an image library. sharp is the usual answer and it is a NATIVE build. there
  is no image dependency in src/backend/package.json today, and the API's whole dependency
  list is currently thirteen well-known packages.
  THE OPTIONS:
    a. add it, honour 48 as written. strongest answer, and the acceptance list in 48
       (a .exe renamed .png; a GPS-tagged photo; a 20000x20000 decompression bomb) becomes
       demonstrable rather than aspirational.
    b. supersede 48 § Validation for P1: verify magic bytes + dimensions + size, store the
       original, re-encode later. weaker, and it contradicts a doc we wrote deliberately.
       if taken, it MUST be a DEC- with the risk stated, not a quiet omission.
    c. accept PNG only and re-encode with something already present. narrows the surface
       but does not remove the need for a decoder.
  RECOMMENDATION ON FILE: (a). the evaluation names file upload as MANDATORY MIDDLEWARE,
  and the part that is interesting as middleware is precisely the validation chain 48
  specifies — a route that accepts bytes is not worth marks, a route that rejects a
  renamed .exe by magic byte during streaming is.
  NOT AN INSTALL TO MAKE UNASKED. see CONF-018, PROGRESS.md Stage E.
  OUTCOME: (b), but narrower than (b) as written -- the stored bytes are NOT the uploaded
  bytes. lib/imageBytes.ts strips the metadata segments WITHOUT decoding, so EXIF/GPS/XMP/
  IPTC never reach disk, which is the privacy property 48 wanted re-encoding for. what is
  NOT bought: polyglot neutralisation. see DEC-036 for the risk, stated rather than quiet.

```

---

## MAP — doc → source path lock

Two people drive Claude in parallel. Before creating or heavily editing a path, confirm the
owning doc. One doc owns a path; a second doc may read it but must not restructure it.

```
CLAUDE.md                        -> /CLAUDE.md
_MEMORY.md                       -> architecture/_MEMORY.md
03-REPO-AND-TOOLING.md           -> /package.json /tsconfig*.json /.env.example /.github
10-DATA-MODEL.md                 -> src/backend/database/** src/backend/db/**
11-PERMISSION-ENGINE.md          -> src/backend/authz/**
                                    incl. authz/visibility.ts, the list-side inverse of
                                    resolve(). see N-016.
12-MIDDLEWARE-STACK.md           -> src/backend/middleware/** src/backend/app.ts
13-API-CONTRACT.md               -> src/backend/routes/** (router wiring only)
                                    NOTE: routes/ was never created. routers live beside
                                    their service in src/backend/features/<name>/router.ts
                                    and are mounted by lib/mount.ts. 13 still owns the
                                    CONTRACT; the folder name differs from the doc.
14-DTO-AND-VALIDATION.md         -> packages/shared/src/dto/**
15-AUTH-AND-SESSIONS.md          -> src/backend/auth/**
16-TENANCY-BILLING-ENTITLEMENTS  -> src/backend/billing/**
17-BACKGROUND-JOBS.md            -> PLACEHOLDER. no path owned yet. see OPEN-005.
18-OBSERVABILITY-AND-OPS.md      -> PLACEHOLDER. no path owned yet.
20-FRONTEND-ARCHITECTURE.md      -> src/frontend/main.tsx App.tsx router/** lib/api.ts
                                    lib/session.ts lib/capabilities.ts pages/**
                                    pages/*/ are PLACEHOLDERS from T-026 until the page
                                    task named inside each one replaces it wholesale.
                                    router/layouts.tsx holds the console frame ONLY until
                                    T-030 lands AppShell (24 §2). taking it then is correct.
21-DESIGN-SYSTEM-BINDING.md      -> src/frontend/design-system/**
22-VOCABULARY-SYSTEM.md          -> src/frontend/lib/labels.ts store/vocabularySlice.ts
                                    src/backend/lib/vocabulary.ts (§6, the server half —
                                    nounsOf/counted, added T-044) and scripts/audit-vocab.mjs
                                    (§5, the mechanical half; 03 §7 describes it, 22 owns
                                    what it looks for)
23-STATE-AND-REDUX.md            -> src/frontend/store/**
24-COMPONENT-INVENTORY.md        -> src/frontend/components/**
                                    components/Icon.tsx owns the closed icon vocabulary
                                    (design_specs/design/01 §5). a concept without an
                                    agreed icon must be added THERE before it is used.
                                    lib/demo.ts is the build-time-stripped stage
                                    affordance — see OPEN-006 and 30 § Sign in.
25..29                           -> PLACEHOLDERS. 29 is unassigned. no paths owned.
30..45 page docs                 -> src/frontend/pages/<world>/<Page>/**
                                    + src/backend/features/<feature>/**
31-PAGE-setup-wizard.md          -> src/frontend/pages/console/Setup/** lib/org.ts
                                    the wizard owns its own state (useWizard.ts) and it
                                    is NOT in redux — 23 §2, one route's transient state.
                                    it also drove components/org/**, components/flow/**,
                                    components/form/Toggle, components/feedback/** — all
                                    catalogued in 24 first. see N-025.
30-PAGE-landing-auth.md          -> src/frontend/pages/public/** lib/auth.ts
                                    lib/auth.ts is the sign-in / register seam (23 §3):
                                    pages call it, it calls lib/api.ts, nothing else does.
                                    T-031 also took packages/shared/src/vocabularies.ts —
                                    the landing pitch's preset labels, DATA, drift-tested
                                    against src/backend/presets/** by
                                    src/backend/test/vocabularies.test.ts. see CONF-011.
32-PAGE-org-structure.md         -> src/frontend/pages/console/Structure/** lib/units.ts
                                    + src/backend/features/units/**
                                    lib/units.ts is the units read/write seam (23 §3):
                                    the page calls it, it calls lib/api.ts, nothing else
                                    does. the DETAIL PANEL is page-local and deliberately
                                    not a catalogue component. the TREE is
                                    components/org/UnitTree.tsx, owned by 24 — read N-025
                                    before touching it. T-033 also took the range grammar
                                    in packages/shared/src/dto/unit.ts (N-027).
35-PAGE-subjects.md              -> src/frontend/pages/console/Subjects/** lib/subjects.ts
                                    + src/backend/features/subjects/**
                                    T-034 also created lib/people.ts (the linked-person
                                    picker) and took usePeopleIn there out of lib/units.ts.
                                    34-PAGE-people.md OWNS lib/people.ts when it is built.
                                    components/data/** (ResponsiveTable, StatCard, BarRow)
                                    was built here but belongs to 24, like every component.
38-PAGE-campaigns.md             -> src/frontend/pages/console/Campaigns/** lib/campaigns.ts
                                    + src/backend/features/campaigns/**
                                    T-038 also took components/feedback/ShareSheet.tsx
                                    (owned by 24) — THE DEMO MOMENT, read 38 § The share
                                    sheet before touching it; every rule in that file is a
                                    scanning requirement, not a style. new dependency:
                                    `qrcode`, rendered to canvas locally, never through an
                                    image service. see N-037 and N-038.
40-PAGE-results.md               -> src/frontend/pages/console/Results/** lib/results.ts
                                    + src/backend/features/results/**
                                    the k-anonymity gate is the point of this feature and
                                    it is enforced IN THE BODY (52 §2) — the page has
                                    nothing that could reconstruct a suppressed
                                    distribution, and it must stay that way.
                                    T-040 also took components/data/StackedBar.tsx (owned
                                    by 24, NPS is its only legitimate caller), extended
                                    <BarRow> with showPercent, and created
                                    src/backend/features/campaigns/audience.ts — shared
                                    with 38 and read N-043 before changing either side.
                                    lib/tree.ts is new and is NOT lib/units.ts: N-045.
                                    <ScoreBadge> is catalogued and deliberately unbuilt,
                                    CONF-016.
41-PAGE-settings.md              -> src/frontend/pages/console/Settings.tsx
                                    reads/writes go through lib/org.ts (useOrg,
                                    useUpdateOrg, useUpdateLabels); the server side is
                                    features/org/**, owned by 31. NOT a folder — the
                                    cut-list keeps one card and a folder would promise
                                    more than is there.
                                    THE WORDS CARD IS <WordsEditor>, owned by 24, shared
                                    with wizard step 4. Do not fork it; read N-052.
                                    The #words anchor is a contract with <VocabularyChips>,
                                    which links it from every console page (41 § Route).
                                    Billing, danger zone and logo are the cut-list, not an
                                    oversight — design_specs/design/11 §1.
46-PAGE-home-dashboard.md        -> src/frontend/pages/console/Home/** lib/home.ts
                                    + src/backend/features/home/**
                                    THE FIRST SCREEN AFTER SIGN-IN and the one the org
                                    switcher lands on, so its nouns are the ten-second
                                    proof (22 §4). ONE request, NO polling — live counters
                                    are 40's, and a second poller here has no reader.
                                    readStats() carried its own copy of the response-rate
                                    bug until T-041: read N-046 before touching either
                                    reader, and go through features/campaigns/audience.ts.
                                    cards.ts, CampaignCard.tsx and Recent.tsx are pure
                                    page-local modules and are not 24's business.
                                    <TrendChip> is catalogued and deliberately unbuilt,
                                    CONF-017.
39-PAGE-respondent-flow.md       -> src/frontend/pages/respond/** lib/respond.ts
                                    + src/backend/features/public/**
                                    THE HERO SCREEN, and the only world with no store, no
                                    chrome and no capability check. It renders through
                                    components/form/QuestionInput.tsx (owned by 24) and
                                    must never grow a second set — INV-008.
                                    ANYTHING IMPORTED HERE SHIPS TO A PHONE ON A VENUE
                                    NETWORK. pages/respond/bundle.test.ts walks the import
                                    graph out of these pages AND out of main.tsx, and
                                    fails on console code, on the store, or on a new
                                    dependency. It found a real leak — read N-040 before
                                    adding an import anywhere near router/layouts.tsx.
                                    answers.ts and copy.ts are pure page-local modules,
                                    like 32's and 38's, and are not 24's business.
37-PAGE-form-builder.md          -> src/frontend/pages/console/Builder/**
                                    T-036 built the AUTHORING components ahead of the
                                    page: components/form/QuestionEditor.tsx (six, one
                                    file, mirroring QuestionInput.tsx), QuestionCard.tsx
                                    and kinds.ts. all three are owned by 24 like every
                                    component. kinds.ts holds the frozen kind map with NO
                                    default branch — a seventh kind fails to compile
                                    (DEC-010) — and changeKind() is the whole of
                                    "change type", so the builder must not restate it.
                                    T-037 built the page: useBuilder.ts (draft + autosave,
                                    page-local per 23 §2, and written as ONE immutable
                                    draft so P3's builderSlice is a move rather than an
                                    untangling), SaveIndicator.tsx, Preview.tsx.
                                    it also took components/form/FormPreview.tsx, which
                                    36's page now uses too — see N-035 — and NO Publish
                                    button or extra tabs, see CONF-014.
36-PAGE-templates-library.md     -> src/frontend/pages/console/Templates/** lib/templates.ts
                                    + src/backend/features/templates/**
                                    lib/templates.ts is the template read/write seam
                                    (23 §3). the CARD, the blank-form dialog and the
                                    delete sentence are page-local by design, like 32's
                                    detail panel — 24 §10 rules out a generic card.
                                    T-035 also built components/form/QuestionInput.tsx
                                    (owned by 24, shared with 37 and 39 — read N-031
                                    before touching it) and components/feedback/Toast.tsx.
                                    it narrowed scripts/audit-vocab.mjs too: N-032.
46-PAGE-home-dashboard.md        -> src/frontend/pages/console/Home/**
47-PAGE-profile.md               -> src/frontend/pages/console/Profile/**
48-FEATURE-file-upload.md        -> src/backend/features/uploads/**
                                    src/frontend/components/form/FileUpload*
54-COURSE-DELIVERABLE.md         -> docs only. hand to the react teacher.
55-BUILD-ORDER.md                -> docs only. the T-### task backlog. PLAN.
/PROGRESS.md                     -> repo root. THE LIVE STATE. every session updates it.
                                    board + session log + open decisions + debt.
                                    stale PROGRESS is worse than none - sessions trust it.
60..63                           -> PLACEHOLDERS, P3 stretch. no paths owned.
                                    these are the 4 disabled "Soon" sidebar items. CONF-006.
                                    RENUMBERED from 46..49 on 2026-08-18 to free the page
                                    block. do not renumber back.
50-SEED-AND-DEMO.md              -> src/backend/database/seed/** src/backend/presets/**
                                    the ONLY two directories where an education noun may
                                    appear, and then only as DATA (INV-002). Both are
                                    exempt in eslint.config.js and in test/seed.test.ts.
lib/paginate.ts                  -> owned by 13 §4 (cursor pagination)
authz/held.ts                    -> owned by 13 § Auth + DEC-019. the UI capability set.
                                    NOT the resolver and must not grow into one.
middleware/idempotency.ts        -> owned by 13 §7
51-TESTING-STRATEGY.md           -> **/*.test.ts src/backend/test/** e2e/**
52-SECURITY-AND-PRIVACY.md       -> cross-cutting; owns no path, constrains all
53-NOVELTY-CLAIMS.md             -> docs only

CONTESTED  src/frontend/components/** is written by 24 but consumed by every page doc.
           rule: a page doc may NOT add a component. it requests one in 24 first.
           source: design_specs/design/09 preamble.

12-MIDDLEWARE-STACK.md           -> src/backend/middleware/**  src/backend/app.ts
                                    chains.ts (links 6-8, router-level) added by T-064.
18-OBSERVABILITY-AND-OPS.md      -> src/backend/lib/logger.ts  src/backend/lib/logFile.ts
                                    src/backend/logs/**
48-FEATURE-file-upload.md        -> src/backend/middleware/upload.ts
                                    src/backend/lib/imageBytes.ts  src/backend/lib/storage.ts
                                    src/backend/features/files/**  src/backend/storage/**
                                    src/frontend/components/form/FileUpload.tsx
19-PLATFORM-OPERATORS.md         -> src/backend/platform/**  packages/shared/src/platform-capabilities.ts
                                    also owns the platform_users / platform_audit_log
                                    tables in database/schema.prisma. 10 owns the FILE;
                                    19 owns those two MODELS. (plan_prices was a third
                                    until DEC-035 deleted pricing outright.)
49-PAGE-plan-and-billing.md      -> src/frontend/pages/console/Billing/**
                                    src/backend/features/billing/**
70-PAGE-platform-console.md      -> src/frontend/pages/platform/Console/**
71-PAGE-platform-analytics.md    -> src/frontend/pages/platform/Analytics/**
                                    NOTE 70+71 are EXEMPT from INV-001 (19 §12) and
                                    audit-vocab.mjs must exclude pages/platform/.

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
DRIFT-007  a preset's `labels` block changed in src/backend/presets/** -> the landing
           page advertises those exact nouns from packages/shared/src/vocabularies.ts.
           src/backend/test/vocabularies.test.ts fails until the copy is updated. do not
           "fix" it by loosening the test; the point is that `/` cannot promise a word the
           product no longer uses. see CONF-011.
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
N-026  ANY component added to router/layouts.tsx must be checked against
       pages/respond/bundle.test.ts before you believe it is free. layouts.tsx is imported
       STATICALLY by router/index.tsx, so everything it imports statically lands in the
       entry chunk that a phone downloads before the first question renders.
       caught twice now, both times by that test and neither time by reading: first
       <AppShell>, then <ThemeToggle> — three icons in a pill, but it imports <Icon>, and
       <Icon> is thirty lucide glyphs. both are `lazy()` in that file for this reason.
       the rule is about the IMPORT GRAPH, not about how big the component looks.
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
N-022  MERGE HAZARD, 2026-08-19: the mithil-patidar merge was committed with conflicts
       unresolved. two files were damaged with NO conflict markers — authz/index.ts came
       out empty, and schema.prisma kept both sides of a dropped enum. a grep for
       '<<<<<<<' over *.ts and *.md said clean while the build was broken.
       ALWAYS scan every tracked file (git ls-files), never a chosen set of extensions,
       and always run typecheck + the suite before trusting a merge. a green grep is not
       a green build.
N-015  FOLDER RENAME 2026-08-19, on the user's instruction: apps/ -> src/,
       api -> backend, web -> frontend, prisma -> database, and the inner src/ of each app
       was flattened away. All 19 affected docs, the MAP table, every tsconfig, eslint,
       vitest, prisma.config.ts and the audit scripts were updated in the SAME pass, so
       nothing should still say apps/. If you find one, it is a miss, not a survivor.
       package names are unchanged (@endur/api, @endur/web) because they appear in every
       -w flag. lib/config.ts now WALKS UP to find .env instead of counting ../../../.. —
       the fixed depth broke on this rename and looked like a missing env var.
N-014  CHAIN ORDERING, found by running it 2026-08-19: 12 §5's "tenantResolver ->
       authenticate" is right, but SESSION LOADING is not authentication and must happen
       EARLIER — tenantResolver reads req.session.orgId, so cookieParser + sessionMiddleware
       go ABOVE it. Getting this wrong makes every authenticated request 401 with
       UNRESOLVED_TENANT, which looks like a tenancy bug and is not.
N-011  LOCAL DEV DATABASE, 2026-08-18. 03 §5 specifies Postgres 16 via docker compose and
       docker-compose.yml is committed and still correct. but the machine this was built on
       has NO DOCKER, so postgres 16.14 is installed natively via
       scripts/install-postgres.sh (same version, same endur/endur credentials, same
       DATABASE_URL — nothing downstream can tell which one it is talking to).
       WSL DOES NOT START SERVICES AT BOOT: `sudo service postgresql start` after a restart,
       or every db command fails with a connection error that looks like a config problem
       and is not.
N-012  prisma.config.ts exists in src/backend and is NOT in any doc. two reasons it had to:
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
N-019  ESLINT FLAT CONFIG REPLACES RULE OPTIONS, IT DOES NOT MERGE THEM. Found 2026-08-19
       by adding a probe file to prove the DEC-007 rule fired, and discovering it did not:
       the `src/backend/features/**` block set no-restricted-syntax for req.body and in
       doing so REPLACED the raw-SQL selector for every file under it. $queryRaw had been
       unguarded inside features/** since T-001. Every block that sets a rule now lists
       every selector that should apply, and both were re-proved by probe.
       THE GENERAL LESSON, which is the T-001 note coming true: a rule that is configured
       and silent is worse than no rule, and the only way to know is to make it fire.
N-020  STATUS FILTERING COSTS ONE DUPLICATION. DEC-016 removed the stored campaign status,
       which means a list filtered BY status has to restate the derivation in SQL —
       features/campaigns/status.ts holds statusOf() and whereStatus() side by side for
       that reason, and campaigns.test.ts compares them against each other over a fixture
       of all four states rather than trusting they were written together.
N-021  THE LIST SIDE OF A CAPABILITY IS A DIFFERENT QUESTION. requireCapability answers
       "may you act on this target"; a list needs "which targets may you see". Guarding a
       list with a target-based check fails for every scoped role — a subtree grant cannot
       reach an org-level target by design (11 §4) — so list routes pass
       `{ target: 'any' }` and the handler scope-filters through visibleUnits(). Rows the
       caller cannot see are absent, which is INV-003 stated as code.
       A PERSON IS NOT ANCHORED TO A UNIT in the request — their POSITIONS are — so person
       routes additionally re-check visibility after reading the row.
N-008  DRIFT-003/004 must be implemented in scripts/audit-drift.mjs and NOT restated as
       literal grep patterns inside architecture/, or the check matches its own definition.
       this already bit once on 2026-08-16.
N-016  THE RESOLVER HAS TWO SIDES AND ONLY ONE EXISTED UNTIL 2026-08-19.
       resolve() answers "may this caller act on THIS target". every list endpoint asks the
       inverse — "WHICH targets may this caller see" — because INV-003 requires out-of-scope
       rows to be ABSENT and meta.total to count only what the caller may see. that inverse
       is authz/visibility.ts, built on the same collectGrants() so the two sides cannot
       disagree. deny still wins there: a deny at scope all empties the visibility, a deny
       anchored at a unit subtracts that subtree.
N-017  TENANT RESOLUTION FROM A PUBLIC PATH, fixed 2026-08-19. the respondent-token pattern
       in tenantResolver was ^/(?:r|api/v1/public)/([A-Za-z0-9_-]{8,128}) which, against the
       real path /api/v1/public/campaigns/<token>, captured the literal word "campaigns" and
       resolved no tenant. the segment after the prefix is not always the token — the pattern
       must name the full prefix including /campaigns/. it was invisible until T-022 because
       nothing had ever called a public route.
N-018  BUILD ENVIRONMENT, 2026-08-19. this repo cannot be npm-installed in place when it sits
       on an exFAT volume: npm workspaces symlink each workspace into node_modules and exFAT
       has no symlinks, so install dies with EISDIR on src/frontend -> node_modules/@endur/web.
       junctions fail too ("Local NTFS volumes are required"), as does ln -s from WSL against
       /mnt/<drive>. build on an NTFS path and keep the exFAT copy source-only.
N-023  A CHECK THAT FAILS ON ITS OWN EXPLANATION GETS ROUTED AROUND. audit-vocab.mjs used to
       scan comments, so T-032 failed the build on four lines that were DESCRIBING INV-001 —
       'the button label uses the vocabulary: "Add a Department" here'. It now strips
       comments before scanning, preserving line numbers, exactly as seed.test.ts's INV-002
       scan has since T-025. INV-001 is about what RENDERS, and a comment renders nothing.
       The strip was proved not to blind the check: a real `<p>Departments</p>` still fails.
       This is the third time this lesson has been learned in this repo (T-003 audit-drift,
       T-025 seed.test, T-032 audit-vocab). Write new checks with it already applied.
N-024  A HOOK THAT RETURNS A FUNCTION HAS REGISTERED A TEARDOWN. `beforeEach(() =>
       mock.mockReset())` in vitest: mockReset() returns the mock, the concise arrow returns
       it, and vitest calls it after every test. With mockRejectedValue set, that is an
       unhandled rejection reported against whichever test built the error — an hour on
       19 Aug. Always brace the body of a hook.
N-025  <UnitTree> WAS BUILT BY T-032, NOT T-033. 55-BUILD-ORDER lists it under T-033
       (structure page), but wizard step 3 needs it first and INV-009 says there is exactly
       ONE of it — "assign it to one person; it is the component most likely to be rewritten
       three times" (24 §4). It exists at src/frontend/components/org/UnitTree.tsx with all
       three modes. **T-033 EXTENDS IT, DOES NOT WRITE IT.** Same for <InlineName>, which
       24 §7 describes as a pattern rather than a component; it is a component now, because
       three callers needed identical Enter-commits / Esc-reverts behaviour and that is the
       part everybody gets subtly wrong.
       The tree also has a keyboard/touch re-parent path ("Move", then choose a destination)
       alongside HTML5 drag. Not decoration: drag does not exist on touch, and 31 §
       Acceptance requires the tree to be usable there.
N-026  THE WIZARD RUNS IN A FOCUSED CONSOLE FRAME. design_specs/design/03 §3.4 draws it with
       its own shell — brand, org name, "Skip setup" — and no sidebar. Rather than a fourth
       layout, AppShell gained `focused` (no rail, no drawer, no hamburger) and ConsoleLayout
       turns it on for /app/setup. The reason is not aesthetic: during setup every sidebar
       item leads to a page that is empty BECAUSE setup has not happened, so offering them
       invites the one click that makes the product look broken.
N-027  THE RANGE GRAMMAR LIVES BESIDE THE SCHEMA, AND BOTH SIDES READ IT. `Floor 1..8` and
       `Wing A..F` are parsed and expanded by parseUnitRange() / expandUnitNames() in
       packages/shared/src/dto/unit.ts, next to the RepeatRange schema that caps them at 50.
       The server expands inside the create transaction; the client uses the same functions
       to preview and to say WHY `1..10000` is refused before asking. Two reasons it is not
       client-side: a loop in the browser would fire ten thousand requests before anyone
       noticed, and a second parser is how a preview and a write quietly stop agreeing.
       `A..F` needed a `letters` flag on RepeatRange — additive, so the numeric form and its
       existing tests were untouched.
N-028  /app/structure IS THE SECOND ROUTE-LEVEL CAPABILITY GATE. 32 § States requires a
       full-page 403 for direct navigation without `unit.read`, so the route wraps
       <RequireCapability>. router/index.tsx used to say setup was "the ONE console route
       with a capability gate"; that comment is now wrong and has been corrected. The rule
       has NOT changed: everywhere else, out-of-scope data is absent rather than gated
       (INV-003). These two are gated because on them the page IS the action, so somebody
       without the capability would otherwise get an empty screen that looks broken.
N-029  THE PAGINATED ENVELOPE WAS DECLARED TWICE, DIFFERENTLY, AND THE WRONG ONE WAS THE
       SHARED ONE. `Page<T>` in packages/shared said `{ items }` from T-003; every list
       handler returned `Paged<T>` from src/backend/lib/paginate.ts, which says
       `{ data, page, meta }` — and 13 §4 agrees with the backend. Nothing consumed the
       shared type for sixteen days, so nothing noticed.
       T-033's people list was the first caller to trust it. It read `.items`, got
       undefined, and its TEST PASSED because the mock repeated the same wrong shape. Found
       by T-034 only because the subjects list is paginated and the envelope had to be read
       properly. Fixed by correcting the shared type to 13 §4 and making the backend's
       `Paged<T>` an ALIAS of it — one declaration, so they cannot drift again.
       The lesson worth keeping: a shared type nobody imports is not a contract, it is a
       guess, and a mock written from the same guess will confirm it.
N-030  THE SUBJECT DETAIL CARRIES CYCLES BUT NEVER SCORES. `GET /subjects/:id` returns the
       summary plus every campaign the subject appeared in, with the responses that came
       back ABOUT THAT SUBJECT in each — 35 § Interactions' "first hint of the Improve
       layer". It deliberately carries no averages: aggregates live behind the results
       endpoints, which is where the k-anonymity gate is (INV-007). A per-subject average
       on a page with no gate in front of it would be a second, ungated path to the same
       numbers, and it would look completely innocent in review.

N-031  <QuestionInput> x6 WAS BUILT BY T-035, NOT T-036. 55-BUILD-ORDER pairs the six
       inputs with the six editors because both are "the form engine", but the template
       PREVIEW is their first caller and INV-008 forbids a stand-in: "preview a template
       exactly as respondents will see it" is either one implementation or it is
       marketing. So T-035 built the inputs; T-036 is now editors-only, and
       components/form/QuestionInput.tsx says so at the top.
       Two consequences worth knowing:
         - T-039, THE HERO SCREEN, NO LONGER WAITS ON T-036. Its dependency was the input
           set, not the editors, and 55-BUILD-ORDER now reads T-035.
         - the six are one dispatcher plus six renderers in one file, with <Scale> shared
           by rating/NPS and <Choices> by single/multi. design_specs/design/05 §5.3
           defines each of those pairs as the SAME control with one difference; written
           twice, that one difference quietly becomes three.
       Exactly the shape of N-025, where the wizard built <UnitTree> a task early.

N-032  audit-vocab NO LONGER SCANS TEST FILES, and this is the FOURTH narrowing of a check
       that fired outside its own subject (after audit-drift's px values at T-003,
       audit-vocab's comments at T-032/N-023, and seed.test.ts's INV-002 scan at T-025).
       INV-001 is about what a component RENDERS. A .test.tsx renders nothing: its strings
       are fixtures standing in for CUSTOMER DATA, and customer data is legitimately
       English — a university really does own a template called "Course feedback", the same
       way src/backend/presets/** really does say "Department". T-035's page tests produced
       18 findings that were all the check's fault.
       Nothing is lost, and this was proved rather than assumed: a real hardcoded noun was
       added to TemplateCard.tsx and the narrowed check still failed on it. A noun in a
       component is caught IN THE COMPONENT; a test could only ever have echoed it. The
       output now prints the skipped count, so the narrowing is visible rather than silent.
       The standing rule this keeps re-teaching: a check that cries wolf gets routed
       around, and then it stops catching the real thing.

N-033  A DESIGN LINE WITH NO CONTRACT BEHIND IT GETS A CONTRACT, NOT A FAKE.
       design_specs/design/05 §5.1 has drawn "Used in 2 campaigns" / "Never used" on the
       template card since revision one, and 13 carried nothing that could answer it.
       T-035 added `campaignCount` to TemplateSummary — derived in the same query as the
       row, catalogued in 13 and 36 BEFORE the page was written.
       The alternative was the T-033 move (substitute a number the API does have, record
       the substitution — the "Inside" count where the mockup said RESP), and the reason
       this one went the other way is that the count is not decoration: without it the
       delete dialog cannot state a consequence and the reader discovers the 409 by
       pressing the button, which is the "are you sure?" 24 §6 exists to abolish.
       The rule to take from the pair: substitute when the number is informational;
       extend the contract when a REQUIRED BEHAVIOUR depends on it. Either way it is
       written down before the code.

N-037  THE QR'S TWO COLOURS ARE THE ONLY HEX LITERALS OUTSIDE design-system/, AND DEC-012
       WAS RIGHT TO FLAG THEM. They stay because they are not brand colours: a QR is
       decoded by thresholding luminance, and the margin a phone camera has under a
       projector, at an angle, in a lit room, IS the contrast between the two values
       design_specs/design/06 §6.3 names (this ledger does not restate them — see DRIFT).
       Routing them through a token would mean the code changes colour when somebody
       re-themes the product — correct for every other pixel in that file, wrong for these
       two. design_specs/design/06 §6.3 specifies both literally for the same reason.
       Both the component and its TEST carry an eslint-disable with the reason, and the
       test PINS the literals on purpose: anybody who later tokenises them breaks a test
       rather than the demo.

N-038  T-038's DEPARTURES FROM design_specs/design/06, all recorded in 38 before the code:
         - NO responses-over-time sparkline, NO average completion time, NO per-subject
           breakdown on the campaign detail (§6.4 draws all three). There is no endpoint
           for any of them, and per-subject numbers are 40's — behind the k-anonymity gate.
           A second, ungated path to per-subject aggregates is precisely what INV-007
           exists to prevent, so this one is not merely unbuilt, it is REFUSED.
         - NO `Duplicate` on the campaign detail (§6.4). No endpoint, and it is not in 38.
         - NO "show a progress bar" toggle in step 3 (§6.2). No field in CreateCampaignBody
           and no respondent behaviour attached to it.
         - the AUDIENCE COUNT in step 2 is computed from the org tree already in memory,
           not from GET /:id/audience — because that endpoint needs a campaign id and the
           campaign does not exist until step 3 commits. It is labelled as an estimate and
           the authoritative number is the one the API returns afterwards.
       Nothing here is a shortcut: each is a design line whose contract does not exist, and
       the rule from N-033 applies — extend the contract when a required behaviour depends
       on it, substitute when it is informational. All four are informational.

N-035  TWO SCREENS PREVIEW A FORM, SO THE PREVIEW IS A COMPONENT. INV-008 says the six
       inputs have one implementation because the preview must not drift from the live
       form. T-037 found the same argument one level up: 36's template page and 37's
       builder both render "the form as a respondent sees it", and T-035 had written that
       shell inline on the template page. A second copy in the builder would have made
       "exactly as respondents will see it" true on one screen and approximate on the
       other — which is the failure INV-008 describes, wearing a different hat.
       Lifted to components/form/FormPreview.tsx (the three width frames, the "nothing is
       saved" banner, the disabled Submit) and the template page rewired to it. Its 15
       tests passed unchanged through the refactor, which is what made it safe to do.
       Catalogued in 24 §5 first.

N-036  A ROW OF CONTROLS CANNOT ITSELF BE A CONTROL. The collapsed question card was
       role="button" with tabIndex and its own Enter/Space handling — and then T-037 hung
       the two reorder buttons inside it. That is nested interactive content: invalid ARIA,
       and assistive tech collapses it into one control whose accessible name is every
       label inside concatenated.
       FOUND BY A TEST, not by reading: getByRole('button', { name: /Was the pace right/ })
       matched three elements — the row and both of its Move buttons — and the ambiguity
       was the bug reporting itself. Fixed by making the row a plain div that keeps its
       click handler for the mouse (the whole 52px stays the target, which is the
       ergonomic the mockup draws) and putting the NAME in a real <button>. Enter and Space
       then come free from the platform, which is the point of using one.
       The lesson generalises: when a query cannot tell two things apart, neither can a
       screen reader.

N-034  T-036's DEPARTURES FROM 24 §5, all recorded in 24 itself before the code:
         - ONE FILE, NOT SIX. §5's six-file layout existed so two people could take three
           editors each. That never happened, and the live risk is the six editors
           drifting from the six INPUTS they author — so QuestionEditor.tsx mirrors
           QuestionInput.tsx line for line. Twelve files hide that drift; two show it.
         - NpsEditor does NOT reuse YesNoEditor's "No settings for this type." Both have
           an empty config, but for opposite reasons: yes/no has nothing TO configure,
           NPS has something deliberately withheld. It says what is fixed and points at
           the rating scale, which is the question the reader is about to ask.
         - <QuestionCard> gained `index` and `readOnly`. `index` names a card whose text
           is still empty ("Question 3"); without it a blank new question is unreachable
           by name, for a reader and for a test.
         - the editors take a DRAFT (packages/shared's QuestionInput DTO, re-exported as
           QuestionDraft), not the API's question row. `position` is derived on save and
           `id` is absent until the first one, so a card holding a row would hold two
           fields it must never send.
         - multi choice has a `maxSelections` editor. 37's table lists the field;
           design_specs/design/05 §5.3 draws no control for it. A config field with no way
           to set it is a field nobody can use, so the toggle-plus-number was added rather
           than the field being quietly ignored.
         - NO QUESTION IMAGES, though 05 §5.2 draws the button. QuestionConfig has nowhere
           to put one and the union is frozen (DEC-010): adding a field is a decision, not
           a card-header button. Not built and not stubbed.

N-039  T-039's DEPARTURES FROM SPEC, and there are only three because 39 is unusually
       complete about this screen.
         - A SUBJECT PICKER, which neither 39 nor design_specs/design/07 draws. Both assume
           one subject; 38 step 2 lets a campaign carry many, and public/service.ts's
           resolveSubject() 422s on `body.subjectId` when it does and the submission does
           not name one. A form that could not be submitted was the alternative. Rendered
           as a required question card, in the org's own noun ("Which Course is this
           about?"), and ABSENT when there is exactly one — asking somebody to choose from
           a list of one is noise, and the server resolves that case itself.
         - THE ANONYMITY LINES ARE SILENT WHEN THE CAMPAIGN IS NOT ANONYMOUS. Rule 6 says
           anonymity is stated twice; it is written for the anonymous case and neither
           source gives copy for the other one. The two things this page could invent are
           both wrong — a promise it cannot keep, or a warning about a linkage the schema
           does not make (a response row has no respondent column at all, INV-006). Saying
           nothing is the only honest option without a contract, and copy.test.ts pins it.
         - PublicCampaign.labels IS NOW ResolvedLabels, not Record<string, Label>. The
           server already sends every key (resolveLabels fills the gaps); the loose type
           only meant the respond world had to guard each noun against undefined, and one
           forgotten guard renders "undefined" on the demo phone. Type precision, not a
           contract change — 13 §6 already said "org display name + labels".

N-040  "THE RESPONDENT BUNDLE MUST NOT INCLUDE THE CONSOLE" WAS FALSE, AND THE PAGES WERE
       NEVER THE LEAK. 20 §8 has said it since revision one with nothing checking it.
       T-039 wrote pages/respond/bundle.test.ts, a static import-graph walk out of the two
       respondent pages — and it passed immediately. The build did not agree: the ENTRY
       chunk, which every route downloads, contained lucide-react.
       CAUSE: router/index.tsx imports router/layouts.tsx statically (it must — the three
       layouts are route elements), layouts.tsx imported <AppShell> statically, and
       <AppShell> pulls the sidebar, the top bar and <Icon>'s thirty glyphs. Route-level
       lazy loading of PAGES cannot help with anything the entry itself imports.
       FIXED by making <AppShell> lazy inside layouts.tsx, with a Suspense that reuses the
       session-loading fallback. Entry chunk 322.9 kB -> 308.5 kB (101.5 -> 96.5 kB gzip).
       The test now walks main.tsx's STATIC graph too — `lazy(() => import(...))` has no
       `from` clause, so the same regex naturally sees only what cannot be split out — and
       reverting the fix makes it fail, which was checked both ways.
       STILL IN THE ENTRY AND NOT FIXED HERE: @reduxjs/toolkit, react-redux, immer and zod,
       because main.tsx wraps the router in <Provider> for all three worlds. Roughly 40 kB
       gzip a respondent never uses. Moving the Provider into the console layout is a
       20 §3 / 23 §2 decision, not a page task — recorded so somebody decides it rather
       than inherits it. A respondent today downloads ~102 kB gzip of JS and 9 kB of CSS.
       qrcode is already correctly confined to the campaigns chunk (T-038).

N-041  THE RESPONDENT IDEMPOTENCY KEY IS PER FILL, NOT PER TOKEN. 13 §7 says respondent
       submit is "keyed on the invitation token", which is exactly right for an invitation
       — one token, one person, so a retry is unambiguous. An OPEN LINK inverts it: every
       phone in the room holds the same token, so a key derived from it would replay the
       first person's 201 to the second, and the campaign would collect exactly one
       response in front of the evaluator.
       lib/respond.ts's submitKey() mints one uuid-suffixed key per FILL, held in a ref and
       reused by every retry of that fill. A failed submit stores nothing (the middleware
       caches successes only), so editing an answer after a 422 and pressing again is a
       fresh request rather than a conflict. A 409 on this key therefore means one thing —
       the first attempt landed and its reply was lost — and the form says so instead of
       "try again", because trying again is the one thing that would produce a duplicate.

N-042  A CUSTOM PROPERTY THAT WAS NEVER DEFINED, and eight CSS rules asked for it.
       endur.css named a "display face" variable that tokens.css does not declare; the
       real one is the heading-face variable, and the two names differ by one word. Five
       of the eight rules came from T-037 and T-038 — including the 42px line that goes on
       the PROJECTOR in presentation mode.
       An undefined custom property makes font-family invalid at computed-value time, so
       every one of those elements silently inherited the body face.
       INVISIBLE TODAY, and that is the part worth keeping: the two woff2 files are not
       vendored (D-005), so both faces fall back to the system stack and the bug looks
       like nothing at all. It would have appeared the moment somebody repaid D-005 —
       which is due 24 Aug, two days before the demo. Fixed in the same pass.
       The names themselves are deliberately not written here; they live in the design
       system, which is the only place that owns them (DEC-012). Read the declarations
       before adding a rule rather than copying the nearest line.

N-043  THE RESPONSE RATE HAD NO DENOMINATOR, AND SHOWED 4675%. `readResults` set
       `audienceEstimate` to `campaign.subjects.length` — so `responseRate` was
       responses-per-SUBJECT, rendered as a percentage. Measured against the seeded demo
       before touching anything: Northfield's Spring term feedback 633 responses / 18
       subjects = 3517%; Riverside's patient survey 4675%; every one of the eight seeded
       campaigns with real data between 1750% and 4675%. On the screen an evaluator opens
       straight after scanning a QR code.
       CAUSE: two different questions with one answer. `audiencePreview` substitutes the
       subject count for an `anyone` rule ON PURPOSE and says so — the create screen needs a
       number to show, and "0" beside an open audience reads as a broken rule. `readResults`
       reused that number as a divisor, where the honest answer is that there isn't one.
       FIXED by extracting features/campaigns/audience.ts: countAudience() resolves a unit
       or role rule against the org graph and returns NULL for `anyone`, because a link has
       no roll. 40's DTO has typed both fields `| null` since revision one, which is the
       document having anticipated this and nobody having read it that way.
       The page renders a dash AND THE REASON — "anyone with the link can respond, so there
       is no total to measure against" — rather than a bare "—", which would read as a
       number that failed to load.
       CONSEQUENCE FOR THE DEMO, and it is somebody's call, not this task's: all four seeded
       orgs use `anyone`, so the RESPONSE RATE card is a dash throughout the demo. One
       seeded campaign given a `unit` audience would make that card show a real number. That
       is 50's data, not 40's page.
       ALSO FOUND on the way: `audience_rule` is JSONB and the dev database holds rows with
       `{}` in it, from before the discriminated union existed. Both readers now go through
       ruleOf(), which treats an unreadable rule as the open case rather than throwing — a
       results page that 500s because of an old row is worse than one that guesses the
       likeliest thing and stays up.

N-044  THE CSV SAID "SUBJECT". 22 §6 warns in as many words that "a CSV export whose header
       column says Course for a hotel is exactly the kind of leak the manual audit is for,
       and it is the one nobody thinks to check" — and the export shipped at T-023 with the
       literal word as a header. Nobody checked it for the reason the doc predicted:
       audit:vocab only scans the frontend, because that is where components render.
       Fixed at T-040 (resolveLabels on the campaign's org), and the test now pins the test
       org's own noun and asserts the English word is ABSENT — an assertion that would have
       failed the day the export was written.
       WORTH GENERALISING: every user-facing string the SERVER produces is outside the
       vocabulary check. 22 §6 lists three kinds — validation messages, confirmation text,
       export headers. Only one of the three has been audited.

N-045  A PURE FUNCTION INSIDE A MOCKED MODULE IS A FUNCTION EVERY MOCK REIMPLEMENTS.
       `flattenUnits` — the tree flattened for a `<select>` — existed twice, character for
       character, in 35's subject filter and 38's audience picker. T-040 needed a third, so
       it was lifted into lib/units.ts.
       Two suites went red immediately: `No "flattenUnits" export is defined on the
       "lib/units.js" mock`. Every page that filters by unit mocks `useUnits()`, and adding
       a pure helper to that module meant every one of those mocks would have to grow a copy
       of it — which is the duplication again, moved somewhere harder to see.
       Moved to lib/tree.ts, which nothing mocks. The rule: a module that tests replace
       wholesale is a bad home for a function that has no reason to be replaced. The failing
       mock is the signal, not an obstacle.

N-046  THE SAME BUG HAD A SECOND READER, AND IT WAS THE FIRST SCREEN AFTER SIGN-IN. N-043
       fixed `readResults`. It did not know `readStats` in features/home/service.ts held its
       own copy of the substitution — sum the campaigns' `_count.subjects`, divide the
       responses by it, render as a percentage. Measured against the seeded demo before
       touching anything, exactly as N-043 was: Northfield 3161%, Grand Palace 2654%,
       Meridian 2610%, Riverside 4675%. Verified afterwards on the same data: all four now
       report no denominator.
       WHAT IT COST TO FIND: nothing, because T-041 read the endpoint it was building
       against. WHAT IT WOULD HAVE COST TO MISS: the first number on the first screen of the
       graded demo. The generalisable half is the one worth keeping — A FIX APPLIED AT THE
       CALL SITE IS NOT A FIX. `countAudience()` existed, was correct, and was documented as
       the honest counter, and a second caller three files away still divided by the wrong
       thing. When a wrong number is corrected, grep for the ARITHMETIC, not for the
       function: `_count.subjects` as a divisor was greppable and nobody grepped it.
       Both readers go through features/campaigns/audience.ts now. Home aggregates across
       campaigns, so it drops a campaign with no audience from BOTH sides of the fraction
       rather than counting its responses against everybody else's audience — that would be
       a third wrong number rather than a compromise.
       THE SEED DECISION FROM N-043 NOW AFFECTS TWO SCREENS: all four demo orgs use `anyone`,
       so both cards read "—" throughout the demo. Correctly. One seeded campaign with a
       `unit` audience fixes both, and that is 50's data.

N-047  A CONTRACT EXTENDED SO A CLICK STAYS A CLICK. 46 § Interactions gives each campaign
       card a Share that opens <ShareSheet>, "because during a demo the most common thing you
       want from this screen is the QR code". <ShareSheet> cannot render without the URL, and
       HomeView did not carry one — so the choice was a second request fired on the click, on
       venue wifi, at the moment somebody is holding a phone up, or two fields from columns
       the query already reads.
       Extended, per N-033's rule: substitute when the missing number is informational,
       extend the contract when a required behaviour depends on it. `url` and `anonymous`
       are in 46 § Data contract and in 13 § Home. `status` is NOT — every campaign on this
       page is open by definition, and a field with one possible value is a field that will
       eventually hold the wrong one.
       ALSO NOT BUILT, and for the N-046 reason: design_specs/design/04 §4.1 draws a progress
       bar reading `612 / 800` on each card. The 800 is the same invented denominator. The
       count renders alone.
       ALSO NOT BUILT: the "View all →" on the recent-response strip. Those comments come
       from several campaigns, the payload does not say which, and a cross-campaign response
       inbox is P3 by name (40 § Out of scope). A link to the wrong page is worse than no
       link.

N-048  THE DEFAULT VOCABULARY IS THE LIKELIEST THING TO BE HARDCODED. T-044 ran 22 §5's
       nonsense walk and found four leaks. NOT ONE was an education word — which is the
       entire class audit:vocab had been built around since T-003.
       <ShareSheet> had rendered "Respondents don't need an account." since T-038, on the
       component that IS the demo, through four audits. The grep could not see it: its list
       holds Course/Faculty/Student/Department, and "Respondent" is the CUSTOM PRESET — the
       fallback vocabulary, English, generic, and wrong for a hotel, which calls them Guests.
       The rule: nobody types "Guests don't need an account" while building generic UI.
       Everybody types "Respondents". A banned list of words a developer would have to go
       out of their way to write is a banned list that catches nothing.
       audit:vocab now has three passes (03 §7). Pass 2 adds the five default labels but ONLY
       inside JSX text and copy-bearing attributes, because `Campaign` is also a type, a
       table and a route segment; template-literal interpolations are blanked first, so
       ${nounsOf(req).unit.one} reads as the mechanism it is. Each pass was proved by
       planting a real violation and watching it fail — the T-035 discipline.
       The other three findings: "About 1 frimbles can respond." on the campaign-create
       screen (the plural passed as BOTH forms — the agreement case 22 §5 names by name),
       "3 cycles so far" on the subject detail, where `cycle` is the DTO's internal word for
       a campaign and was sitting directly under a kicker reading "Active {campaign.many}",
       and the server, below.
       The last one stays manual and cannot be otherwise: nothing but a reader knows that
       "cycle" and "{campaign}" are the same thing.

N-049  17 MESSAGE SITES, AND THE UI RENDERS THEM VERBATIM. N-044 wrote the brief — "every
       user-facing string the SERVER produces is outside the vocabulary check; 22 §6 lists
       three kinds and only one has been audited" — and T-044 paid it off.
       The API said "That unit does not exist.", "That campaign has launched. It can be
       closed, but not edited.", "That unit has 3 units inside it." Ten console pages render
       `error.message` straight out of the envelope, so a hotel was told about a "unit" by
       the API rather than by a component, in a place audit:vocab could not look.
       22 §6 had specified the mechanism since revision one and nobody had built it: the
       label set on req.ctx after tenantResolver. It costs nothing — that middleware already
       read organizations for authzVersion, so `labels` is a column on a query that was
       happening anyway. lib/vocabulary.ts holds nounsOf(req) and counted(n, label); the
       latter takes a Label rather than two strings, because the delete-unit message used to
       build its plural with + "s" and "Faculty" pluralises to "Faculty".
       Three things worth keeping:
         · A 404's UNIFORMITY IS ABOUT THE ANSWER, NOT THE LANGUAGE. assertVisible throws
           the same message on both branches — no row, and out of scope — so the two stay
           indistinguishable (13 §5). Saying it in the org's noun does not change that.
         · THE WIZARD READS THE BODY, NOT ctx. POST /org/setup validates a structure while
           the reader is looking at words they chose two steps ago that the database has not
           been told about. validateStructure takes them from SetupOrgBody.
         · A STRUCTURAL WORD STAYS STRUCTURAL IN THE SAME SENTENCE: "That template is used by
           1 review round." A hotel calls a template a template.
       ALSO FOUND, NOT FIXED, AND WRITTEN DOWN SO IT IS NOT REDISCOVERED: roles/service.ts
       `describe()` turns "campaign.launch" into "launch campaigns" for 33's powers grid.
       That grid is not built (33 is after M0) and the object→label mapping for `role`,
       `person`, `template` and `org` — none of which HAS a label — is 33's design work, not
       something to invent now. Whoever builds T-033 owns it.
       AND ONE TEST WAS PINNING THE BUG: units.test.ts asserted /1 unit/. The message said
       "unit" because the code hardcoded it, and the test agreed with it.

N-050  A COOKIE THAT OUTLIVES ITS PARTNER IS A PERMANENT OUTAGE, NOT A FLAKE. The first
       walkthrough of the running app (21 Aug) kept hitting "Your session token was missing
       or invalid. Reload and try again." It was not intermittent. `endur.csrf` was set with
       no maxAge — a browser-session cookie — beside a session cookie with seven days, so
       closing the browser dropped one and kept the other. You came back signed in, with no
       CSRF token, and EVERY mutation failed. Forever.
       The message named the one remedy that could not work: a reload issues only GETs, and
       `issueCsrfToken` had exactly three callers — GET /auth/csrf, register and login. The
       SPA never called /auth/csrf (grep src/frontend: nothing). Sign out and back in was the
       only way out, which is not a thing a reader would guess.
       T-047 fixed both halves. The cookie now carries SESSION_TTL_DAYS, and csrfProtection
       re-issues it on any safe method when the principal is a cookie user — so the boot
       GET /auth/me heals it and "reload and try again" became true. An EXISTING token is
       re-set rather than rotated, which slides the expiry in step with the rolling session
       without invalidating a mutation already in flight holding the old value.
       Issuing on a GET is not a hole: double-submit rests on an attacker being unable to
       READ the cookie cross-origin, and a fresh random token they cannot see is worth
       nothing to them.
       THE GENERAL RULE: two cookies that must be present together must expire together.
       Anything that pairs a readable token with an httpOnly session has this bug available
       to it. 201 backend tests and 618 frontend ones were green while it was live, because
       every one of them starts a fresh agent — nothing in the suite ever REOPENED anything.

N-051  A DISABLED ITEM IS AN ANSWER; A STUB PAGE IS AN APOLOGY. The same walkthrough found
       Roles, People and Settings as live sidebar links onto "Not built yet", plus /app/profile
       from the top bar and person links from the structure panel and the subjects table.
       router/index.tsx states the rule in its own header — "a stub page behind a dead link is
       worse than a disabled item" — and the code did not break it: the rule was written for
       P3 and nobody extended it to the P2-after-M0 routes. The mechanism already existed and
       was in use three times.
       Extending it was mechanical. What was NOT mechanical: /app/settings turned out not to
       be post-M0 at all. 41 § Route & access has <VocabularyChips> linking `#words` from
       EVERY console page, and design_specs/design/11 §1 keeps the Words card while cutting
       the rest of that screen. So the most-linked destination in the console was scaffold,
       and PROGRESS.md said "no placeholder is behind an M0 path" in good faith because
       nobody had followed a link out of a component into a cut-list. T-046 built it.
       WHEN A PAGE IS DISABLED, THE LINKS INTO IT ARE PART OF THE JOB. Greying the sidebar
       item is the visible half; the structure panel, the subjects table and the user menu
       all pointed at the same unbuilt pages and would have kept doing it.

N-052  BUILD THE SECOND PLACEMENT BY EXTRACTING, NOT BY COPYING. 41 asks for "the same five
       fields and the same live preview as wizard step 4", which is only true if it is the
       same component. <WordsEditor> came out of WordsStep whole; the step kept its title and
       lede and nothing else. Same rule as <UnitTree> (INV-009), and the same reason: the
       preview is the product claim rendered live, and a second copy of it would eventually
       disagree with the first about what saving does.
       Like <UnitTree>, it does not call useLabels(). The wizard edits an unsaved draft and
       settings edits the saved org; a component that reached for the store would render the
       wrong one of the two.
       ONE THING THE SERVER DOES NOT STORE AND SHOULD NOT: which plurals are overridden.
       A saved plural that differs from derivePlural(singular) IS the override — that is what
       makes the hotel's "Staff / Staff" survive a reload instead of quietly becoming
       "Staffs" the next time somebody edits the singular.

N-053  THE TESTS HAD BEEN WRITING TO THE DEVELOPMENT DATABASE FOR THREE DAYS. D-004, repaid
       21 Aug. 209 integration tests register organisations and submit responses, and they did
       it in `endur`. By the time it was fixed there were 2,880 organisations in there, the
       demo seed had been pushed out once already (19 Aug — the advertised logins stopped
       working), and one run had failed because uniqueSlug() exhausted twenty variants of a
       name a test reused.
       vitest.config.ts now has globalSetup (create endur_test if absent, `prisma migrate
       deploy`) and setupFiles (point the worker at it). THE ORDERING IS THE MECHANISM:
       lib/config.ts parses DATABASE_URL at module load, and process.loadEnvFile() does NOT
       overwrite an already-set variable, so a value assigned in setupFiles wins over .env for
       the whole worker. Verified that behaviour before relying on it.
       TWO GUARDS, AND THE SECOND ONE IS THE SUBTLE PART. The name must end in `_test`, and it
       must not be the DATABASE_URL written in .env. Rule 2 reads the FILE rather than
       process.env, because once globalSetup has switched the process the two are legitimately
       equal — the first version of this refused to run for the exact reason everything was
       correct. Same trap in derive(): a second call in a switched process produced
       `endur_test_test`, which fails at connect with a message about a missing database
       rather than about the double derivation. It is idempotent now, and a test says so.
       WRITE THE TEST FOR THE GUARD. test/test-database.test.ts asserts both rules by their
       FAILURE and found the derive() bug on the first run. A guard that never refuses
       anything is not a guard, and this one decides what 209 tests may truncate.
       STILL TRUE AFTER THE FIX: `endur` holds 2,880 organisations. The leak is closed, the
       puddle is not mopped — `npm run db:reset` does that and is the user's call, because it
       also drops anything they created by hand while clicking around.

N-054  A RETRY THAT SCANS TURNS ONE COLLISION INTO A QUEUE. D-006, repaid 21 Aug (T-049).
       uniqueSlug() cannot move inside register's transaction — it reads COMMITTED rows and a
       transaction cannot see what it is racing — so the fix is to catch the P2002 and try
       again. The first version retried by re-running the sequential scan, and one contender
       still got a 500: six requests all re-read, all found `acme-2` free, five collided again.
       Sequential retry needs as many attempts as there are contenders.
       A retry now takes a RANDOM suffix instead, and the field spreads out in one round
       however many are racing. The uncontended path still scans, so the ordinary case —
       registering "Acme" next week when `acme` exists — still gets the readable `acme-2`, and
       that path is not racing anything.
       IT DOES NOT READ FIRST ON THE RETRY PATH, DELIBERATELY. Under contention that read is
       exactly the thing that lies. The unique index plus the retry loop are a better guard
       than a SELECT already proven stale.
       ONLY A P2002 ON `slug` IS RETRIED. Retrying a genuine conflict would fail five times
       more slowly and hide what happened.
       AND THE TEST INVERTED, WHICH IS CORRECT. register-rollback.test.ts was built on the
       collision producing a 500; now every contender succeeds on a distinct slug. The rollback
       property is still tested — by every retry, since a failed attempt that left half an
       organisation behind would show as an org count exceeding the number of winners. The six
       DISTINCT SLUGS are what prove the retry ran: all six derive the same base before any
       commits, so six slugs can only mean five collisions were caught.

N-055  FIRE-AND-FORGET AFTER THE RESPONSE IS A RACE WITH THE CLIENT. Found 21 Aug while
       checking T-049 for flakiness, in middleware/idempotency.ts — not in anything that task
       touched.
       The Idempotency-Key row was written with `void prisma…create()` INSIDE the res.json
       wrapper, so the response went out first. A retry arriving in that gap missed the read,
       ran the handler again, and created a SECOND response — the exact duplicate the
       middleware exists to prevent, on the respondent submit path, which is the one a phone
       takes in front of the evaluator. The code even said the loser's "response is identical
       anyway because it ran the same handler on the same input", which is false when the
       handler CREATES something: the second response has a different id.
       Now the row is committed before the body is sent. One indexed insert of latency.
       IT WAS ONLY EVER VISIBLE AS AN INTERMITTENT TEST FAILURE, and it appeared the day the
       suite moved to a small fast test database (D-004) — the same work in less time widened
       the window relative to it. A flaky test is a bug report you have not read yet. This one
       had been sitting in the suite since T-022, passing.
       WHAT IS LEFT IS D-011, and it is the harder half: two genuinely concurrent requests can
       both miss the read, which is the REAL flaky-network case where the client never got the
       first response. The unique index still allows only one key row, but both handlers ran.
       Closing it means RESERVING the key before the handler instead of writing it after, which
       introduces an in-flight case that has to answer something — 409, or wait-and-replay.
       Not invented under time pressure five days from a graded demo.
```
