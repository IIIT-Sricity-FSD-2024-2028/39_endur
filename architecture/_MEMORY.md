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

DEC-009  AMENDED-BY:DEC-037  2026-08-16  origin:A
  Respondents never authenticate. opaque campaign token in the URL, no account, no cookie
  that identifies a person. anonymity is a schema property, not a UI setting.
  AMENDED 2026-08-23 BY DEC-037, NARROWLY: a campaign may be marked access:'organization',
  and then the caller must also hold a STAFF session for that org. this creates no
  respondent account and no new principal kind -- a member answering signs in as staff.
  EVERYTHING ABOVE STILL HOLDS for access:'public', which is the default, the demo path
  and every seeded campaign. read DEC-037 with this entry, never instead of it.
  see      15-AUTH-AND-SESSIONS.md, 52-SECURITY-AND-PRIVACY.md, DEC-037

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
  extended DEC-050 (2026-08-24) -- every entry now CARRIES ITS WIDEST HELD SCOPE. the rule
           above for WHICH capabilities are listed is unchanged, deny subtraction included;
           what changed is that each one names how far it reaches.

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

DEC-037  ACTIVE  2026-08-23  origin:user  amends:DEC-009
  what     A CAMPAIGN HAS A SECOND AXIS, `access`: 'public' | 'organization'.
           public       = the token is the only credential. unchanged, still the default,
                          still the demo path, still every seeded campaign.
           organization = the caller must ALSO present a staff session for THIS org.
           the toggle the user asked for: "open to all / open to all in the organization,
           configurable", the shape people know from google forms.
  why      user, 2026-08-23. an organisation wants "only our people can answer this"
           without minting 400 per-person invitation links.
  narrow   THIS DOES NOT CREATE A RESPONDENT ACCOUNT. no new principal kind, no new cookie,
           no change to Principal in 11 §2. the person signs in as STAFF with the endur.sid
           they already have, and the check is MEMBERSHIP ONLY -- is this session's orgId the
           campaign's orgId. no grant is resolved. holding more powers buys nothing.
  holds    MEMBERSHIP IS CHECKED AT THE GATE; IDENTITY IS DISCARDED AT THE DOOR.
           nothing about the session reaches `responses`, which still has no column that
           could hold it. INV-006 is untouched because it is a property of the SCHEMA and
           the schema does not change.
  cost     PARTICIPATION STOPS BEING ANONYMOUS even though the ANSWER stays anonymous.
           campaign_participants(campaign_id, user_id, responded_at) -- the invitations
           pattern exactly: records THAT a member answered, never WHAT. the primary key is
           what prevents a second submission; the ABSENCE OF A THIRD COLUMN is what keeps
           the answer anonymous. 52 §1 now names the two promises separately and 39's
           <AccessNotice> tells the respondent which one they are being given.
  order    THE GATE RUNS AFTER TOKEN RESOLUTION, NEVER BEFORE. invalid/unlaunched/closed/
           expired still 404 identically (13 §6); only a VALID token can reach
           401 SIGN_IN_REQUIRED, which therefore discloses nothing the token did not.
           gating first would make a restricted campaign an existence oracle.
  immut    `access` joins `anonymous` in the after-launch trigger. one trigger, two columns.
           loosening it mid-flight betrays people told "only colleagues can answer";
           tightening it strands a link already printed on a table card.
  see      38, 39, 10 §4.3 §4.4, 15 §3, 52 §1, 12 §4.10c, 13 § Public respondent

DEC-038  ACTIVE  2026-08-23  origin:user
  what     AN ORGANISATION PROVISIONS ITS OWN SIGN-INS. account.create / account.revoke /
           account.reset in 11 §3; POST /people/:id/account returns a ONE-TIME activation
           link; the person sets their own password at /activate/:token and lands signed in.
  why      user, 2026-08-23: "allow organization to make accounts for level like university
           admin making dean accounts". before this, register created exactly ONE account
           per org -- the founder's -- so every console screen was openable by one human.
  holds    34's rule SURVIVES, RE-EXAMINED RATHER THAN INHERITED: an admin never sets a
           password and never knows a working credential. an admin who can set a dean's
           password can sign in as the dean, and every audit row from that session names
           the dean -- the org chart intact and the audit log a fiction, which is exactly
           what 56 exists to prevent.
  fact     users.status and a nullable password_hash ALREADY anticipated this (10 §3).
           the new table is account_invites -- NOT `invitations`, which is taken and means
           campaign tokens. two tables called invitations is a mistake somebody makes at 2am.
  fact     only sha256(token) is stored; one live invite per person via a PARTIAL UNIQUE
           INDEX, so re-issuing invalidates the old link in the same statement that mints
           the new one and there is no window where both work.
  fact     NO MAILER EXISTS ANYWHERE IN THE APP (checked, 2026-08-23). the admin copies the
           link. that is a stated trade, not a hidden one -- 52 §10 records it. when email
           arrives it changes ONE function and nothing else here, which is the test of
           whether the seam is in the right place.
  see      57-FEATURE-accounts-and-invites.md, 15 §5, 34, 10 §5

DEC-039  ACTIVE  2026-08-23  origin:claude  introduces:INV-012
  what     NO PRINCIPAL MAY CREATE A POSITION, GRANT OR ACCOUNT WHOSE RESOLVED POWERS
           EXCEED THEIR OWN. new middleware requireNoEscalation (12 §4.10b), on
           POST /people/:id/assignments, POST /people/:id/account and the powers-grid write.
           403 WOULD_ESCALATE, naming the capability.
  found    WHILE WRITING 57, AND IT IS A LIVE HOLE IN SHIPPED CODE. src/backend/features/
           people/service.ts addAssignment() checks assignment.create on the target unit and
           NOTHING ELSE. a caller holding exactly that -- a coordinator whose job really is
           to put people into positions -- can assign the Owner role at the root unit to a
           colleague, or to a second account of their own, and hold the organisation an hour
           later. every check passes. THERE IS NO BUG TO POINT AT: the resolver worked
           exactly as specified, because nobody had specified this.
  shape    the same shape as DEC-034's billing.update hole. a capability that is safe to
           HOLD becomes unsafe to HAND OUT the moment a route hands things out. 57 is that
           route, which is why the bound lives in 11 (the engine) and not in 57.
  rule     computed from resolve(), NEVER from Node.level. "level 3 may create level 4 and
           below" would re-introduce the integer-level model through a side door (DEC-002,
           CONF-002) and would be wrong the moment an admin edits the powers grid.
  holds    A DENY THE ACTOR CARRIES MUST SURVIVE INTO WHAT THEY CREATE, or a deny is
           escapable by proxy and INV-004 becomes a suggestion.
  holds    IT IS MIDDLEWARE, NOT A SERVICE CHECK. INV-003 says authorisation is decided in
           middleware; "may you hand this power out" is an authorisation decision. in a
           service it would be the one authz rule you cannot see by reading the route.
  except   register and /org/setup seed the founder's position with no actor to bound
           against. they run BEFORE the guard, not around it -- both write inside the
           registration transaction rather than through POST /assignments. any future
           seeding path uses that seam or the guard, never neither.
  built    2026-08-23, T-071. authz/escalation.ts (findEscalation, positionWouldConfer),
           middleware/requireNoEscalation.ts, features/people/positions.ts. 8 tests, and
           removing the guard fails 5 of them while the 3 "does not over-refuse" tests
           still pass -- checked both ways.
  ALSO     THE CSV IMPORT CREATES POSITIONS TOO, behind person.import alone. found while
           building the guard. a guard on /:id/assignments ONLY would have been WORSE THAN
           NONE, because the board would have recorded the hole as repaid while it was
           bypassable in one call by naming a senior role in a one-row CSV. both routes
           now carry it and SHARE one resolution of "which role does this row mean"
           (features/people/positions.ts) -- two copies would drift into a row the guard
           did not check and the handler did create.
  fact     WHAT IT CATCHES FIRST IS REACH, NOT POSSESSION. a Section Head holding
           assignment.create:own_unit assigning the Principal role in their OWN unit is
           refused on assignment.create ITSELF, because that role carries it at `subtree`.
           the capability is one they hold; the DISTANCE is not. hence the message names
           the UNIT as well as the capability -- naming only the capability would read as
           a bug in the commonest case.
  see      11 §5b, 12 §4.10b, 57, 33, 34

DEC-040  ACTIVE  2026-08-23  origin:claude
  what     audit_log.ip IS NULL FOR NON-USER PRINCIPALS. written only when
           principal.kind === 'user', in db/tx.ts flushAudit().
  found    while writing 56. THE LEAK WAS REAL AND DORMANT:
             audit_log   response.submit · campaign X · 14:05:11 · 203.0.113.44
             responses            (anon) · campaign X · 14:05:11
           every submission writes an audit row (correctly -- INV-007 covers every state
           change) and flushAudit wrote `ip: req.ip ?? null` for EVERY principal alike.
           responses.submitted_at is written in the same transaction. sort both by time,
           zip them, and you have IPs against responses. INV-006 defeated through a table
           it never mentions, built out of two tables that each keep the promise alone.
  why-now  NOTHING HAS EVER READ audit_log, which is why this survived four security passes.
           56 IS THE READER THAT WOULD HAVE MADE IT LIVE. fixed with the page, not after it.
  where    AT THE WRITER, not filtered at the reader. a reader fix protects one screen; a
           writer fix protects every screen anybody builds later. AuditEntry additionally
           has no ip field at all (56), belt and braces.
  keep     ip STAYS for user principals -- "who changed this permission, and from where" is
           real forensics on the one table that answers it.
  lesson   A DORMANT LEAK IS A LEAK. the question to ask of a new read surface is not "does
           this expose something" but "WHAT DOES THIS MAKE READABLE THAT WAS ONLY WRITTEN".
  built    2026-08-23, T-074. one line in db/tx.ts flushAudit(). two tests in public.test.ts,
           and REVERTING THE FIX FAILS ONE WITH `expected '::ffff:127.0.0.1' to be null` --
           the leak, printed. the inverted test (a staff mutation DOES write ip) still
           passes with the fix reverted, which is what stops "never write ip" from
           satisfying the pair.
  see      10 §5, 52 §6, 56 § Anonymity, src/backend/db/tx.ts

DEC-041  ACTIVE  2026-08-23  origin:claude
  what     THE AUDIT LOG RECORDS REFUSALS TOO. audit_log.outcome 'allowed'|'denied', and
           decided_by carries the narrowest DENY on a denial.
  why      "admins must be able to see logs" (user, 2026-08-23) and the half an administrator
           actually wants is the refusals: "somebody tried to launch a campaign in
           Engineering and was refused" is a security event. historically a row meant
           SOMETHING HAPPENED, so the log could only ever answer half the question.
  scope    DENIALS OF MUTATING CAPABILITIES ONLY. a 403 on a GET is the permission system
           working correctly, thousands of times a day; logging all of them produces a
           table nobody reads -- the same reasoning that keeps a 403 at warn and not error
           in 18 §4.
  see      10 §5, 52 §6, 56, 11 §3 (audit.read)

DEC-042  ACTIVE  2026-08-23  origin:claude  resolves:OPEN-003  REVISIT:2026-11-01
  what     THE ANALYSIS ENGINE IS RULE-BASED. no LLM in P1-P3. stop-words, stemming, n-gram
           frequency clustered by co-occurrence into <=12 themes; a sentiment lexicon per
           comment aggregated per theme; drivers = correlation between a theme's presence
           and the response's own rating, which is arithmetic over numeric_value.
  why      forced by CONF-019 -- the owner asked for the Analysis page to be completed, and
           43 could not be built while its engine was undecided. 43's own recommendation
           was already "rule-based first"; this ratifies it rather than inventing it.
  decider  THE PRIVACY QUESTION. 52 promises respondents anonymity; shipping their free-text
           to a third party is a disclosure that must be SURFACED, and there is no consent
           mechanism in the product to surface it with. building one to enable a feature
           nobody asked for in those terms is the wrong order.
  also     an api key is a dependency the owner has reserved before (DEC-036 is the same
           shape). non-determinism makes 43's acceptance list untestable. and a lexicon is
           HONEST ABOUT BEING WEAK, which § Reliability already made the differentiator.
  reverse  LLM stays available as a per-org opt-in with a visible disclosure. the engine is
           one interface with one function -- the seam stripMetadata() occupies in 48.
  verify   no outbound http client exists in the analysis feature, asserted by absence.
  see      43 § The engine, OPEN-003

DEC-043  ACTIVE  2026-08-23  origin:user
  what     TWO LOG SURFACES, TWO AUDIENCES, TWO CAPABILITIES.
             org administrator -> /app/logs (56)  reads audit_log,   audit.read
             endur operator    -> /ops/logs (72)  reads the FILES,   platform.logs.read
  why      user, 2026-08-23: "admins of endur and organization must be able to see logs".
           both halves are answered, and they are answered with different things because
           the two logs have different subjects: audit_log is EVIDENCE (who did what, and
           which grant allowed it, forever, per-row tenant-scoped by construction);
           app-*.log is DIAGNOSTICS (what the system did, every tenant in one file,
           14 days). 18 §9 already insisted they are never conflated -- this spends that.
  refused  AN ORG ADMIN DOES NOT READ THE FILES. one file per day across every tenant;
           serving a customer a filtered slice is one filter bug away from serving somebody
           else's traffic, and the content a customer wants is not in there anyway. said
           out loud in 18 §9 and 56 § Out of scope rather than left as an omission.
  holds    72 IS SAFE UNDER INV-011 ONLY BECAUSE 18 §3 ALREADY MADE IT SAFE AT THE WRITER --
           no bodies, no credentials, no respondent identity in a log line. the viewer
           INHERITS that; it must never be the thing enforcing it, because a viewer that
           filters at render time is a viewer that makes it fine to write them.
  cost     anything added to a log line is now added to an internal screen for 14 days.
           the redact list was already load-bearing (DEC-032); it is now doubly so.
  see      56, 72, 18 §9, 19 §4, 11 §3

DEC-044  ACTIVE  2026-08-23  origin:claude  resolves:CONF-020  repays:D-020
  what     A PER-PERSON GRANT ANCHORS AT THE PERSON'S HOME UNIT, and "home unit" is:
             one primary position        -> its unit  (11 §4 as originally written)
             no primary, exactly ONE     -> that one's unit          (the extension)
             no primary, TWO OR MORE     -> NO ANCHOR, no unit-scoped claim
             no positions                -> no anchor  (11 §4's "absent => self only")
  why      collect.ts registered the person node with NO unit, so scopeCovers() correctly
           refused every unit-scoped person grant a claim and A PER-PERSON DENY AT
           own_unit OR subtree DID NOTHING AT ALL. an administrator using 33's per-person
           override to block somebody inside their department wrote a row that LOOKED like
           it worked. INV-004 says a deny beats an allow unconditionally; a deny that never
           applies never beats anything. the per-person ALLOW was equally inert.
  chose    FIX THE CODE, not the doc. the alternative was narrowing 11 §4 to "a person
           grant must be self or all", which would have left T-052 building the powers
           grid's per-person row on a control that writes a row and changes nothing.
  measured BLAST RADIUS IS ZERO, and this was CHECKED rather than assumed: every grant in
           the database -- 1,545 rows across four demo orgs -- is on a ROLE node. there are
           no person or group grants at any scope. `all` and `self` person grants are
           unaffected either way (neither consults an anchor), so the ONLY behaviour that
           moves is unit-scoped person grants going from inert to working, and there are
           none.
  why-fallback  isPrimary DEFAULTS TO FALSE on CreateAssignmentBody, so the ordinary
           "give this person a position" call produces no primary at all -- 2 of 151 people
           in the dev database are already in that state. a strict primary-only rule would
           have left per-person overrides inert for the COMMONEST shape in the product,
           which is the bug it was meant to fix.
  why-not-guess  two unflagged positions is GENUINE AMBIGUITY -- isPrimary exists to
           resolve exactly it. picking one would anchor an override at whichever row the
           database returned first, and a non-deterministic permission system is worse than
           a narrow one. so: no anchor, and scopeCovers records "the grant has no anchor
           unit" in the trace, which 42 renders.
  ALSO     held.ts HAD THE SAME CLASS OF BUG AND IT WAS PRE-EXISTING. it subtracted a deny
           only when `scope === 'all' && !anchorUnitId`, but scopeCovers returns covers:true
           for `all` BEFORE looking at an anchor -- so an anchored `all` deny is just as
           inescapable. role grants ARE anchored, so an `all`-scoped deny on a ROLE was
           never subtracted from the UI capability set either. found by a regression in
           me.test.ts the moment person grants gained an anchor. now `scope === 'all'`,
           full stop, matching the resolver.
  verify   7 tests in test/person-anchor.test.ts. REVERTING THE ANCHOR FAILS 6 of them
           (including "expected true to be false" on the deny -- the deny not denying) while
           the two CORRECTLY-INERT cases still pass, which is what stops them asserting
           only that the fix exists. escalation.test.ts's deny corollary was written against
           scope `all` for one afternoon because of D-020 and is now back on `subtree`.
  see      11 §4, authz/collect.ts homeUnit(), authz/held.ts, CONF-020, D-020

DEC-045  ACTIVE  2026-08-23  origin:claude  amends:DEC-040  repays:D-022
  what     THE AUDIT ROW FOR A RESPONDENT SUBMISSION CARRIES NO ACTOR AND NO IP, WHOEVER
           IS SIGNED IN. the rule is keyed on THE ACTION, not on the principal kind:
             db/tx.ts  ANONYMOUS_ACTIONS = { 'response.submit' }
           actor_user_id and ip are both NULL for any action in that set.
  why      DEC-040 keyed the same rule on `principal.kind === 'user'`, which was correct
           for exactly as long as a respondent could never BE a user. DEC-037 made them
           one: an `organization` campaign is answered by a signed-in member (15 §3), so
           flushAudit would have written PRIYA'S USER ID and her address onto the
           response.submit row -- and responses.submitted_at is committed in the SAME
           TRANSACTION:
             audit_log   response.submit · campaign X · 14:05:11 · priya · 203.0.113.44
             responses            (anon) · campaign X · 14:05:11
           sort both by time, zip them, and the answers have NAMES against them. that is
           strictly worse than the IP leak D-019 closed three hours earlier, and it
           arrives through a different door.
  chose    RE-KEY ON THE ACTION rather than patch the principal test a second time. the
           principal was never the thing that mattered; "this state change is a respondent
           saying something" is. a third patch on principal kind was the alternative and it
           would have broken the next time somebody made a respondent something else.
  chose    A LIST AT THE WRITER, not a flag at the call site. a flag is a thing the next
           respondent-facing handler forgets; a list is a thing they have to add to. same
           argument 52 §6 already makes for fixing at the writer rather than the reader --
           a reader-side fix protects the one screen that exists (56) and has to be
           repeated for every screen that does not yet.
  measured D-022 WAS ALREADY LIVE AND HAD NEVER FIRED. respondentChain has always run
           authenticateOptional, so a staff member answering a PUBLIC link from their own
           signed-in browser already wrote their user id onto that row -- the demo
           presenter scanning their own QR is the likeliest way to hit it. checked before
           building: every response.submit row in the dev database has actor_user_id NULL,
           because nobody has ever answered a form while signed in. zero rows to repair.
  cost     one action is now unattributable in audit_log by design. that is the correct
           trade and it is the same one INV-006 has always made -- the log still records
           THAT a submission happened, to which campaign, at what time, which is every
           forensic fact that does not identify a person.
  verify   test/campaign-access.test.ts. REVERTING IT FAILS with the member's uuid where
           null was expected, and the INVERTED test -- a staff subject.create still writes
           both actor and ip -- keeps the rule from being satisfied by blinding the log.
  see      52 §6, DEC-040, DEC-037, D-019, D-022, db/tx.ts

DEC-046  ACTIVE  2026-08-24  origin:claude  amends:14 §8  repays:D-024
  what     THERE IS EXACTLY ONE WAY TO DISABLE AN ACCOUNT, and it is
           DELETE /people/:id/account behind `account.revoke`. `UpdatePersonBody` no longer
           accepts `status` at all; PATCH /people/:id edits a NAME and an EMAIL.
  why      the field had been there since T-033 and it was a FAKE REVOKE. it needed
           `person.update` (seeded to L2 subtree), not `account.revoke` (L1) -- which is
           the split 57 makes precisely so revocation can be withheld from a coordinator
           while the other two verbs are granted. and it did two thirds of the job:
             sessions   untouched. `authenticate` never reads users.status, so the
                        target's open browser kept working until the session expired on
                        its own. the administrator saw "disabled" and believed access had
                        ended. it had not.
             password   left in place, so flipping the status back restored their OLD
                        password -- the thing 57 says cannot exist, because a properly
                        revoked account has no old password to restore.
  chose    REMOVE THE FIELD rather than teach the PATCH route to do the other two things.
           an account's lifecycle belongs to `account.*`; a person's name and email are
           facts about the person. two routes that both end access is two places for the
           next one to be forgotten -- and the reason this was never noticed is that the
           frontend has never sent `status`, so the hole had no user and no test.
  chose    NOT to make `authenticate` re-read users.status per request. it would be real
           defence in depth and it costs a query on EVERY request in the product, to close
           a window that now has no opener. revisit if a second disable path is ever added.
  cost     a client sending `status` now has it silently stripped by Zod rather than
           honoured. nothing in the product sends it.
  verify   test/accounts.test.ts "D-024 -- there is exactly one way to disable an account":
           the PATCH renames them, does NOT change their status, and their session survives
           it -- which is the honest consequence, stated rather than hidden.
  see      57 § Revocation, 34, 15 §2, D-024

DEC-047  ACTIVE  2026-08-24  origin:claude  amends:11 §4  repays:D-026
  what     A PERSON WITH NO POSITIONS IS VISIBLE TO ANYBODY HOLDING `person.read` ANYWHERE.
           the person scope filter is one predicate in features/people/visibility.ts, read
           by BOTH the list and the detail route:
             a position in a unit the caller can see   OR
             no member edges at all                    OR
             it is the caller themselves
  why      `POST /people` creates a person and NO position -- 14 §8 insists on that,
           because granting a position is a permission change and must be its own audited
           call. so the person it returned had no unit, matched no unit-scoped caller, and
           VANISHED. verified end to end before the fix, on a brand-new organisation, as
           its founder:
             POST /people        201, id returned
             GET  /people        total 2, and the new person is not in it
             GET  /people/:id    404
           the founder holds `person.read: subtree` at the root, not `all`, which is the
           ordinary shape -- so this was every organisation, on the most common action in
           34, and every route that could have given them a position had first to see them.
           a deadlock, not a policy. it had no test because the create test never read the
           person back.
  chose    UNANCHORED MEANS NOBODY'S TERRITORY. scope filtering exists to stop you seeing
           people inside somebody ELSE's part of the organisation (INV-005); somebody with
           no position is in nobody's part of it, so no unit-scoped caller is excluded by
           territory. what is disclosed is the name and address of a person holding no
           powers at all.
  chose    ONE PREDICATE, EVALUATED BY THE DATABASE, shared by list and detail. they were
           two hand-written copies before and had ALREADY drifted in wording; two
           expressions of one rule is exactly how a row comes back in a table and then 404s
           when somebody clicks it (N-005, N-016).
  note     THE ASYMMETRY WITH 11 §4 IS DELIBERATE. for a GRANT, no anchor means no claim --
           an unanchored power defaults to nothing. for a TARGET, no anchor means nobody's
           territory. different question, opposite safe answer, and both are written down
           so the next reader does not "fix" one into the other.
  verify   test/people.test.ts "can still see somebody it just created, who has no position
           yet", plus its inverse -- somebody WITH a position in another section is still
           invisible, so the clause is not a back door.
  see      34, 11 §4, INV-003, INV-005, D-026

DEC-048  ACTIVE  2026-08-24  origin:user  supersedes:49 § Interactions, 16 §7  repays:D-012
  what     THE TIER IS PICKED AT SIGN-UP AND ASSIGNED IMMEDIATELY. one step between account
           creation and the setup wizard, three buttons -- Bronze, Silver, Gold -- and the
           one you press is the one you are on. `subscriptions` row written by REGISTER,
           not by a later visit to a billing page. NO TRIAL, no pre-selected default, no
           skip, no `trialing` status on the sign-up path.
           ENTERPRISE IS NOT ON THE PICKER. 16 §4 prices it individually as "a base
           platform plus chosen services", which is a sales conversation and not a button;
           it stays operator-assigned through `platform.plan.override` (19 §4), which is a
           route that already exists in the spec for exactly this.
  why      user, 2026-08-24: "when you login - pick between option / rn, no pricing, just
           pick the option (bronze, silver and gold) and you get assigned that / its
           basically revenue tiers but no actual pricing for now."
  chose    NO TRIAL, and DEC-035 is what killed it rather than this decision. 16 §7 starts
           new orgs `trialing` on Gold for 14 days "so the improvement loop is seen before
           it is SOLD", and 49 § Interactions builds the sign-up step around defaulting to
           it -- "a mandatory plan choice before anyone has seen the product is a sign-up
           form that asks a question its reader cannot yet answer". BOTH ARGUMENTS ARE
           ABOUT PRICE, and DEC-035 removed price on 23 Aug. when any tier is one free
           click, a 14-day free trial of Gold is a countdown to nothing: on day 15 the
           organisation presses Gold again. it would also need a SCHEDULER to expire, and
           OPEN-005 is still open -- nothing in this product owns scheduled work.
           the question the reader cannot answer stops being unanswerable too: with no
           amounts, picking is reversible at zero cost from Settings.
  resolves D-012's THREE-WAY AMBIGUITY, which was the blocker. 16 §7 said new orgs start
           `trialing` on Gold; requireEntitlement's own comment calls bronze "the trial
           default"; and NOTHING WROTE EITHER, so every org in the product -- all four demo
           orgs included -- is silently bronze and every Gold surface 402s for everyone.
           there is now one answer: the row is written at registration with the tier the
           person chose, and `status` is 'active' from the first request.
  measured MORE OF THIS EXISTS THAN THE BOARD SUGGESTS. src/backend/billing/entitlements.ts
           already has TIERS, TIER_ENTITLEMENTS and tierIncludes(); requireEntitlement is
           mounted and correct. the ONLY missing pieces are the row ever being written and
           the three buttons that write it -- which is why T-088 is carved out of T-057/
           T-058 rather than waiting for them.
  cost     the 402 path needs somebody to have CHOSEN bronze for it to be demonstrable on a
           real account. the seed covers it either way -- D-012 already asks for one demo
           org per tier -- and a real sign-up that picks Bronze now produces a real 402,
           which the trial default would have hidden for the first fourteen days.
  open     16 §7's trial paragraph is SUPERSEDED ON THE SIGN-UP PATH by the above. whether
           the concept survives anywhere else (a `trialing` status an operator can grant?)
           is not decided here and 16 §7 is annotated rather than deleted -- removing a
           documented feature is larger than what was asked for.
  built    2026-08-24, T-088, as decided. `RegisterBody.tier` is REQUIRED WITH NO DEFAULT --
           a default would have silently re-created D-012, every org on one tier chosen by
           nobody -- and the row is written INSIDE register's transaction, so an org cannot
           exist without a tier somebody chose. /start is two steps and ONE POST for that
           reason; a second page after the account existed would leave the same gap open for
           however long they took to answer. the seed now gives one demo org per tier, so the
           402 path is demonstrable on a real organisation instead of only in a test.
           IT FOUND D-028 ON THE WAY -- account.* and billing.* were in NO TIER AT ALL.
  see      49 § Interactions, 16 §4 §7, DEC-035, D-012, D-028, T-088, billing/entitlements.ts

DEC-049  ACTIVE  2026-08-24  origin:claude  supersedes:CONF-013  repays:D-007
  what     AN EMAIL ADDRESS STAYS PER-TENANT, AND LOGIN VERIFIES THE PASSWORD AGAINST EVERY
           ACTIVATED ACCOUNT ON IT -- capped at 5, ordered createdAt asc.
           exactly one match -> signed in, no question asked. that is every ordinary case,
           INCLUDING a person with accounts in two organisations who uses two passwords.
           more than one match -> 409 ACCOUNT_AMBIGUOUS naming the organisations, and the
           client re-posts with `orgId`. zero matches -> the one uniform 401, with a dummy
           verification when there are no candidates so an unknown address costs the same.
           `orgId` NARROWS, IT NEVER UNLOCKS: the password is checked against that org and
           nowhere else, so a wrong orgId fails exactly like a wrong password.
  why      CONF-013 asked whether an address is global or per-tenant and set 24 Aug as the
           date. the answer came from MEASURING rather than from choosing: the mitigation
           (findFirst, oldest activated row wins) closed the ADVERSARIAL lockout and left an
           HONEST one that is worse than the "ambiguity" CONF-013 described.
           REPRODUCED THROUGH THE REAL ROUTES, 24 Aug, before anything was changed:
             person has an account in org A. org B adds them (POST /people), provisions a
             sign-in (T-072, one click), they follow the link and choose a password. the
             activation signs them in -- and they can NEVER LOG IN AGAIN. their correct
             password returns 401 forever, because only the older row is ever compared
             against. measured: org B password 401, org A password 200, lands in A.
           T-072 shipped the day before and made reaching that state one click and a link.
  chose    (b) FROM CONF-013, in its disambiguation form rather than its slug-field form.
           rejected (a) MAKE EMAIL GLOBALLY UNIQUE, for three reasons and the third is the
             one that decides it: it forbids one person belonging to two organisations,
             which 10 allows and DEC-009 does not forbid; it needs a MIGRATION plus guards
             in people/service.ts, the CSV import and T-072's provisioning, two days before
             a graded demo; and it turns register's 409 "already registered" into a
             CROSS-TENANT MEMBERSHIP ORACLE -- "is alice@acme.com an Endur user anywhere?"
             -- in a product whose whole posture is INV-006 and INV-011.
           rejected (c) KEEP THE MITIGATION AS THE RULE. CONF-013 said "do NOT leave it as
             (c) by silence", and the measurement is why: (c) is not a documented tradeoff,
             it is a silent permanent lockout of the newer account.
           rejected the SLUG FIELD variant of (b) -- CONF-013 calls (b) "worse on stage",
             and that is true of asking every caller which organisation. asking ONLY when
             the password genuinely opens several costs nothing on stage: no seeded org
             shares an address, so the demo never renders the question.
  cost     an address with several activated accounts costs proportionally more argon2 work
           than one without -- a timing signal for the NUMBER of accounts on a known
           address. capped at 5, and register's 409 already discloses that an address is in
           use, so this adds cardinality rather than existence. stated, not hidden.
           a hypothetical SIXTH account is unreachable until one of the first five is
           revoked. oldest-first ordering means that always fails toward the incumbent.
  measured NO MIGRATION AND NO SCHEMA CHANGE, which is what made it the right answer two
           days from M0. one handler, one optional DTO field, one error code, one screen.
  proven   MAX_LOGIN_CANDIDATES reverted to 1 -> three tests in cross-tenant-login.test.ts
           fail, including "can sign in to the one they just activated". restored -> pass.
  see      15 §2, 13 §5, 30 § Sign in, CONF-013, D-007, T-072, features/auth/router.ts

DEC-050  ACTIVE  2026-08-24  origin:claude  extends:DEC-019  amends:13 § Auth, 20 §6, 50 §1
         closes-part-of:OPEN-009  repays:D-027 (half)
  what     THE CAPABILITY SET /auth/me HANDS THE SPA IS A MAP OF CAPABILITY -> SCOPE, not a
           list of verbs. `MeResponse.capabilities: HeldCapabilities` = Partial<Record<
           Capability, Scope>>. absent = not held anywhere. present = THE WIDEST SCOPE ANY
           LIVE ALLOW REACHES. keys sorted, so a diff between two callers stays readable.
           `useCan(cap, atLeast?)` compares breadth; atLeast DEFAULTS TO `self`, so every
           existing call site means exactly what it meant before.
           AND: the seeded matrix gives L4 `subject.read: own_unit` (50 §1).
  why      D-027. `person.read: self` is seeded to EVERY role without exception so that
           /app/profile opens (50 §1, and 11 §10 tests that it is never omitted). held.ts
           reported the verb only, so `can('person.read')` was TRUE FOR EVERY ACCOUNT IN
           THE PRODUCT, and the People nav item -- gated on that verb -- showed everybody a
           page listing exactly one person: the reader. `org.read: all` did the same to
           Settings. it could not be fixed on the client, because the client was never told
           the difference. the scope IS the difference.
  chose    A MAP KEYED BY CAPABILITY, not an array of {capability, scope} pairs: O(1)
           lookup, duplicate-free structurally rather than by assertion, and it is what
           useCan already wanted to build. JSON preserves insertion order for keys that are
           not array indices, and no capability is one, so sorted keys survive the wire.
           THE WIDEST ALLOW, not the narrowest and not a combination. the question held.ts
             answers is the same existential one it always answered -- "is there anywhere
             at all this button could work" -- so the widest reach is the honest answer.
             two `own_unit` grants at two different units report `own_unit` ONCE; the map
             cannot say WHICH units and does not pretend to. ask the resolver instead.
           A UNIT-SCOPED DENY DOES NOT NARROW THE VALUE, for the same reason it has never
             subtracted the key: an `own_unit` deny on one section is no reason to tell the
             client that a `subtree` allow stops there. an `all` deny still removes the key
             entirely. so the KEY SET IS BYTE-FOR-BYTE WHAT THE ARRAY WAS -- me.test.ts
             asserts that deliberately. T-086 changed what the client KNOWS, never which
             capabilities it is told about.
           `own_unit` FOR L4's subject.read: a respondent-level account has a reason to see
             the subjects of the section they are in and none to enumerate the whole
             organisation; `own_unit` not `subtree` for the reason unit.read stops there at
             L3 -- L4 is the bottom, so a subtree below them is usually empty.
           NO `needs` GATE WAS CHANGED. T-086 carries the scope; T-087 spends it. one task
             deliberately, so the mechanism and the per-tier policy are reviewed apart.
  cost     still usability, never enforcement (INV-003) -- requireCapability decides every
           route and this map decides nothing. the map is one notch more precise than the
           array and NOT a different kind of answer: "somewhere this reaches this far" is
           not "here". anything that must be true of a SPECIFIC thing is the server's.
           the L4 row changes what EVERY organisation gets by default. org.test.ts asserts
           the L4 grant list exactly, so a fifth capability cannot join it quietly.
  found    VERIFIED LIVE, end to end on the running API: probe org, POST /people, an L4
           assignment, POST /people/:id/account, activate, GET /auth/me as that account.
           the whole map came back as FOUR entries:
             { "org.read":"all", "person.read":"self", "person.update":"self",
               "subject.read":"own_unit" }
           A SCOPE GATE FIXES People AND DOES NOT FIX Settings, and T-087 needs to know:
             People   needs person.read   bare verb TRUE, beyond self FALSE  -> scope works
             Settings needs org.read      bare verb TRUE, beyond self TRUE   -> scope does
                      NOT work. org.read really IS `all` at L4 -- seeded to all four levels
                      so the vocabulary loads on first paint, and that is correct.
           so Settings is not a scope problem, it is the WRONG CAPABILITY: 55 § Stage 8's
           table puts Settings at L1 only, and `org.update` is L1 only. T-087 changes that
           item's `needs` from org.read to org.update. no scope involved.
           probe org deleted, 0 users left. API stopped.
  proven   held.ts flipped to report the NARROWEST allow -> "separates the universal
           person.read: self from a real one" and "reports the WIDEST allow" both fail.
           scopeReaches made to ignore `atLeast` (the pre-T-086 behaviour) -> the two
           useCan scope tests fail. both restored -> 338 backend, 721 frontend, green.
  see      13 § Auth, 20 §6, 50 §1, 55 § Stage 8, D-027, OPEN-009, T-086, T-087,
           authz/held.ts, lib/capabilities.ts, packages/shared/src/capabilities.ts

DEC-051  ACTIVE  2026-08-24  origin:user  resolves:OPEN-009  repays:D-027  spends:DEC-050
  what     WHAT EACH ROLE LEVEL SEES IN THE SIDEBAR, decided. NavItem gains `minScope`,
           defaulting to `self` -- how far `needs` must REACH before an item is worth
           showing. two gates changed and NOTHING ELSE:
             People    person.read, minScope own_unit   (was: the bare verb)
             Settings  org.update                        (was: org.read)
           the seeded matrix is UNCHANGED. no grant was added, removed or narrowed.
  chose    L3 KEEPS People. THE OWNER'S CALL, asked directly on 24 Aug and answered:
           "hide the item, keep the grant" was offered for L3 and DECLINED in its favour --
           an L3 holds `person.read: own_unit` from the matrix, so their People page lists
           their actual colleagues, not themselves. that is a real page. the participant-vs-
           manager question resolves to MANAGER OF A SMALL AREA at L3.
           the owner ALSO chose to leave the rest of the L3 row alone for now: L3 still
           sees Structure and Templates (`unit.read: own_unit`, `template.read: all`), which
           55 § Stage 8's first-draft table proposed hiding. deliberately not done -- see
           OPEN-010.
  fact     SETTINGS WAS NEVER A SCOPE PROBLEM, and this is the part that could not be seen
           from the docs. `org.read` is `all` at EVERY level including L4, seeded that way
           so the vocabulary loads on first paint (50 §1) -- so NO minimum scope could ever
           hide Settings. it was gated on the wrong capability. the page exists to EDIT the
           organisation; 55 § Stage 8 puts it at L1; `org.update` is L1.
           <VocabularyChips> had already gated its link there on `org.update`. the chip row
           reached this answer first and the sidebar was the half that had not caught up.
           found by reading a REAL L4 account's map off the running API, not from the table.
  cost     the ROUTE guard on /app/settings stays `org.read`, deliberately. the page already
           renders read-only without `org.update` (Settings.tsx `editable`), and a
           directly-typed URL showing a read-only page is a better answer than a 403 to
           something the caller may in fact read. so the item is absent from the nav and the
           page is still reachable -- that is 20 §6's stated exception, not a leak.
           still usability, never enforcement (INV-003). requireCapability refuses these
           routes and the lists already scope-filter; deleting every gate here exposes
           nothing.
  proven   both gates reverted (People to the bare verb, Settings to org.read) -> 5 of the
           13 sidebar tests fail. THE L1 TEST STILL PASSES, which is what stops the four
           per-level tests from being "everything must change". restored -> 13 pass.
  see      20 §2, 24 §2, 55 § Stage 8, 50 §1, OPEN-009, OPEN-010, D-027, DEC-050,
           components/layout/navItems.ts, components/layout/Sidebar.tsx

DEC-052  ACTIVE  2026-08-24  origin:claude  amends:47 § Data contract  task:T-051
  what     `ProfileView` REUSES `/people/:id`'s TYPES rather than declaring its own.
           `Position` and `PowersAtPlace` are named in packages/shared/src/dto/person.ts
           and both routes return them. 47's own sketch gave each a narrower shape --
           `capabilities: string[]`, and a positions type without `edgeId` -- and the doc
           was amended to the code, not the other way round.
  why      N-005 says the powers view is produced by the SHARED resolver and never a second
           implementation, and 34 and 47 say it independently, in the same words. the way
           that promise actually breaks is not somebody writing a second resolver on
           purpose. it is a second CONSUMER: two response shapes force two renderers, and
           <PowersByPlace> would have been forked into one per screen. the rule is about the
           resolver and the failure arrives one layer above it.
  also     there is now exactly ONE caller of resolve() for this question --
           features/people/powers.ts -- shared by readPerson and readProfile the way
           visibility.ts is shared with 57's account routes and positions.ts with the
           import guard. same pattern, third time.
  cost     the two routes are coupled: a field added for the profile page appears on every
           person row. that is the intended direction. they are the same three blocks about
           the same kind of human being, and the whole point of 47 existing as a separate
           doc is WHO IS READING, not what is read.
  see      47 § Data contract, 34 § Interactions, 24 §4, 13 § Profile, N-005, N-057

DEC-053  ACTIVE  2026-08-24  origin:claude  task:T-051  touches:12 §7
  what     POST /profile/password CARRIES NO requireCapability, and is the one AUTHENTICATED
           route on the route-enumeration allowlist (test/routes.test.ts).
  why      13 § Profile and 47 § Capabilities both specify it that way and the reason holds:
           no capability expresses "you hold this session AND you know the current
           password". the nearest candidate, `person.update: self`, is seeded to EVERY role
           (50 §1), so a gate on it would refuse nobody -- it would only make the route look
           guarded -- and it would imply an organisation could withhold password changes by
           editing a role, leaving that person unable to rotate a credential they own.
  fact     what makes it safe is the SHAPE, not the gate: the route takes no id. the only
           password it can reach is the caller's own, which is 57's rule ("why an
           administrator still cannot set a password") arriving from the other side. the
           current password is verified inside the service, where a hash comparison can
           happen and a Zod schema cannot.
  cost     the allowlist is named PUBLIC_ROUTES and this entry is not public -- `authenticate`
           runs and it 401s without a session. the list actually enumerates uncapability-
           gated routes. renamed in the comment rather than in code, because the constant is
           referenced by 12 §7 and a rename is a doc edit in three places for no behaviour.
  proven   the enumeration test FAILED when the route was added, which is the mechanism
           working exactly as 12 §7 intends: a human had to argue for the entry.
  see      13 § Profile, 47 § Capabilities, 12 §7, 57 § Revocation, 15 § Password handling

DEC-054  ACTIVE  2026-08-24  origin:owner-report  repairs:D-029  task:T-089  touches:20 §2, 25
  decision A FAILED MODULE IMPORT IS A STALE-APP FAILURE AND ITS ONLY REMEDY IS A FULL
           DOCUMENT LOAD. every page is lazy (20 §2), so the browser fetches a route's chunk
           at CLICK TIME -- minutes or hours after the document loaded. if the module graph
           moved underneath it, the already-running app keeps working and the NEXT lazy
           route is the thing that dies.
  rule     a boundary catching an import failure MUST (a) say the app updated, in those
           words, and (b) offer a HARD RELOAD, never a client-side <Link>. a router link
           re-renders inside the same dead module graph and fails identically, turning one
           failure into a loop the user cannot escape without knowing to press ctrl-F5.
  why      three different causes produce it -- a deploy replacing hashed chunks, a dev
           server restart, a vite dep re-optimisation -- and the boundary can identify the
           CLASS from the thrown value without knowing which one fired. all three want the
           same remedy, so no diagnosis is required to give the right advice.
  fact     ConsoleBoundary ALREADY DOES THIS and its comment says why: `<a href="/app">`,
           "whatever state caused the crash is in memory, and navigating within the same app
           carries it along". PublicBoundary was the half that had not caught up, and /login
           is the most-hit lazy route in the product -- it is what the landing page's one
           call to action points at.
  cost     the copy stops being literally accurate for the OTHER thing that can throw here
           (a genuine render bug). accepted: describe() keeps its existing branch for
           everything that is not an import failure, so this is an added case, not a
           replacement.
  homed    HERE BECAUSE 25 IS UNWRITTEN. 25-FRONTEND-ERROR-HANDLING.md is a reserved
           placeholder whose "what will go here" already lists "error boundaries per world
           and what each renders". when it is written it inherits this as its first row.
  see      20 §2, 25, D-029, T-089, router/boundaries.tsx, 30 § Sign in

DEC-055  ACTIVE  2026-08-24  origin:claude  task:T-052  repays:D-008  touches:33, 22 §6
  decision THREE CAPABILITY OBJECTS ARE THE ORGANISATION'S WORDS AND TWENTY ARE OURS.
           `unit`, `subject` and `campaign` are what organization.labels renames, so the
           powers grid's row labels resolve those three per tenant and leave the rest
           literal. `role`, `person`, `template`, `org`, `grant`, `account`, `audit`,
           `apikey`, `billing` and the rest are Endur's own furniture -- INV-001's own
           carve-out ("structural words stay literal"), not an exception to it. 33 §
           Interactions said deciding this was that document's work; this is the decision.
  shape    packages/shared/src/capability-labels.ts. ONE PHRASE PER CAPABILITY, WRITTEN OUT
           -- 64 of them, `Record<Capability, string>` so the compiler refuses a missing or
           surplus key -- with `{unit}` `{subject}` `{campaign}` filled at render. The server
           builds them with `nounsOf(req)`; the same function is exported for the client.
  why not derived  the old rule was four lines in features/roles/service.ts:
           `${verb} ${object}s`.replace(/ss$/, 'ses'), and it is how `campaign.launch`
           became "launch campaigns" on the one grid a hotel administrator reads.
           audit:vocab cannot see it, because the string is ASSEMBLED FROM A KEY rather than
           written anywhere -- which is why D-008 was filed rather than fixed.
  found    writing them out showed the derivation was not merely un-localised, it was WRONG
           for every object added after the rule: `results.read` produced "read resultses",
           `apikey.create` "create apikeys", `actionplan.read` "read actionplans". Nobody had
           read the output. THAT IS THE FAILURE MODE OF EVERY CLEVER STRING DERIVATION and
           the general lesson is worth more than the fix.
  fallback a capability with no phrase renders its RAW KEY, never a derivation. a key on
           screen is obvious in one glance; "frobnicate widgets" looks deliberate and ships.
  one impl the grid's row labels and the grant WARNINGS are the same builder. two would
           drift, and "Nobody in this organisation can launch campaigns" is the drift
           arriving -- in a sentence, to an administrator, on the screen whose whole claim is
           that it explains itself.
  proven   live against The Grand Palace: "open guest surveys for answers", "add
           restaurants", "move properties to a different parent".
  see      33 § Interactions, D-008, 22 §6, lib/vocabulary.ts, T-052

DEC-056  ACTIVE  2026-08-24  origin:claude  task:T-052  extends:INV-012  touches:12 §2, 33
  decision A GRID CELL IS BOUNDED BY WHAT THE SAVER CAN DO **EVERYWHERE**, NOT BY SCOPE WIDTH.
           middleware/requireNoGrantEscalation.ts, link 10b on PUT /grants.
  why      33 § "The escalation bound" specifies it and nothing implemented it: PUT /grants
           carried requireCapability('grant.update') and nothing else, so anyone the
           administrator delegated the grid to could write any role every capability in the
           catalogue. Same shape as D-018, one screen along -- the route's own check passed
           because nobody had asked the second question. 33 names this screen as the worse of
           the two: "editing a role's row raises everyone holding it".
  the rule a cell says nothing about WHERE. it grants C to a role, and that role can later be
           placed at any unit by anybody holding assignment.create. the saver cannot know
           where the power will be exercised, so the only honest bound is that they must hold
           it across the WHOLE organisation themselves.
  !! THE FIRST VERSION COMPARED SCOPE WIDTHS and was wrong in both directions. the tests
           caught it by refusing THE FOUNDER: 50 §1 seeds level 1 `campaign.launch: subtree`,
           not `all`, because a subtree anchored at the ROOT unit already is the whole
           organisation -- so the owner of a new org could not grant `all` on their own grid.
           and it is wrong the other way too: `subtree` at Section A is NOT the organisation,
           and a width comparison cannot tell those two apart, because heldCapabilities()
           deliberately discards the anchor. so this asks visibleUnits(), the same primitive
           findEscalation uses, and SCOPE WIDTH IS NOT CONSULTED AT ALL.
  bounds   ALLOWS ONLY. a deny cell and a `scope: null` cell both REDUCE what a role can do,
           and refusing those would make the bound a weapon -- a delegate could be prevented
           from undoing their own mistake.
  order    a capability not in the catalogue is skipped, so writeMatrix's 409 ("that is not a
           capability") still wins. without that line the guard reached it first and told an
           administrator who typed `campaign.obliterate` that they lacked a power that does
           not exist. EACH REFUSAL OWNED BY THE CHECK THAT CAN EXPLAIN IT.
  sibling  NOT an extension of requireNoEscalation (INV-009 is about a second PLACEMENT of
           one thing; this is a second RULE). a position is a role at a unit and resolves
           through the graph; a cell IS a capability at a scope and needs no graph.
  see      33 § "The escalation bound", 11 §5b, 12 §2, DEC-039, D-018, T-052

DEC-057  ACTIVE  2026-08-24  origin:claude  task:T-052  touches:33 § "The lockout guard"
  decision THE LOCKOUT GUARD IS A 409 IN THE SERVICE, NOT A CAPABILITY CHECK, AND IT IS
           COMPUTED ON THE RESULTING MATRIX. A save leaving no role holding an ALLOW on
           `grant.update` is refused outright. Specified since round 1 and never built.
  why here not middleware  it is not an authorisation question. the caller IS permitted to
           make the change; the resulting STATE is what is refused. same shape as "that is
           not a capability", which is why it sits beside it.
  resulting, not submitted  PUT /grants writes the cells it is given and leaves the rest
           alone, so a body that merely does not MENTION grant.update is fine and one that
           removes the last holder is not. checking the BODY would refuse the first and allow
           the second, which is exactly backwards.
  INV-004  a role both allowed and denied holds NOTHING. a guard counting rows rather than
           outcomes would wave through a matrix that LOOKS like it has a holder.
  the one override  33 argues this exception rather than assuming it, and the argument holds:
           everything else the grid can express is a legal configuration somebody might mean,
           and blocking on a judgement call is how administrators learn to fight the tool.
           this is not a judgement call -- it is a state from which the tool cannot be
           operated, and there is no undo, because undo is a grid edit.
  THE OTHER HALF IS THE CLIENT'S, and the server cannot do it. handing the grid to somebody
           else and keeping NONE for yourself is legal, occasionally intended, and still a
           one-way door for the person pressing the button. only the client knows which roles
           the reader holds -- which is why Position gained `roleId` (T-052): matching the
           caller's positions to grid columns BY NAME is N-057 exactly, before the one save
           in the product that cannot be undone.
  see      33 § "The lockout guard", 14 § Position, N-057, T-052


DEC-058  ACTIVE  2026-08-25  origin:claude  task:T-079  touches:58, 13 § Inbox, 10 §5
  decision THE INBOX OWNS `inbox_state` AND NOTHING ELSE. Every word it renders comes from
           features/results/service.ts's readComments(), which is where the k-anonymity gate
           already lives. features/inbox/ does not query `responses` and must not learn how.
  why      38 § "Not built" refused a per-subject breakdown in these words: "a second ungated
           path to them is what INV-007 exists to prevent". The inbox is the same mistake
           made larger -- a list of INDIVIDUAL COMMENTS ACROSS CAMPAIGNS, which is precisely
           what the gate exists to withhold. A feature folder that cannot reach `responses`
           cannot grow a second path to one by accident later.
  the merge is where a UNION would be wrong  the threshold is applied PER CAMPAIGN before
           anything is combined. two campaigns of four responses each do not become a
           readable eight. asserted directly, because it is the failure a naive
           cross-campaign query makes and it looks correct while making it.
  one scope predicate  canSee() is shared by assertVisible (40's path) and readableCampaigns
           (58's). 58 § Acceptance asks that the two match for the same caller; sharing the
           function is how that is true BY CONSTRUCTION rather than by two people writing
           the same `some()` twice.
  the writes are gated too  POST /inbox/:id/read on a guessed uuid would otherwise be an
           oracle -- 204 for a response that exists, 404 for one that does not, in a campaign
           the caller cannot read. one readComments() call per mark, same 404 for all three
           reasons (absent / out of scope / below threshold), because a distinct message for
           the third announces that suppressed data exists.
  see      58, 10 §5, features/inbox/service.ts, test/inbox.test.ts

DEC-059  ACTIVE  2026-08-25  origin:claude  task:T-079  amends:58 § Data contract
  decision `InboxResponse` CARRIES TWO FIELDS 58 DID NOT SPECIFY: `questionId` and
           `scoreMax`. Both are forced by the table, not chosen.
  questionId  `id` IS THE RESPONSE ID -- inbox_state is keyed (user_id, response_id) and the
           routes are /inbox/:responseId/read, so nothing else can mark anything. A response
           answering two free-text questions therefore produces two cards SHARING one read
           state, which is correct ("I have dealt with this response" is one fact), and
           leaves them without distinct React keys. questionId is the key.
  scoreMax the rating's scale. `score: 3` is meaningless without knowing whether the top is
           5 or 10, and a template can use either. Read from the question's own config.
  what is still NOT there  any respondent attribute, and any of 43's four tags. The first is
           impossible (INV-006, no column could supply one) and the second is refused until
           43 exists (24 §6c).
  see      58 § Data contract, packages/shared/src/dto/inbox.ts

DEC-060  ACTIVE  2026-08-25  origin:claude  task:T-080  touches:58 § State
  decision READING IS NOT TRIAGING. A card marked read BY BEING OPENED stays where it is;
           a card the reader ticks, archives, or hits `u`/`e` on leaves the tab. The unread
           COUNT drops either way.
  found by its own test  the first version filtered every marked card out of the tab
           immediately, which is right for a tick and wrong for an expand: on the Unread tab
           the detail appeared and vanished in the same frame, because opening the card marks
           it read and read cards do not belong in Unread. The test that caught it was
           written to assert the expansion, not the eviction.
  why not "never evict"  the eviction is the feature. 58 opens by calling this the only
           TRIAGE-shaped screen in the product; a tick that leaves the card sitting there is
           a tick that did nothing. Only the side effect of reading is exempt.
  see      58 § State, lib/inbox.ts mark(), pages/console/Inbox/Inbox.test.tsx
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
  UNCHANGED BY DEC-037. an authenticated respondent's identity is checked at the gate and
  discarded at the door; campaign_participants records THAT a member answered, never WHAT,
  and has no response reference -- the column that would undo this in one migration.
  NOTE THE TWO PROMISES ARE DIFFERENT (52 §1): "the answer is anonymous" always holds;
  "your participation is private" holds only on an open link with no invitations.
  DEC-040 closed a path INTO this through audit_log.ip. a dormant leak is a leak.
  see      52-SECURITY-AND-PRIVACY.md, DEC-037, DEC-040

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

INV-012  NO PRINCIPAL MAY CREATE A POSITION, GRANT OR ACCOUNT WHOSE RESOLVED POWERS EXCEED
  THEIR OWN. the capability set the new actor would resolve to, at the units it resolves
  them at, must be a SUBSET of the creator's own set at those same units.
  computed  from resolve(), never from Node.level -- level is ordering and seeding only
            (DEC-002, CONF-002).
  corollar  a deny the actor carries must survive into what they create, or a deny is
            escapable by proxy and INV-004 becomes a suggestion.
  where     requireNoEscalation, MIDDLEWARE not a service check (INV-003 -- "may you hand
            this power out" is an authorisation decision). it can only refuse; it never
            replaces requireCapability.
  except    register and /org/setup seed the founder's position before any actor exists to
            bound against, inside the registration transaction.
  origin    DEC-039. found 2026-08-23 as a LIVE HOLE: addAssignment() checked
            assignment.create and nothing else, so a coordinator could assign Owner at root.
  see       11 §5b, 12 §4.10b
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

CONF-020  RESOLVED-BY:DEC-044  2026-08-23  11 §4's anchor table  vs  authz/collect.ts
  11 §4 SAYS a grant on a PERSON node anchors at "the person's primary position's unit;
  absent => self only". collect.ts DOES NOT DO THAT -- it sets
  `anchors.set(personNode.id, { via: 'person', name })` with NO unitId, so every
  person-node grant is unanchored.
  CONSEQUENCE, and it is not cosmetic: scopeCovers() correctly refuses an unanchored grant
  a unit scope ("no anchor means no claim"), so A PER-PERSON DENY AT own_unit OR subtree
  DOES NOTHING AT ALL. an administrator using 33's per-person override to block somebody
  inside their department writes a row that is silently inert. INV-004 says deny beats
  allow unconditionally; a deny that never applies is a deny that never beats anything.
  the same is true of a per-person ALLOW at a unit scope, which simply never grants.
  FOUND 2026-08-23 while writing T-071's deny-corollary test, which used
  denyPerson(..., 'subtree') and got a 201. every EXISTING test of denyPerson uses scope
  `all`, which is why nothing caught it: `all` needs no anchor.
  RESOLVED SAME DAY -> DEC-044, and the deciding fact was MEASURED rather than argued:
  every grant in the database is on a ROLE node, so anchoring person grants moves nothing
  that exists. the feared blast radius was not there. fixed the CODE rather than narrowing
  the doc, because the alternative left T-052 building 33's per-person override on a
  control that writes a row and changes nothing.
  DEC-044 adds one clause 11 §4 did not have -- a lone unflagged position counts as home --
  because isPrimary defaults to FALSE and a strict rule would have left the commonest
  shape in the product still inert.
  see D-020, 11 §4, authz/collect.ts, authz/scope.ts, test/escalation.test.ts

CONF-019  RESOLVED  2026-08-23  the sidebar's phase tags  vs  the owner's "complete these too"
  THE OWNER POINTED AT THE SIDEBAR AND ASKED FOR EVERY "SOON" ITEM TO BE COMPLETED. five
  items carry that tag: Roles, People, Analysis, Inbox, Reflect. their docs disagree with
  the ask in three different ways, and the three need three different answers rather than
  one blanket re-tag.
    Roles (33), People (34)  P2, fully specified since round 1, backend built since T-017/
                             T-018. NO CONFLICT AT ALL -- they are unbuilt, not unplanned.
                             T-050, T-051, T-052 already exist for them.
    Analysis (43)            P3, AND BLOCKED ON OPEN-003 (which engine). could not be built
                             while undecided -> RESOLVED BY DEC-042, rule-based.
    Reflect (44)             P3, and blocked on D-012 in a way nobody had noticed: every
                             capability in 44 is GOLD-entitled and NO ORG HAS EVER HAD A
                             SUBSCRIPTION ROW, so requireEntitlement reads 'bronze' for
                             everyone and the whole surface 402s for every user, forever.
                             building the screens first produces a feature nobody can open,
                             INCLUDING THE DEMO. T-057 BEFORE T-081. not negotiable.
    Inbox                    HAD NO ARCHITECTURE DOC AT ALL. it is drawn in
                             design_specs/design/08 §8.3 and named only in 43 § Out of scope
                             ("related surface, P3"). the same class of gap 46 was -- a
                             route in the sidebar that no doc owned. NOW 58, and pulled to
                             P2 on §8.3's OWN advice: "the read/unread/archived mechanic
                             would work today on raw comments... the only roadmap screen
                             worth considering pulling forward".
  RESOLVED -> 43 and 44 are re-tagged "P3, buildable" with the P3 label kept on the parts
  that genuinely need P3 (cycle-over-cycle measurement, themes over time). 58 is written and
  tagged P2. 33/34 need no re-tag, only building.
  THE PATTERN, SINCE IT IS THE SECOND TIME: an owner instruction that crosses a phase
  boundary is a CONF, not a silent re-tag. CONF-018 did the same for 48. write down what
  each blocked item was blocked ON, because the answer differs per item and a blanket
  "it is P2 now" would have hidden a hard dependency (D-012) behind an easy one.
  see 43, 44, 58, DEC-042, D-012, T-079..T-082.

CONF-021  RESOLVED-BY-OWNER  2026-08-24  55 § Stage 7's "sequenced behind M0"  vs  the owner
          asking a SECOND time for the greyed sidebar items
  THE SAME ASK AS CONF-019, MADE AGAIN, WITH THE OBSERVATION THAT NOTHING HAPPENED:
  "roles, analytics, inbox and reflect still need to be built (i asked for this before and
  you didnt do it)". THAT IS ACCURATE AND THIS LEDGER IS THE PROOF. CONF-019 (23 Aug)
  answered the ask by WRITING SPECS -- 43 and 44 re-tagged buildable, 58 written from
  scratch -- and then sequencing every one of them behind M0. no code followed. from the
  owner's chair the sidebar is unchanged two days later, because it is.
  ("analytics" here is the SIDEBAR item, which reads Analysis -> 43. the platform analytics
  page, 71, is a separate surface and arrives under the owner's third item, not this one.)
  WHY THE FIRST ANSWER WAS WRONG, precisely: CONF-019 answered "CAN these be built?" when
  the ask was "BUILD these". a spec is not the deliverable; the page is. everything CONF-019
  established -- the phase tags, the per-item blocker analysis -- remains correct and is not
  withdrawn. what is withdrawn is the SEQUENCE those findings were used to justify.
  RESOLVED -> the four items are promoted ABOVE the remainder of Stage 6 (T-053..T-055,
  T-057, T-058, T-060) and above T-073. ordering in 55 § Stage 9.
  WHAT CHANGED SINCE CONF-019, and it is why this is now cheap rather than blocked: T-088
  wrote the subscriptions row (DEC-048), repaying D-012, so Analysis and Reflect -- both
  entirely GOLD-entitled -- no longer 402 for every user in the product. CONF-019's one hard
  blocker is gone. Roles and Inbox never had one.
  THE COST, STATED ONCE AND NOT RE-ARGUED: M0 is 26 Aug, two days out, and T-045 (three demo
  rehearsals) is unrun. SEVEN tasks for item 2 alone (T-052, T-079..T-084; T-085 is per-page
  edits, not a task), sixteen across the whole stage. the owner has asked twice;
  the sequence is theirs and this entry records the trade rather than re-opening it.
  see 55 § Stage 9, CONF-019, DEC-042, DEC-048, D-012, T-052, T-079..T-085.

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

CONF-022  <ScoreBadge> HAS A LEGITIMATE CALLER NOW, AND CONF-016 REFUSED IT ON A PREMISE
          THAT HAS CHANGED. 24 Aug -> 25 Aug, found building T-080.
          CONF-016 refused to build it, and every word of its argument was right ABOUT 40:
          24 §3 defined the component as a score "with threshold colours", 40 § Interactions
          forbids exactly that -- "Do not colour rating 1 red and rating 5 green, that is
          interpretation" -- and 40 was the only would-be caller. A component whose single
          use is the one place the docs rule out is one that eventually acquires an
          illegitimate one. That reasoning is untouched.
          58 § Components lists <ScoreBadge> too, and its number is a DIFFERENT number:
            40's is an AVERAGE over responses. Deciding 3.8 is bad is an inference.
            58's is ONE PERSON'S OWN RATING on the response their comment came from.
            "2/5 - the projector in Room 4 has never worked" is a fact somebody stated, and
            reporting what they said is not judging it.
          So the two halves of CONF-016 come apart, and only one of them was ever about the
          badge:
            THE COLOURS were the interpretation. They are not built, at any value.
            THE BADGE was refused for having no legitimate caller. It has one.
          RESOLVED -> BUILT, COLOURLESS. One surface at every score, and the prohibition now
          lives INSIDE the component rather than in a doc nobody reads before importing it
          -- which is a stronger place for it than "not built" ever was, because the next
          page that wants a score gets the safe one instead of writing its own.
          Its test asserts `className === 'score-badge'` exactly, so a well-meant `.is-bad`
          is a failing test rather than a code review nobody runs.
          status   ACTIVE. 43 may still define a JUDGED score against a rubric; that is a
                   different component and CONF-016's last paragraph still describes it.
          see      CONF-016, CONF-004, 24 §3, 58 § Components, components/data/ScoreBadge.tsx

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
          status   NARROWED 2026-08-25 BY CONF-022 -- the PROHIBITION stands unchanged and is
                   now enforced inside the component. The "not built" half lapsed when 58
                   produced a second, legitimate caller. It was revisited earlier than
                   expected and for a different reason than expected: not a rubric, but a
                   number that was never an average in the first place.

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

CONF-013  RESOLVED 2026-08-24 BY DEC-049 -- PER-TENANT, and login verifies the password
          against every activated account on the address rather than only the oldest. Read
          DEC-049 for the reasoning and for the honest lockout the mitigation below left
          open, which was measured rather than argued. Kept in full because the reproduction
          is the reasoning, and because option (a) remains available if the product ever
          decides one person may not belong to two organisations.
          IS AN EMAIL ADDRESS GLOBAL OR PER-TENANT? The schema and the login contract
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
          ANSWERED: (b), in its disambiguation form. DEC-049. The blast radius above
          understated it -- the honest collision was not ambiguity, it was a silent
          permanent lockout of the newer account, measured 24 Aug.

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

OPEN-003  RESOLVED-BY:DEC-042  2026-08-23
  analysis engine: themes/sentiment. rule-based vs LLM-assisted. affects 43-PAGE-analysis.md
  and whether an API key/cost enters the stack. not needed before P3.
  RESOLVED 2026-08-23 -> RULE-BASED, no LLM in P1-P3. forced early by CONF-019: the owner
  asked for the Analysis page to be completed and it could not be built while the engine was
  undecided. the decider was the PRIVACY question -- 52 promises anonymity, shipping
  free-text to a third party is a disclosure needing a consent mechanism the product does
  not have. LLM stays available as a per-org opt-in behind one interface. REVISIT:2026-11-01
  stands, but nothing is blocked on it now. see DEC-042.

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

OPEN-009  CLOSED 2026-08-24 by DEC-051, answered by the owner  raised 2026-08-24 by the
          owner  was-blocking:T-087  found-by:T-072
  ANSWER, in the owner's own choice, 24 Aug: L3 KEEPS People (they hold
  `person.read: own_unit`, so the page lists their real colleagues), and the REST of the L3
  row is left alone for now -- see OPEN-010. L4 gets Subjects and nothing else in
  `organize`. Settings is L1 only, via `org.update` rather than a scope. DEC-051 has the
  reasoning; the rest of this entry is kept as the record of how the question was framed.
  WHAT DOES EACH ROLE LEVEL SEE IN THE SIDEBAR? the owner's words: "student / lowest tier
  shouldn't see roles, people and department pages at all (even if they see nothing
  actually in it). only courses list. similar logic for upper tiers."
  translated (INV-002): the L4 role should see the SUBJECTS list and nothing else in
  `organize`. Unit = department, Subject = course, L4 = student.
  WHY IT IS OPEN NOW rather than a year ago: 50 §1 says of the L4 row "this row only
  matters for the rare case of someone at that level who DOES hold an account". T-072
  made provisioning an account for anybody in the graph a one-click action on 24 Aug, so
  the case stopped being rare and nobody had designed what those people see.
  THE MECHANICAL HALF IS NOT OPEN -- it is a bug, and it is bigger than L4:
    navItems.ts gates every item on a bare capability (`needs`), and authz/held.ts
    DELIBERATELY DISCARDS SCOPE (a capability is held when any live allow exists).
    so `person.read: self` -- the UNIVERSAL grant every role gets, 50 §1 -- satisfies
    People's gate, and EVERY ACCOUNT IN THE PRODUCT sees a People item that lists exactly
    one person: themselves. `org.read: all` does the same for Settings, seeded to all four
    levels so the vocabulary can load. Structure and Roles are already correctly hidden
    for L4; Subjects is already hidden and is the one item they SHOULD have.
    fix: T-086 carries scope to the client so a gate can say "person.read beyond self".
    DONE 2026-08-24, DEC-050 -- the map is on the wire and useCan(cap, atLeast) reads it.
    T-086 changed NO `needs` gate, on purpose: the mechanism is reviewable apart from the
    per-tier policy, and the policy is still this question. T-087 is what spends it.
    NOT an authorisation change -- requireCapability already refuses these routes and the
    lists already scope-filter to nothing. this is design_specs/design/02 §5 (an action
    the caller cannot perform is ABSENT) applied to the sidebar, where it is half true.
  THE GENUINELY OPEN QUESTION, and it is one cell: L3 x People. an L3 holds
  `person.read: own_unit` from the seeded matrix, so seeing their colleagues is the matrix
  working as designed, not an accident. hiding it is a PRODUCT choice about whether a
  reviewee-level account is a participant or a manager of a small area, and the owner
  should answer it rather than a session guessing. every other cell in 55 § Stage 8's
  table follows from grants that already exist.
  CLOSED, the smaller half, 2026-08-24 by DEC-050: L4 had no `subject.read` row at all, so
  "only the courses list" was unreachable. T-086 added one at `own_unit` -- the owner's own
  words are the authorisation ("only courses list"), and 55 § Stage 8 put the row inside
  T-086's scope with no blocker, which is the reading taken where 50 §1 held it for a
  confirmation. `own_unit` not `all`: a reason to see their own section's subjects, none to
  enumerate the organisation. org.test.ts now asserts the L4 grant list EXACTLY, so the next
  row cannot join it quietly. SUBJECTS IS NOW VISIBLE FOR L4 with no new gate machinery.
  ANSWERED 2026-08-24, DEC-051: L3 KEEPS People. the owner was offered "hide the item,
  keep the grant" and chose to leave it -- an L3's roster is real, so the participant-vs-
  manager question resolves to manager-of-a-small-area at that level.
  AND ONE CLAIM ABOVE TURNED OUT TO BE WRONG, which is worth keeping visible: "every other
  cell follows from grants that already exist" is NOT true of Settings. `org.read` is `all`
  at every level including L4, so no scope minimum could ever hide it -- it was the wrong
  capability, not a too-wide one, and only reading a real L4 account's map showed that.
  nor is it true of L3 x Structure or L3 x Templates, which 55 § Stage 8's draft table also
  proposed hiding: L3 genuinely holds `unit.read: own_unit` and `template.read: all`. the
  owner chose to leave those for now -- OPEN-010.
  see 55 § Stage 8, 20 §2, 50 §1, authz/held.ts, D-027

OPEN-010  OPEN  raised 2026-08-24 by the owner's deferral  blocks:nothing-for-M0
          found-by:T-087  successor-to:OPEN-009
  SHOULD THE REST OF THE L3 ROW BE TRIMMED? T-087 answered L3 x People (it stays, DEC-051)
  and the owner explicitly chose to decide only that cell for now. so an L3 still sees:
    Structure   `unit.read: own_unit`   -- their own section's node and its children
    Templates   `template.read: all`    -- templates are org-wide and have no unit (50 §1
                                           says a unit scope here would mean nobody could
                                           read them), so this cannot be narrowed by scope
                                           either -- it would need a different capability,
                                           exactly like Settings did.
  55 § Stage 8's FIRST-DRAFT table proposed hiding both at L3. that table was written
  before anyone had read a real account's capability map, and it has now been wrong twice
  (Settings, and these two), so it should be treated as a sketch rather than a spec.
  WHY IT CAN WAIT: an L3 seeing Structure and Templates is not a bug the way People was --
  both pages have real content for them, neither lists just themselves, and neither is an
  admin surface they cannot use (an L3 holds `template.clone: all`). it is a product
  question about how much furniture a reviewee-level account should carry, and the owner
  is better placed to answer it after seeing the trimmed sidebar on screen.
  NOT M0. the owner's original ask was about the LOWEST tier and that is fully delivered.
  see DEC-051, OPEN-009, 55 § Stage 8, 50 §1

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
                                    also packages/shared/src/capabilities.ts — the
                                    CATALOGUE and the SCOPE vocabulary (SCOPES,
                                    SCOPE_BREADTH, and since T-086 HeldCapabilities +
                                    scopeReaches, which both apps compare with). 11 §3 is
                                    still the authoritative catalogue; additions go to the
                                    doc first. see DEC-050.
12-MIDDLEWARE-STACK.md           -> src/backend/middleware/** src/backend/app.ts
13-API-CONTRACT.md               -> src/backend/routes/** (router wiring only)
                                    NOTE: routes/ was never created. routers live beside
                                    their service in src/backend/features/<name>/router.ts
                                    and are mounted by lib/mount.ts. 13 still owns the
                                    CONTRACT; the folder name differs from the doc.
14-DTO-AND-VALIDATION.md         -> packages/shared/src/dto/**
15-AUTH-AND-SESSIONS.md          -> src/backend/auth/**
16-TENANCY-BILLING-ENTITLEMENTS  -> src/backend/billing/**
                                    T-088 also took packages/shared/src/tiers.ts — the
                                    tier NAMES and selling lines, DATA, for the same
                                    reason 30 took vocabularies.ts: /start has no session
                                    and cannot fetch GET /billing/plans. the ENTITLEMENT
                                    MAP stays server-side and is not shipped. see DEC-048.
                                    <PlanPicker> is components/billing/**, owned by 24.
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
                                    src/frontend/lib/profile.ts
                                    src/backend/features/profile/**
                                    packages/shared/src/dto/profile.ts
                                    T-051 built all four. the backend router already
                                    existed with the two avatar routes (T-062, 48's) and
                                    gained GET /, PATCH / and POST /password.
                                    NOTE readProfile goes THROUGH people/service.ts's
                                    readPerson rather than round it -- one shape for one
                                    human being, and it exercises the `self` clause of the
                                    person scope filter on every load (DEC-047).
                                    NOTE ProfileView reuses 34's Position and PowersAtPlace
                                    types. DEC-052. do not narrow them here.
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
features/people/powers.ts        -> 34's file, shared with 47's /profile route the way
                                    visibility.ts is shared with 57's account routes.
                                    THE ONE CALLER of resolve() for "what can this person
                                    do, and where". extracted from readPerson by T-051,
                                    which fixed a unit-by-NAME lookup on the way out
                                    (N-057). a second caller is the drift N-005 forbids.
components/org/PowersByPlace.tsx -> owned by 24 §4 like every component. ONE
                                    implementation, TWO placements: 34's /people/:id and
                                    47's /profile. the second extends, never forks
                                    (INV-009). `onWhy` is 42's link and is UNWIRED until
                                    T-054 -- a link into a <Placeholder> is what
                                    design_specs/design/02 §7 forbids.
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

--- added 2026-08-23 with the four-ask pass (DEC-037..DEC-043, CONF-019) ---

56-PAGE-activity-log.md          -> src/backend/features/audit/**
                                    src/frontend/pages/console/Logs/**
                                    src/frontend/components/data/DecisionTrace.tsx
                                    NOTE DecisionTrace is ALSO 42's. one implementation,
                                    two placements -- 24 §6c. whoever builds first owns it;
                                    the second EXTENDS, never forks (the INV-009 rule).
57-FEATURE-accounts-and-invites  -> src/backend/features/accounts/**
                                    src/backend/auth/inviteToken.ts
                                    src/backend/middleware/requireNoEscalation.ts
                                    src/frontend/pages/public/Activate.tsx
                                    src/frontend/components/org/InviteLink.tsx
                                    packages/shared/src/dto/account.ts
                                    NOTE requireNoEscalation is 11 §5b's RULE and 57's
                                    FILE. 11 owns the semantics; changing them is a DEC.
                                    NOTE the token module is in auth/, NOT in the feature
                                    where 57's Owns line put it (T-072). tenantResolver has
                                    to hash an activation token to find its organisation,
                                    and middleware importing from a feature is the arrow
                                    pointing the wrong way -- the alternative was a second
                                    sha256 in the resolver, and a disagreement between two
                                    copies would surface as a link that silently resolves
                                    no tenant. auth/ already holds password.ts and
                                    session.ts, and 15 §3 is the doc that specifies tokens.
                                    NOTE features/people/visibility.ts is 34's file, shared
                                    with 57's routes the way positions.ts already is. it
                                    holds the ONE person scope predicate (DEC-047) and
                                    requirePersonVisible, which the account routes mount
                                    BEFORE requireNoEscalation -- reversed, WOULD_ESCALATE
                                    becomes an oracle for who outranks you.
58-PAGE-inbox.md                 -> src/backend/features/inbox/**   (BUILT T-079)
                                    src/frontend/pages/console/Inbox/** (BUILT T-080)
                                    src/frontend/components/feedback/ResponseCard.tsx
                                    src/frontend/lib/inbox.ts
                                    packages/shared/src/dto/inbox.ts
                                    NOTE reads THROUGH features/results/service.ts and must
                                    not query responses itself -- the k-anon gate lives
                                    there and a second path around it is the whole risk.
                                    ENFORCED, not just asked for: features/inbox/service.ts
                                    imports readComments() and prisma.inboxState, and
                                    touches no other table. DEC-058.
                                    readComments/readableCampaigns/canSee are 40's, in
                                    features/results/service.ts, and 40 owns them -- 58 is
                                    the second CALLER, not a second owner (INV-009).
                                    <ScoreBadge> is 24's, built here. CONF-022.
72-PAGE-platform-logs.md         -> src/backend/platform/logs/**
                                    src/frontend/pages/platform/Logs/**
                                    NOTE reads lib/logFile.ts's OUTPUT. 18 owns what is
                                    written; 72 owns who may read it. also EXEMPT from
                                    INV-001 with 70+71.

33-PAGE-roles-and-powers-grid.md -> src/frontend/pages/console/Roles/**
                                    src/frontend/lib/roles.ts
                                    ALSO packages/shared/src/capability-labels.ts -- what
                                    each capability SAYS. the CATALOGUE is 11 §3's; the
                                    phrasing is 33's design work (DEC-055, repaying D-008).
                                    src/backend/middleware/requireNoGrantEscalation.ts is
                                    33's too, mounted on PUT /grants (DEC-056). 12 owns the
                                    chain; this doc owns the rule.
                                    NOTE the backend is 11's: features/roles/** exists since
                                    T-017 and this doc does NOT own it. what 33 owns is the
                                    grid and the English power labels describe() produces --
                                    D-008 says those labels are 33's design work, so the
                                    repayment edits roles/service.ts under 11's roof. ask
                                    before restructuring that file.
43-PAGE-analysis.md              -> src/backend/features/analysis/**
                                    src/frontend/pages/console/Analysis/**
                                    NOTE rule-based, DEC-042. a test asserts the feature
                                    imports NO outbound http client -- that absence is the
                                    decision, so it is enforced rather than remembered.
44-FEATURE-improve-loop.md       -> src/backend/features/improve/**
                                    src/frontend/pages/console/Reflect/**
                                    NOTE every capability here is GOLD-entitled (16 §3). the
                                    surface is only reachable at all because T-088 wrote the
                                    subscriptions row -- see D-012.

CONTESTED  src/backend/features/people/** is 34's, but 57 adds three routes to its router
           and DEC-039 adds a guard to its assignment route. rule: 57 owns
           features/accounts/** and MOUNTS onto people's router; it does not edit
           people/service.ts except to insert the guard.
CONTESTED  src/backend/db/tx.ts is 10 §5's. DEC-040 changes ONE line in it (ip written only
           for user principals). anyone touching flushAudit reads DEC-040 first.
CONTESTED  database/schema.prisma gains campaigns.access, campaign_participants,
           account_invites, inbox_state and audit_log.outcome in one migration. 10 owns the
           file; four docs own the models. WRITE THEM IN ONE MIGRATION, not four.

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

N-061  SCOPE ON A RESPONSE IS DECIDED AT THE CAMPAIGN, NOT AT THE SUBJECT, AND THE INBOX
       IS WHERE THAT BECOMES VISIBLE. Found 25 Aug verifying T-080 live against The Grand
       Palace. NOT INTRODUCED BY T-079/T-080 -- it is 40's behaviour, reached by 58 because
       58 shares 40's predicate deliberately.
       A campaign is visible when ANY of its subjects sits in a unit the caller can reach
       (assertVisible, and now canSee). Once it is visible, EVERY response in it is returned:
       readResponses filters by campaignId alone, and readResults aggregates the whole
       campaign unless the CLIENT passes a subject or unit filter.
       Live: grand-palace-3, a level 3 anchored at Lakeside Property with `response.read` at
       `own_unit`, reads all 229 comments including every one about City Property — and
       /campaigns/:id/responses hands them the same 210 rows it hands the administrator, 12
       distinct subjects apiece. Same answer through both surfaces, which is the acceptance
       criterion 58 asked for and got.
       SO THE INVARIANT HOLDS AT THE GRANULARITY THE CODE CHOSE and the question is whether
       that granularity is the right one. INV-003 says the API returns only what the caller
       may see; at campaign granularity that is true, at subject granularity it is not. An
       org-wide campaign is the common case, not an exotic one, and the inbox puts the other
       property's subject name on the card in plain sight where 40's aggregate hid it in an
       average.
       NOT FIXED IN T-080, DELIBERATELY. 58 § Acceptance requires the inbox to match 40 for
       the same caller. Making the inbox stricter would satisfy a different reading of
       INV-003 and BREAK the one 58 asked for, leaving two answers to one question -- which
       is the state DEC-058's shared predicate exists to prevent. Filed as D-032; it is a
       change to 40 first and 58 second, and the owner's call.
       see    D-032, 40, 58 § Acceptance, features/results/service.ts canSee()

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

N-056  A NARROWER RESPONSE SHAPE IS A SECOND IMPLEMENTATION IN DISGUISE. 24 Aug, T-051.
       47 § Data contract and 34 § Interactions both promise the powers view comes from the
       shared resolver and never a second implementation (N-005). Both then sketched their
       OWN response shape for it, one with `capabilities: string[]` and one with
       `{capability, scope}`. Neither doc was wrong about the resolver; taking both literally
       would still have produced two renderers of one block, because a component cannot read
       two shapes. THE RULE WAS WRITTEN ABOUT THE LAYER WHERE THE DUPLICATION WAS EXPECTED,
       and duplication arrived one layer up. When two docs specify the same view, check that
       they specify the same TYPE — not just the same source. DEC-052.

N-057  A LOOKUP BY NAME IS A LOOKUP BY SOMETHING THAT IS NOT UNIQUE. Found 24 Aug building
       T-051, in code T-018 wrote and nobody had reason to read since.
       `readPerson` assembled `powersByPlace` by looping the person's positions and resolving
       the whole capability catalogue at each one's unit. It had no unit ID to resolve
       against — `personSelect` fetched position NAMES only — so it re-found the unit:

           where: { orgId, kind: 'position', unit: { name: position.unitName } }

       `nodes` has no unique on (org_id, kind, name) and POST /units does not check, so two
       units may share a name; "Year 1" under two faculties is the ordinary case, not the
       exotic one. For a person holding a position in each, both loop passes resolved to
       whichever row came back first, and one unit's powers printed under the other unit's
       heading — ON THE ONE SCREEN IN THE PRODUCT BUILT TO DEMONSTRATE THAT POWERS DO NOT
       LEAK BETWEEN UNITS (INV-005). It also ran one query per position for an id the row
       already had.
       WHY IT SURVIVED, and this is the transferable part: every fixture in the repo names
       its units distinctly — Section A, Section B, Engineering, Mechanical — so every
       existing test passed, including the one whose name is about INV-005. The test that
       catches it is the only one in the suite with two same-named units. Proved by reverting
       the fix: the twin-unit test fails and the INV-005 test still passes.
       Fixed by putting `unitId` on the position DTO and deleting the lookup. The general
       shape: WHEN A QUERY RE-FINDS A ROW THE CALLER ALREADY HAD, ask what it is matching on
       and whether the database enforces that it is unique. DEC-052, 34 § Acceptance.

N-058  T-059's "needs T-057" LOOKS LIKE THE COUPLING DEC-048 ALREADY TOOK APART ONCE. Noted
       24 Aug while sequencing the owner's third ask (the Endur-admin pages).
       T-059 is `platform_users`, the separate login and cookie, `requirePlatform()` and the
       aggregate-only db seam. NONE of those four reads a seat count, a usage breakdown or a
       plan. the dependency is presumably there because /ops (T-066) DISPLAYS tiers -- but
       that is T-066's dependency, not T-059's.
       this is the same conflation that made T-088 look far away: one large task named after
       its biggest part, with a small independent piece buried inside it. DEC-048 carved that
       piece out and it took an afternoon.
       DO NOT re-sequence on this note alone. CHECK IT when T-059 starts; if it holds, split
       it the way DEC-048 split T-057, and record the split rather than doing it silently.
       see 55 § Stage 6, § Stage 9, DEC-048, D-012, T-057, T-059, T-066.

N-059  WRITING OUT WHAT A DERIVED STRING ACTUALLY SAYS IS A TEST. 24 Aug, T-052.
       `describe()` turned a capability key into English in four lines and had done since
       T-017. It was filed as D-008 for being un-localised. Replacing it with a table showed
       it was also simply WRONG -- "read resultses", "create apikeys", "read actionplans" --
       for every object added to the catalogue after the rule was written. Nobody had ever
       read its output for those keys, because nothing rendered them: the grid that would
       have shown all 64 rows was the unbuilt screen.
       THE SHAPE: a derivation is only checked where it is SEEN. a rule covering 64 inputs
       and rendered for 20 of them is 44 untested strings that look fine in the source.
       When you replace a derivation with a table, read the table.
       see DEC-055, D-008, 33 § Interactions.

N-060  THE SEEDED DEMO ORGS ARE FROZEN AT THE MATRIX OF THE DAY THEY WERE MADE, and the
       seed will not fix them. Found 24 Aug from the powers grid's OWN warnings, which is
       the screen working: "Nobody in this organisation can give somebody a sign-in."
       All four demo orgs were seeded 21 Aug and hold 51 capabilities. T-072 added
       `account.create`, `account.reset` and `account.revoke` to presets/grant-matrix.ts on
       24 Aug. Existing orgs got no rows, and `npm run db:seed` prints
       `skip: <name> already exists` -- it creates missing orgs, it does not reconcile
       present ones.
       CONSEQUENCE: the invite/accounts flow (T-072, built and tested) is UNREACHABLE in
       every demo organisation, and T-073's Invite button would 403 for all four on stage.
       D-031. The remedy is destructive (drop and re-seed) so it is the owner's call.
       GENERAL SHAPE: a seed that skips is a snapshot, not a migration. any capability added
       to the matrix after an org exists never reaches it.
       see D-031, 50 §1, T-072, T-073, presets/grant-matrix.ts.
```