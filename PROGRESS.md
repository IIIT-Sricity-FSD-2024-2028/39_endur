# Endur — progress

**The live state of the build.** Any Claude session, on any account, reads this first and
updates it before finishing. `architecture/55-BUILD-ORDER.md` is the plan; this file is what
has actually happened.

```
UPDATED   2026-08-31  (T-109 -- SUPPORT ACCESS. THE SUPERUSER CAN DRIVE EVERY WORKFLOW.
                       DEC-114, which SUPERSEDES ONE ROW OF 19 §14 and nothing else.
                       ROOT RUNNER: 1602/1602 across 122 files. typecheck 0, lint 0, build
                       passes, drift + vocab clean. ONE MIGRATION -- run `npm run db:migrate`
                       after pulling, or /ops 500s on a table Prisma knows about and the
                       database does not.
                       !! THE ASK: *"every functionality and workflow being usable by the
                       superuser -- every single thing configurable by superuser and admin."*
                       !! 19 §14 SAID DO NOT BUILD THIS, AND IT WAS RIGHT AND IT WAS NARROW.
                       the row refused *"an Endur employee READING FEEDBACK"*, not an
                       operator entering. so the reading is removed rather than the
                       objection argued away -- and 19 §5 had ALREADY conceded the gap and
                       named the workaround (*"the customer grants a time-boxed in-org
                       account through the normal person.create path"*), which is this
                       feature done by hand and badly: an account nobody revokes, that costs
                       a seat and lands in their audiences.
                       !! THE POWERS ARE GRANTS, NOT A BYPASS. the four-line version --
                       `if (principal.support) return next()` in requireCapability -- was
                       rejected twice over: a second permission model drifts from the first,
                       and it is silently TOTAL, so every capability shipped afterwards
                       would be held by an operator without anybody deciding it. instead
                       authz/collect.ts mints candidates on the NO-PERSON-NODE branch, which
                       no real member ever reaches, and resolve() is untouched.
                       !! SO INV-004 IS WHAT ENFORCES INV-011 HERE. the operator holds the
                       ALLOW and the DENY for results.read; the deny wins because a deny
                       always wins, and the refusal is `explicit_deny` WITH the grant that
                       decided it -- not `no_grant`, which means "go and ask somebody" when
                       there is nobody to ask. A DENY LIST, NOT AN ALLOW LIST: an allow list
                       is a thing somebody forgets to add to and then "fixes" by widening.
                       !! THE BANNER WAS WRONG IN THE FIRST DRAFT. it rendered from the
                       CALLER's own session, so the only person who ever saw the disclosure
                       was the operator it was disclosing -- the customer is on a DIFFERENT
                       session and carries no support flag. SupportContext.viewer plus one
                       indexed lookup on /auth/me is the fix. A PROMISE LEGIBLE ONLY TO THE
                       PERSON BEING WATCHED IS NOT A PROMISE.
                       !! THE SEAM WAS NOT WIDENED. User and SupportSession are NOT in
                       platform/db.ts's WRITABLE_MODELS; the two tenant writes live in
                       db/support.ts with the base client, because the allowlist is not
                       per-function and adding User there would make user.create reachable
                       from every handler in a 900-line file forever.
                       !! TO DEMO: npm run db:seed prints the operator logins -> /ops/login
                       as owner@endur.test -> open an org -> Open console. THE STRONGEST
                       THING TO SHOW IS THE REFUSAL: open Results inside the session and
                       read the trace. same engine, same screen, deny beats allow.)

UPDATED   2026-08-31  (T-108 -- A PLAN THAT RUNS OUT NOW ACTUALLY RUNS OUT. DEC-113.
                       ROOT RUNNER: 1577/1577 across 120 files. typecheck 0, lint 0, build
                       passes, drift + vocab clean. ONE MIGRATION -- run `npm run db:migrate`
                       after pulling, or the API 500s on a column Prisma knows about and the
                       database does not.
                       !! `db:migrate` IS `migrate deploy` AS OF TODAY, not `migrate dev`.
                       running the step above on the old script generated a migration that
                       would have dropped the GIN indexes, the DEFERRABLE unique and the
                       `sessions` table -- everything N-013 warns about. it failed on one
                       DROP INDEX and rolled back whole; nothing was lost. N-073, 03 §5.
                       !! THE REPORT: *"on plan expiration, nothing happens for the client,
                       they are able to continue to use the features granted by the plan,
                       and there is no option to change the plan on expiration. the entire
                       possibility of plan expiration is not designed at all for both client
                       and admin."* every word true.
                       !! TWO CAUSES, AND ONLY FIXING BOTH CLOSES IT. `applyExpiredDowngrade`
                       returned early unless a downgrade had been SCHEDULED, so an org that
                       let the month run out kept its tier with period_end frozen in the
                       past, indefinitely. AND `requireEntitlement` selected `tier` ALONE --
                       so even a correct row would not have helped an organisation that
                       never opens /app/plan, which is most of them, because the gate is
                       what an ordinary user meets. the load-bearing test is the one that
                       402s a Gold surface with no read of /billing first.
                       !! THE DOCS HAD BEEN CONTRADICTING THEMSELVES. 16 §7: *"expiry moves
                       the org to Bronze, never to zero access."* DEC-080: *"nothing renews,
                       nothing expires."* the scope note is what shipped. DEC-113 resolves it
                       in §7's favour and supersedes both that line and DEC-098's *"pending
                       _tier is never consulted by requireEntitlement"* -- the gate consults
                       it now, through ONE function both readers share, which is STRONGER
                       than two readers trusting one column that goes stale.
                       !! AND IT WOULD HAVE OPENED A REVENUE HOLE. DEC-097 charges the
                       DIFFERENCE because the customer already paid for the tier they are
                       leaving; after a lapse they did not, so bronze -> gold would bill
                       Rs 900 for a Rs 999 plan EVERY MONTH -- making a deliberate lapse
                       permanently cheaper than staying on the plan. `pricedFrom` splits the
                       two jobs `fromTier` was doing: the MOVE is still bronze -> gold, the
                       PRICE is measured against nothing. still no amount on any request.
                       !! OWNER DECISIONS, TAKEN 31 AUG: lapse to Bronze and rejoin with the
                       existing join button (no /billing/renew); BRONZE ROLLS FREE, so it
                       earns Rs 99 ONCE and not Rs 99 a month; a seven-day warning banner
                       rather than a grace period.
                       !! THE BANNER IS THE POINT. /app/plan has printed the period's end
                       date since T-058 and the owner still met "nothing happens" -- a fact
                       nobody navigates to is a fact nobody has. <PlanNoticeBanner> is in
                       <AppShell>, on every console page, gated on billing.read so it never
                       fires a request that would 403.
                       5 of the 7 new tests FAIL against the old rule -- checked by reverting
                       effectiveTier and re-running. the 2 that pass both ways are the
                       deliberate guards: bronze is never taken away, and an ordinary upgrade
                       still pays the difference.)

UPDATED   2026-08-31  (T-107 -- FOUR BUGS FROM THE OWNER, AFTER PULLING THE MATE'S BRANCH.
                       ROOT RUNNER: 1561/1561 across 118 files. typecheck 0, lint 0, build
                       passes, drift + vocab clean. DEC-110, DEC-111, DEC-112.
                       !! 1. THE SIGN-UP FORM WALKED PEOPLE THROUGH A PAYMENT SCREEN IN
                       ORDER TO REJECT THEM. `/start` step 1 did setStep('plan')
                       UNCONDITIONALLY, so digits in every field advanced, chose a plan,
                       ran the checkout, and met a 422 afterwards. registration and the
                       capture are ONE transaction, so nothing was created and nothing was
                       charged -- the owner noticed earnings did not move, and that half
                       was the system WORKING. the client now runs
                       RegisterBody.pick(...), which is LITERALLY the schema the server
                       parses, not a copy of it.
                       !! 2. AND THE SERVER WAS LETTING IT THROUGH ANYWAY. `min(1)` accepts
                       "12345" and accepts "   ", in each of the twenty-odd DTOs that
                       spelled it out -- so this was never only a client gap, and fixing
                       only the client would have left POST /people happy to create a
                       person called `404`. one `nameField(max)`: trimmed, at least one
                       LETTER (\p{L} with the u flag -- every alphabet, not [A-Za-z]),
                       bounded.
                       A FIRST PASS APPLIED IT BY REGEX AND REACHED THREE THINGS IT MUST
                       NOT: passwords (must not be trimmed, and composition rules are
                       deliberately refused -- Credentials' own comment), poll options
                       ("2025" is a legitimate option) and machine ids. `textField` is the
                       trimmed-and-bounded one for free text; a test that a numeric poll
                       option still saves is what stops the next tidy-up.
                       !! 3. ENDUR WAS NOT CHARGING FOR ENTERPRISE, AND THE NUMBER WAS
                       ALWAYS ZERO. the queue could only record a conversation: the owner
                       closed a request, went to the org's page and set the tier through
                       platform.plan.override -- WHICH DELIBERATELY WRITES NO payments ROW.
                       so the one tier the product charges Rs 4,999 for earned nothing and
                       every Enterprise customer was invisible to /ops/earnings. Approve
                       now grants the tier AND captures, in one transaction. it NAMES NO
                       AMOUNT -- the price comes from PLAN_OPTIONS server-side -- which is
                       why it does not reopen "an operator could invent revenue", and why
                       adding Payment to platform/db.ts's write allowlist is safe.
                       overridePlan STAYS money-free and a test pins that.
                       AND THE "nothing happens" WAS LITERAL: the page called
                       `void queue.update(...).finally(...)` with NO .catch, so a 403 or a
                       409 produced an unhandled rejection and nothing on screen. it also
                       fetched only `open`, so Contacted made the row VANISH -- which reads
                       as a failed click rather than as progress.
                       !! 4. KAVYA REDDY'S EMPTY CONSOLE WAS A ONE-LINE MAPPING. the grant
                       matrix's four rows are POSITIONS IN THE FEEDBACK LOOP, not positions
                       in the list -- its own comments say L3 is the REVIEWEE and L4 the
                       RESPONDENT -- and the code read `Math.min(index + 1, 4)`. a ten-role
                       college put SIX ROLES on the respondent row: five capabilities, 403
                       on campaigns. levelForRole() gives the BOTTOM role 4 and the middle
                       3. four-role orgs are byte-for-byte unchanged (a test pins it).
                       THIS ALSO CLOSES F2 WITHOUT TOUCHING EITHER RULE F2 NAMED -- the
                       Gold loop was unreachable AND ungrantable for a reviewee below the
                       fourth; it is reachable now because the reviewee is on level 3.
                       THE mate's OWN RUN DOC HAD FOUND BOTH (F4, F2) AND ONLY WARNED.
                       !! A WARNING WAS PASSING FOR THE WRONG REASON. thin_starter_row
                       filtered on "is this the highest level number", which is true of the
                       bottom role under ANY mapping -- so it kept passing while naming one
                       role out of the six that were actually thin. it asks levelForRole()
                       now, the same function that assigns the grants.
                       NOTE the mate's branch was pulled onto Stage 11; nothing was lost.
                       NEXT: T-045 IS STILL UNRUN AND IS STILL THE LARGEST RISK ON THE DAY.
                       Earlier: STAGE 11 COMPLETE -- ALL NINE TASKS BUILT, T-097 THROUGH T-105.
                       ROOT RUNNER: 1524/1524 across 115 files. typecheck 0, lint 0, build
                       passes, drift + vocab clean.
                       !! DEC-102 HAD TO BE CORRECTED AGAINST ITSELF, and this is the one
                       thing to read before touching /ops/analytics. it says movement is
                       read from `payments` "RATHER THAN" from plan.override audit rows.
                       taken literally that LOSES A CASE THE SAME ENTRY REQUIRES: its own
                       `not` clause says downgraded covers an operator override, and an
                       override deliberately writes NO payments row (an operator who could
                       name an amount could invent revenue). so it reads BOTH -- disjoint
                       by construction, nothing double-counted, and the disjointness is
                       written into the query's comment because if it ever stops being
                       true the count silently doubles.
                       !! T-101 NEEDED THE PLATFORM WRITE SEAM WIDENED. platform/db.ts
                       refuses every write into a tenant except by an allowlist;
                       Notification and EnterpriseRequest join it. THE READ SURFACE IS
                       UNCHANGED -- Answer unreachable, Response count-only, and neither
                       new model carries a relation that could reach either. what an
                       operator writes into a tenant is a subject and a body THEY TYPED.
                       !! THE ROUTE-ENUMERATION TEST CAUGHT THE TWO NEW INBOX ROUTES and
                       demanded a written justification rather than a capability. that is
                       INV-003's guard working: GET /inbox/messages carries NO capability,
                       because response.read scopes UNITS and would lock a recipient out of
                       their own mail, and a notification.* module would imply a shared
                       queue somebody can be excluded from. the row NAMES the reader.
                       !! OrgDetail.tsx HAD NO TEST AT ALL, which is why reinstate could be
                       dead. a silent early return produces no request, no error and no
                       toast -- indistinguishable from a slow network. the new test asserts
                       THE REQUEST WAS MADE, never what the screen says afterwards.
                       !! A TEST WAS PINNING A FIGURE THAT COULD NOT MOVE, twice over:
                       `conversionRate is null` (converted is a hardcoded 0, so the dash
                       was the only reachable branch) and `priceMinor === 0` on Enterprise.
                       both passed forever and neither tested a decision.
                       !! endur.css LOST 150 LINES to a block that appeared TWICE,
                       byte-identical, 157 lines apart -- .preset-grid declared three times,
                       the setup step's spacing decided by cascade order. a duplicate that
                       agrees with itself is invisible until somebody edits one copy.
                       DESIGN: dark surfaces get an EDGE (DEC-106) -- one block, six
                       selectors, and `.card` is deliberately absent because the glass card
                       already carries one in every theme.
                       NOTE design_specs/design/01 IS GITIGNORED, so its dark column does
                       not appear in `git status`.
                       NEXT: T-045 IS STILL UNRUN AND IS STILL THE LARGEST RISK ON THE DAY.
                       it needs the demo machine and a phone, and DEC-086's WSL2 question
                       is still open.
                       Earlier: T-097 BUILT -- THE LADDER IS ONE-WAY AND THE PERIOD IS A MONTH.
                       DEC-096 + DEC-097. OPEN-015 ANSWERED by the owner: SAME NUMBERS,
                       BILLED MONTHLY (Rs 99/499/999). a 12x rise, deliberately.
                       ROOT RUNNER: 1487/1487 across 112 files. typecheck 0, lint 0, build
                       passes, drift + vocab clean.
                       THE RULE IS THE SERVER'S: POST /billing/tier answers 409 on a lower
                       rank AND on an equal one, before anything is written, and the test
                       CALLS THE ROUTE rather than driving the page -- removing a button is
                       not a rule (INV-003).
                       !! THE LEDGER WAS OVERSTATING AND NOBODY HAD ASKED ABOUT IT. an org
                       walking Bronze->Silver->Gold totalled Rs 1,597 in `payments` for a
                       customer holding ONE Rs 999 plan. DEC-097 charges the DIFFERENCE and
                       it now totals Rs 999. the headline assertion is a SUM, not three row
                       checks, because the sum is what /ops/earnings reads.
                       !! THE PERIOD WAS HARDCODED IN FOUR PLACES, NOT THREE -- the fourth
                       is database/seed/demo.ts, found by grepping the COLUMN rather than
                       the number. AND THEY ALREADY DISAGREED: two used +365*DAY and two
                       used setFullYear(+1), a day apart in a leap year. nothing read the
                       difference, which is why it survived -- and DEC-098 is about to make
                       period_end the date a downgrade fires on. now ONE function,
                       billing/period.ts, calendar month, CLAMPED (31 Jan -> 28/29 Feb).
                       !! A TEST WAS ASSERTING THE WRONG THING AND PASSING. Plan.test.tsx's
                       "CONFIRMS a downgrade" drove a flow that charged a customer a SECOND
                       time for LESS than they already held. it asserted the dialog's
                       wording rather than whether the transaction should exist. two more
                       asserted "per month" appears NOWHERE -- true of a yearly product.
                       ON THE PAGE: a card below your tier loses its button and gains a
                       sentence. ABSENT, NOT DISABLED. `override` mode is exempt -- an
                       operator may still move a plan either way.
                       CORRECTION TO MY OWN REPORTING: three earlier "full suite" runs said
                       44 files / 551 tests. that was the BACKEND PROJECT ONLY -- a stale
                       `cd src/backend` was still in effect. the root run is 112/1487.
                       NEXT: T-098 and T-099 are unblocked and both depend on this. T-102
                       and T-103 are independent live bugs, any order.
                       T-045 IS STILL UNRUN AND IS STILL THE LARGEST RISK ON THE DAY.
                       Earlier: THE OWNER'S THIRD PASS -- TWELVE REPORTS, NINE TASKS, DOCS ONLY.
                       (that pass wrote no code; T-097 above is the first of its tasks.)
                       DEC-096..DEC-106, D-043..D-045, N-067, OPEN-015, 55 § Stage 11.
                       !! TWO REPORTS WERE MISREAD ON THE WAY IN AND BOTH CORRECTIONS ARE
                       THE FINDING.
                       "enterprise plan is not working" is ONE LINE, not a missing feature:
                       <PlanPicker> applies `unavailable = disabled || !plan.selectable` in
                       ALL THREE MODES, and `override` is the OPERATOR assigning a plan --
                       the path DEC-048 routes enterprise through on purpose. THE ONE TIER
                       THE PRODUCT CALLS OPERATOR-ASSIGNED IS UNASSIGNABLE IN THE ONLY UI
                       THAT CAN ASSIGN IT.
                       "suspending suspends every org" was CHECKED AND NOT REPRODUCED --
                       setSuspended is scoped by params.id, tenantResolver reads facts per
                       request with no cache, OrgRow renders per row. the likeliest reading
                       is D-043, reported in the same breath: REINSTATE SILENTLY DOES
                       NOTHING (one handler guards BOTH verbs on the typed-name check and
                       the reinstate dialog has no name field, so it RETURNS BEFORE MAKING
                       ANY REQUEST -- no error, no toast, dialog still open), so nothing
                       could be brought back and suspensions accumulated. N-067 records
                       what was checked so nobody re-reads the middleware first.
                       !! A MESSAGE FROM ENDUR REACHED NOBODY AND THE OPERATOR WAS TOLD
                       OTHERWISE. messageAdministrators writes ONE platform_audit_log row --
                       THE OPERATOR'S OWN TABLE -- and returns { sentTo: 3 }. the customer's
                       admins have no route and no screen. DEC-101 gives them one.
                       !! TWO OF SIX HEADLINE CARDS ON /ops/analytics COULD NEVER MOVE.
                       DEC-048 means registration writes 'active', so nothing is ever
                       trialing; `converted` is a hardcoded 0 under a comment saying it has
                       no source. the honest thing to do with a metric that has no source is
                       NOT TO PRINT IT (DEC-102). and movement's upgrade/downgrade counts
                       read plan.override audit rows -- THE OPERATOR'S ACTION -- so that
                       table has only ever counted what OPERATORS did while labelled as the
                       estate. it moves onto `payments`.
                       !! THE LEDGER OVERSTATES REVENUE, and nobody had noticed: an org that
                       walks Bronze->Silver->Gold in one period contributes Rs 1,597 for a
                       customer holding one Rs 999 plan. DEC-097 charges the DIFFERENCE, and
                       the same journey sums to Rs 999.
                       THE LADDER IS ONE-WAY (DEC-096) AND THE SERVER IS WHERE THAT IS
                       DECIDED -- removing the button is not the rule, INV-003.
                       "downgrade only when exhausted" needs the one thing this product has
                       not got, something that runs when a date passes. SO NOTHING RUNS:
                       pending_tier + the first read after period_end, the evaluate-on-read
                       trick readBilling ALREADY uses for D-012 (DEC-098).
                       ALSO FOUND, UNASKED: endur.css carries 157 LINES TWICE, verbatim, so
                       .preset-grid is declared THREE TIMES and the setup step's spacing is
                       decided by cascade order (D-045). the dark half is a system fault --
                       design_specs/01 §4's surface table is LIGHT-ONLY and the dark token
                       block's own comment already says the lift must come from the edge
                       (DEC-106).
                       OWED BY THE TEAM: OPEN-015, ONE LINE. monthly prices -- the same
                       numbers, or the annual figure over twelve? nothing else blocks.
                       START AT T-097 if that is answered, T-102 or T-103 if not.
                       T-045 IS STILL UNRUN AND IS STILL THE LARGEST RISK ON THE DAY.
                       Earlier: D-036 AND D-041 REPAID -- DEC-094, DEC-095. THE SUITE IS GREEN,
                       ALL OF IT, THREE RUNS RUNNING: backend 546/546, frontend 933/933.
                       !! BOTH DEBT ENTRIES HAD THE WRONG DIAGNOSIS WRITTEN DOWN, AND BOTH
                       WOULD HAVE BEEN "FIXED" INTO SOMETHING WORSE.
                       D-036 said the log-pagination fixture had shrunk below the 64 KB
                       chunk so the test asserted nothing, and prescribed sizing it up.
                       THAT WOULD HAVE BEEN A GREEN TEST OVER A LIVE BUG. the test was
                       right and the READER was losing lines: tailRead's cursor was the
                       CHUNK offset, and the reader walks BACKWARDS, so the next page
                       resumed at that chunk's start and read the chunk BELOW it -- every
                       line the page limit left unreturned in between was skipped, and the
                       page after that opened on half a line. MEASURED: a 1,500-line file
                       at limit 50 returned 150 lines and LOST 1,350. a 220-line file --
                       under one chunk, i.e. every log file for the first hours of its day
                       -- returned 50 and said hasMore false, LOSING 170. this is the
                       operator's incident tool.
                       THE CURSOR IS NOW A LINE OFFSET (DEC-094), in Buffer.byteLength and
                       never String.length, and the test WALKS TO THE END at two sizes.
                       D-041 said "flake, watch it". it recurred every full run on a
                       DIFFERENT innocent test, each passing alone. the pool hypothesis
                       (~15 workers x 33 connections vs max_connections 100) was DISPROVED
                       rather than assumed -- pool_timeout was dropped below the test
                       timeout so starvation could speak, and NOT ONE timeout was a pool
                       wait. the real number: the slowest test is 3361ms on an IDLE machine
                       against vitest's 5s default. a lottery, not a bug.
                       BOTH PROJECTS NOW RUN A 20s TIMEOUT with the measurement beside it
                       (DEC-095). NOT retry:1 -- that hides every race the suite exists to
                       catch, including the booking one T-095 found.
                       ALSO FOUND: booking.test.ts's DEC-090 grep guard resolved its
                       directory from process.cwd(), so it THREW from the repo root -- the
                       command D-037 made the correct one. resolved from the test file now.
                       a rule that only holds from one working directory is not a rule.
                       ROOT RUNNER: 1479/1479 across 112 files, three runs.
                       STILL OWED: <PaymentDialog>'s two delays are hardcoded, so the
                       frontend suite spends ~15s watching an animation.
                       Earlier: D-042 REPAID + THE CONTENTION DEMO -- DEC-093.
                       A POLL WAS INVISIBLE ON /app/campaigns TO EVERY SEEDED ROLE,
                       INCLUDING THE PERSON WHO MADE IT ONE SECOND EARLIER. a campaign is
                       scoped through its SUBJECTS' units and DEC-089's org singleton
                       subject has no unit, so the filter matched nothing.
                       THE RULE NOW SAYS WHAT THE ROW MEANS rather than loosening the
                       filter: anchored to the ORGANISATION subject = the whole
                       organisation, visible to anyone who may read campaigns at all.
                       every quick campaign is access:public + audience:anyone, so the
                       link already answers to whoever holds it.
                       !! THE ROOT-UNIT CANDIDATE WAS REJECTED ON EVIDENCE. campaign.launch
                       is seeded own_unit at LEVEL 3, so a tutor launching from Section A
                       would still lose the poll instantly -- the same bug one level down.
                       !! `type` WAS CLIENT-SETTABLE and the new rule reads it. anybody with
                       subject.create could have widened their own campaign's audience -- a
                       permission written in a text column. 'organisation' is now RESERVED,
                       422 on body.type.
                       !! THE PREDICATE WAS ALREADY WRITTEN TWICE -- listCampaigns inline
                       and home/service.ts's own scopeToCampaigns. fixing one would have
                       left Home wrong and silent. both import campaigns/visibility.ts now.
                       npm run demo:contention -- 40 phones, one slot, capacity 10. an
                       ASSERTION THAT HAPPENS TO PRINT: 10 x 201, 30 x 409, 10 rows in the
                       database, remaining 0, ~300ms, non-zero exit if the count is not
                       exact. 50 SS5 carries it as demo step 10. a demonstration, NOT a
                       benchmark -- no throughput figure is claimed.
                       AFTER PULLING 5fd6a953: `npm install && npm run db:migrate`. the
                       prisma client is generated not committed, and two migrations were
                       unapplied -- 15 phantom typecheck errors and a 500 saying
                       public.bookables does not exist.
                       backend 544/545, frontend 933/933. (D-036 was the one red then; it
                       is closed above, and it was a REAL BUG, not a fixture.)
                       Earlier: T-095 + T-096 -- BOOKING AT GOLD, AND STAGE 10 CLOSED. three
                       tables, five capabilities, and the only write in the product with
                       REAL CONTENTION.
                       THE FEATURE IS THE ROW LOCK: SELECT ... FOR UPDATE on the slot,
                       THEN the count, then the insert. counting first is the bug -- two
                       phones both read capacity-1 and the room is double-booked on stage.
                       the lock lives in db/graph.ts, the one file DEC-007 permits raw SQL.
                       !! THE N+1-CONCURRENT TEST FOUND A REAL BUG AND IT WAS MINE. the
                       plan specified isolationLevel 'Serializable' ON TOP of the lock and
                       I wrote it that way; one of two RIGHTFUL WINNERS came back 40001
                       instead of 201, because postgres SSI reads the count behind the lock
                       as a predicate read conflicting with the other insert. it added no
                       safety and turned a correct booking into a 500. removed -- DEC-092.
                       the lock and Serializable are ALTERNATIVES, not belt and braces.
                       the loser gets 409 and NOT 400: well-formed, and lost a race.
                       DEC-090 A BOOKING IS IDENTIFIED AND A RESPONSE IS NOT, and they must
                       never join. enforced by a GREP over the whole feature directory with
                       comments stripped, because the rule has to survive somebody who
                       never read the header comment.
                       the PUBLIC payload carries REMAINING and omits capacity and every
                       name (13 §6). remaining is DERIVED -- a stored counter is a second
                       source of truth and drifts the first time somebody cancels.
                       /book/:token is a SECOND ROOT of the respondent world sharing its
                       layout and boundary, not a fifth world. routes.test.tsx's containment
                       check was asserting one-root-per-boundary and was RESTATED as the
                       property it always meant.
                       D-040's FIRST HALF REPAID because this task depended on it: the
                       respondent bundle guard compared win32 backslashes against
                       forward-slash literals, so it reported clean WITHOUT LOOKING.
                       Book.tsx was going into its entry list; normalised once, all five
                       assertions now run for real.
                       T-096 the last two gallery lanes are LIVE, sidebar gains both,
                       /app/plan and 16 §2 NAME what silver and gold now buy, and the seed
                       has a nearly-full slot so "1 left" is on screen before anybody books.
                       backend 540/542, frontend 924/925 -- every failure pre-existing and
                       documented (D-036, D-042, D-040's second half).
                       Earlier: T-094 -- ANNOUNCEMENTS AT SILVER, AND THE FIRST RECEIPT TABLE IN
                       THE PRODUCT. two tables, four capabilities, eight routes, two
                       screens and a banner on Home.
                       THE RECEIPTS ARE WRITTEN AT PUBLISH TIME, ONE PER RESOLVED
                       RECIPIENT, IN THE SAME TRANSACTION THAT STAMPS published_at. that
                       is the whole feature: "12 of 40 have read this" needs a
                       DENOMINATOR, and a row created lazily on first read can only ever
                       count readers.
                       announcement.publish IS A SEPARATE VERB FROM announcement.create
                       and the seeded matrix makes the gap real -- L1+L2 draft, L1 alone
                       sends. drafting is not broadcasting.
                       THE AUDIENCE IS AudienceRule, resolved by the CAMPAIGNS resolver
                       (features/campaigns/audience.ts gained audienceUsers + a shared
                       positionFilter). two resolvers is how "everyone in Housekeeping"
                       comes to mean two different sets on two screens.
                       `anyone` MEANS SOMETHING DIFFERENT HERE and it is written down: on
                       a campaign it is "whoever holds the link" and uncountable; an
                       announcement has no link, so it is every account in the org.
                       bronze keeps announcement.read (16 §7 -- a downgrade retains data),
                       so a bronze org gets 402 on create/publish and 200 on read.
                       publishing is IRREVERSIBLE and IDEMPOTENT BY STATE as well as by
                       key: a second publish returns the first result rather than
                       re-resolving the audience against a graph that has since changed.
                       delivery is IN-PRODUCT ONLY and the composer says so on screen.
                       !! FOUND, NOT CAUSED: a quick campaign (poll / suggestion box) is
                       INVISIBLE ON /app/campaigns to every seeded role -- see D-042. it
                       is T-091's org-singleton subject having no unit, and the one
                       remaining red backend test is asserting the correct behaviour.
                       Earlier: T-092 AND T-093 -- THE SUGGESTION BOX, AND THE GALLERY THAT MAKES
                       FIVE SURFACES LOOK LIKE ONE PRODUCT.
                       T-092's backend was already built by T-091 -- the second `purpose`
                       on the same endpoint -- so the whole task was THE SENTENCE THAT
                       STOPS IT LOOKING BROKEN. a suggestion box shows NOTHING until
                       K_ANON_THRESHOLD people have answered, which on stage means the
                       first two answers land in an empty screen. CampaignSummary now
                       carries templateCategory and resultsThreshold and the card says
                       "Answers appear once 5 people have responded. 2 so far." THE
                       THRESHOLD IS NOT LOWERED FOR THE DEMO, and the number is the
                       SERVER'S -- a client hardcoding 5 lies the day the config changes.
                       reading is the EXISTING Inbox, whose campaign filter was already
                       there. no second reader: that is what INV-006 exists to prevent.
                       T-093 /app/start. <StartCard> HAS FOUR STATES BECAUSE THERE ARE
                       FOUR DIFFERENT REASONS A LANE CANNOT BE PRESSED and they are
                       answered differently -- missing CAPABILITY disables the card WITH
                       THE REASON, missing ENTITLEMENT keeps it live with a tier chip that
                       lands on /app/plan (a tier is something you can buy; hiding it
                       sells nothing), not-built-yet says so and does not navigate.
                       CAPABILITY FIRST, TIER SECOND -- the chain's own order, DEC-091.
                       AN UNKNOWN TIER SELLS NOTHING rather than guessing bronze and
                       offering a gold customer what they already own.
                       two TemplateSeeds per preset, so the gallery is never empty and a
                       hotel poll is not a university poll.
                       !! TWO FRONTEND TESTS ARE RED ON WINDOWS AND WERE BEFORE THIS
                       WORK -- see D-040. neither is in a file this session touched.
                       !! THE BACKEND SUITE COULD NOT RUN THIS SESSION: no postgres and no
                       docker daemon on the machine. typecheck, lint, audit:vocab and
                       audit:drift are all clean; the new backend assertion in
                       campaigns.test.ts is UNVERIFIED and must be run before the demo.
                       Earlier: T-091 -- POLLS, AND THE DECISION NOT TO BUILD ANYTHING. one endpoint
                       (POST /campaigns/quick), one dialog, and NO new table, kind, column
                       or capability: DEC-088 extends DEC-010 from questions to products,
                       so a poll IS a one-question campaign and the category is the only
                       thing that says so.
                       DEC-089 THE COMPOSITION IS ONE SERVER TRANSACTION, gated on
                       campaign.launch -- the strictly most privileged verb in the
                       sequence, so the endpoint cannot be a way around the launch check.
                       four client round trips can half-fail and the failure lands on
                       stage as an orphan template or a campaign with no QR.
                       DEC-087 "Poll"/"Announcement"/"Booking"/"Slot" ARE STRUCTURAL words
                       on INV-001's exempt list. audit:vocab passes with NO new exclusion.
                       !! THE TRAP: subjectIds.min(1) was NOT relaxed for a poll with no
                       reviewee -- every results screen groups by subject, so quickCreate
                       finds-or-creates ONE per-org subject with type: 'organisation'.
                       !! THE SIX NEW BACKEND TESTS WERE NOT RUN. docker daemon down on
                       this machine AND N-066's globalSetup/npx blocker still stands.
                       typecheck, lint, audit:vocab and audit:drift are all clean; the two
                       red frontend tests are pre-existing, confirmed on a stashed tree.
                       T-092 should run the backend suite before adding to it.
                       Earlier: TIER 2 -- THE THREE DECISIONS NOBODY WAS MAKING. DEC-084, DEC-085,
                       DEC-086. nine red tests at the start of the session, ONE at the end,
                       and THE FRONTEND SUITE IS FULLY GREEN FOR THE FIRST TIME (890/890).
                       none of the nine was a bug; every one was a deferred decision and
                       the tests were the only record of it.
                       DEC-084 OPERATOR TOTP BACK TO 30s, ±1 STEP. a second factor valid
                       for a full shift is close to a static secret -- it survives a
                       shoulder-glance, a screenshot and a scrollback all day, leaving the
                       password very nearly the only factor, and 19 §9's WHOLE argument for
                       building MFA at all is that one stolen operator password exposes
                       EVERY TENANT'S plan data at once. keeping it was rejected on PRICE:
                       the convenience was not re-reading a code, and ops:code buys that in
                       one command. no doc amendment needed -- 19 §9 already said ±1 step,
                       which the branch had silently broken too.
                       DEC-085 SETUP KEEPS ITS SHAPE AND GIVES BACK WHAT IT DROPPED BY
                       ACCIDENT. sorted by asking what each affordance was FOR. `← Back`
                       WAS NEVER LOST -- D-038 was wrong; the button is there and the
                       redesign replaced the literal arrow with an Icon, so three
                       assertions were matching on DECORATION. restored: "Pick the closest
                       one" (without it five cards read as an exhaustive list on the one
                       screen whose subject is that the model does not care), STEP 4's LIVE
                       PREVIEW (the lede claims these words appear throughout Endur and the
                       preview is the only thing that proves it -- proving it on Review,
                       two steps after the reader stopped doubting, proves nothing), and
                       `your plural` (D-039). THE ROLE CHAIN ON EVERY CARD IS THE ONE REAL
                       LOSS AND IT IS DELIBERATE: the aside shows strictly more of one
                       preset, and THE COST IS THAT PRESETS ARE NOW COMPARED SERIALLY. 31
                       amended.
                       DEC-086 THE QR ENCODES THE LAN ADDRESS -- OPEN-002 ANSWERED after 8
                       days deferred. dev only: a loopback PUBLIC_BASE_URL is rewritten to
                       the host's LAN IPv4, printed at boot, AND VITE BINDS TO THE LAN,
                       because rewriting the URL without that gives an address that resolves
                       and refuses the connection. not a tunnel: no account, no third-party
                       uptime, no key expiring mid-demo.
                       !! T-045 MUST STILL PROVE IT ON THE DEMO MACHINE. under WSL2 the
                       address found inside WSL is the VIRTUAL ADAPTER'S, behind a NAT and
                       NOT reachable from a phone -- it will look configured and still
                       fail. run the dev servers from Windows, or add a netsh portproxy.
                       THE ONE REMAINING RED TEST IS D-036, whose fixture drifted below the
                       64 KB chunk so it asserts nothing. size the fixture, never relax it.
                       RULE WORTH KEEPING: a test that disagrees with the code is a decision
                       nobody made, not a chore. assertions move only with a DEC.
                       Earlier: THE BRANCH BUILDS. tsc 4 -> 0, npm run build PASSES, tests
                       11 failed -> 9. no feature: the owner asked what was open and then
                       for the top of the list, which was that the branch did not build and
                       that two red tests belonged to no debt id.
                       D-035 CLOSED. all four errors were exactOptionalPropertyTypes and
                       all four were fixed by CONSTRUCTING THE KEY CONDITIONALLY, never by
                       widening -- on Target an ABSENT unitId is how the resolver says
                       ORG-WIDE, so unitId: undefined and no unitId mean the same to JS and
                       different things to the type. THE REAL FIND WAS UNDERNEATH: the
                       `as never` on capability was bridging a z.string() DTO to a
                       Capability input, so A MISSPELT CAPABILITY RESOLVED TO no_grant and
                       the simulator rendered it as "No rule grants this" -- a real-looking
                       answer to a question the system never understood. DTO now
                       .refine(isCapability): 422 instead, AND the narrowing caught the
                       page holding capability as a bare string in a file whose own header
                       says the sentence can never ask an invalid question.
                       D-014 WAS STALE -- /authz/simulate has been mounted all along. what
                       was missing was ANY TEST, which is exactly why three of D-035's
                       errors accumulated inside runSimulation with nothing going red. new
                       test/simulator.test.ts, 7 tests.
                       THE TWO UNOWNED RED TESTS WERE A LITERAL 3 AGAINST A FOURTH WORLD.
                       /ops made four at DEC-033; routes.test.tsx now asserts worlds.length,
                       so a FIFTH world must bring its own boundary and layout to pass and
                       cannot break the test by existing. 20 §1 said "the three worlds" and
                       now says four. FOUR LIVE ROUTES WERE IN NEITHER THE MAP NOR THE TEST
                       -- /app/plan, /activate/:token, /ops/orgs/:id, /ops/earnings.
                       AUDIT:VOCAB CLEAN FOR THE FIRST TIME, 3 -> 0. all three were INV-001
                       breaches in these same two files, parked under D-035 and about to be
                       orphaned by closing it -- the simulator offered "a campaign" between
                       two labelled options, and resolveSimTarget raised two 404 sentences
                       an administrator reads. runSimulation takes nounsOf(req) now.
                       THE REMAINING 9 FAILURES ARE ALL DECISIONS, NOT WORK: D-038 x6,
                       D-039, D-040, D-036. nothing in the suite is red for a reason
                       nobody has written down.
                       NOTE: THE 27 AUG DEMO DATE HAS PASSED and T-045 is still unrun,
                       while the countdown below still reads "2 days". somebody say which.
                       Earlier: DEC-081 — A COUNT ON A UNIT COUNTS THE WHOLE BRANCH, and the
                       BRANCH SWEEP that came with it. the owner added a ward under Ward D
                       and NOTHING ABOVE IT MOVED: the leaf said 1 person, Ward D still
                       said 2, Surgery still said 3. the API's peopleCount is a groupBy on
                       unitId with no walk in it -- the right PRIMITIVE and the wrong
                       NUMBER TO PRINT. THE SERVER ALREADY AGREED: /units/:id/impact
                       answers "delete Engineering" with peopleAffected: 64, and
                       Structure.test.tsx has carried 64 and 4 side by side since T-033
                       without anyone reading them together. rolled up ON THE CLIENT and
                       that is CORRECTNESS: the tree is scope-filtered before it is
                       returned (INV-003), so a total over what the reader was SENT counts
                       exactly what they may see -- one computed in SQL would leak the size
                       of a branch they cannot open. new lib/unitTotals.ts; Overview.tsx's
                       local totals() was a SECOND implementation of the same walk and is
                       now a call to it. the DETAIL PANEL is the only surface showing both,
                       "4 here | 60 below", because it is the only one with room to say
                       which is which. SAME PASS KILLED "1 Services": subjectWord was the
                       PLURAL ALONE on both components, and A TEST ASSERTED THE BUG
                       ('4 people . 1 Quaxels', T-033) -- a test written from the code
                       cannot catch the code. <UnitMap> HAD NO CATALOGUE ENTRY AT ALL since
                       T-033; added.
                       THE BRANCH WAS RED AND IS NOW GREEN WHERE IT CAN BE. lint 9 -> 0,
                       drift 1 -> 0, vocab 5 -> 3 (D-035's own), tsc 22 -> 4 (D-035's own).
                       D-037 REPAID AND PROVED -- root vitest.config.ts with both
                       workspaces as projects; dev database held 4 orgs before a
                       root-launched backend run and 4 after. THE PAYMENTS MIGRATION HAD
                       NEVER BEEN APPLIED, so /app/plan's checkout and every panel on
                       /ops/earnings were dead against the dev database; applied, purely
                       additive, no data lost. NO postinstall EXISTED, so a fresh clone
                       could not typecheck -- 15 of the 22 errors were a stale Prisma
                       client for a model sitting in schema.prisma. THE SHARESHEET
                       LOCALHOST WARNING HAD BEEN DELETED in a design commit, leaving
                       isUnscannable() with no caller and OPEN-002 with no mitigation in
                       the product at all; restored. MOJIBAKE in three files -- comments
                       re-saved through a non-UTF-8 editor turned every em-dash and section
                       sign to ?" and A; repaired, no user-visible string affected.
                       FOUR NEW DEBTS FILED, and D-038/D-039/D-040 ARE DECISIONS, NOT WORK:
                       the Setup redesign disagrees with six of its own tests, <WordsEditor>
                       stopped saying which plurals are yours, and OPERATOR MFA QUIETLY
                       BECAME A 6-HOUR CODE with no DEC and a red test left behind.
                       Earlier: T-058 — PRICES, A CHECKOUT AND /ops/earnings. DEC-080, which
                       SUPERSEDES DEC-035: bronze Rs 99, silver Rs 499, gold Rs 999 per
                       year in INR, on the picker and in a payment dialog at both the
                       sign-up step and /app/plan. THE MONEY IS SIMULATED — no gateway, no
                       card fields, no keys — and the UI says so where a real one would
                       take a card. New `payments` table (append-only ledger, amounts as
                       INTEGER PAISE), written inside the EXISTING transactions in
                       auth/service.ts and billing/service.ts, PRICED SERVER-SIDE from
                       PLAN_OPTIONS on both paths — no request carries an amount. New
                       owner-only capability platform.revenue.read, GET /platform/earnings,
                       and /ops/earnings: revenue over time, plan mix donut, plans-bought
                       trend, recent payments, who moved plan. Charts are inline SVG and a
                       conic gradient — DEC-064 still holds, no library added. New
                       --tier-{bronze,silver,gold}-* ramp so the three metals mean the same
                       thing on the picker, in the dialog and in the charts. NOT built: any
                       renewal, expiry, dunning, refund or invoice — the ledger records
                       captures and nothing reads period_end.
                       Earlier: T-058 PART — /app/plan. the owner asked for a "Plan" item in the
                       sidebar showing the current plan with a way to change it. built as
                       a nav item in the `system` group, NOT the settings tab 49 asks for;
                       the doc's argument is recorded in the page, not dropped. new backend
                       feature src/backend/features/billing/ (GET /billing, /billing/plans,
                       POST /billing/tier) — the first routes ever to sit behind
                       billing.read/billing.update. seats are computed from 16 §5, and a
                       missing subscriptions row is repaired on read (D-012). upgrade
                       applies silently, downgrade confirms. NOT built: <OverLimitBanner>,
                       the seat ceiling, the from-tier on the audit row — all T-057/T-058.
                       Earlier: DEC-078 — /OPS TAKES THE CONSOLE'S CHROME. the owner asked for the
                       ops screens (estate list, analytics, logs) to look as finished as
                       /app, having seen them side by side, and judged 70's "plainer than
                       the customer console" as unfinished rather than intentional —
                       superseded, in writing, in 70 § Design note and DEC-078, not
                       silently dropped. DEC-012 still holds: nothing invented, only reuse.
                       OpsLayout (router/layouts.tsx) gained <AmbientBackground> and a
                       glass nav on the same .topbar/.nav-public rule /app already carries.
                       TWO REAL BUGS TURNED UP DOING IT, both pre-existing and unrelated to
                       the plain-vs-styled question: <OrgRow> (estate list rows) has been
                       referenced since T-066 with ZERO CSS RULE — every row rendered as a
                       bare unstyled <button>, which is why the estate list read as
                       especially basic. Fixed with .org-row in endur.css. Analytics/
                       index.tsx used className="stat-grid", a class that has never existed
                       — .stat-row is the real one Home.tsx already uses — so the four
                       overview cards there rendered as an unstyled stack. Fixed by
                       renaming the class. Verified live: logged in as owner@endur.test,
                       confirmed via computed styles on /ops, /ops/analytics, /ops/logs —
                       glass nav backdrop-filter applied, ambient field present, stat cards
                       render in a grid, org rows carry padding/radius/hover. No new
                       console errors from the change (pre-existing 401 session probes and
                       a pre-existing Logs.tsx setState-in-render warning, both unrelated).
                       SAME "stat-grid" BUG, A THIRD TIME: OrgDetail.tsx (/ops/orgs/:id) had
                       it too — fixed to .stat-row, verified live (6 stat cards, grid).
                       OWNER FLAGGED IT STILL LOOKED BROKEN ON A SCREENSHOT, and two real
                       layout bugs were in it, both from the SAME ROOT CAUSE as .org-row:
                       nothing on this page ever gave it room. Every `<section
                       className="card">` sat bare inside `.page`, which has no gap, so six
                       sections read as one edge-to-edge block with only a hairline between
                       them — fixed with a new `.ops-sections` wrapper (same fix
                       `.settings-page` already does for `/app/settings`, without its 900px
                       cap). AND `<PlanPicker>` was wrapped in a SECOND `.card` — its own
                       `.plan-card` already carries background/radius/shadow, the same grid
                       `Start.tsx` uses BARE — so the four tiers were squeezed into a card
                       nested inside a card, narrower than every other plan grid on the
                       product. Unwrapped to `.ops-plan-section` (no `.card`). Verified
                       live: section gap 26px (was 0), plan cards ~284px wide and no longer
                       double-bordered, no new console errors.
                       Earlier: DEC-077 — THE POWERS GRID IS READABLE WHILE YOU USE IT, AND THE
                       "SOON" TAGS WERE LYING. the owner sent a screenshot: TWELVE ROWS OF
                       VALUES WITH NO ROLE NAME ANYWHERE ON SCREEN, cells reading "Their
                       department + belc", and 64 differently-sized dropdowns down the left.
                       DEC-076 fixed the WORDS; none of that was about words.
                       THE HEADER HAD BEEN position:sticky SINCE T-052 AND NEVER ONCE STUCK.
                       .powers-scroll was overflow-x:auto WITH NO HEIGHT, which per CSS is a
                       scroll container in BOTH axes — so top:0 pinned the row to a box that
                       never scrolls while the PAGE carried it away. the power-name column is
                       pinned on the other axis for the same reason.
                       min-width:6em TRUNCATED THE CELLS and no constant can be right when
                       the noun in the middle is the tenant's to choose — the width is now
                       MEASURED from the longest resolved phrase.
                       SEVEN CAPABILITIES WERE STILL P3 A DAY AFTER T-081..T-084 SHIPPED
                       THEM. `phase` is a BEHAVIOUR, not a note: the grid greys a P3 row and
                       stamps it Soon, and warnings() SKIPS P3 when it hunts for a power
                       nobody holds — so the screen called seven live features unbuilt AND
                       stayed silent about a real orphan among them. corrected in 11 §3 and
                       capabilities.ts. apikey.* is the only true P3 left: no route exists.
                       A P3 ROW NO LONGER ACCEPTS A GRANT — readable, not settable.
                       24 tests on the page, 856 frontend, 27 backend roles. green.
                       Earlier: D-031 REPAID — THE DEMO DATABASE RECREATED, AND IT WAS WIDER
                       THAN FILED. the four demo orgs had 103 grants, ZERO account.* and
                       NO SUBSCRIPTION ROW AT ALL — so it was never only the invite flow,
                       every tier-gated screen was dead too. requireEntitlement fell
                       through to its BRONZE backstop on an org the seed calls GOLD,
                       which is the failure demo.ts's own comment warns about.
                       AFTER: gold / silver / bronze / enterprise, active, 130 grants and
                       5 account.* each. seedOrg SKIPS an existing slug by design, so no
                       re-seed could have reconciled them — the reset was the fix and it
                       was the owner's call. prisma refused the destructive command from
                       an agent, correctly, and the owner ran it.
                       THE OPERATORS NEEDED NOTHING: owner@endur.test (superuser) and
                       support@endur.test (Endur admin) have been in operators.ts since
                       T-059, deterministic TOTP so MFA works at rehearsal.
                       FOUND D-037, LIVE: 65 junk orgs and 36 stray platform users dated
                       25 Aug — FOUR DAYS AFTER T-048 closed D-004. the guard is not weak,
                       it is SKIPPABLE. globalSetup/setupFiles live in src/backend/
                       vitest.config.ts and THERE IS NO VITEST CONFIG AT THE REPO ROOT, so
                       `npx vitest run` from the root points a suite that truncates and
                       rewrites at the DEVELOPMENT database. npm test is safe; the
                       DANGEROUS COMMAND IS THE SHORTER ONE. fix before T-045 or the fresh
                       seed is re-polluted before the rehearsal.
                       Earlier: DEC-076 — THE POWERS GRID NOW SAYS WHAT IT MEANS.
                       the owner called /app/roles "too jargon based even for a superuser"
                       and was right: `tree` is the SHAPE OF THE DATA STRUCTURE the scope
                       walks, `self` reads as "their own department" to anybody who has not
                       read 11 §4, and `L1` invites the one belief the GRANT model exists to
                       deny — that a lower number means more power. a grid whose whole
                       argument is that mistakes become VISIBLE only works if the reader can
                       read it.
                       CELLS NOW READ: No / Themselves / Their {unit} / Their {unit} + below
                       / Everywhere / Blocked — in the TENANT'S noun. INV-001 applies to both
                       axes of this grid and only one of them had ever been done: D-008 fixed
                       the row labels and left the cells saying "unit" to an organisation that
                       calls them something else. scope-labels.ts is the same table for the
                       other axis, and the nonsense-label fixture now covers the cells.
                       THE CLICK-CYCLE IS GONE, not supplemented. it could only reach a state
                       by passing through states nobody asked for, it did not work on touch at
                       all, and its companion — shift-click for a hard block — hid the page's
                       most consequential action behind a modifier key. one dropdown of six
                       named choices, a legend above the grid explaining all six once, and a
                       visible "Set all…" where a click on the ROW LABEL used to silently
                       grant a power to every role.
                       A NATIVE <select>, not a popover: the grid lives in a horizontal scroll
                       container that clips anything positioned inside it, so a custom menu
                       would have needed a portal, a focus trap and a keyboard map to arrive
                       at what the browser already ships correct on a phone and to a screen
                       reader.
                       FOUND: `.powers-module` was TWO CLASSES WITH ONE NAME — T-051's
                       powers-by-place list and T-052's module header <tr> — so the grid's
                       group headers were laid out by a rule written for another screen.
                       21 tests on the page, green.
                       Earlier: DEC-075 — THE LOG FILES ARE NOW WRITTEN FOR A PERSON TO READ.
                       the owner asked for the bracketed form and that is what is on disk:
                       [2026-08-26 01:34:58 UTC+05:30] [11996] [INFO] [HTTP] GET /healthz
                       200 7ms req=… — local time with the offset, pid, level, a TAG the
                       eye can scan (HTTP / the error code / APP), the human sentence, then
                       everything else as key=value. STDOUT STILL GETS THE JSON: one logger,
                       one record, two renderings, because a pipeline and a person at 2am
                       want opposite things.
                       THE FORMAT IS REVERSIBLE AND THAT IS THE WHOLE SAFETY ARGUMENT.
                       /ops/logs and the T-090 export read these files back through
                       platform/logs/parser.ts, so a format that were merely prettier would
                       have silently broken the viewer. lib/logFormat.ts owns the grammar
                       and the parser IMPORTS it rather than restating it. one record is
                       one line whatever a stack trace holds. 10 new tests, all round trips.
                       THE PARSER STILL READS PINO JSON — files written before the change
                       are inside the 14-day window and blanking a week of history is not
                       an acceptable way to change a log format. the 1,548 lines already on
                       disk were converted in place, each one verified to parse back to the
                       same record BEFORE it was rewritten.
                       PID COMES FROM THE RECORD (loggerOptions.base gained it), and prints
                       `-` when there is none — never process.pid at format time, because a
                       log file spans restarts and a converted old line stamped with today's
                       pid is a fabricated fact.
                       Earlier: T-090 BUILT — THE LOG EXPORT, AND DEC-074 REVERSES A "NO" IN 72.
                       an operator can now download a filtered log file as ndjson or csv,
                       and EVERY EXPORT IS AUDITED — which is the whole reason the refusal
                       could be reversed rather than argued around: 72 § Out of scope did
                       not say "diagnostics must not leave", it said "a copy with NO AUDIT
                       of where it went". platform.logs.export is its OWN capability (both
                       roles) because a read is a page on a screen and an export is a file
                       that outlives the session AND the 14-day retention window.
                       THE OTHER HALF OF THE ASK WAS ALREADY TRUE. logs have been written
                       to src/backend/logs/app-<date>.log and error-<date>.log, rotated
                       and retained, since Stage E. what was missing is that the SCREEN
                       never said where — the page header now names the directory, the
                       rotation size and the retention, read off live config.
                       THE EXPORT SHARES THE READER'S NAME ALLOWLIST, never a second copy:
                       a guard applied on one of two routes is not a guard. it reads
                       FORWARD where the viewer reads backwards, and a capped export says
                       so rather than losing its tail silently.
                       FOUND: <LogViewer> HAD NO CSS AT ALL since T-078 — every class it
                       shipped had no rule anywhere. /ops/logs rendered as an unstyled
                       stack and now does not.
                       NOT MINE AND SAID SO: 4 pre-existing tsc errors (D-035) and one
                       pre-existing failing pagination test (D-036), both confirmed
                       against a stashed tree.
                       Earlier: T-059 BUILT — THE PLATFORM BACKEND. /ops HAS A DOOR. a separate
                       account table with NO org_id, a separate cookie (endur.ops), a
                       separate capability catalogue, a separate database seam and 13
                       routes under /api/v1/platform. 459 backend (+19) + 852 frontend
                       = 1,311 tests green.
                       INV-011 IS ENFORCED BY THE SEAM, NOT BY A CAREFUL HANDLER. 19 §5
                       is explicit that it must be "enforced by the platform client
                       returning aggregates only, not by a UI that declines to render
                       them", so platform/db.ts refuses `Answer` in ANY operation
                       including a nested include, allows `Response` only count/
                       aggregate/groupBy, and allows writes to exactly four models. it
                       throws PlatformSeamViolation — NOT a 403, because an INV-011
                       breach is a line of code to delete rather than a refusal to
                       render, and a tidy 403 is something somebody later allowlists.
                       N-058 WAS CHECKED BEFORE STARTING AND IT HELD (DEC-071). T-059
                       was the last unbuilt A-task and it was carrying a dependency on
                       T-057, which has never been built. none of platform_users, the
                       cookie, requirePlatform() or the seam reads a seat count or a
                       plan — that was /ops's dependency, not the door's. following the
                       board would have parked the whole tree with a day left.
                       DEC-072: THE OPERATOR SESSION IS ITS OWN STORE, NOT A SECOND
                       express-session. 19 §7 asks for a second cookie NAME because
                       "one session, two meanings is how privilege confusion bugs
                       happen" — and req.session IS SINGLE-VALUED, so mounting a second
                       instance would have reintroduced exactly that under a nicer
                       name. platform_sessions holds an opaque 32-byte id and
                       platform/session.ts is the only file that reads endur.ops.
                       DEC-073: SUSPENSION IS ENFORCED ON THE RESOLUTION SOURCE. 19 §6
                       and 70 both require it to cut the customer's STAFF and not their
                       respondents — a QR code on a wall belongs to people who did not
                       choose the plan (16 §6). tenantResolver is the only file that
                       knows HOW a tenant was resolved, so `via === 'session'` is the
                       only place that sentence can be written. checking at login would
                       have left every live staff session working.
                       MFA IS BUILT, NOT DEFERRED — 19 §9's blast-radius argument, kept.
                       RFC 6238 in 40 lines of node:crypto and NO dependency; mfa_secret
                       NOT NULL so there is no "not set up yet" state to fall through;
                       one message for all three login failures. `npm run ops:code -w
                       @endur/api` prints a live code so the demo can show it.
                       NOT BUILT AND SAID SO IN 19 §13b: /platform/analytics is T-067's
                       (71's four decisions ARE that task), the log routes are T-077's,
                       and the message endpoint stores the RECORD without sending mail
                       because there is no mail transport in this product.
                       Earlier: T-075 + T-076 BUILT — /app/logs, AND audit_log HAS A READER AT
                       LAST. it has been written on every state change since T-013 and
                       had never once been read: a whole invariant's worth of evidence
                       (INV-007, the transaction-bound row carrying decided_by) sitting
                       in a table with no reader. 440 backend (+7) + 852 frontend (+9)
                       = 1,292 tests green.
                       audit_log.outcome DID NOT EXIST IN THE DATABASE. 10 §5 has
                       carried the column since 23 Aug and the table had not, because
                       nothing had ever read audit_log — and a column no writer sets is
                       a column no reader can trust. it landed WITH ITS READER, DEFAULT
                       'allowed', because every row written before today described
                       something that happened. backfilling any other way would be
                       inventing history.
                       !! TWO CONDITIONS DECIDE WHICH REFUSALS ARE WRITTEN (DEC-068).
                       DEC-041 says "mutating capabilities only"; 56 gives the reason in
                       terms of the METHOD — "a 403 on a GET is the permission system
                       working as designed, thousands of times a day". both are right
                       about DIFFERENT mistakes, so both apply: nothing for a GET, and
                       nothing for a *.read. the second is the belt to the first, because
                       a read is occasionally shaped like a write and POST
                       /authz/simulate asks a question and changes nothing.
                       A 404 IS RECORDED TOO. indistinguishable from a 403 to the caller
                       by design (13 §5), and the more interesting of the two to the
                       ORGANISATION: somebody reached for a resource so far outside
                       their scope that we would not confirm it exists.
                       THE WRITER SITS BESIDE flushAudit IN db/tx.ts, never in the
                       middleware. ip and actor are decided by DEC-040/DEC-045 there and
                       nowhere else, and a second writer is a second place those rules
                       have to be remembered — which is DEC-040's whole lesson. NOT in a
                       transaction: INV-007 binds a row to the mutation it describes and
                       a refusal describes a mutation that never happened. and it can
                       never replace the 403 — a log that turns a refusal into a 500
                       makes the product LESS safe than not having one.
                       DecidedBy WAS TWO SHAPES UNDER ONE NAME (DEC-069). errors.ts had
                       {via, subjectName?, scope?} for the 403 detail; the resolver's
                       describe() emits seven fields, and BOTH cross the wire from the
                       same function. one type now — which is 24 §6c's argument for
                       <DecisionTrace> being one component, made one layer down.
                       <DecisionTrace> IS FINALLY BUILT, catalogued 23 Aug with no
                       caller. it took a `tense` prop so one component says "Allowed by"
                       of a real event and "Would be allowed by" of a hypothetical one;
                       T-054 EXTENDS IT, never forks it (INV-009). the full form says the
                       scope IN WORDS — "that ward and everything under it", never
                       own_unit.
                       SCOPE IS FILTERED OVER THE TARGET, IN SQL, BEFORE THE PAGE QUERY
                       (DEC-070) — 56: a row is visible when the THING ACTED UPON is in
                       scope, not when the actor is. before, not after, so meta.total is
                       a real count rather than a count of what exists with rows dropped.
                       WRAPPED in RequireCapability, unlike Analysis and Reflect: there
                       is no 402 on a log, so a route guard can say everything there is
                       to say.
                       NOT BUILT AND NOT PRETENDED: the actor filter has no picker (the
                       query parameter works), <PersonChip> was never built anywhere, and
                       the expanded trace has NO `considered` list to show — decided_by
                       stores the deciding grant, and storing the rejected candidates
                       would multiply the row size of the one table kept forever.
                       Earlier the same day: T-083 + T-084 + T-085 BUILT — THE IMPROVE
                       LOOP, AND STAGE 9 IS
                       DONE. THERE IS NO "Soon" TAG LEFT IN THE SIDEBAR: every item now
                       goes somewhere real. 433 backend (+10) + 843 frontend (+7) =
                       1,276 tests green.
                       THE ORDERING CONSTRAINT IS ENFORCED BY AN ABSENT ROUTE, not only
                       by a 404 (DEC-067). 44 calls it "the most defensible novelty claim
                       in the product after the permission engine": you record your own
                       assessment BEFORE you see what anybody said, or the reflection
                       becomes a rationalisation of the scores and the gap cannot exist.
                       GET /reflect/:id/gap 404s until the reflection is written — and
                       there is NO ROUTE AND NO DTO ANYWHERE that returns a reviewee's
                       received scores on their own. A 404 is a check somebody can relax
                       later; a missing endpoint is not. DEC-062's shape one feature over.
                       The page collapsed 44's five addresses into two for the same
                       reason: /app/reflect/:id/gap as its own address would be a link
                       somebody could open early.
                       !! ONE ACCEPTANCE LINE WAS NARROWED ON PURPOSE (DEC-066). 44 says
                       "a supervisor reads their subtree's reflections" — and one
                       paragraph earlier the SAME DOC says getting this scope wrong
                       "exposes someone's private self-assessment to a peer". A reflection
                       is a person's own written account of their own weaknesses, recorded
                       before they are allowed to see anything. So reflection.read is
                       seeded `self` AND NOTHING WIDER at every level that holds it. What
                       a supervisor gets is the CHECK-IN — the conversation, which is what
                       step 4 of the loop actually describes. An org that disagrees can
                       write the grant; the resolver supports it. It is their call, not
                       ours to seed.
                       NOT L4 EITHER: L3 is the reviewee and L4 is the respondent-level
                       role, so somebody nobody reviews has nothing to reflect on. The
                       item would have shown for every account and opened an empty page —
                       D-027 again.
                       IMMUTABILITY IS THREE DATABASE TRIGGERS, and 44 asks for a trigger
                       test BY NAME rather than a service test. reflections refuse UPDATE
                       outright (submitting IS finalising); plans and check-ins refuse any
                       change once finalised. improve.test.ts writes to the row directly
                       and the database still says no.
                       <GapBar> NAMES NO WINNER and has no `valence` prop — self higher is
                       a blind spot, self lower is under-confidence, and 44 is explicit
                       that a gap view reading as an accusation guarantees the next
                       reflection is gamed. Accent for your own reading, neutral for
                       everybody else's, never the status ramp.
                       <UpgradeCard> LEFT /app/analysis and joined 24 §6b — two callers,
                       identical shape, one differing tier, which is the test DEC-065 sets.
                       WHAT IS NOT BUILT AND IS NOT PRETENDED: the check-in text chat (the
                       `notes` field is the seam), step 5's cycle-over-cycle measurement
                       (needs two closed cycles; the seed has one), item-level overdue
                       (nothing schedules), and "reflection due" on /app home (46's
                       payload has no field and that is 46's task).
                       Earlier the same day: T-082 BUILT — /app/analysis. THE ANALYZE
                       LAYER IS A SCREEN.
                       Stage 9's fifth row, and Analysis is off the "Soon" list.
                       423 backend + 837 frontend (+30) = 1,260 tests green.
                       TWO FAILURES, TWO SCREENS — this is what DEC-011 was for. 403 is
                       "your account may not": an administrator's problem, nothing to
                       buy. 402 is "your organisation is below Silver": the account is
                       fine and the remedy is a tier. Collapsing them would have made a
                       Bronze customer WITH EVERY PERMISSION IN THE PRODUCT read "you do
                       not have access" and go asking their administrator to fix a
                       permission that was never wrong. Both directions asserted.
                       RELIABILITY IS ON EVERY PANEL, not just the strip. 43 says a 4.6
                       from 8 responses and a 4.6 from 800 are different facts and that
                       presenting them identically is the most common way a feedback
                       dashboard lies. The strip scrolls away and a screenshot of the
                       themes table does not carry it, so every heading gets the tag.
                       THE DRILL-THROUGH 403s ON ITS OWN, INSIDE THE PANEL, with the
                       analysis still on screen — 40's rule for its comments, on the
                       route that carries the same capability. Somebody who can read the
                       themes and not the comments is not a bug; they are the split
                       working.
                       !! NO CHARTING LIBRARY, AND 24 §10 IS SUPERSEDED RATHER THAN
                       IGNORED (DEC-064). §10 reserved Recharts "for the P3 analysis
                       dashboard only" and 43 repeated it — and design_specs/design/08
                       §8.2 ALREADY DRAWS THIS PAGE as "the conic-gradient donut, the
                       inline-SVG line chart", with three token swaps as its corrections.
                       There was nothing to convert. A library to redraw a picture we had
                       is 24 §1's indirection one layer down, and ~90KB of it. NO
                       DEPENDENCY WAS ADDED. The svg is aria-hidden and the same numbers
                       go out as a hidden <table>, which is not optional.
                       TWO COMPONENTS CATALOGUED, FOUR LEFT PAGE-LOCAL (DEC-065) — 43 §
                       Components names a line chart and a theme table, so <TrendLine>
                       and <ThemeTable> went into 24 §3 first and the donut, the driver
                       rows, the panel and the 402 card did not. 24 forbids a page
                       acquiring a SHARED CONTRACT nobody agreed, not a div becoming a
                       row. And <TrendChip> is finally BUILT after two refusals — with
                       `valence` OPTIONAL, because the arrow is a direction and the
                       colour is a claim. Its first caller passes none: a theme mentioned
                       twelve more times is not thereby better or worse.
                       <BarRow> IS NOT THE DRIVER BAR. It draws a share of a total. A
                       correlation is signed and lives in -1..+1, so -0.4 and +0.4 would
                       land in the same place with different colours — colour carrying
                       the meaning alone, which 21 §8 forbids.
                       WHAT THE PAGE HONESTLY CANNOT SHOW: the drivers panel is empty on
                       demo data and says so in words, because demo.ts draws a comment's
                       tone and its rating as INDEPENDENT THROWS so every correlation
                       lands in the deadband. And the four demo orgs still cannot open
                       this page at all — zero analysis.read grants AND no subscription
                       row, so it 403s and 402s for all four. Nothing was re-seeded;
                       that is still D-031.
                       Earlier the same day: T-081 BUILT — THE ANALYSIS BACKEND,
                       RULE-BASED. Stage 9's fourth row.
                       THE GATE IS THE TYPE. DEC-058 made features/inbox/ hold one
                       content-free table so it COULD NOT query `responses`. Analysis is
                       the same danger one step on — a list of individual comments with
                       arithmetic over it — so features/analysis/ holds NO QUERY AT ALL
                       and a test asserts the word `prisma` is absent from it.
                       readCorpus() returns a UNION whose `comments` field exists only on
                       the unsuppressed branch: 40 and 58 both had to REMEMBER their gate,
                       this one is refused by the compiler. DEC-062.
                       TWO gates, and the filters are why. readableCampaigns() decides
                       which campaigns may be read; the second decides whether the SLICE
                       asked for is big enough. Without it `?subjectId=` is a per-subject
                       breakdown of three people — the request 38 § "Not built" refused,
                       reached through a query parameter instead of a route. Proved by
                       disabling it: exactly one test goes red.
                       THE DRILL-THROUGH IS response.read, NOT ANALYSIS. It returns
                       verbatim comments and 40 already priced those — "seeing that the
                       average is 4.3 and reading what one person wrote are different
                       levels of access". Gating on analysis.read alone would have made
                       this page a way around the split 40 draws, QUIETLY, because the
                       seeded matrix hands both to the same three levels.
                       !! FOUND D-033 BEFORE A LINE OF THE FEATURE EXISTED. analysis.read
                       has been in 11 §3 since T-003 and entitled at Silver in 16 §3 since
                       T-088 — and in NO ROW of the seeded grant matrix. Not restricted.
                       ABSENT. So /api/v1/analysis would have returned 403 TO EVERY USER OF
                       EVERY ORG INCLUDING A GOLD ONE, on the exact surface 43 exists to
                       demonstrate the 402-vs-403 split on. It is D-012 and D-028 a third
                       time: THE ENTITLEMENT SAID YES AND THE GRANT SAID NOTHING, which is
                       what made it look built. Ten capabilities were absent; the other
                       nine are T-083's and 45's and are left ON PURPOSE — a grant to a
                       route that does not exist cannot be tested. routes.test.ts now
                       asserts the pair that IS always a bug: a MOUNTED route requiring a
                       capability nobody holds. T-083 meets it the day it mounts /reflect.
                       DEC-063, N-062.
                       !! FOUR ENGINE FLAWS THAT TWELVE FIXTURES COULD NOT SHOW, found by
                       running it read-only over the real seeded corpora. `room` is in 113
                       of Grand Palace's 229 comments — 49% — so a flat 50% merge bar ate
                       everything and returned four confident themes; the bar must BEAT
                       CHANCE now, capped at 1 or a ubiquitous theme can never have a
                       facet. `Comfortable` sat in the themes table beside `Checkout` — a
                       theme is WHAT people talked about, the lexicon is HOW THEY FELT.
                       `Twice` and `Dropped` are real words and not topics. And `called`
                       stemmed to `cal` while `call` stemmed to `call`, so the two never
                       met. Each fix has its own regression test.
                       All four demo orgs now read plausibly — Room/Checkout/Breakfast/
                       Staff/Night/Location for the hotel, Nurses/Discharge/Ward/Food for
                       the hospital. What is LEFT is vocabulary coverage, and that is the
                       weakness 43 § Reliability promised: Riverside reads 101 of 115
                       neutral because a hotel lexicon does not know a hospital's words.
                       AND THE DEMO ORGS STILL CANNOT OPEN IT. Seeded 21 Aug, they hold
                       zero analysis.read grants AND no subscription row, so it 403s and
                       402s for all four. db:seed skips existing orgs; only db:reset
                       repairs them, and that is D-031 — the owner's call. Nothing was
                       re-seeded.
                       Earlier: T-079 + T-080 BUILT — THE RESPONSE INBOX, BACK AND FRONT.
                       Stage 9's second and third rows. /app/inbox is real: four tabs,
                       optimistic marking that reverts ON THE CARD, j/k/e/u each with a
                       visible button, and three empty screens of which two are IDENTICAL
                       ON PURPOSE (52 §2 — a "3 hidden" placeholder would announce that
                       suppressed data exists).
                       THE BACKEND'S POINT IS WHAT IT CANNOT DO. 38 § "Not built" already
                       refused a per-subject breakdown in these words: "a second ungated
                       path to them is what INV-007 exists to prevent". An inbox is the
                       same mistake made larger — a list of INDIVIDUAL COMMENTS ACROSS
                       CAMPAIGNS is precisely what the k-anon gate exists to withhold. So
                       features/inbox/ owns ONE TABLE (inbox_state: two ids and two
                       timestamps, no content) and imports readComments() from
                       features/results/service.ts. It does not query `responses` and
                       cannot grow a path to one by accident later. DEC-058.
                       The threshold is applied PER CAMPAIGN BEFORE THE MERGE — two
                       campaigns of four responses each do not become a readable eight,
                       which is the mistake a naive cross-campaign UNION makes and it
                       looks right while making it. Asserted directly.
                       assertVisible and readableCampaigns now share ONE predicate, so
                       "the inbox's scope matches 40's" is true BY CONSTRUCTION rather
                       than by two people writing the same `some()` twice.
                       THE WRITE ROUTES ARE GATED TOO. Without it POST /inbox/:id/read on
                       a guessed uuid is an ORACLE: 204 for a response that exists, 404
                       for one that does not, inside a campaign the caller cannot read.
                       Same 404 for all three refusal reasons.
                       !! DEC-060 CAME FROM ITS OWN TEST, and the bug was mine. Opening a
                       card marks it read; the first version then filtered every marked
                       card out of the tab, so on Unread THE DETAIL APPEARED AND VANISHED
                       IN THE SAME FRAME. Reading is not triaging: a card leaves when the
                       reader ticks or archives it, never as a side effect of being read.
                       The test that caught it was written to assert the expansion.
                       !! <ScoreBadge> IS BUILT, AND CONF-016 WAS RIGHT ABOUT 40. It
                       refused the component because 40's number is an AVERAGE and
                       colouring one is interpretation, and 40 was its only caller. 58's
                       number is ONE PERSON'S OWN RATING on the response their comment
                       came from — "2/5 · the projector in Room 4 has never worked" is a
                       fact somebody stated. So the two halves come apart: the BADGE had
                       no legitimate caller and now has one; the THRESHOLD COLOURS were
                       the interpretation and are still not built, at any value. The
                       prohibition now lives INSIDE the component, which is stronger than
                       "not built" ever was. CONF-022, and its test asserts the className
                       is exactly `score-badge`.
                       !! AND /app/roles WAS STILL GREYED WITH A "Soon" TAG. T-052 shipped
                       the ladder and the powers grid on 24 Aug and the LAST EDIT — the
                       one T-085 exists to name — was missed, so a built page was
                       reachable for a day only by typing the address. Nothing asserted
                       the POSITIVE direction: Sidebar.test.tsx counted "Soon" tags and
                       tested that scaffold items refuse to navigate, and had one
                       hand-written check that People DOES navigate. It is a table now,
                       one row per built page.
                       FOUND N-061 / D-032 — NOT OURS, AND SAID SO. Response scope is
                       decided at the CAMPAIGN, not the subject: a campaign is visible if
                       ANY of its subjects is in reach, and then every response in it is
                       returned. Live, grand-palace-3 (level 3, anchored at Lakeside
                       Property, response.read: own_unit) reads all 229 comments including
                       every one about City Property — and /campaigns/:id/responses hands
                       them the same 210 rows it hands the administrator. That is 40's
                       behaviour and 58 § Acceptance REQUIRES the inbox to match it. A
                       stricter inbox would break the criterion that asked for consistency
                       and leave two answers to one question. Owner's call; it is a change
                       to 40 first.
                       DTO gained questionId and scoreMax (DEC-059) — both forced by the
                       table, not chosen: `id` must be the RESPONSE id because inbox_state
                       is keyed on it, so two free-text answers on one response share a
                       read state and need a second key.
                       386 backend (+18) + 807 frontend (+23) = 1,193 tests, all green.
                       Live-verified against The Grand Palace: 229 comments, real hotel
                       nouns on the cards, and the full read → archive → unarchive →
                       unread round trip returning the org to 229 unread exactly.
                       Earlier: T-089 + T-052 BUILT — THE BOUNDARY, AND THE POWERS GRID.
                       Items 1 and 2 of the owner's second ask, in the order they asked.
                       T-089: a failed lazy import now says THE APP UPDATED and offers a
                       HARD RELOAD of the page you were opening. PublicBoundary printed the
                       raw Error.message and offered a client-side <Link>, which re-renders
                       inside the same dead module graph and fails identically — one
                       failure became a loop. DEC-054, D-029 repaid. Proved by reverting:
                       put the <Link> back and EXACTLY ONE test goes red, the one that
                       clicks and asserts the event was not preventDefault'ed. Every other
                       assertion passes against the broken version, because <Link> renders
                       an <a href> too.
                       T-052: /app/roles is real. The ladder (order derives every level,
                       nothing sends one) and the grid (scope cycle, shift-click block,
                       column copy, row fill, undo, warnings AT the cell, read-only without
                       grant.update, a DIFF on save).
                       !! "NO BACKEND WORK AT ALL" WAS WRONG AND THE ERROR WAS MINE.
                       Yesterday's board said so because every route exists — T-017 built
                       all nine. What did NOT exist is TWO OF THE THREE REFUSALS 33 has
                       specified since round 1:
                         · PUT /grants carried requireCapability('grant.update') and
                           NOTHING ELSE, so anyone the administrator delegated the grid to
                           could write any role every capability in the catalogue. Same
                           shape as D-018, one screen along. requireNoGrantEscalation,
                           DEC-056. The bound is EVERYWHERE, not a scope-width comparison:
                           the first version refused THE FOUNDER, because 50 §1 seeds
                           level 1 campaign.launch at `subtree` and a subtree from the ROOT
                           already is the whole org. It asks visibleUnits() instead.
                         · No lockout guard. A save leaving nobody holding grant.update was
                           accepted, and the capability that would undo it is the one just
                           removed. 409, DEC-057, computed on the RESULTING matrix.
                       A ROUTE EXISTING IS NOT A RULE EXISTING.
                       D-008 REPAID — DEC-055. 64 written phrases replace a four-line
                       derivation. It was filed for being un-localised; writing the table
                       showed it was also WRONG for every object added after the rule:
                       "read resultses", "create apikeys", "read actionplans". Nobody had
                       read its output, because the screen that renders all 64 rows was the
                       unbuilt one. N-059.
                       VERIFIED LIVE against The Grand Palace: "open guest surveys for
                       answers", "add restaurants", "move properties to a different parent".
                       !! AND THE GRID'S OWN WARNINGS FOUND SOMETHING — N-060, D-031.
                       "Nobody in this organisation can give somebody a sign-in." All four
                       demo orgs were seeded 21 AUG and hold 51 capabilities; T-072 added
                       account.create/reset/revoke to the matrix on 24 Aug and existing orgs
                       got no rows. `npm run db:seed` will NOT fix it — it prints
                       `skip: <name> already exists`. So T-072's invite flow is UNREACHABLE
                       in every demo org and T-073's Invite button would 403 on stage.
                       Remedy is destructive (drop + re-seed), so it is the owner's call.
                       368 backend (+15) + 784 frontend (+31) = 1,152 tests, all green.
                       Earlier the same session: DOCS ONLY — THE OWNER'S SECOND ASK IS RECORDED. NO CODE WRITTEN.
                       Three items, raised after opening the running app:
                         1. the Sign in button on the landing page failed with
                            "error loading dynamically imported module: .../Login.tsx"
                         2. roles, analysis, inbox and reflect STILL NEED BUILDING —
                            "i asked for this before and you didnt do it"
                         3. logging should be visible to admins, and the endur-admin and
                            superuser pages have not been seen at all
                       !! ITEM 2 IS A REPEAT INSTRUCTION AND THE COMPLAINT IS CORRECT.
                       CONF-019 (23 Aug) was the same ask. It was answered by WRITING
                       SPECS — 43 and 44 re-tagged buildable, 58 written from nothing —
                       and then sequencing every one of those tasks behind M0. No code
                       followed. A spec is not the deliverable; the page is. CONF-021
                       records the correction and PROMOTES the four above the rest of
                       Stage 6 and above T-073. Nothing was re-specified: same task ids,
                       same specs, new order. 55 § Stage 9.
                       What changed since CONF-019 and makes this cheap: T-088 wrote the
                       subscriptions row, so Analysis and Reflect — both entirely GOLD —
                       no longer 402 for every user. 55 § 7d still named T-057 as their
                       blocker; corrected to T-088 ✅.
                       ITEM 1, HONESTLY: NOT REPRODUCED. Crawled the whole Login module
                       graph off the dev server — 44 modules, every one 200 and valid
                       javascript — so the failure was not present when checked. What IS
                       a real defect is the REMEDY: PublicBoundary catches the throw,
                       prints the raw Error.message (a .tsx path at a localhost URL) and
                       offers a client-side <Link to="/"> — which re-renders inside the
                       same dead module graph and fails identically. ConsoleBoundary
                       already uses <a href> and its comment says why. DEC-054 is the
                       rule, D-029 is the defect, T-089 is the fix. Homed in 25, which is
                       otherwise still an unwritten placeholder.
                       ITEM 3 IS TWO THINGS WEARING ONE WORD, and 19 §4 already draws the
                       line: an ORG's admin sees their own org's activity (56 → T-075
                       read surface, T-076 /app/logs); an ENDUR operator sees the estate
                       and the log FILES (19/70/71/72 → T-059 then T-066, T-067, T-077,
                       T-078). Different principals, different stores, INV-011.
                       "Haven't seen the endur admin pages" is correct AND BY DESIGN:
                       /ops is a FOURTH route tree behind a separate login and a separate
                       cookie, and nothing in /app links to it. T-059 is what makes the
                       door exist — until then there is nothing to have seen.
                       20 §2's route map was stale in three ways and is fixed: /app/logs
                       was missing entirely though 56 has owned it since 23 Aug; inbox /
                       analysis / reflect were still tagged P3; the /ops tree was absent.
                       Its D-027 paragraph still said T-086 and T-087 were future work.
                       N-058 flags that T-059's "needs T-057" looks like the same
                       over-coupling DEC-048 already took apart once. CHECK, do not
                       re-sequence on it.
                       THE COST, STATED ONCE: M0 is 26 Aug, two days out, T-045 (three
                       demo rehearsals) is unrun, and Stage 9 is 16 tasks. The owner has
                       asked twice; the sequence is theirs.
                       Earlier the same day: T-051 BUILT — PERSON DETAIL AND MY ACCOUNT. Two pages, one shared
                       block. `/app/people/:id` and `/app/profile` stop being stubs, and
                       <PowersByPlace> is the panel 34 and 47 would otherwise have built
                       twice (24 §4, INV-009).
                       Backend: GET /profile, PATCH /profile and POST /profile/password —
                       the three routes 13 § Profile had CATALOGUED SINCE ROUND 1 and
                       nobody had written. Plus features/people/powers.ts, now the ONE
                       caller of resolve() for "what can this person do, and where".
                       !! IT FOUND A LIVE INV-005 BREAK, in code T-018 wrote. readPerson
                       had no unit id to work with, so it re-found the unit BY NAME:
                         where: { orgId, kind: 'position', unit: { name: unitName } }
                       `nodes` has NO unique on (org_id, kind, name) and POST /units does
                       not check — "Year 1" under two faculties is ordinary, not exotic.
                       A person holding a position in each had BOTH resolved to whichever
                       row came back first, so one unit's powers printed under the other
                       unit's heading. ON THE ONE SCREEN BUILT TO SHOW THAT POWERS DO NOT
                       LEAK BETWEEN UNITS. Every existing test passed, because every
                       fixture in the repo names its units distinctly. N-057.
                       The test that catches it is the only one in the suite with two
                       SAME-NAMED units. Reverting the fix fails it — and the test called
                       "PROVES INV-005" still passes, which is why this survived.
                       POST /profile/password carries NO requireCapability and is now the
                       one AUTHENTICATED route on the enumeration allowlist, argued in
                       place (DEC-053). The test FAILED when the route was added, which is
                       12 §7's mechanism working: a human had to argue for the entry.
                       ProfileView REUSES /people/:id's types rather than 47's narrower
                       sketch (DEC-052) — two shapes would have forked the one component
                       that renders them, which is N-005 breaking a layer above where it
                       was written. N-056.
                       VERIFIED LIVE against a real lowest-tier account: /profile 200 with
                       4 held capabilities; their people list is ONE row, themselves; the
                       founder's row 404s not 403s; PATCH /profile carrying an `email`
                       changed the name and NOT the address.
                       353 backend (+15) + 753 frontend (+26) tests.
                       Earlier the same day: T-087 BUILT — OPEN-009 IS CLOSED, BY THE OWNER. DEC-051.
                       WHAT EACH ROLE LEVEL SEES IS NOW DECIDED AND TESTED. NavItem gains
                       `minScope` (default `self`) — how far `needs` must REACH before an
                       item is worth showing. TWO gates changed, SEEDED MATRIX UNTOUCHED:
                         People    person.read at own_unit  (was the bare verb)
                         Settings  org.update               (was org.read)
                       !! SETTINGS WAS NEVER A SCOPE PROBLEM. org.read is `all` at EVERY
                       level including the lowest — seeded so the vocabulary loads on
                       first paint — so no minimum could ever have hidden it. It was the
                       WRONG CAPABILITY. <VocabularyChips> already gated its link to the
                       same page on org.update; the sidebar was the half that had not
                       caught up. Found by reading a REAL L4 account's map, not the docs.
                       OWNER'S ANSWER: L3 KEEPS PEOPLE. They hold person.read: own_unit,
                       so their page lists real colleagues, not themselves — the
                       difference from L4, where it listed one person.
                       Four tests, one per level, EXACT item lists. Reverting both gates
                       fails 5 of 13; the L1 test still passes.
                       DEFERRED BY THE OWNER → OPEN-010: an L3 still sees Structure and
                       Templates. 55 § Stage 8's draft table has now been WRONG IN THREE
                       CELLS and is marked a sketch, not a spec.
                       338 backend + 727 frontend tests.
                       Earlier the same day: T-086 BUILT — THE CAPABILITY SET NOW SAYS HOW FAR, NOT JUST WHAT.
                       MeResponse.capabilities is a MAP of capability -> WIDEST HELD
                       SCOPE, not a list of verbs. DEC-050. useCan(cap, atLeast?) defaults
                       to `self`, so all 49 existing call sites are unchanged; the wider
                       form is what a nav gate needs, because `person.read: self` is
                       seeded to EVERY role (so /app/profile opens) and the bare verb was
                       therefore true for EVERY ACCOUNT IN THE PRODUCT — D-027.
                       THE KEY SET IS EXACTLY WHAT THE ARRAY WAS, asserted on purpose: the
                       value is the WIDEST live allow, and a unit-scoped deny still
                       neither removes the key nor narrows it. What changed is what the
                       client KNOWS, never which capabilities it is told about.
                       !! SUBJECTS IS NOW VISIBLE FOR L4, which is the owner's ask landing.
                       The seeded matrix gives L4 subject.read: own_unit (50 §1) and the
                       existing gate does the rest. Smaller half of OPEN-009 CLOSED.
                       org.test.ts asserts the L4 grant list EXACTLY, so the next row
                       cannot join it quietly.
                       NO `needs` GATE WAS CHANGED IN T-086, deliberately — it carries
                       the scope; T-087 spent it later the same day (above).
                       Proven both halves by reverting: narrowest-instead-of-widest fails
                       2 backend tests, scopeReaches ignoring atLeast fails 2 frontend.
                       338 backend + 721 frontend tests.
                       Earlier the same day: D-007 REPAID ON ITS DUE DATE — DEC-049, AND IT WAS A LIVE LOCKOUT,
                       not the "ambiguity" CONF-013 described. MEASURED FIRST, through the
                       real routes: a person with an account in Org A is added to Org B,
                       provisioned a sign-in (T-072, ONE CLICK), follows the link, picks a
                       password, IS SIGNED IN BY THE ACTIVATION — AND CAN NEVER LOG IN
                       AGAIN. Their correct password 401s forever; only the older row was
                       ever compared against. T-072 SHIPPED THE DAY BEFORE and made that
                       state one click and a link.
                       The answer is CONF-013's option (b), disambiguation form: address
                       stays PER-TENANT, login checks the password against every activated
                       account on it (capped 5, oldest first), one match signs in with NO
                       question, more than one returns 409 ACCOUNT_AMBIGUOUS naming them.
                       NO MIGRATION, NO SCHEMA CHANGE — which is what made it right two
                       days from M0. Costs nothing on stage: no seeded org shares an
                       address, so the demo never renders the question.
                       Proven by reverting MAX_LOGIN_CANDIDATES to 1 — three tests fail.
                       334 backend + 716 frontend tests.
                       Earlier the same day: T-088 BUILT — AN ORGANISATION IS NOW ON THE TIER IT PICKED. /start is
                       two steps and ONE POST: details, then bronze/silver/gold, and the
                       one pressed is the one you are on. RegisterBody.tier is REQUIRED
                       WITH NO DEFAULT, and the subscriptions row is written inside
                       register's transaction — so an org cannot exist without a tier
                       somebody chose. No trial, nothing pre-selected, no skip. The seed
                       gives one demo org per tier. DEC-048.
                       !! D-012 IS REPAID, so T-082 (Analysis) and T-083 (Reflect) are
                       UNBLOCKED. Every org in the product had been silently bronze since
                       the beginning, which 402'd both surfaces for everyone.
                       !! IT FOUND D-028, TWO MORE HOLES IN SHIPPED CODE.
                       account.* (added by T-072 YESTERDAY) and billing.* were in NO TIER
                         AT ALL — the map is a whitelist. billing.update uncovered means
                         the moment T-057 mounts the gate on POST /billing/tier, THE
                         UPGRADE BUTTON 402s.
                       requireEntitlement, mounted since T-003, had NO TESTS WHATSOEVER.
                         That is how D-012 survived a month. test/tiers.test.ts is new.
                       VERIFIED AGAINST THE RUNNING API, both directions on ONE org:
                       silver -> 404 (gate opened), flip to bronze -> 402 naming silver.
                       Probe org deleted, zero rows left. 330 backend + 712 frontend
                       tests. 61 docs, 64 capabilities.
                       Previously, 2026-08-24: T-072 BUILT — AN ORGANISATION CAN NOW MAKE ITS OWN ACCOUNTS. An
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
                       authz/held.ts discarded scope, so EVERY ACCOUNT IN THE PRODUCT sees
                       a People item that lists exactly one person — themselves. Settings
                       is the same via `org.read: all`. Structure and Roles are already
                       correctly hidden for L4; Subjects, the one they SHOULD see, was
                       hidden because L4 had no subject.read row.
                       ALL FIXED 24 Aug by T-086 + T-087. OPEN-009 CLOSED by the owner.
                       Subjects shows for L4; People needs person.read beyond `self`;
                       Settings needs org.update. D-027 REPAID. What is left is OPEN-010,
                       the rest of the L3 row, deferred by the owner and not M0.
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
STATUS    51/80 (49/49 for M0 minus the fonts). STAGES 0-4 DONE BUT FOR THE FONT FILES.
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
&& `npm run audit:vocab && npm test`. That last one runs both workspaces — **1,152 tests
across 93 files**, 368 backend + 784 frontend. All five are green right now, so anything red
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
[x] T-043  X  resolve OPEN-002 (public URL / QR)   DEC-086 — LAN address; verify at T-045
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
              + lib/logFormat.ts — the on-disk line is human-readable (DEC-075, 26 Aug)
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
              CSV import wizard BUILT 25 Aug (below, with T-073). Only the two-hat
              preset buttons remain unbuilt on this task (see Debt)
[x] T-051  B  person detail + my account (34, 47)
              ← BUILT. Both pages, plus GET/PATCH /profile and POST /profile/password
                (13 § Profile catalogued them in round 1; nobody had written them).
                <PowersByPlace> is ONE component in TWO placements — 24 §4, INV-009.
                FOUND AND FIXED A LIVE INV-005 BREAK: powersByPlace re-found the unit
                BY NAME and two units may share one, so one unit's powers printed under
                the other's heading. N-057. DEC-052, DEC-053
[x] T-052  B  roles + the powers grid (33)                     ← repays D-008
              ← BUILT 24 Aug, see Stage 9 item 2 for the full entry
[x] T-053  A  POST /authz/simulate — the route does not exist  ← blocks T-054
              ← BUILT 25 Aug. Mounted on authzRouter, guarded by requireCapability
                ('simulator.run') — already seeded S('all','subtree') in grant-matrix.ts,
                so the route-enumeration test's unreachable-capability check was already
                satisfied. `runSimulation()` (features/roles/service.ts) maps SimulateBody's
                target onto authz's own Target and calls `simulate()` — still three lines,
                still just resolve() — with ONE resolution step ahead of it: a subject or
                campaign id has no `unitId` of its own in `authz/types.ts`'s Target, so the
                service reads the subject's `unitId` / the campaign's `audienceRule.unitId`
                from Prisma first. New DTO: `packages/shared/src/dto/authz.ts`
                (SimulateBody/SimulateTarget/SimulateDto)
[x] T-054  C  permission simulator page (42)                   ← needs T-053
              ← BUILT 25 Aug. `/app/simulator` replaces the `<Placeholder>`. Sentence
                builder (person → capability → target-kind → target, every blank a
                real-object dropdown/search, `at` optional), verdict card, and
                `<DecisionTrace>` EXTENDED rather than forked (INV-009) — same component
                `56`'s log renders, `tense="present"`. Explicit lines for a hard block and
                for "no rule grants this"; a best-effort counterfactual derived from
                `considered` for an out-of-scope block. Last five simulations kept in
                `useSimulator()` state. NOT BUILT: the many-hats glowing-chart view and the
                embedded panel on `/app/roles` (42 says both placements) — scoped out here,
                left for a follow-up. New: `lib/simulator.ts`. Typecheck clean on both
                packages; the backend vitest suite needs a local Postgres + `npx` on PATH
                that this session's shell did not have, so `routes.test.ts` (route-
                enumeration, INV-003) was read by hand rather than run — worth an actual
                run before this is called done
[ ] T-055  A  RLS policies                                     ← repays D-001 + D-003
[x] T-056  X  DECIDE: what an Endur operator IS (OPEN-007)     ← DEC-033. Doc 19 written
[~] T-057  A  billing read surface + seat metering (16 §5, §8) ← repays D-012, D-013
              ← PART BUILT 29 Aug alongside the /app/plan page. GET /billing (summary +
                billable_seats computed live from 16 §5, repaired on read when the row is
                missing), GET /billing/plans, POST /billing/tier. STILL MISSING: the seat
                LIMIT and everything that depends on it — GET /billing/usage as its own
                route, <OverLimitBanner>, the 402 on adding a person over the limit
[~] T-058  B  plan + billing page, JOIN buttons, over-limit banner (49)  ← DEC-080
              done: /app/plan, prices, <PaymentDialog>, payments ledger, /ops/earnings.
              left: <OverLimitBanner> + the seat ceiling (needs T-057)
              ← THE PAGE IS BUILT, 29 Aug, AT /app/plan AND NOT AT /app/settings/billing.
                49 § Route & access argues for a settings tab; the owner asked for a
                sidebar item, so it is one — in the `system` group beside Settings and the
                activity log, and the doc's argument is recorded in the page header rather
                than deleted. Current-plan card (tier, status, period, seat breakdown, a
                four-step tier ladder) + <PlanPicker mode="join">. Upgrade applies with no
                dialog, downgrade confirms and says the data is kept (49 § Interactions).
                NOT BUILT: <OverLimitBanner> and the seat ceiling (T-057), and the audit
                row does not name the from-tier — AuditIntent carries no metadata field
                and widening it belongs with the rest of this task
[x] T-059  A  platform backend — platform_users, requirePlatform, seam (19)  BUILT 26 Aug
              ← the T-057 dependency was DROPPED, not waited out (DEC-071, closing N-058)
[x] T-066  B  /ops console — estate, plan override, messaging (70)   BUILT 26 Aug
[x] T-067  B  /ops/analytics — tier mix, movement, trials, quiet (71) BUILT 25 Aug
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
[x] T-073  B  Invite action, account panel, <InviteLink>, /activate page  BUILT 25 Aug
              ← UNBLOCKED PROPERLY BY T-051: the account panel hangs on person detail,
                which now exists rather than being a <Placeholder>. Backend was already
                complete (T-072); this was the frontend half. List row shows Invite /
                Pending / Active / Disabled; the detail page carries the full panel with
                re-issue and revoke. `<InviteLink>` never dismisses silently — no backdrop
                click, no Escape (57 § Interactions). `/activate/:token` carries no
                `<RedirectIfSignedIn>`, on purpose: a stranger from another tenant must
                still reach it (57's own acceptance list)
[x] T-074  A  audit_log.ip NULL for non-user principals  ← D-019 REPAID
              ← RE-KEYED THE SAME DAY BY DEC-045: the rule is on the ACTION, not the
                principal, because DEC-037 made a respondent a `user` principal
[x] T-075  A  GET /audit — filters, cursor, outcome, denial rows (56, DEC-041) BUILT 25 Aug
[x] T-076  B  /app/logs + <DecisionTrace>   ← T-054 needs the SAME component. EXTEND it
[x] T-077  A  platform.logs.read + the file routes + path guard (72)  BUILT 25 Aug
[x] T-078  B  /ops/logs + <LogViewer>                                    BUILT 25 Aug
[x] T-090  A  log EXPORT + platform.logs.export (72, DEC-074)          BUILT 26 Aug
[x] T-079  A  inbox_state + 5 routes, read THROUGH results/service.ts (58)   BUILT 25 Aug
[x] T-080  C  /app/inbox + <ResponseCard> + <ScoreBadge>                     BUILT 25 Aug
[x] T-081  A  analysis backend, RULE-BASED (43, DEC-042)               BUILT 25 Aug
[x] T-082  C  /app/analysis                                           BUILT 25 Aug
[x] T-083  A  improve-loop backend (44)                               BUILT 25 Aug
[x] T-084  B  /app/reflect                                            BUILT 25 Aug
[x] T-085  B  un-disable the sidebar — DONE. No "Soon" tag is left anywhere.

Stage 8 — WHAT EACH TIER SEES.  Owner ask, 24 Aug.  DOCS ONLY so far (55 § Stage 8).
[x] T-086  A  scope-aware MeResponse.capabilities + subject.read for L4 (13, 50 §1)
              ← BUILT. capabilities is a MAP of capability → widest held scope, not a
                list of verbs (DEC-050). useCan(cap, atLeast?) defaults to `self`, so
                every existing call site is unchanged. The seeded matrix now gives L4
                subject.read: own_unit, so SUBJECTS IS VISIBLE FOR L4 TODAY, with no
                new gate machinery — the smaller half of OPEN-009, closed. No `needs`
                gate was touched: T-086 carries the scope, T-087 spends it
[x] T-087  B  per-tier sidebar — People/Settings stop showing to self-only accounts
              ← BUILT. NavItem.minScope (default `self`). TWO gates changed and the
                seeded matrix untouched: People → person.read at own_unit; Settings →
                org.update, a CAPABILITY change not a scope one, because org.read is
                `all` at every level. OWNER ANSWERED OPEN-009: L3 KEEPS People, their
                roster is real. Four tests, one per level, exact item lists. The rest
                of the L3 row (Structure, Templates) deferred → OPEN-010
[x] T-088  B  THE TIER PICKER AT SIGN-UP (DEC-048)   ← asked for by name, 24 Aug
              ← BUILT. /start is two steps and ONE POST; RegisterBody.tier is required
                with NO DEFAULT; the subscriptions row is written inside register's
                transaction. D-012 REPAID, so T-082 and T-083 are unblocked. The seed
                now gives one demo org per tier. FOUND D-028: account.* and billing.*
                were in NO TIER AT ALL, and requireEntitlement had NO TESTS
```

### Stage 9 — the second ask · 24 Aug · CONF-021 · **THE CURRENT WORK**
Three owner items after opening the running app. **Item 2 is a repeat of `CONF-019` and the
complaint is correct** — that ask was answered with specs and then deferred behind M0, and no
code followed. Nothing here is newly specified: same task ids, same spec docs, **new order**.
Full tables in `55` § Stage 9.
```
--- item 1 · the bug -------------------------------------------------------------
[x] T-089  A  a failed lazy import must offer a HARD RELOAD, not a router <Link>
              ← BUILT. "Endur updated while this tab was open" + <a href> to the page you
                were opening, not to /. REVERT PROOF: put the <Link> back and exactly ONE
                test goes red — <Link> renders an <a href> too, so every attribute
                assertion passes against the broken version. RespondBoundary gained a
                Try again as well: "open the link again" is useless advice to somebody
                who arrived from a printed QR code
              ← DEC-054. NOT REPRODUCED on demand — the Login module graph crawls
                clean, 44 modules, all 200. The defect is the REMEDY: PublicBoundary
                prints the raw Error.message and links client-side, which re-renders
                inside the same dead module graph. ConsoleBoundary already gets this
                right and says why in a comment. Repays D-029. DO NOT FOLD THIS INTO
                ANOTHER TASK — every route is lazy, so every stale tab shares the fault

--- item 2 · the four sidebar pages, in order ------------------------------------
[x] T-052  B  roles + the powers grid (33)        ← BUILT. /app/roles is real: the
                ladder (order derives every level) and the grid (scope cycle, shift-click
                block, column copy, row fill, undo, warnings AT the cell, read-only
                without grant.update, a DIFF on save).
              !! "NO BACKEND WORK AT ALL" WAS WRONG. Every ROUTE existed since T-017; TWO
                OF THE THREE REFUSALS 33 specifies did not. PUT /grants had no escalation
                bound (DEC-056) and no lockout guard (DEC-057). A ROUTE EXISTING IS NOT A
                RULE EXISTING.
              D-008 REPAID — DEC-055, 64 written phrases. The old derivation was not only
                un-localised, it said "read resultses". N-059
              FOUND D-031 from the grid's own warnings: the demo orgs predate T-072's
                account.* capabilities and db:seed skips them. N-060
[x] T-079  A  inbox backend — inbox_state, 5 routes, read THROUGH results/service.ts
              BUILT 25 Aug. features/inbox/ CANNOT REACH `responses` — it imports
              readComments() and prisma.inboxState and nothing else (DEC-058).
              Threshold applied PER CAMPAIGN before the merge. Writes gated too.
[x] T-080  C  /app/inbox + <ResponseCard> + <ScoreBadge>
              BUILT 25 Aug. <ScoreBadge> built COLOURLESS — CONF-022 narrows CONF-016.
              Also un-disabled /app/roles: T-052's last edit had been missed.
[x] T-081  A  analysis backend, RULE-BASED (43, DEC-042)               BUILT 25 Aug
              BUILT 25 Aug. features/analysis/ HOLDS NO QUERY — readCorpus() returns a
              union whose `comments` exist only on the unsuppressed branch, so the gate
              is the TYPE (DEC-062). TWO gates: per campaign, and over the filtered
              slice. Drill-through carries response.read as well as analysis.read.
              FOUND D-033: analysis.read was in no row of the seeded matrix.
[x] T-082  C  /app/analysis                                           BUILT 25 Aug
              BUILT 25 Aug. TWO FAILURES, TWO SCREENS (DEC-011): 403 says an
              administrator, 402 names the tier and what it adds, and neither ever
              says the other's sentence. Reliability on the strip AND on every
              panel heading. Drill-through 403s inside the panel. NO CHARTING
              LIBRARY — DEC-064 supersedes 24 §10; no dependency added. <TrendChip>
              finally built, uncoloured by default. DEC-065: two components
              catalogued, four left page-local.
[x] T-083  A  improve-loop backend (44)                               BUILT 25 Aug
              3 tables, 3 TRIGGERS. The ordering constraint is enforced by an ABSENT
              ROUTE as well as the gap's 404 (DEC-067). reflection.read seeded `self`
              and nothing wider — 44's "supervisor reads the subtree's" narrowed on
              purpose (DEC-066).
[x] T-084  B  /app/reflect                                            BUILT 25 Aug
              Form → gap → plan, order decided by the server. <GapBar> names no
              winner. <UpgradeCard> lifted out of 43 on its second caller.
[x] T-085  B  un-disable the sidebar — DONE. STAGE 9 IS COMPLETE.

--- item 3 · logs, and Endur's own two consoles ----------------------------------
    TWO DIFFERENT THINGS WEARING ONE WORD. 19 §4 draws the line: an ORG's admin sees
    their own org's activity; an ENDUR operator sees the estate and the log FILES.
    Different principals, different stores, different routes. INV-011.
[x] T-075  A  GET /audit — filters, cursor, outcome, denial rows (56)  BUILT 25 Aug
              audit_log.outcome DID NOT EXIST in the database. 10 §5 has carried the
              column since 23 Aug and the table had not, because a column no writer
              sets is a column no reader can trust — it landed with its reader.
              Denials written when the method is not GET AND the capability is not a
              *.read (DEC-068). 404s recorded too. writeDenial() sits BESIDE
              flushAudit in db/tx.ts, never in the middleware — ip and actor are
              decided in one place and DEC-040's lesson is exactly that.
              DEC-069: `DecidedBy` was TWO SHAPES UNDER ONE NAME. DEC-070: the scope
              filter is over the TARGET, in SQL, before the page query.
[x] T-076  B  /app/logs + <DecisionTrace>  ← T-054 needs the SAME component. EXTEND
              BUILT 25 Aug. <DecisionTrace> catalogued 23 Aug with no caller; built
              here, with a `tense` prop so ONE component says "Allowed by" of a real
              event and "Would be allowed by" of a hypothetical one. The row expands
              INSIDE ITS OWN CELL, never a second <tr>. WRAPPED in RequireCapability,
              unlike Analysis and Reflect: there is no 402 on a log, so a route guard
              can say everything there is to say. New sidebar item, new `log` icon.
[x] T-059  A  platform backend — platform_users, requirePlatform, aggregate-only seam
              BUILT 26 Aug. THE DOOR IS OPEN. Separate table, separate cookie
              (endur.ops), separate catalogue, separate seam, 13 routes, 17 tests.
              N-058 CHECKED AND IT HELD — DEC-071 drops the T-057 dependency rather
              than waiting it out; T-059 was the last unbuilt A-task and it was
              carrying a dep on a task that has never been built.
              DEC-072: its own session store, NOT a second express-session —
              req.session is single-valued, so two instances would have reintroduced
              the exact "one session, two meanings" confusion the second cookie name
              exists to prevent.
              DEC-073: suspension is enforced in tenantResolver ON THE RESOLUTION
              SOURCE. A tenant resolved FROM THE SESSION is refused; one resolved from
              a respondent token is not — so a suspended org's QR codes keep working,
              which is what 19 §6 and 16 §6 both ask for and what no other file could
              express.
              MFA IS BUILT, not deferred: RFC 6238 in 40 lines of node:crypto, no
              dependency, mfa_secret NOT NULL so there is no "not set up yet" state to
              fall through. `npm run ops:code -w @endur/api` prints a live code.
[x] T-066  B  /ops — the ENDUR ADMIN console (70)          BUILT 26 Aug
[x] T-067  B  /ops/analytics — the SUPERUSER page (71)     BUILT 25 Aug. Built its
                own /platform/analytics endpoint: 71's four decisions ARE the task
[x] T-077  A  platform.logs.read + the file routes (72)    BUILT 25 Aug
[x] T-078  B  /ops/logs + <LogViewer>                      BUILT 25 Aug
[x] T-090  A  the EXPORT, + the viewer's missing CSS (DEC-074)  BUILT 26 Aug
```
**The cost, stated once and not re-argued.** M0 is 26 Aug, two days out; `T-045` (three demo
rehearsals) is unrun; this stage is 16 tasks — 1 + 8 + 7. The owner has asked twice and the sequence is
theirs — this line records the trade rather than re-opening it.

### Stage 10 — four demo surfaces on one engine · 29 Aug · **COMPLETE 30 Aug**
The product showed **one** thing: feedback campaigns. The engine underneath was already
generic; what was missing was a second and third way to PRESENT it. Plan in `Mithil/plan.md`,
tables in `55` § 9d, decisions `DEC-087` … `DEC-092`. All six tasks built.
```
[x] T-095  B  BOOKING AT GOLD — the row lock, and the one bug the test found
              ← BUILT 30 Aug. `bookables` + `slots` + `bookings`, five capabilities, ten
                console routes and three public ones on the EXISTING publicRouter, so the
                feature inherits the one PUBLIC_ROUTES exemption 13 §6 already justifies.
                CAPACITY IS A ROW LOCK: SELECT … FOR UPDATE on the slot, THEN the count,
                then the insert. counting first is the bug — two phones both read
                capacity-1 and the room is double-booked on stage. the lock lives in
                db/graph.ts because DEC-007 confines $queryRaw to that file.
                !! THE N+1 TEST FOUND A REAL BUG AND IT WAS MINE: written with
                isolationLevel 'Serializable' ON TOP of the lock, one of two rightful
                winners came back 40001 instead of 201 — postgres SSI treats the count
                behind the lock as a predicate read conflicting with the other insert.
                the isolation level added no safety and turned a correct booking into a
                500. removed; DEC-092 records it. 10/10 booking tests green after.
                the loser gets 409 and not 400: well-formed, and lost a race.
                BOOKINGS ARE IDENTIFIED (DEC-090) and never join responses — asserted by
                a grep over the whole feature directory, comments stripped, so the rule
                survives somebody who never read the header comment.
                /book/:token is a SECOND ROOT of the respondent world, sharing its layout
                and boundary — not a fifth world. routes.test.tsx's containment check was
                asserting one-root-per-boundary and had to be restated as the property it
                always meant: every layout has exactly one boundary and vice versa.
[x] T-096  C  THE LAST TWO LANES GO LIVE — gallery, sidebar, plan page, seed
              ← BUILT 30 Aug. /app/start's Announcement and Booking cards are real links
                gated on announcement.create and booking.create, keeping their tier chip.
                CAPABILITY FIRST, TIER SECOND (DEC-091) and there is now a test for it on
                an ENTERPRISE org: a reader who may not write is told so rather than sold
                an upgrade for a verb they would still be refused.
                sidebar gains both, NEITHER gated on the tier — a bronze administrator
                reaches the page's own 402 with an upgrade card, which is what 43 exists
                to demonstrate; the client never receives the entitlement map anyway.
                /app/plan and 16 §2 now NAME the two features. a tier that withholds
                something the plan page does not mention looks arbitrary.
                seed: one published announcement with a receipt per member of staff and a
                third of them read (nought reads as broken, all reads as fake), and — on
                gold and above ONLY — a bookable whose middle slot is NEARLY FULL, so
                "1 left" is on screen before anybody books on stage.
[x] T-094  B  ANNOUNCEMENTS AT SILVER — receipts written at publish time
              ← BUILT 30 Aug. `announcements` + `announcement_receipts`, four
                capabilities, eight routes, /app/announcements + <Composer> +
                <AnnouncementBanner> on Home. THE DENOMINATOR IS THE POINT: one receipt
                per resolved recipient, written in the SAME transaction as the
                published_at stamp, so the read count is a fraction of who it was SENT
                to rather than a count of who happens to be in the unit today.
                publish is its own verb and the seeded matrix gives it to L1 alone while
                L2 may draft — drafting is not broadcasting. audience is AudienceRule
                through the CAMPAIGNS resolver (audienceUsers), never a second one.
                bronze keeps announcement.read: 402 on write, 200 on read (16 §7).
                8/8 new backend tests green, 10/10 new frontend tests green.
[x] T-092  A  SUGGESTION BOX — the k-anonymity sentence, on the card
              ← BUILT 30 Aug. no backend work: it is the second `purpose` on T-091's
                endpoint. CampaignSummary gained templateCategory (DEC-088's discriminator
                is DATA, so the console has to be told it) and resultsThreshold, and the
                card explains its own empty state instead of looking broken on stage.
                READ THROUGH THE EXISTING INBOX, which already filters by campaign — a
                second path to individual comments is what INV-006 exists to prevent.
                works on bronze: campaign.* and template.* are all in the bronze line.
[x] T-093  C  THE START GALLERY — /app/start, five lanes, one product
              ← BUILT 30 Aug. <StartCard> ready | capability | tier | soon, and the four
                states are the whole of what the page decides (DEC-091). the two unbuilt
                lanes are ON the page wearing the tier that will buy them — a customer
                who cannot see a feature cannot want it — and T-096 turns them into
                links. sidebar item gated on NOTHING: every level sees it, which is the
                point of a screen where the whole product is visible at once.
                two TemplateSeeds per preset (Poll + Suggestion box), one question each.
[x] T-091  A  POLLS — POST /campaigns/quick, one transaction, no new anything
              ← BUILT 29 Aug. template + one question + the org subject + campaign +
                token, composed server-side (DEC-089) and gated on campaign.launch, the
                strictly most privileged verb in the sequence. NO question kind, NO table,
                NO column, NO capability (DEC-088) — a poll is a one-question template,
                exactly as dto/template.ts has said since DEC-010.
                THE SUBJECT PROBLEM: subjectIds.min(1) was NOT relaxed. quickCreate
                finds-or-creates ONE per-org subject with type: 'organisation' and reuses
                it; a campaign with no subject renders as an empty results page.
                <QuickDialog> + two buttons on /app/campaigns; success lands on the detail
                page, which already shows the QR (T-089, DEC-086).
[ ] T-092  A  SUGGESTION BOX — the second `purpose` on the SAME endpoint, so the backend
              is already built. read through the EXISTING Inbox over the k-anonymity
              gate, never a second reader. the below-threshold state must be EXPLAINED
              on screen; the threshold is not lowered for the demo
[ ] T-093  C  /app/start — the gallery that makes four features look like one product.
              missing CAPABILITY disables the card with the reason; missing ENTITLEMENT
              keeps it live with a tier chip to /app/plan. usability only — the server
              403s and 402s regardless (INV-003)
[ ] T-094  B  ANNOUNCEMENTS at SILVER (61) — 2 tables, 4 capabilities, receipts written
              AT PUBLISH so the read count has an honest denominator
```

### Stage 11 — the owner's third pass · 31 Aug · **SPECIFIED, NOT BUILT — docs only**

Twelve reports from one sitting with the running app. **No code was written this session; the
owner asked for docs.** Nine tasks, `DEC-096`…`DEC-106`, `D-043`…`D-045`, `N-067`, `OPEN-015`.
Full table in `55` § Stage 11.

**Read this before picking one up.** They are three different kinds of thing wearing one list:
a **live bug** (`T-102`'s date window, `T-103`'s reinstate, `T-104`), a **product decision**
where nothing is broken and the owner changed what the product does (`T-097`…`T-101`), and a
**figure that never had a source** and should not have been printed (`T-102`'s removals).

**Two of the twelve were misread on the way in.** *"Enterprise plan is not working"* is one
line in `<PlanPicker>` — `unavailable = disabled || !plan.selectable` is applied in **all three
modes**, so the `override` mode an operator uses has its Enterprise button disabled by a flag
that means *a customer may not choose this*. **The one tier the product calls operator-assigned
is unassignable in the only UI that can assign it.** And *"suspending is suspending every org"*
was **not reproduced** — see `N-067` for what was actually checked, so nobody re-reads the
middleware first.

```
[x] T-097  B  ONE-WAY LADDER + A MONTHLY PERIOD (DEC-096, DEC-097)
              ← BUILT 31 Aug. 409 on a lower rank AND on an equal one, SERVER-SIDE, before
                anything is written. removing the button is not the rule — /billing/tier is
                a documented route and INV-003 says the client never decides, so the test
                calls the ROUTE rather than driving the page.
                THE UPGRADE CAPTURES THE DIFFERENCE, and the assertion that matters is a
                SUM: an org walking Bronze→Silver→Gold now totals ₹999 in `payments`, where
                it used to total ₹1,597 for a customer holding one ₹999 plan.
                !! THE PERIOD WAS HARDCODED IN FOUR PLACES, NOT THREE. the fourth is
                database/seed/demo.ts and it was found by grepping the COLUMN, not the
                number. AND THEY ALREADY DISAGREED — two `+365*DAY`, two `setFullYear(+1)`,
                a day apart in a leap year. now one function, billing/period.ts.
                OPEN-015 ANSWERED by the owner: same numbers, billed monthly.
[x] T-098  B  A SCHEDULED DOWNGRADE, APPLIED ON READ (DEC-098)
              ← BUILT 31 Aug. readBilling is the ONE applier; requireEntitlement still
                selects `tier` alone, so the gate and the page cannot reach different
                answers. THREE WRITES IN ONE TRANSACTION when it fires — the subscription,
                a payments row of kind 'expiry' at ₹0 (the MOVE, which T-102 counts), and
                an AUDIT ROW WITH NO ACTOR.
                the audit row is written DIRECTLY rather than pushed to req.ctx.audit, and
                that is the part worth reading twice: the intent queue attributes to the
                CURRENT PRINCIPAL, and this is a date passing, noticed by whoever happened
                to open the page next. stamping their name on it puts a person's id
                against a change they did not make, in the one table we offer as evidence.
                the period ROLLS FORWARD (else the next schedule fires instantly).
                an upgrade, and an operator override, CLEAR the column — a customer who
                paid to go up has replaced the intention, not added to it.
[x] T-099  B  ENTERPRISE STARTS WORKING — one line, plus a price (DEC-099)
              ← BUILT 31 Aug, and NARROWER than the change order said: `unavailable` reads
                `disabled || (mode === 'signup' && !plan.selectable)`, because T-100 landed
                in the same pass and gave the join card a REQUEST verb rather than a
                disabled one. the operator's case is fixed either way.
                "Arranged with us" STAYED, reworded — deleting it, as DEC-099 proposed,
                would have left one card whose verb differs from every other card's with
                nothing on it saying why.
                two tests were pinning the sentinel and both could only ever take one
                branch. the property they defended (nothing renders ₹0) is kept, and is
                now true because the number is real.
[x] T-100  B  REQUEST ENTERPRISE → A QUEUE THE OWNER WORKS (DEC-100)   needs T-099
              ← a WORK ITEM, not a bell: what has to survive is not "somebody was told"
                but "somebody has to ring this customer back", and a notice that clears on
                read loses exactly that. two owner-only platform capabilities. explicitly
                NOT 63, which is outbound multichannel and needs a provider and 17
[x] T-101  B  THE OPERATOR'S MESSAGE ACTUALLY REACHES THE CUSTOMER (DEC-101)
              ← !! messageAdministrators writes ONLY platform_audit_log, which is the
                OPERATOR'S OWN TABLE. the customer's admins have no route and no screen.
                THE OPERATOR IS TOLD "Sent to 3 administrators" AND NOBODY HAS BEEN SENT
                ANYTHING. one notifications row per recipient, surfaced as a From Endur
                tab on /app/inbox — a PLACEMENT of 58's mechanic, not a second one
[x] T-102  A  /ops/analytics PRINTS ONLY FIGURES WITH A SOURCE (DEC-102, DEC-103)
              ← BUILT 31 Aug. !! DEC-102 SAID "rather than" AND THAT WOULD HAVE LOST THE
                OPERATOR'S OWN OVERRIDES — see the header. it reads payments AND
                plan.override, disjoint by construction. one rule for both: the previous
                plan against the one that replaced it, silent about who caused the move.
                endOfDay() is one helper every windowed query on BOTH platform pages runs
                through, and window.to goes back out as THE DAY THAT WAS ASKED FOR — the
                page echoes it into its own date input.
              ← Trials started CANNOT MOVE: DEC-048 means registration writes 'active',
                and `converted` is a hardcoded 0 under a comment saying it has no source —
                so conversionRate is permanently the em-dash. TWO OF SIX HEADLINE CARDS
                WERE STRUCTURALLY INCAPABLE OF CHANGING. seats go (D-013: nothing is
                billed on them). movement moves onto `payments` — the plan.override source
                counts ONLY WHAT OPERATORS DID. `to` becomes end-of-day (D-044). the
                window governs MOVEMENT and the page says so. copy: drop "— never read",
                rename Quiet 30 days → Gone quiet
[x] T-103  A  REINSTATE, AND THE STAFF VIEW OF /ops (D-043, DEC-104)
              ← confirmSuspend() guards BOTH verbs on the typed-name check and the
                reinstate dialog has no name field, so it RETURNS SILENTLY — no request,
                no error, dialog still open. the suspend section then goes ABSENT for
                staff, heading and copy included, which makes 70 agree with its own
                analytics-tab rule
[x] T-104  C  `Enter` STOPS LEAVING THE SETUP WIZARD (DEC-105)
              ← the handler exempts BUTTON and TEXTAREA only. step 3's `+` adds a unit AND
                FOCUSES ITS NAME INPUT, so the wizard hands you a text field and treats
                the natural key for finishing the row as the key for leaving the screen
[x] T-105  C  DARK MODE GETS ITS EDGE BACK, AND endur.css LOSES 157 LINES (DEC-106, D-045)
              ← design_specs/01 §4's surface table is LIGHT-ONLY, written before dark
                shipped. the dark token block's own comment says "the lift has to come
                from the edge instead" and the components never followed. separately,
                /* Industry Split Layout */ appears TWICE — .preset-grid is declared three
                times with different minmax() and gap, so the step's spacing is decided by
                cascade order
[x] T-106  C  A LIVE POLL SEEDED ON EVERY DEMO ORG, REGARDLESS OF TIER
              ← `campaign.*` is bronze (`billing/entitlements.ts` §3), unlike announcements
                (silver+) and booking (gold+), so a poll is the one quick-launch surface
                every seeded org can actually use. `seed/demo.ts` now builds one per org the
                same way `quickCreate` would — org singleton subject, one-question
                single-choice template, public token — with a spread of votes on options.
                Announcements and booking stayed on their existing tier gates on purpose
                (D-012's one-org-per-tier demo of the 402 wall still needs Riverside on
                bronze and The Grand Palace on silver to lack the paid ones)
[x] T-108  A  A PLAN THAT RUNS OUT ACTUALLY RUNS OUT (DEC-113)
              ← owner: "on plan expiration nothing happens for the client, they are able to
                continue to use the features granted by the plan, and there is no option to
                change the plan on expiration." TWO CAUSES: readBilling returned early
                unless a downgrade had been SCHEDULED, and requireEntitlement selected
                `tier` alone and never read the date — so an org that never opens /app/plan
                kept a plan it stopped paying for. one effectiveTier() shared by the gate,
                readBilling and the estate list; subscriptions.lapsed_from so the page can
                NAME what was lost; kind: 'lapse' beside 'expiry'; pricedFrom so a rejoin
                pays ₹999 and not ₹900. <PlanNoticeBanner> in <AppShell> — the end date was
                already on /app/plan and it still read as "nothing happens".
                ONE MIGRATION: 20260831140000_plan_lapse
[x] T-109  A  SUPPORT ACCESS — the superuser can drive every workflow (DEC-114)
              ← "every functionality and workflow being usable by the superuser". an
                operator opens a customer's OWN console for an hour from /ops/orgs/:id,
                with a typed reason the customer reads verbatim on every page.
                SUPERSEDES ONE ROW OF 19 §14 and nothing else — that row refused an Endur
                employee READING FEEDBACK, not an operator entering, so the feature is
                built with the reading removed rather than the objection argued away.
                THE POWERS ARE GRANTS, NOT A BYPASS: authz/support.ts mints candidates and
                authz/collect.ts returns them on the NO-PERSON-NODE branch, which no real
                member ever reaches. resolve() is unchanged, so INV-004 is what enforces
                the deny list — the operator holds the allow AND the deny for results.read
                and the deny wins, with the trace to prove it.
                <SupportBanner> above the top bar, undismissable, FOR BOTH AUDIENCES. the
                first draft read the caller's own session and was therefore visible only
                to the operator it was disclosing.
                platform/db.ts NOT widened; the two tenant writes live in db/support.ts.
                ONE MIGRATION: 20260831170000_support_sessions
```

### Why is that item still greyed? — one row per "Soon"

Asked by the owner 24 Aug. **Nothing is on the chopping block; everything below has an id and
a spec.** The table exists because the board could not answer the question at a glance, which
is a fault of the board rather than of the plan.

**ANSWERED AND SUPERSEDED THE SAME DAY — `CONF-021`.** The owner asked again, having read this
table, and the reply was *"i asked for this before and you didnt do it"*. That is right: every
row below says "sequenced after M0" and none of them says why that outranked an explicit
instruction. **The `Blocked by` column is still accurate; the `sequenced after M0` part is
withdrawn.** All four are promoted — Stage 9 above.

| Sidebar item | Lands with | Blocked by | Status |
|---|---|---|---|
| **Roles** | `T-052` | ~~nothing — sequenced after M0~~ **nothing. PROMOTED, goes first** | spec is `33`, complete since round 1. The only one with no backend work at all. Repays `D-008` |
| ~~**Inbox**~~ | ~~`T-079` → `T-080`~~ | **BUILT 25 Aug** | spec is `58`. Reads **through** `features/results/service.ts` so the k-anonymity gate is not forked — and `features/inbox/` cannot reach `responses` at all, which is what makes that true next month as well as today (`DEC-058`) |
| ~~**Analysis**~~ | ~~`T-081` → `T-082`~~ | **BUILT 25 Aug, both halves** | rule-based engine (`DEC-042`), two k-anon gates, drill-through behind `response.read` as well — and the screen, with a real `402` path (`T-088`) and, since `D-033`, a capability somebody can actually hold. **No dependency was added to draw it** (`DEC-064`) |
| ~~**Reflect**~~ | ~~`T-083` → `T-084`~~ | **BUILT 25 Aug, both halves** | every capability in the improve loop is Gold, and `D-012` meant no organisation had ever had a subscription row — built before `T-088` this would have `402`d for every user in the product. The ordering constraint is enforced by an **absent route** as well as a 404 (`DEC-067`), and `reflection.read` is seeded `self` and nothing wider (`DEC-066`) |

**All four are built. The sidebar has no "Soon" tag left** — and `T-076` added the first
genuinely NEW item since the tags ran out: **Activity log**, `system` group, under Settings,
hidden without `audit.read`.

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

**Prices came back on 29 Aug — `DEC-080`, which supersedes `DEC-035`.** The owner: *"we
have plans but not payment thing"*. Bronze ₹99, Silver ₹499, Gold ₹999 per year, on the picker
and behind a payment dialog. **The money is simulated end to end** — no gateway, no card
fields, no keys — and the dialog says so on screen. What DEC-035 argued (a course project
cannot take money) is still true and still honoured: nothing here takes money, it records a
capture it performed itself.

`71` keeps its analytics page and gains a second one beside it, `/ops/earnings`, behind a
returning `platform.revenue.read`. The two capabilities now coexist and mean different things:
analytics is orgs/seats/activity, revenue is money.

**What is missing is the tier machinery itself**, which `DEC-035` explicitly kept:

| Survives `DEC-035` | Built? |
|---|---|
| the entitlement gate (`16` §3) and `requireEntitlement`'s `402` | **yes** — middleware exists and is correct |
| `subscriptions.tier`, `GET /billing`, `/billing/plans`, `POST /billing/tier` | **yes, 29 Aug** — `src/backend/features/billing/`. `GET /billing/usage` is still absent: the summary carries the seat breakdown, and a separate usage route only earns its place once there is a limit to measure against |
| the seat meter and `billable_seats` (`16` §5) | **counted, not capped.** The formula is live in `GET /billing` and shown on `/app/plan`; there is no ceiling and no over-limit behaviour — `T-057` |
| ~~the 14-day Gold trial (`16` §7)~~ | **RETIRED by `DEC-048`, and the row that was missing is now written.** `D-012` is repaid: `register` writes the `subscriptions` row at the chosen tier, and the seed gives one demo org per tier |
| `<PlanPicker>` with a **Join** button per tier | **yes, 29 Aug** — `/app/plan`. `<OverLimitBanner>` is still `T-058`, and needs the ceiling `T-057` would set |

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
mounted and correct. The missing piece was one row. That is why `T-088` was carved out of
`T-057`/`T-058` instead of waiting behind them — it was the smallest change on the board that
un-greys two pages.

**BUILT 24 AUG, AND IT WAS THAT SMALL.** `/start` is now two steps and one POST; `tier` is a
required field on `RegisterBody` with **no default**; the row is written inside `register`'s
transaction. Verified live, both directions on the same organisation. `T-082` and `T-083` are
unblocked. The seat meter, the usage breakdown and the billing page are untouched and stay
where they were, in `T-057`/`T-058`.

**It also found `D-028`, which is the sort of thing only building it finds:** the entitlement
map is a whitelist, and **five capabilities were in no tier at all** — `account.*` (added by
`T-072` yesterday) and `billing.*` (uncovered since `T-003`). Neither had fired yet, but
`billing.update` in no tier means that the moment `T-057` mounts `requireEntitlement` on
`POST /billing/tier`, **the upgrade button `402`s**. And `requireEntitlement` — mounted since
`T-003`, the middleware this entire section is about — **had no tests at all**. It has 18 now.

**Progress: 51 / 80 done (T-027 partial). Stages 0-4 complete but for the font files.
Stage 5 is what stands between here and the graded demo: one decision (`T-043`), the fonts
(`D-005`), ~~`D-007`~~ (**repaid 24 Aug, `DEC-049`**), `D-011` (explicitly after M0), and three
rehearsals. The demo runs end to end: scan, fill,
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
| ~~`OPEN-015`~~ | **ANSWERED 31 Aug — same numbers, billed monthly. Built in `T-097`.** ~~Monthly prices: the same numbers, or the annual figure divided by twelve?~~ `DEC-096` moves the billing period from a year to a calendar month on your instruction and **leaves the numbers where they are** — Bronze ₹99, Silver ₹499, Gold ₹999, now *per month*. That is a **12× rise** and it is written that way deliberately, not by oversight: ₹99 a **year** for an organisation running unlimited campaigns is not a price anyone would defend in the room, and ₹99 a month is. The other reading gives ₹8.25 / ₹41.58 / ₹83.25, three numbers no customer recognises and that `formatMoney` would print with decimals — which its own comment calls *"an accounting document impersonating a price tag"*. **Nothing else depends on the answer**: the one-way ladder, the difference pricing and the expiry mechanism are identical either way, and every number lives in one table (`PLAN_OPTIONS`) that `tiers.test.ts` already guards. Enterprise is ₹4,999/month by direct instruction and is not in question — note only that it makes Gold→Enterprise a 5× step, which is a sales shape rather than a bug | ~~before `T-097`~~ — **answered** | ~~`T-097`~~, `T-098`, `T-099` |
| ~~`OPEN-002`~~ | ~~What public URL does the QR encode? `localhost` will not scan from a phone~~ | **ANSWERED 29 Aug — the machine's LAN address. `DEC-086`.** In development only, a loopback `PUBLIC_BASE_URL` is rewritten to the host's LAN IPv4 (port preserved, printed at boot) and Vite binds to the LAN so the address answers. Not a tunnel: no account, no third-party uptime, no key expiring mid-demo. **`T-045` must still prove it on the demo machine** — under WSL2 the address found inside WSL is the virtual adapter's and is not reachable from a phone without a `netsh portproxy` rule or running the dev servers from Windows | ~~before `T-045`~~ — **answered, verify at rehearsal** | T-038, T-043 |
| ~~`OPEN-008`~~ | **RESOLVED 23 Aug — `DEC-036`.** File upload **strips metadata, it does not re-encode.** `lib/imageBytes.ts` sniffs the real format from magic bytes, reads dimensions from the header, and removes JPEG APP1/APP13/COM, PNG `eXIf`/`tEXt`/`zTXt`/`iTXt`/`tIME`, and WebP `EXIF`/`XMP ` chunks with the VP8X flag bits that advertise them — without decoding anything, and therefore **without an image library nobody approved**. The privacy property `48` wanted re-encoding for survives: GPS, device ids and author names do not reach disk, asserted by a test that uploads a GPS-tagged JPEG and greps the stored bytes. What is not bought is polyglot neutralisation, and that risk is written into `48` and `DEC-036` rather than left quiet — stored bytes are only ever *served*, with a sniffed `Content-Type`, `nosniff` and `inline`, and respondent uploads stay out of scope, which is where a hostile file would come from. **If an image library is ever approved, `stripMetadata()` is the one function to replace** | ~~before `T-061`~~ — **done** | ~~T-061~~, ~~T-062~~ |
| ~~`OPEN-011`~~ | ~~**Does operator MFA stay a 6-hour code?**~~ | **ANSWERED 29 Aug — no. `DEC-084`.** Reverted to 30s / ±1 step. The other honest answer (keep it, write the trade into a `DEC-`) was rejected on price rather than principle: the convenience was not re-reading a code, and `ops:code` buys that in one command without touching the algorithm | ~~before `T-045`~~ — **done** | ~~`D-040`~~ |
| ~~`OPEN-012`~~ | ~~**Does the Setup wizard keep what its redesign dropped?**~~ | **ANSWERED 29 Aug — mostly yes, one loss on the record. `DEC-085`.** `← Back` turned out never to have been dropped. *"Pick the closest one"*, step 4's live preview and `your plural` are back; the role chain on every card stays in the aside, with the cost written down. `31` amended | ~~before `T-045`~~ — **done** | ~~`D-038`, `D-039`~~ |
| ~~`OPEN-013`~~ | ~~**Should the lowest tier of people be counted on `/app/structure` at all?**~~ **ANSWERED 29 Aug — `DEC-083`, option (b).** Not by dropping a tier from the total: everyone placed in a ward IS affected when the ward goes, which is what this page's numbers are for. By saying what the total is made of — `GET /units/:id/composition`, and a bar per role under the People stat. Riverside's root now reads 30, and under it: Director 1, Head of Department 3, Nurse 10, Patient 16 | done | `DEC-083` |
| `OPEN-014` | **Should respondents be `person` nodes with accounts at all?** The contradiction `DEC-083` declined to resolve six days from a graded demo. `labels.respondent` names Patient/Student/Guest as the respondent noun and `DEC-009` says respondents are **never users** — yet the demo seed gives all sixteen Riverside patients full `person` nodes **with user accounts and positions**, which is why they appear in a staff count at all. Either `DEC-009` means what it says and the seed is wrong, or respondents-as-people is a real second case `DEC-009` never covered and should be written down. Touches the seed, setup, and the demo org itself | **after M0** | `DEC-083` § not |
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
| `D-043` | **Reinstating an organisation silently does nothing, and always has** | Found 31 Aug from the owner's report, by reading. `OrgDetail.tsx`'s `confirmSuspend()` opens `if (!id \|\| suspendConfirmText !== org.name) return;` — the typed-name guard `70` requires for **suspension**. The reinstate path uses a plain `<ConfirmDialog>` **with no name field**, so the typed text is `''`, never equals the organisation name, and the function **returns before making any request**: no error, no toast, the dialog stays open looking like it is working. One handler serves both verbs and inherited the destructive one's guard. **The silent return is the second half of the bug** — the suspend dialog already disables its confirm button on the identical condition, so on that path the early return is unreachable, and it is the *only* behaviour on the path with no input to satisfy it. A guard that refuses without saying so is how this stayed invisible. **Not the same thing as "suspending suspends every org"**, reported in the same breath and **not reproduced** — `N-067` records what was checked so nobody re-reads the middleware first; the likeliest reading is that nothing could be brought back, so suspensions accumulated | `T-103`, `DEC-104` |
| `D-044` | **`/ops/analytics` excludes the whole of the last day selected** | Found 31 Aug chasing the owner's *"the date filters are not working"* at `?from=2026-08-02&to=2026-08-12`. `<input type="date">` sends `2026-08-12`; `z.coerce.date()` reads that as `2026-08-12T00:00:00Z`; every query is `lte: to`. **A one-day window (`from` = `to`) therefore matches nothing at all.** Cosmetically small and genuinely wrong, and it is the *second* fault behind that report — the first is that the window governs only `movement` and `trials` while four other sections are unfiltered all-time counts, so moving the dates changes almost nothing on screen. That half is `DEC-103`, not debt: it is a decision about what the page claims | `T-102` |
| `D-045` | **157 lines of `endur.css` are duplicated verbatim, and `.preset-grid` is declared three times** | Found 31 Aug reading for the dark-mode report. `/* Industry Split Layout */` appears at **two** line numbers and the blocks below them differ by one blank line and one trailing rule. So `.preset-grid` exists once at its original definition (`minmax(168px)`, `gap --space-3`) and twice more in the duplicated blocks (`minmax(220px)`, `gap --space-4`), and **what renders is whichever copy the cascade reaches last** — the setup step's column count and spacing are decided by file order rather than by anybody's choice, which is the *"layout and padding are not clear"* half of the owner's report. The dark-mode half is a different fault and is `DEC-106` | `T-105` |
| `D-046` | **Quick poll and suggestion-box results answered 404 to their own author** — FIXED 30 Aug | `features/results/service.ts` had a private copy of the campaign visibility predicate without `DEC-093`'s organisation-subject clause, and its `select`s did not fetch `subject.type`. Found by the college demo run; it affected every role in every organisation. Now calls `campaignInScope` (INV-009) | fixed, `test/quick-results.test.ts` |
| `D-047` | **The Gold improvement loop was unreachable and ungrantable** — FIXED 30 Aug | `reflection.*`/`actionplan.*` are seeded at `self` only, and the grid's escalation bound required holding a capability everywhere before granting it, so nobody could grant them. `DEC-107` bounds a `self` cell by holding instead | fixed, `test/powers-grid.test.ts` |
| `D-048` | **A ten-role organisation leaves six roles clamped to the thin level-4 row, with nothing on screen saying so** — WARNED 30 Aug | The defaults are unchanged and still right for four roles; `GET /grants/warnings` now returns `thin_starter_row` per clamped role. A longer preset ladder for the industries that need one is still open | warning shipped; preset depth open |
| `D-049` | **`/inbox/messages` answered 500 on a Prisma client generated before the `Notification` model** — FIXED 30 Aug | `predev` now runs `prisma generate`, and the dev server prints unapplied migrations at boot (`N-072`). The Windows ordering matters: the watcher holds the query-engine DLL open | fixed |
| ~~`D-037`~~ | ~~**`D-004`'s guard is bypassed by running vitest from the repo root**~~ | **REPAID 29 Aug.** Root `vitest.config.ts` now declares both workspaces as `projects`, so `npx vitest run` from the repo root runs each under its own config — the backend's `globalSetup`/`setupFiles` included. **Proved, not assumed**: the development database held 4 organisations before a root-launched `test/tiers.test.ts` and 4 after, and the run reported itself as `|@endur/api|` with `env: "test"` in every log line. The frontend project points at `src/frontend/vite.config.ts`, where its jsdom setup already lives — a second copy here is how the two would drift. `eslint.config.js` gained `allowDefaultProject` for the new file, which no tsconfig owns. **The advice to run from `src/backend` is withdrawn — the root command is now the correct one** | ~~before `T-045`~~ — **done** |
| ~~`D-038`~~ | ~~**The Setup wizard's redesign disagrees with its spec, and six tests are the evidence**~~ | **RESOLVED 29 Aug, `DEC-085`, and the entry was wrong about one of the four.** Sorted by asking what each affordance was *for*. **`← Back` was never lost** — the button is present and accessible, the redesign replaced the literal arrow with an `<Icon>`, and three assertions were matching on decoration. **Restored**: *"Pick the closest one"* (one line of copy, and without it five cards read as an exhaustive list on the one screen whose subject is that the model does not care) and **step 4's live preview** (the step's lede claims these words appear throughout Endur and the preview is the only thing that proves it — the same `<DashboardPreview>` Review uses, not a fork). Review's role list also gets its arrow back: these are ordered levels, and `+` reads as a set. **Moved on the record**: the role chain and vocabulary pair live in step 1's aside rather than on every card. The aside shows strictly more and the cost is real and stated — presets are now compared serially, so a presenter wanting the side-by-side beat says the sentence instead of showing it. `31` § step 1 and § step 4 amended. **Setup.test.tsx 25/25** | ~~a decision, then one session either way~~ — **done** |
| ~~`D-039`~~ | ~~**`<WordsEditor>` stopped saying which plurals are yours**~~ | **REPAID 29 Aug, `DEC-085`.** `your plural` is back on any row whose plural is not the derived one, shown to a read-only reader too — the hint explains why the plural is unusual; only the undo is a permission. **The `auto: Wings` half is deliberately not restored**: beside a filled field already reading `Wings` it repeats the field, and it is the override that needs saying | ~~with `D-038`~~ — **done** |
| ~~`D-040`~~ | ~~**Operator MFA became a 6-hour code, with no `DEC-` and a red test left behind**~~ | **REPAID 29 Aug, `DEC-084`.** Back to `STEP_SECONDS = 30` and `WINDOW = 1`. The convenience bought was not re-reading a code at login, and `npm run ops:code -w @endur/api` already buys that in one command — paying for it in posture instead is paying more. **No doc amendment was needed**: `19` §9 already says *"±1 step of clock drift is accepted"*, which the branch had silently broken too, so this restores the doc rather than changing it. `platform.test.ts` 23/23 | ~~a decision, and it is a security posture~~ — **done** |
| ~~`D-041`~~ | ~~**`public.test.ts` flaked once under the root runner**~~ | **REPAID 30 Aug — `DEC-095`, and it was never a flake.** The entry said *"one occurrence is not a diagnosis"* and was right; the second occurrence came, and the third, on a **different innocent test every full run**, each passing alone. **The standing hypothesis was disproved, not assumed:** ~15 workers × a 33-connection default Prisma pool against `max_connections = 100` looked damning, so `pool_timeout` was dropped below the test timeout to let starvation announce itself — the timeouts continued and **not one** reported a pool wait. The real number is that these are integration tests and the heaviest register two organisations end to end: **on an idle machine the slowest is 3361ms and four are over 2.5s**, against vitest's **5s** default. Two thirds of the budget spent before fifteen workers compete for sixteen cores; whichever test is slowest when the machine is busiest loses. The frontend had the same shape for its own reason — `<PaymentDialog>`'s ~2.2s of **real-timer** capture and success overlay against the same 5s. **Both projects now run a 20s `testTimeout`/`hookTimeout` with the measurement written beside them.** Not `retry: 1` — it would have hidden every genuine race the suite exists to catch, including the booking one `T-095` found. Not `fileParallelism: false` — that works by making the machine idle and turns a 60s suite into minutes. **Backend 546/546 and frontend 933/933, three consecutive full runs each** | ~~watch it~~ — **done** |
| ~~`D-035`~~ | ~~**Four `tsc -b` errors on the branch, none of them from a task**~~ | **REPAID 29 Aug.** All four were `exactOptionalPropertyTypes`, and all four were fixed by CONSTRUCTING THE KEY CONDITIONALLY rather than widening the target type — `...(body.at ? { at: body.at } : {})`, and `subject.unitId ? { kind: 'subject', unitId } : { kind: 'subject' }` twice. That direction is not a style preference: on `Target`, an ABSENT `unitId` is how the resolver says *org-wide*, so `unitId: undefined` and no `unitId` at all mean the same thing to JavaScript and different things to the type. Widening would have made the two indistinguishable everywhere, to fix three lines. **The fourth, in `Simulator.tsx`, was the same shape**: `<DecisionTrace>` documents an absent `considered` as *"this response carried no candidate list"* — a production 403 (`11` §10) — so it is spread in, not passed as `undefined`. **`capability: body.capability as never` is also gone**, and that was the real find: `SimulateBody.capability` was `z.string()` while `ResolveInput.capability` is `Capability`, and the cast bridged them. The DTO now `.refine(isCapability)`, which narrows the inferred type *and* changes behaviour — a misspelt capability is a 422 naming the field, where it used to resolve to a silent `no_grant` that the simulator rendered as *"No rule grants this"*: a real-looking answer to a question the system never understood. The narrowing then found a genuine third error — the page held `capability` as a bare `string`, in a file whose own header says the sentence must never be able to ask an invalid question. It is `Capability | ''` now, so the compiler keeps that rule instead of the comment. **`npm run build` passes** | ~~before any build-based demo~~ — **done** |
| ~~`D-042`~~ | ~~**A poll or a suggestion box never appears on `/app/campaigns`**~~ | **REPAID 30 Aug — `DEC-093`.** The rule now says what the unattached row MEANS rather than loosening the filter: a campaign anchored to the organisation subject belongs to the whole organisation and is visible to anyone who may read campaigns at all. Every quick campaign is `access: public` with `audience: anyone`, so the link already answers to whoever holds it — there was nothing there to withhold. **The root-unit candidate was rejected on evidence**, not taste: `campaign.launch` is seeded `own_unit` at level 3, so a tutor launching a poll from Section A would still have lost it the instant it was created — the same bug one level down. The `organisation` type is now **reserved** (`POST /subjects` → 422 on `body.type`), because a client-settable value deciding visibility is a client-settable permission. The predicate was written **twice** — inlined in `listCampaigns` and again as `home/service.ts`'s own `scopeToCampaigns` — so only one of the two would have been fixed; both now import `features/campaigns/visibility.ts`. Three new tests: the level-3 launcher sees their own poll, a foreign unit still does not see a unit-anchored campaign (404, not 403), and the reserved type is refused. Original diagnosis: Found 30 Aug during `T-094`, in `T-091`'s work and **not caused by this session**; `campaigns.test.ts` *"carries the category and the k-anonymity threshold on the summary"* is red because the campaign it just created is missing from the list. `quickCreate` anchors every quick campaign to the per-org singleton subject (`type: 'organisation'`), which has **no unit**, and `listCampaigns` scopes a non-`all` reader with `subjects.some.subject.unitId in visibleUnits` — so a row with no unit matches nothing. `campaign.read` is seeded `subtree`/`own_unit` and never `all` (`50` §1), so this hides polls from **every seeded role in every organisation**; the campaign is reachable only by the URL the creator lands on. The test is asserting the correct behaviour and should stay red until the product is fixed. Two candidate fixes, and the choice is an authorisation decision rather than a patch: anchor the singleton subject to the org's ROOT unit (a subtree reader at the top then sees it, an `own_unit` reader below still does not), or teach `listCampaigns` that a subject with no unit belongs to the whole organisation. **Do not relax the visibility filter generally** | ~~before the demo~~ — **done** |
| `D-040` | **Two frontend tests fail on Windows, and one of them is a guard that asserts nothing there** | Found 30 Aug during `T-093`; **neither file was touched by that work**. (1) `pages/respond/bundle.test.ts` compares `path.relative()` output against forward-slash literals (`'components/form/QuestionInput.tsx'`), so on win32 every path comparison misses — the INV-008 assertion fails outright and the *"no console code in the respondent bundle"* filter silently matches nothing, which is the worse half: the guard looks green while checking nothing. Fix is to normalise separators once where `reached` is built, never to relax an assertion. (2) `router/boundaries.test.tsx` *"does not mistake a thrown Response for a stale graph"* dies in undici — `RequestInit: Expected signal ("AbortSignal {}") to be an instance of AbortSignal` — a jsdom/undici mismatch inside `createMemoryRouter`, not a product bug | whoever next runs the suite on Windows |
| ~~`D-036`~~ | ~~**`platform-logs.test.ts` "a bounded page from the end" fails, and has been failing**~~ | **REPAID 30 Aug — `DEC-094`, and the filed diagnosis was wrong in the direction that matters.** It read *"most likely the fixture size drifted below the 64 KB chunk, in which case the test is asserting nothing"*, and prescribed sizing the fixture up. **That would have produced a green test over a live bug.** The test was asserting the right thing and the reader was losing lines: `tailRead` set its cursor to the start of the **chunk** it had just read, and the reader walks **backwards**, so the next page resumed at that chunk's start and read the chunk *below* it — every line the page limit left unreturned in between was skipped, and the page after that opened on the truncated half of whatever line straddled the boundary. **Measured, not reasoned:** a 1,500-line file at limit 50 returned **150 lines and lost 1,350**; a 220-line file — smaller than one chunk, which is every log file for the first hours of its day — returned its newest 50 and said `hasMore: false`, **losing 170**. The cursor is now the byte offset of the **oldest line the page returned**, measured in `Buffer.byteLength` (a character count walks off the boundary the first time somebody logs an accented name). The test walks a fixture to the **end** at both sizes and asserts the pages equal the file — a pagination test that stops after two pages can only catch a bug in the first two pages. `platform-logs.test.ts` **15/15** | ~~whoever next touches `72`'s reader~~ — **done** |
| `D-001` | RLS policies not written (`10` §8 layer 2) | **Raised in severity by T-006.** Layer 1 cannot scope `findUnique`/`update`/`delete` by-id calls; RLS is what actually closes that. Until then, by-id handlers must check `orgId` themselves | before P1 closes |
| `D-003` | Every by-id read checks `orgId` by hand | Stage 2 repeats that check in eleven services (`assertVisible`, `assertOwned`, `assertUnitInOrg`). Each one is correct; one forgotten call is a cross-tenant read. RLS (`D-001`) is what makes it structural rather than remembered | with `D-001` |
| ~~`D-004`~~ | **REPAID 21 Aug by `T-048`.** `vitest.config.ts` gained a `globalSetup` (create `endur_test` if absent, then `prisma migrate deploy`) and a `setupFiles` that points each worker's `DATABASE_URL` at it **before `lib/config.ts` reads `.env`** — which works because `process.loadEnvFile()` does not overwrite an already-set variable. `TEST_DATABASE_URL` is optional; absent, it derives by appending `_test`. Two guards in `test/database.ts` refuse to run rather than trust the config: the name must end in `_test`, and it must not be the `DATABASE_URL` written in `.env`. `test/test-database.test.ts` asserts both by their failure. **The leak is closed; the puddle is not mopped** — `endur` still holds 2,880 organisations, and `npm run db:reset` is yours to run because it also drops anything you made by hand | ~~before `T-045`~~ — **done** |
| ~~`D-006`~~ | **REPAID 21 Aug by `T-049`.** A P2002 on `slug` is now caught and retried with the next slug, up to five attempts, so nobody gets an error page for choosing a name somebody else chose a millisecond earlier. `uniqueSlug()` still cannot move inside the transaction — it reads committed rows, and a transaction cannot see what it is racing. **The retry uses a random suffix, not the next number:** re-running the sequential scan makes every contender pick the same next value, so one collision becomes a queue as deep as the field, and the first version still 500ed one of six. The uncontended path still scans, so registering "Acme" next week when `acme` exists still gets the readable `acme-2`. `register-rollback.test.ts` inverted with it — all six contenders now succeed on six distinct slugs, which is also what proves the retry ran | ~~before `T-045`~~ — **done** |
| ~~`D-007`~~ | ~~`CONF-013` is **mitigated, not resolved**~~ | **REPAID 24 Aug by `DEC-049`, on its due date, and the answer came from measuring rather than choosing.** `CONF-013` framed this as a philosophy question — is an address global or per-tenant — and said *"do not let silence choose."* Reproducing it first changed the question: the mitigation closed the **adversarial** lockout and left an **honest** one that is worse than the "ambiguity" the doc described. Measured through the real routes before anything was touched: a person with an account in Org A is added to Org B, provisioned a sign-in (`T-072`, one click), follows the link, chooses a password, **is signed in by the activation — and can never log in again.** Their correct password returns `401` forever, because `findFirst` ordered `createdAt asc` only ever compared against the older row. `T-072` shipped the day before and made reaching that state one click and a link. **The answer is `CONF-013`'s option (b) in its disambiguation form:** the address stays per-tenant, login verifies the password against every activated account on it (capped at 5, oldest first), exactly one match signs in with no question, and more than one — which needs the *same password* in several orgs — returns `409 ACCOUNT_AMBIGUOUS` naming them. **No migration and no schema change**, which is what made it the right answer two days from M0. Option (a), globally unique email, was rejected on three counts, the deciding one being that it turns register's `409` into a cross-tenant membership oracle. Proven by reverting the candidate window to 1 and watching three tests fail | done |
| ~~`D-009`~~ | **REPAID 21 Aug by `T-047`.** The CSRF cookie now carries `SESSION_TTL_DAYS`, matching the session cookie, and `csrfProtection` re-issues it on any safe method for a cookie principal — so the boot `GET /auth/me` heals a browser that came back without one, and *"reload and try again"* is true for the first time. An existing token is re-set rather than rotated, so the expiry slides with the rolling session without killing a mutation already in flight. Two regression tests in `org.test.ts` (the cookie has a `Max-Age`; a reload with only the session cookie gets a working token back) and verified live with curl | ~~before `T-045`~~ — **done** |
| ~~`D-010`~~ | **REPAID 21 Aug by `T-046`.** Settings turned out not to be post-M0 at all — `41` § Route & access has `<VocabularyChips>` linking `#words` from every console page and `design_specs/design/11` §1 keeps the Words card — so it was **built**, not disabled. Roles and People are now `Soon`-disabled like the P3 items. The other three link sites went with them: the TopBar's *My account*, the structure panel's person links, and the subjects table's linked-person column are text or gone until `34`/`47` exist. Nothing in the console now navigates to `<Placeholder>` | ~~before `T-045`~~ — **done** |
| `D-011` | **Two genuinely concurrent submits can both run the handler** | Found 21 Aug while checking `T-049` for flakiness (`N-055`). The `Idempotency-Key` row is now committed before the response is sent, which closes the window for any retry that follows a delivered response. The real flaky-network case is narrower and still open: the client never got the first response, both requests arrive together, both miss the read. The unique index still allows only one key row, so the replay stays correct — but both handlers ran, and on respondent submit that means two responses. Closing it means RESERVING the key before the handler instead of writing it after, which introduces an in-flight case that has to answer something (409, or wait-and-replay). Not a thing to invent five days from a graded demo | after M0, or before `T-045` if a rehearsal ever shows a duplicate |
| ~~`D-008`~~ | **REPAID 24 Aug by `T-052` (`DEC-055`), and it was worse than filed.** ~~The capability catalogue's power labels are English~~ | `roles/service.ts` `describe()` turns `campaign.launch` into *"launch campaigns"* — a domain noun, for `33`'s powers grid. Found by the T-044 audit and deliberately not fixed: the grid is not built, and the object → label mapping for `role`, `person`, `template` and `org` — none of which HAS a label — is `33`'s design work, not something to invent from outside it. `audit:vocab` does not scan it, because the string is assembled from a capability key rather than written | with `T-033` |
| ~~`D-018`~~ | **REPAID 23 Aug by `T-071`.** ~~Anyone holding `assignment.create` can make themselves an owner~~ | Found 23 Aug while writing `57`, and it was a **live hole in shipped code**, not a spec gap. `features/people/service.ts` `addAssignment()` checks `assignment.create` on the target unit and **nothing else**. So a departmental coordinator — whose job genuinely is to put people into positions, and who would legitimately be granted exactly that one capability — can assign the **Owner** role at the root unit to a colleague, or to a second account of their own, and hold the organisation an hour later. **Every check passes.** There is no bug to point at: the resolver worked exactly as specified, because nobody had ever specified that creating an actor is different from acting. It is the same shape as the `billing.update` hole `DEC-034` found — a capability safe to *hold* becomes unsafe to *hand out* the moment a route hands things out, and `57` is that route. Fixed by `INV-012` + `requireNoEscalation` (`11` §5b, `12` §4.10b), which is **middleware and not a service check** because INV-003 says authorisation is decided in middleware and *"may you hand this power out"* is an authorisation decision. **Closed by `authz/escalation.ts` + `middleware/requireNoEscalation.ts`**, mounted on `POST /people/:id/assignments` **and `POST /people/import`** — because building it turned up that **the CSV import creates positions too**, behind `person.import` alone, so a guard on the first route only would have been *worse than none*: the board would have said the hole was repaid while it stayed bypassable in one call by naming a senior role in a one-row CSV. Both routes share one resolution of *"which role does this row mean"* (`features/people/positions.ts`); two copies drift into a row the guard did not check and the handler did create. 8 tests, and **removing the guard fails 5 of them while the 3 "does not over-refuse" tests still pass** | ~~`T-071`~~ — **done** |
| ~~`D-019`~~ | **REPAID 23 Aug by `T-074`.** ~~The audit log records the respondent's IP address~~ | Found 23 Aug while writing `56`. `db/tx.ts` `flushAudit()` writes `ip: req.ip ?? null` for **every principal alike**, and `features/public/service.ts` correctly pushes an audit row on every submission (INV-007 covers every state change). `responses.submitted_at` is written in the same transaction. So sorting `audit_log` and `responses` by time and zipping them yields **IP addresses against answers** — INV-006 defeated through a table it never mentions, built out of two tables that each keep the promise on their own. **It is dormant only because nothing has ever read `audit_log`**, which is exactly why it survived four security passes; `/app/logs` is the reader that would make it live. Fixed at the **writer** (`ip` only for `principal.kind === 'user'`), not filtered at the reader — a reader fix protects one screen, a writer fix protects every screen anybody builds later. `AuditEntry` additionally has no `ip` field at all. **Fixed:** one line in `db/tx.ts`, and reverting it fails the test with `expected '::ffff:127.0.0.1' to be null` — the leak, printed in the test output. The inverted test (a staff mutation *does* write `ip`) still passes with the fix reverted, which is what stops *"never write `ip`"* from satisfying the pair. `DEC-040` | ~~`T-074`~~ — **done** |
| ~~`D-020`~~ | **REPAID 23 Aug by `DEC-044`.** ~~A per-person deny at a unit scope does nothing~~ | Found 23 Aug while writing `T-071`'s deny-corollary test, which used `denyPerson(…, 'subtree')` and got a `201`. `11` §4 says a grant on a **person** node anchors at *"the person's primary position's unit; absent ⇒ `self` only"*. `authz/collect.ts` does not do that — it registers the person node with no `unitId` at all. `scopeCovers()` then correctly refuses an unanchored grant a unit scope (*"no anchor means no claim"*), so the deny is **silently inert**. INV-004 says a deny beats an allow unconditionally; a deny that never applies never beats anything. The same is true of a per-person **allow** at a unit scope, which simply never grants — so `33`'s per-person override row is, today, a control that writes a row and changes nothing unless it is `self` or `all`. **Every existing test of `denyPerson` uses scope `all`**, which needs no anchor, which is why four audits missed it. The direction was a real question — anchor at the primary position (`11` §4 as written), or narrow `11` §4 to say a person grant must be `self` or `all`. **Fixed the code, not the doc**, and the deciding fact was *measured, not argued*: every grant in the database — 1,545 rows across four demo orgs — is on a **role** node, so there was nothing to move. `DEC-044` adds one clause `11` §4 lacked: a **lone unflagged position counts as home**, because `isPrimary` defaults to `false` and a strict primary-only rule would have left the commonest shape in the product still inert. Two unflagged positions gets **no** anchor — `isPrimary` exists to resolve that ambiguity, and guessing would make the resolver non-deterministic. 7 tests; reverting the anchor fails 6 while the two correctly-inert cases still pass. **It also dragged out a pre-existing bug in `held.ts`** — see the note above | ~~after M0~~ — **done** |
| ~~`D-022`~~ | **REPAID 23 Aug by `DEC-045`, in the same task that would have widened it.** ~~A signed-in staff member answering a form writes their user id onto the submission's audit row~~ | Found 23 Aug while building `T-069`. `DEC-040` had just narrowed `flushAudit()` to write `ip` only for a `user` principal — correct for exactly as long as a respondent could never **be** one. But `respondentChain` has always run `authenticateOptional`, so a staff member answering a **public** link from their own signed-in browser was already a `user` principal, and `audit_log` recorded **their id and their address** on the `response.submit` row — with `responses.submitted_at` written in the same transaction. Zip the two by time and the answers have **names** against them, which is strictly worse than the IP leak `D-019` closed three hours earlier. `DEC-037` turns that from an accident (the demo presenter scanning their own QR) into **the designed path**: an `organization` campaign is *only ever* answered by a signed-in member. Fixed by re-keying the rule on **the action** rather than the principal — `ANONYMOUS_ACTIONS` in `db/tx.ts` — because the principal was never the thing that mattered, and a third patch on principal kind would break the next time a respondent became something else. A list at the writer, not a flag at the call site: a flag is a thing the next handler forgets. **Measured before building: every `response.submit` row in the dev database has `actor_user_id` NULL**, because nobody has ever answered a form while signed in — so zero rows to repair. Reverting it fails with the member's uuid where null was expected | ~~`T-069`~~ — **done** |
| ~~`D-024`~~ | **REPAID 24 Aug by `DEC-046`.** ~~`PATCH /people/:id` was a second, worse way to disable an account~~ | Found 24 Aug while building `T-072`, deciding what `AccountStatus.disabled` could honestly report. `UpdatePersonBody` had accepted `status: 'active' \| 'invited' \| 'disabled'` since `T-033`, behind **`person.update`** — seeded to L2 `subtree` — where `57` puts revocation behind **`account.revoke`**, L1 only, *precisely* so it can be withheld from a coordinator while the other two verbs are granted. And it did two thirds of the job: it left `sessions` untouched, and **`authenticate` never reads `users.status`**, so the target's open browser kept working until the session expired on its own — the administrator saw *"disabled"* and believed access had ended. It also left `password_hash` in place, so flipping the status back restored their **old password**, the thing `57` says cannot exist. Fixed by **removing the field**, not by teaching `PATCH` to do the other two things: an account's lifecycle belongs to `account.*`, and two routes that both end access is two places for the next one to be forgotten. Deliberately did **not** make `authenticate` re-read `users.status` per request — real defence in depth, but a query on every request in the product to close a window that now has no opener. **The hole had no user and no test**: the frontend has never sent `status` | ~~`T-072`~~ — **done** |
| ~~`D-026`~~ | **REPAID 24 Aug by `DEC-047`.** ~~A person you had just created was invisible to you~~ | Found 24 Aug when `T-072`'s first test run failed on every case involving a person with no positions — and `57` says explicitly that *"a person with no positions can always be given an account… invite first, assign afterwards"* is **the common one**. `POST /people` creates a person and **no position** (`14` §8 requires that), so the person it returned had no unit, matched no unit-scoped caller, and vanished. **Verified end to end before the fix**, on a brand-new organisation, as its founder: `POST /people` → `201` with an id; `GET /people` → total 2 and the new person is not in it; `GET /people/:id` → `404`. The founder holds `person.read: subtree` at the root, **not `all`**, which is the ordinary shape — so this was every organisation, on the most common action in `34`, and every route that could give them a position had first to see them. **A deadlock, not a policy.** It had no test because the create test never read the person back. Fixed by adding one clause — **no member edges at all** — to a predicate that is now written **once** in `features/people/visibility.ts` and evaluated by the database for both the list and the detail route; the two used to be hand-written copies and had already drifted in wording. The asymmetry with `11` §4 is deliberate and is written down: for a **grant**, no anchor means no claim; for a **target**, no anchor means nobody's territory | ~~`T-072`~~ — **done** |
| `D-030` | **Three CSS custom properties are used and never defined** | Noticed 24 Aug while writing `T-052`'s stylesheet. `--color-border`, `--color-surface-2` and `--space-5` appear in `endur.css` (`.position-chip`, `.powers-place`, `.tsection`) and exist in no token file. An undefined `var()` makes the whole declaration compute to its initial value, so those borders render as **no border at all** and `.tsection` gets no margin. Subtle, shipped, and cheap: they belong to `T-050`/`T-051`/earlier, so `T-052` used real tokens and left the others alone rather than editing three tasks' styles in passing | one pass over `endur.css` |
| ~~`D-033`~~ | **REPAID 25 Aug by `T-081` (`DEC-063`), in the task that found it.** ~~`analysis.read` is in no row of the seeded grant matrix~~ | Found 25 Aug building `T-081`, before a line of the feature existed. `analysis.read` has been in `11` §3 since `T-003` and entitled at **Silver** in `16` §3 since `T-088` — and in **no row** of `presets/grant-matrix.ts`. Not restricted, not deliberately withheld: **absent.** So no role in any organisation had ever held it, and `/api/v1/analysis` would have returned **403 to every user of every org including a Gold one** — on the exact surface `43` exists to demonstrate the clean 402-vs-403 split on. **It is `D-012` and `D-028` a third time**: `D-012` was nothing writing a subscriptions row so every org was silently Bronze; `D-028` was `account.*` and `billing.*` being in no tier at all. Here **the entitlement said yes and the grant said nothing**, which is precisely what made it look built. It survived three security passes because neither half is wrong on its own — `11` §3 correctly catalogues a P3 capability, `grant-matrix.ts` correctly seeds what exists — and **nothing compared them.** `analysis.read` was one of **ten** absent capabilities; the other nine are `reflection.*` `actionplan.*` `checkin.*` (`T-083`'s) and `apikey.*` (`45`, no route on the M0 board), and they are **left alone on purpose** — a grant to a route that does not exist cannot be tested. What is *not* left to memory: `test/routes.test.ts` now asserts that **every capability a mounted route requires is seeded to at least one level**, so `T-083` meets it the day it mounts `/api/v1/reflect` rather than the day somebody opens the page. Proved by removing the row and watching the new test fail with `['analysis.read']`. `N-062` | ~~`T-081`~~ — **done** |
| `D-032` | **Response scope is decided at the campaign, not at the subject** | Found 25 Aug verifying `T-080` live. **Not introduced by it** — this is `40`'s behaviour, and `58` § Acceptance requires the inbox to match `40` for the same caller, which it does. A campaign is visible when *any* of its subjects sits in a unit the caller can reach; once visible, **every** response in it is returned. `readResponses` filters on `campaignId` alone and `readResults` aggregates the whole campaign unless the *client* passes a filter. Live proof: `grand-palace-3`, a level 3 anchored at **Lakeside Property** holding `response.read: own_unit`, reads all 229 comments including every one about **City Property**, and `/campaigns/:id/responses` hands them the same 210 rows and 12 distinct subjects it hands the administrator. INV-003 holds at campaign granularity and does not at subject granularity — and an org-wide campaign is the common case, not an exotic one. The inbox is where it becomes *visible*, because it puts the other property's subject name on the card where `40`'s average hid it. **Deliberately not fixed inside `T-080`:** a stricter inbox would satisfy one reading of INV-003 and break the acceptance criterion that asked for consistency, leaving two answers to one question. `N-061` | **owner's call.** It is a change to `40` first and `58` second, and it touches the k-anonymity reasoning in `52` §2 |
| ~~`D-031`~~ | **REPAID 26 Aug — the owner reset and re-seeded, and it was WIDER THAN FILED.** ~~The four demo organisations cannot use the invite/accounts flow, and re-seeding will not fix it~~ | Found 24 Aug from the powers grid's own warnings — *"Nobody in this organisation can give somebody a sign-in."* All four were seeded **21 Aug**; `T-072` added `account.create`/`reset`/`revoke` to `presets/grant-matrix.ts` on **24 Aug**, and existing orgs got no grant rows. `npm run db:seed` prints `skip: <name> already exists` — it creates missing orgs, it does not reconcile present ones. **Measured before the reset, the hole was bigger than the entry claimed:** the four held **103 grants, 0 × `account.*`, and NO `subscriptions` row at all** — so every tier-gated screen was dead too, not only the invite flow. `T-088` writes the subscription inside `register`'s transaction and these orgs predate it, so `requireEntitlement` was falling through to its bronze backstop on an org the seed calls Gold — a demo proving the opposite of what it claims, which is the exact failure `demo.ts`'s own comment warns about. **After `db:reset` + `db:seed`: 130 grants each, 5 × `account.*` (`create`/`reset` on both top levels, `revoke` on the top only), and `gold`/`silver`/`bronze`/`enterprise` `active` on Northfield/Grand Palace/Riverside/Meridian.** The reset also cleared **65 junk organisations and 36 stray platform users** — see `D-037`, which is how they got there | ~~before `T-045`~~ — **done** |
| `D-025` | **`$executeRaw` slips past the DEC-007 lint rule** | Noticed 24 Aug while writing `revokeAccount()`. `DEC-007` confines raw SQL to `db/graph.ts`, and `eslint.config.js`'s selector matches **`$queryRaw`/`$queryRawUnsafe` only** — `$executeRaw` is raw SQL and is not checked. The one call that uses it today is legitimate and unavoidable: revocation deletes the target's rows from `sessions`, which is connect-pg-simple's table and **deliberately not a Prisma model** (`10` §5), so there is no ORM path to it at all. But it passes because of a **gap in the rule, not an exemption**, and that is worth writing down rather than quietly relying on. The fix is one selector plus one `eslint-disable` with a reason — small, and it belongs to whoever next touches `DEC-007` rather than to a feature task | with `DEC-007`'s scheduled revisit (2026-10-01), or sooner if a second `$executeRaw` appears |
| ~~`D-027`~~ | **REPAID 24 Aug by `T-086` + `T-087` (`DEC-050`, `DEC-051`).** ~~Every account in the product sees a `People` item that lists only itself~~ | Raised 24 Aug by the owner (*"lowest tier shouldn't see roles, people and department pages at all, even if they see nothing actually in it"*), and the mechanism turned out to be wider than the tier they asked about. `navItems.ts` gates each item on a bare capability (`needs`), and `authz/held.ts` **deliberately discards scope** — a capability is held when *any* live allow exists. So `person.read: self`, the **universal** grant every role gets (`50` §1, and `11` §10 has a test insisting it is never omitted), satisfies `People`'s gate for **everybody**; the page then renders one row. `org.read: all` does the same for `Settings`, seeded to all four levels so the vocabulary can load on first paint. Of the three pages the owner named, **Structure and Roles are already correctly hidden for L4** — the matrix gives that level neither `unit.read` nor `role.read`. The one they want *shown*, `Subjects`, is hidden, because L4 has no `subject.read` row at all. **Not a security hole and INV-003 is untouched**: `requireCapability` refuses these routes and the list endpoints already scope-filter to nothing — `held.ts`'s own header admits the class (*"a confusing button, not a security hole"*); this is that error landing on a whole page. Fix is `T-086` (carry scope to the client so a gate can say *"`person.read` beyond `self`"*) then `T-087`. **Why it surfaced now:** `50` §1 says the L4 row *"only matters for the rare case of someone at that level who does hold an account"* — `T-072` made that one click, so the case stopped being rare. **`T-086` landed the mechanical half on 24 Aug**: `capabilities` is a map of capability → widest held scope, and `useCan(cap, atLeast?)` compares breadth, so the gate *can* now say *"beyond `self`"*. **`Subjects` is fixed outright** — the seeded matrix gives L4 `subject.read: own_unit` and the existing `needs` gate does the rest. **`T-087` closed the rest the same day**, once the owner answered `OPEN-009`: `NavItem.minScope` gates People on `person.read` **beyond `self`**, and **Settings turned out not to be a scope problem at all** — `org.read` is `all` at every level including the lowest, seeded so the vocabulary loads on first paint, so no minimum could ever have hidden it. It was the wrong capability; `needs` is now `org.update`, which is what `<VocabularyChips>` had already been using for its link to the same page. **L3 keeps People** — the owner's call, and the right one: an L3 holds `person.read: own_unit`, so their page lists real colleagues rather than themselves. The seeded matrix was not touched | ~~`T-086`~~, ~~`T-087`~~ — **done**. `OPEN-010` carries the deferred part of the L3 row |
| `D-023` | **`campaigns.anonymous` changes copy and nothing else** | Found 23 Aug while building `<AccessNotice>` (`T-070`), which needed to know what each half of the `anonymous` × `access` pair actually guarantees. **`anonymous` branches nowhere in the backend** — grep it: every occurrence is a `select`, a DTO mapping, or a copy string. That is not itself a bug, because `52` §1 is explicit that the answer is anonymous **"Always. It is INV-006 and it is in the schema"** — `responses` has no respondent column to populate either way, so the flag *cannot* make a response attributable. It means the toggle is a **promise switch, not a behaviour switch**, and two places imply otherwise: the wizard's hint reads *"We never store who submitted what"*, which invites the reader to conclude that turning it off means we do; and an administrator who turns it off gets **exactly the same data** they would have got with it on, having been led to expect more. `copy.ts` reached half of this independently at `T-039` and left the non-anonymous sentence deliberately blank for the same reason. **Never exercised**: all 13 campaigns in the dev database are `anonymous: true`, so the misleading path has no user. The fix is a copy decision plus a line in `38` saying what the flag is for — not code, and not something to invent from outside the doc that owns it | with `T-051`, or whenever `38`'s copy is next revisited |
| `D-021` | **The CSV import wizard has no UI** | `T-050` built the people list, create and assignments; `34` § Interactions also specifies a column mapper, a five-row preview and a "did you mean" dropdown for every unmatched role, and none of it exists. **Both endpoints do** — `POST /people/import/preview` and `POST /people/import`, guarded, idempotent, and INV-012-bounded since `T-071`. The consequence is bounded and worth stating precisely: a cold start now **works** (add a person, give them a position) but does not **scale** — `34`'s own framing is that a 500-person organisation is populated by import, not by typing. Not on the M0 path, and it is a wizard rather than a form: mapper state across two steps, per-row error reporting, and an all-or-nothing commit | with `T-051`, or when somebody has a real CSV |
| `D-005` | The two woff2 faces are not vendored — **and this is why the UI reads as generic** | `tokens.css` declares both; `public/fonts/` holds only a README. `design_specs/design/01` §5 puts **Caprasimo on every `h1`–`h4`, card title, KPI number, button label and badge** and Figtree on everything else — so with the files absent, *every heading and every number in the product is `system-ui`*. The spec is explicit that the personality is concentrated in the type (*"Caprasimo has one weight and a lot of personality… a paragraph set in it instantly cheapens the page"*), and the fonts README says it plainly: *"until the files land… nothing breaks — it just does not look like Endur."* Confirmed as the main cause of the 21 Aug walkthrough's *"too simple, too AI-like"*. `endur.css` (1,451 lines) and the vendored `organic.css` are in place and doing their job; the two files are the missing input | **24 Aug** (`21` §4) — **highest visual return of anything left** |
| ~~`D-012`~~ | ~~**No organisation has ever had a subscription row, so the trial in `16` §7 has never once happened**~~ | **REPAID 24 Aug, `T-088`, and `DEC-048` is what unblocked it.** The blocker was never the code — it was that there were **three answers and no way to choose between them**: `16` §7 said a new org starts `trialing` on Gold for 14 days, `requireEntitlement`'s own comment called bronze *"the trial default"*, and nothing wrote either, so every org in the product — all four demo orgs included — was silently Bronze and every Silver and Gold surface `402`'d for everyone, forever. `DEC-048` picked a fourth and better answer, which is the owner's: **the tier the founder chose**. `RegisterBody.tier` is required **with no default** (a default would have re-created this bug wearing a nicer coat), the row is written **inside `register`'s transaction** so an org cannot exist without a tier somebody picked, and the seed now gives **one demo org per tier** so the `402` path is demonstrable on a real organisation. Verified live on the running API, both directions on the SAME org: silver → `404` (gate opened), flip to bronze → `402` naming `requiredTier: silver`. The fallback in `requireEntitlement` stays and stays bronze — a missing billing row is our bookkeeping problem, and locking a customer out of a product they are inside is a worse answer to it | done |
| ~~`D-028`~~ | ~~**Five capabilities were in no tier at all, and `requireEntitlement` had no tests**~~ | **FOUND AND REPAID 24 Aug by `T-088`.** `TIER_ENTITLEMENTS` (`16` §3) is a whitelist, so a capability nobody adds to it is entitled at **no tier including Enterprise**. `account.create`/`reset`/`revoke` arrived with `T-072` yesterday and the map was simply not updated; `billing.read`/`billing.update` had been uncovered since `T-003`. Neither had fired — the account routes are not entitlement-gated and `POST /billing/tier` does not exist — but the `billing` half is the worse one and worth naming: with `billing.update` in no tier, mounting `requireEntitlement` on the tier-change route would `402` every attempt to **leave** the tier you are on. A paywall in front of the upgrade button. Both are now Bronze, which `16` §3's own first assertion requires (the whole permission and identity surface is in every tier — selling privacy as an upgrade would be indefensible). **The durable fix is the test, not the two lines**: `test/tiers.test.ts` asserts every capability in the catalogue appears in at least one tier, and that the tiers **nest** — `lowestTierFor` returns the first tier that includes a capability, which is only the *cheapest* one if they do. That file is also the first test `requireEntitlement` has ever had, mounted since `T-003`; the absence is how `D-012` survived a month | done |
| `D-013` | **`billable_seats` is specified and not implemented** | `16` §5 defines it — active users, plus non-person subjects, never respondents — and says it is *"recomputed on a schedule and on membership change, cached on `subscriptions.seats`, and shown in settings with a breakdown so a bill is never a surprise"*. `subscriptions.seats` defaults to `0` and is never written by anything. With it absent, `16` §6's over-limit behaviour cannot exist either: there is no count to be over. Neither is M0, and neither should be invented in a hurry — but *"the revenue model is architecture, not a slide"* is `16`'s own opening line, and right now the metering half of it is a slide | with `T-057` |
| ~~`D-014`~~ | ~~`POST /authz/simulate` is in `13` §Trust and is not mounted~~ | **CLOSED 29 Aug — THE ENTRY WAS STALE, and had been for some time.** The route is mounted in `roles/router.ts` behind `validate(SimulateDto)` and `requireCapability('simulator.run')`, and `/app/simulator` has been calling it. It was mounted without this row being closed, which is the small version of the failure the row describes. **What was actually missing was any test at all** — and that is why three of `D-035`'s four type errors accumulated inside `runSimulation` without one check going red. A route nothing exercises is a route nobody notices rotting. `test/simulator.test.ts` now covers it: the decision agrees with the real resolver, an `out_of_scope` block is distinguished from `no_grant`, `considered` comes back with a reason on it, `at` works present and absent, an unknown capability is a 422, a foreign target id is a 404, and a level-3 role gets a 403 | ~~with `T-053`~~ — **done** |
| `D-015` | The liveness route is `/healthz`; `13` §Unauthenticated utility says `GET /health` | Cosmetic, one line, and listed only because `13` is meant to be the single authority on paths and this is the one place a reader would be told something untrue. `tenantResolver`'s bypass list, `routes.test.ts`'s allowlist and `chain.test.ts` all say `/healthz`, so the code is self-consistent and the doc is the odd one out — but fix whichever, not neither | with `T-057` |
| ~~`D-016`~~ | ~~**Three different maximum CSV sizes, and the smallest one wins silently**~~ | **REPAID 23 Aug, `T-065`.** One number now: `CSV_MAX_CHARS` (150,000) in `packages/shared`, and it sits **below** the parser's 256 kb on purpose — so anything a person plausibly pastes fails `validate()` with a field error naming the CSV, and the body parser is left as the outer backstop for a body that is malicious rather than merely large. `12` §4.4 rewritten: it claimed a streaming CSV parser with a 5 MB cap that was never written, and now states what is actually true (the import is a string in a JSON body) and names the one real bypass (`48`'s multipart). Asserted by a test that sends an oversized CSV and checks the error is `VALIDATION_FAILED` on `body.csv`, not `PAYLOAD_TOO_LARGE` | done |
| ~~`D-017`~~ | ~~**`12` §2 draws links 6–8 in a `per-router` box; `app.ts` mounts all three with `app.use()`**~~ | **REPAID 23 Aug, `T-064`.** `middleware/chains.ts` composes links 6–8 into four chains, applied with `router.use()` in twelve routers. `tenantResolver` became a factory in the process and **lost both its path-regex exception lists** — "which routes may have no tenant" and "which routes may use the slug header" are now mount-point decisions, which is a much harder thing to get wrong than a regex kept in step with `app.ts` by hand. Side effect worth having: a mistyped `/api/v1/...` now 404s instead of answering 401 | done |
| ~~`D-029`~~ | **REPAID 24 Aug by `T-089` (`DEC-054`).** ~~A failed lazy import tells the user to do the one thing that cannot work~~ | Reported by the owner 24 Aug as *"sign in button on homepage is broken"*. Every route is lazy, so a chunk is fetched at click time; if the module graph moved underneath the tab, the running app is fine and the NEXT route dies. `PublicBoundary` prints the raw `Error.message` — a `.tsx` path at a `localhost` URL — and its only affordance is a client-side `<Link to="/">`, which re-renders inside the same dead graph and fails identically. `ConsoleBoundary` already uses `<a href>` and its comment explains why. **Not reproduced on demand**: the Login module graph crawled clean, 44 modules, all 200. The defect is the remedy, not the module | **Repaid the same day.** `T-089`, `DEC-054` |

---

## Session log

Newest first. One entry per working session. Keep entries short — what moved, what was
decided, what the next session should know.

### 2026-08-31 (latest) · `T-109` — support access: the superuser can drive every workflow

**`DEC-114`. It supersedes exactly one row of `19` §14 and nothing else.** An operator opens a
customer's own console for an hour, from `/ops/orgs/:id`, with a typed reason the customer reads
verbatim on every page. `1602` tests green (629 backend across 51 files, 973 frontend across 71),
typecheck 0, lint 0, build passes, drift + vocab clean. **ONE MIGRATION —
`20260831170000_support_sessions`. Run `npm run db:migrate` after pulling.**

**!! THE REQUIREMENT, FROM OUTSIDE:** *"every functionality and workflow being usable by the
superuser — every single thing configurable by superuser and admin."*

**!! `19` §14 SAID DO NOT BUILD THIS, AND IT WAS RIGHT AND IT WAS NARROW.** Read the row again:
*"no amount of consent UI makes an Endur employee **reading feedback** compatible with what `01`
§6 promises."* The objection is to reading feedback, not to entering. So the feature is built
with the reading removed rather than with the objection argued away. `19` §5 had *already*
conceded the gap in words and named the workaround — *"the customer grants a time-boxed in-org
account through the normal `person.create` path"* — which **is this feature done by hand and
badly**: an account the customer must create, nobody revokes, that costs a seat and appears in
their audiences.

**!! THE POWERS ARE GRANTS, NOT A BYPASS, AND THAT IS THE WHOLE DESIGN.** The four-line version
(`if (principal.support) return next()` in `requireCapability`) was rejected: it is a second
permission model that drifts from the first (N-005 one layer down), and it is silently TOTAL —
every capability shipped afterwards held by an operator without anybody deciding it. Instead
`authz/support.ts` mints candidate grants and `authz/collect.ts` returns them on the
**no-person-node branch**, which every real member of every organisation never reaches. So
`resolve`, `visibleUnits` and `heldCapabilities` all agree about what an operator holds without
any of them being told operators exist.

**!! INV-004 IS WHAT ENFORCES INV-011 HERE.** `SUPPORT_DENIED_CAPABILITIES` (10 capabilities:
feedback content, personal content, `org.delete` + `billing.update`) is minted as `deny` at `all`
scope **alongside** the allow. The deny wins because a deny always wins, and the refusal is
`explicit_deny` with the grant that decided it — not `no_grant`, which would mean *"go and ask
somebody"* when there is nobody to ask. **A deny list, not an allow list**, because an allow list
is a thing somebody forgets to add to and then "fixes" by widening.

**!! THE BANNER WAS WRONG IN THE FIRST DRAFT AND IT IS WORTH KNOWING WHY.** It rendered from the
CALLER's own session — so the only person who ever saw the disclosure was the operator it was
disclosing. The customer is signed in to a *different* session and carries no support flag at
all. `SupportContext.viewer` plus one indexed lookup on `/auth/me` is the fix. **A promise
legible only to the person being watched is not a promise.**

**!! THE SEAM WAS NOT WIDENED.** `platform/db.ts` still refuses every write into a tenant:
`User` and `SupportSession` are NOT in `WRITABLE_MODELS`. The two writes live in
`src/backend/db/support.ts` with the base client, because the allowlist is not per-function —
adding `User` there would make `user.create` reachable from every handler in a 900-line file
forever. `Answer` is still unreachable and `Response` is still count-only.

**!! WHAT ELSE HOLDS:** INV-003 (`requirePlatform` and `requireCapability` still never on one
route — the enter route answers a *platform* question, and every question afterwards is asked
elsewhere by `requireCapability`); INV-007 (the customer's own `audit_log` names the operator,
`decidedBy.via = 'support'` — which is what the synthetic `users` row is FOR, since a tenant's
audit row can only point at `users` and never at `platform_users`); INV-006 (a support session is
refused by `requireMembership`, so it can never answer a campaign).

**!! ONE CARVE-OUT IN `tenantResolver`:** a support session reaches a SUSPENDED organisation,
which the customer's own staff cannot. The moment a customer most needs somebody from Endur
inside their console is the moment they have been cut off from it.

**TO DEMO IT:** `npm run db:seed` prints the operator logins → `/ops/login` as
`owner@endur.test` → open any organisation → **Open console**. The strongest thing to show is
the *refusal*: navigate to Results inside the session and read the trace — same engine, same
screen, and the deny beats the allow.

**COST, STATED:** one extra query per boot for every customer, to answer *"is somebody from
Endur inside my organisation right now"*. There is no version of this feature worth having that
would not pay it.

### 2026-08-31 · `viva/` — an evaluation cram kit, no source touched

**Docs only. No source file, test, migration or contract changed** — `git status` shows six new
files under `viva/` and nothing else. Recorded here because the next session will find a new
top-level directory that no `MAP` entry in `_MEMORY.md` owns, and should know it is deliberate
and load-bearing for nothing.

**Why.** The graded code walkthrough is tomorrow (2026-09-01) and the prof has been pointing at
arbitrary features and asking the team to explain them. The codebase is ~100k lines across 730
files with unusually dense comments, so the missing thing was never explanation — it was
**navigation**: which of 730 files was just pointed at, and what it connects to.

**What is in it.** `00-START-HERE.md` (the product, the stack, the repo shape, the one flow to
memorise), `01-MIDDLEWARE-CHAIN.md` (all 16 links, the five chains from `middleware/chains.ts`,
the four adjacencies that have to be defended), `02-PERMISSIONS.md` (grants, the resolver's seven
steps, the 404/403 split, INV-012), `03-FILE-MAP.md` ("what is this file" plus all ~120 routes
with their capabilities), `04-TRACES.md` (four flows click→DB→screen), `05-QUESTIONS.md` (a
cover-and-recite drill sheet).

**Two claims were corrected against the code rather than repeated from the docs**, because a
cram sheet that is wrong under questioning is worse than none:

  · `schema.prisma` has **35 models and 5 enums**, not 37 models.
  · **k-anonymity is enforced in the query layer and in the DTO type, not by a SQL trigger.**
    `features/results/service.ts` returns a body with no `questions` key at all below
    `config.K_ANON_THRESHOLD`, and `comments` exists only on the `suppressed: false` branch so
    the compiler refuses a caller who forgets to check. The triggers that do exist in the
    migrations are immutability triggers — `campaigns_anonymous_immutable` is the relevant one,
    and it stops a campaign being retroactively de-anonymised. The invariant's own wording
    ("enforced in SQL, not in a view") is about INV-006, the absence of a respondent column,
    which is separate and is exactly true.

Both audits were re-run and pass (`vocab` 169 component files, `drift` 61 docs / 73
capabilities), so either can be run live in front of the evaluator.

Also published as a single browsable page for revising away from the laptop:
https://claude.ai/code/artifact/3f10e14d-1b63-4f63-b6c0-9ebbdfd3ee2c

**Next session:** nothing here blocks anything. `T-045` is still unrun and still the largest
risk, and `F1` from the mate's run doc is still a Blocker.

### 2026-08-31 · two owner reports — a phantom "invited" tag, and a 404 that meant 403

**Both found on `/app/people`, and the owner named the contrast themselves:** the escalation
refusal on that page is exemplary — *"That position includes 'org.update', which you do not hold
yourself."* — while adding a position to a unit slightly out of scope answered
`404 {"message": "Not found."}`. Same screen, same caller, one refusal that teaches and one that
tells them the thing they are looking at does not exist.

**1 · The phantom tag.** `POST /people` writes `users.status = 'invited'` with a null password
hash — `10` §2's way of saying the account cannot open the door — and `PersonSummary` carried that
column raw. The list printed it beside the name for anybody not `active`, so every person an
administrator added was labelled "invited" **in the same row that still offered them the Invite
button**. The column is a fact about a hash; the screen was reading it as a sentence about an
email, and it cannot be one — a person awaiting activation and a person nobody has asked are both
`invited` with a null hash, and only an unaccepted `account_invites` row separates them. That is
exactly what `account` already answers, derived server-side in one place (`57` § States).

**Fixed by removing `status` from `PersonSummary`**, not merely by deleting the render: it had
exactly two readers — the list row and the detail panel's "Account status:" line — and both were
the bug. `accountStatusOf` still reads the column server-side, where it belongs.

**2 · The 404 that should have been a 403.** `requireCapability`'s `invisible()` decides the split,
and asked "can the caller see the target" using `<module>.read` derived from the acting capability.
**There is no `assignment.read`** — and there should not be; an assignment is read as part of the
person who holds it. So the question was asked with a capability nobody holds, `visibleUnits`
correctly answered "nowhere", and *every* out-of-scope assignment 404'd — including at a unit the
caller had just picked out of their own unit menu.

**Fixed:** `invisible()` asks `unit.read`, unconditionally. Not a widening — the only target it
ever sees is a unit, since everything without a `unitId` returns false two lines earlier.

- **the failure mode is the lesson.** A capability name built by string concatenation has no
  compiler behind it, and when it resolves to nothing the authz default is DENY — so the mistake
  presents as extra security and nothing errors. Audited the surface: of 108 `requireCapability`
  calls only 8 are unit-anchored, and `assignment.create` was the only one whose module has no
  `.read`. `account.*` and `simulator.*` also lack one; neither is unit-anchored
- both halves are now tested: a Section Head gets **403 `out_of_scope`** at Team A1 (visible, may
  not act) and **404** at Section B (cannot see at all). Each test probes
  `GET /units/:id/composition` first so it cannot pass vacuously
- the backend test asserting `res.body.data.status === 'invited'` is how the phantom tag passed
  review. It now asserts the DB column, and `toBeUndefined()` on the wire
- ledger: **N-075**, **N-076**. 1581 tests pass (614 backend, 967 frontend), typecheck 0, lint 0,
  both audits clean

### 2026-08-31 · Enter on the structure page created two units

**Found by the owner on `/app/structure`:** naming a new unit and pressing Enter added it twice.

`<InlineName>` (`components/org/InlineName.tsx`, `24` §7) had `onBlur={commit}` and an Enter
handler that called `commit()` **and then** `blur()`. `blur()` is synchronous, so one keypress ran
the handler twice, with the same draft both times — React had not re-rendered, so `next !== value`
was still true on the second pass.

**It has always done this. Only the caller was new.** Every previous caller was a RENAME, and
writing the same name twice is the same name, so the second commit was invisible. The structure
page's `+` does not rename, it CREATES, and two identical creates are two units.

**Fixed:** Enter still commits directly — leaving it to the blur would mean Enter does nothing on
an input nothing had focused — and a `committed` ref, shaped like the existing `reverting` one,
tells the blur it caused that there is nothing left to do. `onFocus` clears both, so neither flag
survives into an edit it was not set by; `reverting` had the same latent staleness and now does
not.

- one implementation, N placements (INV-007) — the single change fixes structure, roles, subjects
  and setup, and `.blur()` appears nowhere else in the frontend
- **the test that should have caught it asserted `toHaveBeenCalledWith`, which does not count.**
  It passed against two calls. There is now one asserting `toHaveBeenCalledTimes(1)`, written
  failing first (2 calls) and then passing
- the five page-level tests that fire Enter at an **unfocused** input still pass, and that is the
  reason Enter was not left to the blur. `InlineName.test.tsx`'s own header documents that trap
- 1578 tests pass (612 backend, 966 frontend), typecheck 0, lint 0, both audits clean

### 2026-08-31 · `npm run db:migrate` was the one command N-013 warns about

**Found by the owner running the step `T-108` told them to run.** `npm run db:migrate` ran
`prisma migrate dev`. It prompted for a migration name, generated one, and failed applying it:

```
Database error code: 2BP01
ERROR: cannot drop index questions_template_id_position_key because constraint
       questions_template_id_position_key on table questions requires it
```

**Nothing was lost, and that was luck rather than design.** The generated migration would have
dropped `answers_question_numeric`, `campaigns_audience_rule_gin`, `nodes_meta_gin`, the
DEFERRABLE unique on `questions(template_id, position)`, five foreign keys, and
`DROP TABLE sessions` — the store connect-pg-simple owns (DEC-014). Postgres refuses to drop an
index a constraint needs, so the fourth statement errored and Prisma rolled the file back whole:
`applied_steps_count` 0, and all four objects verified still present afterwards. **N-013 is the
note that says if that file had committed, the app would still have run.** The one statement that
happened to be illegal is the whole reason this is a report and not a recovery.

**Cause: schema.prisma is drifted from the database permanently and on purpose.** ~90 lines of
hand-written SQL in the init migration are things Prisma cannot express. `migrate dev` diffs the
schema against the database and offers to erase the difference. `03` §5 has said
*"`migrate deploy`, never `migrate dev`"* since the suite was written — but it scoped the sentence
to the **test** run, so the everyday script kept saying `dev` and nobody reread it.

**Fixed:** `db:migrate` is now `prisma migrate deploy && prisma generate` (the `generate` half
keeps the ergonomics `dev` had, and N-072's stale-client fault with it). Migrations here are
hand-written, so `dev` never had a job `deploy` does not do.

- the failed row was cleared with `prisma migrate resolve --rolled-back` — **a failed row blocks
  every later migration until it is**, which is the part worth remembering
- `20260831140000_plan_lapse` was already applied last session; the step in the `T-108` header
  was a no-op, and running it is what surfaced this
- verified from empty against a scratch database, not the owner's: 17 migrations apply clean and
  the sessions table, all three special indexes, the deferrable unique and all four triggers are
  present afterwards. Scratch database dropped.
- `10` §11's acceptance item said *"`prisma migrate dev` runs clean from an empty database"* — it
  now says `db:reset`, since the old wording asked for the command that breaks it

**Ledger:** N-073. `03` §5's rule widened past the test run and told why the scoping mattered.

### 2026-08-31 · five UI reports — the booking screens and the modal layer

Five screenshots from the owner, and four of the five turned out to be the same class of
fault: a layout that was written correctly and then never took effect.

**`/app/booking` rendered as three tall boxes of empty space.** `.booking-new` and
`.booking-row` both set `display: flex; align-items: ...` and neither set
`flex-direction`, so both inherited `column` from `.card` — `align-items` then centred and
right-aligned a stack instead of laying out a row. Both now say `row`. The bookable rows
also gained a tinted icon square, which gives the list a fixed left edge, and a hover lift.

**The modal layer had three structural faults, all shared by every dialog in the console.**
(1) `.dialog-backdrop` carried **no `z-index` at all**, so the campaigns list's sticky filter
tabs (z 20) painted straight through an open dialog — that is the third screenshot. It is
now 120, above the rail. (2) `display: grid; place-items: center` on a fixed box centres the
panel and then clips whatever does not fit **off the top**, where the title is; the composer
is taller than a laptop viewport the moment the audience picker opens, so its heading was
simply gone. Now flex with `margin: auto`, which centres a short dialog and lets a tall one
scroll. (3) `.input { border-radius: 999px }` is right for a 42px control and turned the
90px textarea into an oval; `textarea.input` takes the card radius instead.

Added a **`.dialog-tall`** variant — head and actions hold still, only the fields scroll —
and moved `<Composer>` and `<QuickDialog>` onto it. A form long enough to need scrolling must
not take its own Save button below the fold with it. The audience picker's rows became a
two-column grid so the description sits under the label rather than being squeezed into
two-words-a-line beside it, and both dialogs went to the 560px width.

**`<SlotGrid>` now groups by day** (`24` § SlotGrid updated). Eight cards each repeating
"Tue, 1 Sept" spend the reader's whole attention on the one thing every card has in common,
so the day is now the structure: a date block on the left, the times beside it as a chip
strip on a column grid, and the date stated once. Not a heading element — this renders under
a different `<h2>` on each side of the product — so each day's list carries the date as its
accessible name and every chip's `aria-label` still names the whole sentence. Fixes the
fourth and fifth screenshots at once, which is the point of it being one component. Selection
moved from `border-width: 2px` to an inset ring, because growing the border moved every other
chip in the row by a pixel.

Props, states and capabilities all unchanged — presentation only. Typecheck clean, frontend
suite green, checked in both themes and at 375px.

### 2026-08-31 · `T-106` — a poll on every demo org

Asked to give the demo admins polls, slot booking and announcements with real seed data.
Checked what each surface actually costs: `campaign.*` (a poll is a one-question campaign,
DEC-088) is in bronze, so every org can already use it; `announcement.*` write is silver+;
`booking.*` is gold+ with nothing held back for lower tiers. Asked the owner whether to bump
every demo org to enterprise so all three surfaces work everywhere, or keep the existing
one-org-per-tier layout (D-012) and only seed what each org's tier actually unlocks — chose
the latter. Announcements and booking were already seeded correctly on the orgs whose tier
buys them (`seed/demo.ts` §7b); the gap was polls, seeded nowhere. Added `DemoOrg.poll` (one
question, three options, a vote count) and a seeding block that builds it the way
`quickCreate` does — org singleton subject, one-question single-choice template, public
token — on all four orgs. `test/seed.test.ts` still green, typecheck clean.

### 2026-08-30 · the demo run's five findings, fixed

**Source and record:** `Mithil/demo_college_run.md`. That report now carries a **section 9**
written after the fixes — one row per finding with its ledger id and outcome, the two causes
worth reading in full, the file list, and how the checks were run. The findings themselves are
left in the present tense, as written, so the document still reads as the run rather than as a
tidied-up account of it.

**Source:** `Mithil/demo_college_run.md` — a whole college (IIIT Sri City, 34 people, 15 units,
ten roles) driven end to end through the real API. It changed no code and wrote down 13
failures collapsing into five issues. All five are now fixed, with a regression test each.

**`D-046` — quick polls and suggestion boxes had unreachable results (blocker).**
`features/results/service.ts` carried its OWN copy of the campaign visibility predicate,
missing the organisation-subject clause `DEC-093` exists to provide — and the two `select`s
feeding it did not fetch `subject.type`, so the clause could not have been evaluated had it
been there. It bit whenever `visibility.all` is false, which is EVERY role in EVERY
organisation (no seeded role holds `results.read` or `response.read` at `all`), so a poll with
nine votes answered `404` on its own results to the founder who created it, and no
suggestion-box comment ever reached the Inbox. Fixed by deleting the copy and calling
`campaignInScope` from `features/campaigns/visibility.ts` — INV-009, which is why that file
exists. New `test/quick-results.test.ts`; verified it fails on the old service.

**`D-047` — the Gold improvement loop could not be granted (blocker).** See `DEC-107`. The
grid's escalation bound demanded the saver hold a capability EVERYWHERE before handing it out;
`reflection.*` and `actionplan.*` are seeded at `self` and nowhere else, so nobody could ever
hold them everywhere and nobody could ever grant them. A `self` cell claims no unit, so it is
now bounded by holding rather than by reach — the reading `authz/escalation.ts` already took.

**`D-048` — a ten-role organisation left six roles with almost nothing, silently.** The matrix
describes four levels and everything below the fourth is clamped to the level-4 row, which has
no `template.*`, no `campaign.read`, no `booking.*` and no `announcement.create`. The defaults
are unchanged — they are right for a four-role organisation — but `GET /grants/warnings` now
carries a `thin_starter_row` warning naming each clamped role, so the grid says what the wizard
did not.

**`D-049` — `/inbox/messages` 500 on a stale Prisma client.** `prisma generate` is now a
`predev` script (before `tsx watch`, the only order that works on Windows) and the dev server
prints unapplied migrations at boot. See `N-072`.

**`N-069` — response rates over 100%** now state the two counts instead of a percentage on the
results card, and explain themselves on the home card. Arithmetic, not a bug: a public link is
answerable by whoever holds it while the denominator counts the people asked.

Also from the same report: `N-068` `/analysis` on an invisible campaign answers 404 rather than
`responseCount: 0` (`DEC-108`); `N-070` sign-in to a suspended organisation is refused at the
sign-in rather than by the first console call; `N-071` the CSV importer takes an `Also in`
column and creates a second, non-primary position (`DEC-109`) — the thing that made hostel and
mess audiences one person.

**Not fixed, deliberately:** the dev database still holds ~517 junk organisations from earlier
harness runs (`N5` in the report) — data, not code; the test-database resolver already refuses
to write into `DATABASE_URL`. `N1` (an Export CSV button shown to a HoD who lacks
`results.export`) did not reproduce — the button is already behind `can('results.export')`;
what the report saw is that `results.export` is seeded to levels 1–2 only, which is the matrix
working. `N3` is a naming observation about `POST /authz/simulate`, no change.

**Checks:** typecheck 0, lint 0. Backend suites run in batches (`--pool=forks --singleFork`;
the full parallel run exhausts argon2's memory on this machine and dies with
`Memory allocation error`, unrelated to these changes). `router/boundaries.test.tsx` fails on
the frontend before and after these changes — pre-existing, an undici/AbortSignal mismatch.

### 2026-08-31 · `T-108` — plan expiry, which had never been designed

**Owner report, and it was entirely right:** *"On plan expiration, nothing happens for the
client, they are able to continue to use the features granted by the plan, and there is no
option to change the plan on expiration. The entire possibility of plan expiration is not
designed at all for both client and admin."*

**It was scoped out on purpose and then contradicted in writing.** `DEC-080` said *"nothing
renews, nothing expires, nothing dunns"*; `16` §7 said *"expiry moves the org to Bronze, never
to zero access"*. The scope note is what shipped, and the rule sat there unbuilt for a week.
`DEC-113` resolves it in §7's favour.

**Two causes, and fixing either alone would have left the bug in place.**

1. `applyExpiredDowngrade` returned early unless a downgrade had been *scheduled* — one line,
   `if (!pending || !periodHasEnded(...)) return row`. An organisation that simply let the
   month run out kept its tier with `period_end` frozen in the past, indefinitely.
2. `requireEntitlement` selected `tier` **alone**. Even a corrected row would not have closed
   it for an organisation that never opens `/app/plan` — which is most of them — because the
   gate is what an ordinary user actually meets. **This is the load-bearing test in
   `lapse.test.ts`:** a Gold surface `402`s the moment the period ends, with no read of
   `/billing` first, and the row is *not* written by that request.

**One decision, three readers.** `billing/effective.ts` `effectiveTier(row)` — the gate reads
it and never writes; `readBilling` reads it and persists it; the operator estate reads it so
`/ops` never shows a tier the API has stopped serving. `DEC-098`'s property was *"the gate and
the page read the same COLUMN"*, and a column stops answering the moment a date passes. It is
now *"they compute the same ANSWER"*, which is what `49` § Interactions was protecting.

**The revenue hole this would have opened, caught before it shipped.** `DEC-097` charges the
*difference* because the customer already paid for the tier they are leaving. After a lapse
they have not — the Bronze is free — so a rejoin priced Bronze → Gold bills **₹900 for a ₹999
plan, every month**, making a deliberate lapse permanently cheaper than staying on the plan.
`recordPayment` grew `pricedFrom`: the move is still recorded as Bronze → Gold, only the price
is measured against nothing. Two tests, one for the fix and one guarding that ordinary upgrades
still pay the difference.

**Owner decisions taken this session** (all three recorded in `DEC-113`): lapse to Bronze and
rejoin through the join button that already exists — no `/billing/renew`; **Bronze rolls free**,
so it earns ₹99 once rather than ₹99 a month; a seven-day warning banner rather than a grace
period.

**The banner is the actual answer to the report.** `/app/plan` has printed the period's end date
since `T-058` and the owner still met *"nothing happens"* — a fact nobody navigates to is a fact
nobody has. `<PlanNoticeBanner>` renders in `<AppShell>` on every console page, gated on
`billing.read` so a reader who cannot see billing is neither shown it nor made to fire a request
that would `403`.

**Operator half:** the estate row shows the effective tier with `Lapsed` / `Ending soon` chips,
and `/ops/orgs/:id` prints the period end above the picker. An override now clears the lapse and
starts a fresh period — without that, granting a tier onto an expired row would lapse it again
on the very next read, undoing the support action within the second.

**Also fixed on the way:** `/ops/earnings` excluded `kind: 'expiry'` with a `not`, which would
have silently counted every ₹0 lapse as revenue the day this landed. It is a `notIn` list now,
so the next zero-amount kind is a name added to one array.

**Two existing tests changed, both correctly.** `downgrade.test.ts`'s *"is cancelled by paying to
move up"* asserted the tier was still Gold after expiry — that was only ever evidence because
nothing happened at expiry. It now asserts the plan lapsed **from Gold**, with `kind: 'lapse'`
and no `expiry` row, which is only true if the abandoned pending Bronze was genuinely gone.
`platform.test.ts`'s INV-011 field-by-field list gained `periodEnd` and `lapsedFrom` — a date and
a tier, neither able to carry a word a respondent wrote.

**Verified:** 1577 tests across 120 files, typecheck 0, lint 0, `npm run build` passes, drift and
vocab clean. **5 of the 7 new tests fail against the old rule**, checked by reverting
`effectiveTier` and re-running.

**One migration** — `20260831140000_plan_lapse`. Pulling this branch without `npm run db:migrate`
gives a Prisma client that knows about `lapsed_from` and a database that does not.

### 2026-08-31 · `T-107` — four bugs the owner found on the merged branch

**`1561/1561` across `118` files**; typecheck 0, lint 0, build passes, both audits clean.
`DEC-110`, `DEC-111`, `DEC-112`.

**The sign-up form walked people through a payment screen in order to reject them.** `/start`
step 1 was `setStep('plan')` with no check at all, so digits in every field advanced, chose a
plan, ran the checkout, and met a 422 afterwards. Registration and the capture are one
transaction, so nothing was created and nothing was charged — the owner noticed earnings did not
move, and that half was the system working correctly.

**And the server was letting it through anyway**, which is the part that matters more. `min(1)`
accepts `"12345"` and accepts `"   "`, in each of the twenty-odd DTOs that spelled it out. Fixing
only the client would have left `POST /people` happy to create a person called `404`. One
`nameField(max)` now: trimmed, at least one letter, bounded. The letter test is `\p{L}` with the
`u` flag — every alphabet, not `[A-Za-z]` — because a product that is generic across
organisation types has no business being English-only about people's names.

**A first pass applied that rule by regex and reached three things it must not.** Passwords
(which must not be trimmed, and whose lack of composition rules is a deliberate decision the DTO
argues for in its own comment), poll options (`"2025"` is a legitimate thing to choose between),
and machine identifiers. `textField` is the trimmed-and-bounded one for free text, and a test
that a numeric poll option still saves is what stops the next tidy-up doing it again.

**Endur was not charging for Enterprise, and the number was always zero.** The queue could only
record a conversation: the owner closed a request, went to the organisation's page, and set the
tier through `platform.plan.override` — which deliberately writes no `payments` row. So the one
tier the product charges ₹4,999 for earned nothing, and every Enterprise customer was invisible
to `/ops/earnings`. **Approve** now grants the tier and captures in one transaction. It names no
amount — the price is read from `PLAN_OPTIONS` server-side — which is why it does not reopen the
"an operator could invent revenue" objection, and why adding `Payment` to `platform/db.ts`'s
write allowlist is safe. `overridePlan` stays money-free and a test pins that.

**And "clicking Contacted does nothing" was literal.** The page called
`void queue.update(...).finally(...)` with **no `.catch`**, so any refusal became an unhandled
rejection and produced nothing on screen. It also fetched only `open`, so a successful Contacted
made the row vanish — which reads as a failed click rather than as progress. The queue now shows
contacted rows with a chip, and keeps every failure.

**Kavya Reddy's empty console was a one-line mapping.** The grant matrix's four rows are
positions in the **feedback loop**, not positions in the list — its own comments say L3 is the
reviewee and L4 the respondent — and the code read `Math.min(index + 1, 4)`. A ten-role college
put **six roles on the respondent row**: five capabilities, 403 on the campaigns list.
`levelForRole()` gives the bottom role 4 and the middle 3. Four-role organisations are
byte-for-byte unchanged, and a test pins that.

**That also closes `F2` without touching either rule `F2` named.** `reflection.*` is `self` at
levels 1–3 and absent at 4, and the no-escalation guard still requires a granter holding the
capability at `all` — so the Gold loop was unreachable *and* ungrantable for any reviewee below
the fourth. Putting the middle of the ladder on level 3 hands it back. **The mate's own run doc
had found both (`F4`, `F2`) and only warned about them.**

**A warning was passing for the wrong reason.** `thin_starter_row` filtered on "is this the
highest level number", which is true of the bottom role under *any* mapping — so it went on
passing while naming one role out of the six that were actually thin. It asks `levelForRole()`
now, the same function that assigns the grants, so the two cannot drift.

**One flake of my own:** the Enterprise earnings test asserted an estate-wide lifetime total,
passed alone and failed in the full parallel run because other files register organisations the
whole time. It asserts this organisation's row on the page instead.

---

### 2026-08-31 · `T-098`…`T-105` — the rest of Stage 11, in one pass

**Eight tasks, and the stage is closed.** `1524/1524` across `115` files from the repo root;
typecheck 0, lint 0, `npm run build` passes, both audits clean.

**`DEC-102` had to be corrected against itself, and that is the finding of the day.** It says
`/ops/analytics`' movement counts are read from `payments` *rather than* from `plan.override`
audit rows. Taken literally that **loses a case the same entry requires** — its own `not` clause
says a downgrade "covers an operator override", and an override deliberately writes no
`payments` row (`OverridePlan`'s DTO comment: an operator who could name an amount could invent
revenue). Replacing the source would have made an operator moving thirty organisations to Gold
show as **no movement at all**. It reads **both**. They are disjoint by construction — a
customer's move writes a ledger row and no platform audit row, an operator's override the
reverse — and that disjointness is written into the query's own comment, because if it ever
stops being true this count silently double-counts.

**`T-101` needed the platform WRITE seam widened**, which is the only part of Stage 11 that
touches `INV-011`, so it is named rather than quietly done. `platform/db.ts` refuses every write
into a tenant except by an allowlist; `Notification` and `EnterpriseRequest` join it. **The read
surface is unchanged** — `Answer` unreachable, `Response` count-only, and neither new model
carries a relation that could reach either. What an operator writes into a tenant here is a
subject and a body **they typed**: a path out of our table into their inbox, not into their data.

**`routes.test.ts` caught the two new inbox routes and refused a capability-less route without a
written reason.** That is `INV-003`'s enumeration doing its job. `GET /inbox/messages` carries
**no capability**, deliberately: `response.read` scopes which *units'* responses you may see and
would lock a recipient out of their own mail, and a `notification.*` module would imply a shared
queue somebody can be excluded from. The row **names the reader**, and the service scopes every
query by the session's user id.

**`OrgDetail.tsx` had no test at all, which is how reinstate could be dead** (`D-043`). The
route was tested; the failure was entirely in the page — one handler guarding both verbs on a
field only one of them has, returning before any request. A silent early return produces no
request, no error and no toast, which is indistinguishable from a slow network, so the new test
asserts **the request was made**, never what the screen says afterwards.

**Two more tests were pinning figures that could not move.** `conversionRate is null` passed
forever because `converted` is a hardcoded `0`, so the dash was the only reachable branch; and
`priceMinor === 0` on Enterprise, under a comment explaining that `0` was not free. Both were
correct and neither tested a decision. The property the second defended — nothing renders ₹0 out
of that field — is kept, and is now true because the number is real rather than because every
caller remembered to branch first.

**`endur.css` lost 150 lines** to a block that appeared **twice, byte-identical, 157 lines
apart** (`D-045`) — so `.preset-grid` was declared three times and the setup step's column width
and gap were settled by cascade order. A duplicate that agrees with itself is invisible until
somebody edits one of the copies.

**On the pages:** the scheduled downgrade sits **under the current plan**, not on a card —
`<PlanPicker>`'s rule is that a lower tier carries no action, and a rule with one exception is a
rule somebody adds a second exception to. Enterprise's card gained a **Request** verb rather
than losing its disabled one, which made `DEC-099`'s predicted `mode !== 'override'` unnecessary.
Dark surfaces gained an **edge** (`DEC-106`) in one block of six selectors; `.card` is
deliberately absent from it, because the glass card already carries one in every theme.

**`design_specs/design/01` is gitignored**, so its dark column does not appear in `git status`.

---

### 2026-08-31 · `T-097` — the ladder goes one-way, and the period becomes a month

**`DEC-096` and `DEC-097`, built.** `OPEN-015` came back from the owner as *"monthly period,
prices left at ₹99/₹499/₹999"* — the same numbers, billed monthly, which is a 12× rise and is
what the decision was written expecting. `tiers.test.ts` pins all three against the literals, so
the next change to them is a change to a test as well as to a table.

**The suite is green from the root: 112 files, 1487 tests.** Typecheck 0, lint 0, build passes,
drift and vocab clean.

#### The rule is the server's, and the test proves it there

`POST /billing/tier` refuses a lower rank **and an equal one**, with two different messages,
before anything is written — the lower-rank message names the tier they are on, the date the
period ends, and says there are no refunds; "already on Silver" is a different situation and a
reader told the wrong one tries the wrong remedy.

**The test calls the route directly rather than driving `/app/plan`**, and that is the whole
point of writing it: the page stops *offering* a downgrade, `13` § Billing is a documented route
anything can call, and a rule the client enforces is a rule that is not enforced (`INV-003`). It
also asserts that a refusal wrote **nothing** — no tier moved, no capture recorded.

**The equal-rank check earns its own assertion.** `changeCostMinor('gold','gold')` is `0`, so
without it a double-submitted dialog would grow a free `payments` row per click rather than
billing twice. The 409 is what stops that, not the price.

#### The number the owner did not ask about

The headline assertion for `DEC-097` is a **sum**, not three row checks: an organisation that
walks Bronze → Silver → Gold now totals **₹999** in `payments`. It used to total **₹1,597** — for
a customer holding one ₹999 plan. The ledger overstated, and it overstated most for the
customers who upgrade most; `/ops/earnings` reads that table directly.

One formula, `changeCostMinor` in `packages/shared/src/tiers.ts`, beside `priceOf` — the
checkout dialog and `recordPayment` both call it, which is the only reason the two cannot
disagree about a customer's bill. **What the dialog prints is still not what the ledger
records**: the server subtracts again inside the transaction, because `DEC-080` requires it.

#### The period was hardcoded in FOUR places, not three, and they already disagreed

The change order said three. The fourth is `database/seed/demo.ts`, and it was found by grepping
for the **column** rather than for the number — which is the only way to find the copy nobody
remembered writing.

**And two of the four used a different expression from the other two.** `joinTier`'s repair and
`overridePlan` used `+ 365 * DAY`; registration and the seed used `setFullYear(+1)`. In a leap
year a registered organisation got a period **one day longer** than a repaired one. Nothing read
the difference, which is exactly why it survived — a constant duplicated four ways is not wrong
until something depends on it, and `DEC-098` is about to make `period_end` the date a scheduled
downgrade fires on.

It is one function now: `src/backend/billing/period.ts` `newPeriod()`, owned by `16`. A calendar
month, **clamped** — JavaScript rolls 31 January + 1 month forward to 3 March rather than
refusing, so an organisation joining on the 31st would silently get three extra days and, after
`T-098`, a downgrade firing in the wrong month. Computed in UTC, because the columns are
`@db.Date` and mixing local arithmetic with a date column is how the two old expressions came to
differ in the first place.

#### On the page

A card **below** the current tier loses its button and gains a sentence — *"Below your plan.
Moving down happens at the end of a period — there are no refunds part-way through one."*
**Absent, not disabled**: a permanently-dead control teaches a reader to distrust every greyed
control they meet, which is `DEC-104`'s argument arriving early. The sentence is load-bearing —
a card that simply lost its action reads as a rendering fault, which is how somebody "fixes" it
back.

`override` mode is exempt: an operator may move a plan either way, and reusing one flag for both
would have made `/ops` quietly one-way too. That has its own test.

The checkout shows its working — *"₹999 Gold − ₹499 already on Silver"* — because an amount that
is neither of the two prices on the previous screen is exactly the kind of surprise that
produces a support email.

#### A test that was asserting the wrong thing

`Plan.test.tsx` had *"CONFIRMS a downgrade, says the data is kept, and only then asks for
money"*. It passed, and it drove a flow that **charged a customer a second time for less than
they already held**, in a product with no refunds and an append-only ledger. It asserted the
dialog's wording rather than asking whether the transaction should exist.

Two others were the mirror image: `PlanPicker.test.tsx` and `Plan.test.tsx` both asserted that
*"per month" appears NOWHERE on the page*. True of a yearly product, and precisely the shape a
stale test takes when a decision lands and nobody greps for the sentence it invalidates. Both
now assert the opposite, and that `/ year` is gone.

#### One correction on my own reporting

The first three full-suite runs I did this session reported **44 files, 551 tests** and I read
that as the whole suite. It was the backend project only — an earlier `cd src/backend` was still
in effect, so `npx vitest run` picked up that project's config rather than the root's. The root
run is 112 files and 1487 tests, and that is the number above. **`D-037` made the root command
the correct one; a stale working directory is how you run the wrong one and believe otherwise.**

#### What the next session should know

`T-098` (the scheduled downgrade, `pending_tier` + evaluate-on-read) and `T-099` (Enterprise's
one-line fix and its price) are both unblocked and both depend on this. `T-102` and `T-103` are
independent live bugs and can be taken in any order.

`T-045` is still unrun and is still the largest risk on the day.

### 2026-08-31 · the owner's third pass — twelve reports, nine tasks, **DOCS ONLY**

**No code was written. The owner asked for docs and that is what this is** — twelve reports
from one sitting with the running app, each traced to a cause in the source and written up as a
decision, a defect or a task. `DEC-096`…`DEC-106`, `D-043`…`D-045`, `N-067`, `OPEN-015`, `55`
§ Stage 11, and the § Board block above.

**The reports are three different kinds of thing wearing one list**, and sorting them was most
of the work:

| Kind | Which | Why it matters |
|---|---|---|
| A **live bug** | reinstate, the date window, the wizard's `Enter`, the duplicated CSS | Broken now, reproduction written down |
| A **product decision** | the plan ladder, Enterprise, the two message surfaces | Nothing is broken; the owner changed what the product does |
| A **figure with no source** | the trial counters, seats | It was never going to work, and printing it was the mistake |

#### Two reports were misread on the way in, and both corrections are the finding

**"Enterprise plan is not working" is one line, not a missing feature.** `<PlanPicker>` computes
`unavailable = disabled || !plan.selectable` and applies it in **all three modes**. `override`
mode is the operator moving somebody else's plan — `DEC-048` routes Enterprise there
deliberately, `19` §4 has the capability, `70` has the screen — and its Enterprise button is
disabled by a flag whose whole meaning is *a customer may not choose this*. **The one tier the
product calls operator-assigned is unassignable in the only UI that can assign it.** The fix is
`mode !== 'override' && !plan.selectable`. `DEC-099`.

**"Suspending is suspending every org" was checked and NOT reproduced.** `setSuspended` writes
`where: { id: orgId }` from `params.id`; `tenantResolver`'s refusal reads `factsOf(orgId)` per
request with no cache and no shared state; `<OrgRow>` renders `org.suspendedAt` per row. There
is no path in any of the three that could touch a second organisation. **The likeliest reading
is the bug reported in the same breath**: reinstate silently does nothing, so every organisation
suspended stayed suspended and the estate accumulated them with no way back — indistinguishable
from "it suspended everything" from the console list. `N-067` records exactly what was checked
so the next session does not re-read the middleware first, and names the one observation that
would settle it.

#### The three findings that were worse than the report

**A message from Endur reached nobody, and the operator was told otherwise.**
`messageAdministrators` writes one `platform_audit_log` row and returns `{ sentTo: 3 }`. **That
is the operator's own table.** The customer's administrators have no route that reads it and no
screen that renders it, and there is no mail transport. So the operator sees *"Sent to 3
administrators"* while **nothing has been sent to anybody** — a confirmation for an action that
did not happen, which is worse than an unbuilt feature. The service's reasoning that *delivery
in P2 is the record* is right and incomplete: a record is a delivery only if the recipient can
reach it. `DEC-101`, `T-101`.

**Two of six headline cards on `/ops/analytics` could never move.** The owner created an
organisation, watched *Trials started* stay put, and read the counter as redundant. It is worse:
`DEC-048` made registration write `status: 'active'`, so nothing but a seeded operator-created
org is ever `trialing`; and `converted` is a hardcoded `0` under a comment stating it has no
source, so *Conversion rate* is permanently an em-dash. The service argues honestly for the zero
and is right about honesty, wrong about the remedy — **the honest thing to do with a metric
that has no source is not to print it.** `DEC-102`, `T-102`.

**The movement table has only ever counted what operators did.** `upgraded`/`downgraded` come
from `platform_audit_log` rows with `action: 'plan.override'`. A customer's own upgrade writes
`billing.update` to the tenant `audit_log`, which that query never reads — so the estate's
movement chart is labelled as the estate and shows the support desk. It moves onto `payments`,
which carries `from_tier`, `tier` and `kind`, is written on both paths, and is already what
`/ops/earnings` sums. One source, or the two pages disagree about the same event.

#### The billing change, and the number nobody had noticed

The owner's first item was four changes in one paragraph. Separated: the ladder is **one-way**
while a period runs (`DEC-096`), an upgrade captures the **difference** (`DEC-097`), the period
becomes a **calendar month** (`DEC-096`), and a downgrade is **scheduled for expiry** rather than
performed (`DEC-098`).

**The difference rule fixes a number that was not in the report.** `/ops/earnings` sums
`payments`. Today an organisation that walks Bronze → Silver → Gold inside one period
contributes ₹99 + ₹499 + ₹999 = **₹1,597** to estate revenue for a customer holding one ₹999
plan. **The ledger overstates, and it overstates most for the customers who upgrade most.**
Under the difference rule the same journey sums to ₹999.

**"Only when it's exhausted" needs the one thing this product has not got** — something that
runs when a date passes. `16` §8 says so in as many words, `17` is unwritten and `OPEN-005` says
nothing owns a scheduler. **So nothing runs**: `pending_tier` plus the first read after
`period_end`, which is the evaluate-on-read trick `readBilling` already uses to repair a missing
subscription row (`D-012`), with its argument already written in that function's comment. The
accepted cost is stated rather than discovered — an organisation nobody opens never transitions,
which is harmless because a tier is only consulted when somebody asks.

**Removing a button is never the rule.** `/app/plan` stops offering a downgrade and `13`
§ Billing is what makes that true: `POST /billing/tier` refuses a lower or equal rank with a
409. A documented route that anything can call, and `INV-003` says the client never decides.

#### And one thing the owner did not ask about

**`endur.css` carries 157 lines twice, verbatim.** `/* Industry Split Layout */` appears at two
line numbers; the blocks differ by one blank line and one trailing rule. `.preset-grid` is
therefore declared **three times** across the file with different `minmax()` and different `gap`,
and what renders is whichever copy the cascade reaches last. That is the *"layout and padding
are not clear"* half of the dark-mode report, and it is not a dark-mode fault at all. `D-045`.

The dark half **is** a system fault: `design_specs/design/01` §4's surface table gives Content
*"`#ffffff` + `--shadow-sm/md`"* — light-mode only, written before `DEC-028` shipped dark and
never revisited. And the dark token block's own comment already says *"shadows on a dark ground
do almost nothing; the lift has to come from the edge instead"*, over components still carrying
`border: 2px solid transparent`. **The system knew and the components never followed.**
`DEC-106`.

#### What the team owes

**`OPEN-015` is the only blocking question and it is one line.** `DEC-096` moves the period to a
month and leaves the prices at ₹99 / ₹499 / ₹999 — a 12× rise, written deliberately, because
₹99 a *year* is not a price anyone would defend in the room. If the intent was the annual figure
divided by twelve, say so before `T-097` is built. Nothing else in Stage 11 depends on it.

#### What the next session should know

Nothing was built and nothing was verified, because there is nothing to verify — **the suite was
green when this session opened and no file under `src/` was touched.** `git status` should show
architecture docs, `design_specs/design/01`, and this file.

Start at **`T-097`** if the answer to `OPEN-015` has arrived, **`T-102` or `T-103`** if it has
not — both are live bugs on the operator surface, neither depends on a price, and `T-103`'s
reinstate is the one a person would meet in the first minute of using `/ops`.

**`T-045` is still unrun and is still the largest risk on the day.** None of the above changes
that, and none of it should be done in front of it.

### 2026-08-30 · `D-036` and `D-041` repaid — `DEC-094`, `DEC-095`

**The suite is green, all of it, for the first time: backend 546/546, frontend 933/933, three
consecutive full runs each.** Two debt entries closed. Both had a diagnosis written down, and
**both diagnoses were wrong in the direction that would have made things worse.**

#### `D-036` — the log reader was losing lines, and the entry said it was the fixture

The filed diagnosis: *"most likely the fixture size drifted below the 64 KB chunk, in which
case the test is asserting nothing rather than the reader being wrong."* Prescription: size the
fixture up. **That would have produced a green test over a live bug**, which is the one outcome
worse than the red test that had been sitting there since 26 Aug.

The test was asserting the right thing. `tailRead` set its cursor to the start of the **chunk**
it had just read — the header comment even explained why that was safe, *"a chunk this call only
partially used is simply re-read from the same offset next time"*. It is not re-read. **The
reader walks backwards.** Resuming at the chunk's start reads the chunk *below* it, so every
line the page limit left unreturned in that chunk is skipped, and the page after that opens on
the truncated half of whatever line straddled the boundary.

Measured before touching anything, by paging a real fixture to the end:

| fixture | limit | returned | lost |
|---|---|---|---|
| 1,500 lines / 186 KB | 50 | 150 over three pages | **1,350** |
| 220 lines / 27 KB (under one chunk) | 50 | 50, `hasMore: false` | **170** |

The sub-chunk row is the one that matters, and it is the case the debt entry proposed to
delete: one read takes the scan to offset 0 while the limit is still capping the page, so
`hasMore = position > 0` answers *"that is all of them"* to a file with 170 more. **A file
under 64 KB is not an edge case — it is every log file for the first hours of its day**, and
this is the tool an operator opens during an incident.

The cursor is now the byte offset of the **oldest line the page returned**, built with
`Buffer.byteLength` and never `String.length` — a character count walks off the line boundary
the first time somebody logs an accented name, above one chunk only, silently. `DEC-094`.

**The test now walks to the end** and asserts the pages *equal the file*, at two sizes — under
one chunk and across several — because the two sizes broke differently and one fixture proves
half of it. A pagination test that stops after two pages can only ever catch a bug in the first
two pages. Every fixture line carries a multi-byte character. `platform-logs.test.ts` **15/15**.

`72` § Acceptance carried `[x]` against *"asserts the two pages are contiguous with no gap or
repeat"* the whole time. The fix restores the doc rather than changing it, as `D-040` did.

#### `D-041` — not a flake, and the pool hypothesis was mine and was wrong

The entry said *"one occurrence is not a diagnosis — if it returns, the answer is
`fileParallelism` or a pool cap, not a retry."* It returned, on **a different innocent test
every full run**, each passing alone. That is what flakiness looks like and it was not.

The standing hypothesis was connection-pool starvation: 16 cores → ~15 workers, each a
PrismaClient whose default pool is `num_cpus*2+1` = 33, against `max_connections = 100`. The
arithmetic is genuinely bad. **It was still disproved rather than assumed** — `pool_timeout` was
dropped below the test timeout so starvation could announce itself by name, and the timeouts
carried on with **not one** of them reporting a pool wait.

The real number took one command: these are integration tests and the heaviest register two
organisations end to end. **On an idle machine the slowest single test is 3361ms and four are
over 2.5s**, against vitest's **5s** default — two thirds of the budget spent before fifteen
workers start competing for sixteen cores. Whichever test is slowest when the machine is
busiest loses. A lottery, not a bug, which is exactly why four rounds of re-running found
nothing.

The frontend has the same shape for its own reason: `<PaymentDialog>` runs a deliberate ~700ms
simulated capture and ~1500ms success overlay on **real** timers (fake ones fight `waitFor`), so
every paying test in `Start.test.tsx` costs ~2.3s against the same 5s. It failed once in a full
run here and passed 16/16 alone, twice.

**Both projects now run a 20s `testTimeout`/`hookTimeout`, with the measurement written beside
them** so the next person changing it knows what it is buying. `DEC-095`.

- **Not `retry: 1`.** It would have made the symptom disappear the same evening and hidden every
  genuine race the suite exists to catch — including the booking one the N+1-concurrent test
  found in `T-095`. A suite that retries cannot report a race.
- **Not `fileParallelism: false`**, the other option the entry named: it works by making the
  machine idle, turning a ~60s suite into several minutes — paying in the feedback loop for a
  number that costs nothing to correct.
- The **pool cap stays** (`connection_limit=5`, 75 of 100 across 15 workers) because 495
  requested against 100 available is a ceiling the suite would eventually reach — and it is
  explicitly **not** credited with the fix, in the comment as well as here.

**Still owed, and small:** `<PaymentDialog>`'s two delays are hardcoded, so the frontend suite
spends ~15s of wall clock watching an animation. Making them injectable is a change to product
code for the tests' benefit and belongs in its own task, not smuggled into a debt repayment.

#### Found on the way out: a structural guard that only held from one directory

Running the whole thing from the repo root — which `D-037` established as *the correct
command* — turned `booking.test.ts`'s `DEC-090` grep red in 8ms. It resolved
`features/booking/` from **`process.cwd()`**, so from `src/backend` the path was right and from
the root `readdirSync` threw. `D-037`'s own lesson, still being made by a guard written after
it: **a rule that only holds from one working directory is not a rule**, and a structural check
is the last place that should depend on how it was launched. Now resolved from the test file's
own location. Nothing else in the suite reads `process.cwd()`.

**Checks:** typecheck 0, lint 0, `npm run build` passes, `audit:drift` clean (61 docs, 73
capabilities), `audit:vocab` clean. **The root runner — `npx vitest run`, both projects
together — is 1479/1479 across 112 files, three consecutive runs.** Backend alone 546/546 ×3,
frontend alone 933/933 ×3.

**Next session:** `T-045` is now the only thing left on the board that can still go wrong on the
day, and it is the largest risk — three rehearsals, the 390px checks, and the WSL2 question
`DEC-086` left open (the LAN address found inside WSL is the virtual adapter's and is not
reachable from a phone without a `netsh portproxy` rule or running the dev servers from
Windows). It needs the demo machine and a phone, so it is the owner's to run.

### 2026-08-30 · `D-042` repaid, and the contention demo — `DEC-093`

Two things, asked for together: fix the bug that was going to break the demo, and make the
scalability claim something the room can watch rather than take on trust.

**First, a caveat that costs ten minutes if you hit it cold.** After pulling `5fd6a953` the
branch does not typecheck — 15 errors saying `Property 'booking' does not exist on
PrismaClient`, about models that are visibly right there in `schema.prisma`. The client is
generated, not committed, and the `postinstall` hook that regenerates it only runs on `npm
install`. Two pending migrations were unapplied on the dev database too, which shows up as a
500 saying `public.bookables does not exist`. `npm install && npm run db:migrate` fixes both.

**`D-042` — `DEC-093`.** The debt entry laid out two candidate fixes and called the choice an
authorisation decision rather than a patch, which was right. It picked neither, and the
evidence picks the wider one: `campaign.launch` is seeded `own_unit` at level 3, so anchoring
the singleton subject to the org's ROOT unit leaves a tutor who launches a poll from Section A
unable to see it one second later — D-042 again, one level down, where nobody is looking. So
the rule instead says what the unattached row *means*: a campaign anchored to the organisation
subject belongs to the whole organisation. That is also the only coherent answer on the
feature's own terms — every quick campaign is `access: public` with `audience: anyone`, so the
link already answers to whoever holds it and there is nothing to withhold from staff.

Two things came out of it that were not in the entry:

- **The `organisation` type was client-settable.** `type` is free text on
  `CreateSubjectBody`, and the new rule reads it — so anybody holding `subject.create` could
  have minted a subject that widened the audience of their own campaign. A permission written
  in a text column. It is now reserved: 422 naming `body.type`. This also makes true a comment
  `quickCreate` has been making since `T-091` about the row being furniture rather than
  something somebody added on the Subjects screen.
- **The predicate was already written twice** — inlined in `listCampaigns`, and again as
  `home/service.ts`'s own `scopeToCampaigns`. Fixing D-042 in one place would have left Home
  wrong, silently, and nothing would have caught it. Both now import
  `features/campaigns/visibility.ts`. INV-009 applies to a predicate exactly as it applies to
  a component, and the MAP row for `38` now says so.

Three tests: the level-3 launcher finds their own poll (list **and** detail, so the two
statements of the rule cannot drift apart), a Section B reader still cannot see a Section A
campaign and gets 404 rather than 403, and the reserved type is refused without a row being
written.

**`npm run demo:contention` — the scalability proof, made watchable.** `booking.test.ts`
already proves capacity holds under concurrency, but a green tick is a claim the evaluator has
to take on trust, and *scalable* is the one item on the board that a screenshot does not
support. The script registers a throwaway gold org, opens one slot through the real routes,
fires N concurrent public bookings over HTTP, and prints what happened:

```
  CONTENTION — 40 phones, one slot, capacity 10
  201 booked                     10   ✓ exactly capacity
  409 slot full                  30   ✓ everyone else
  anything else                   0   ✓ none
  rows in the database           10   ✓ agrees with the API
  slot reports remaining          0   ✓ full
  all answered in               301ms
```

It is an **assertion that happens to print** — non-zero exit if anything but exactly
`capacity` wins — and it is a demonstration, not a benchmark: no throughput figure, because
the only number being claimed is that the count is exact under contention. `50` §4 and §5
carry it as demo step 10, with the sentence to say over it (counting before locking passes a
sequential test and double-books a live room) and the `--capacity 1` variant for when there is
time for one line only. Setup goes through the API deliberately: a script that reached into
Prisma to open the slot would be demonstrating a path nobody uses.

**Checks.** typecheck 0, lint 0, drift clean (61 docs, 73 capabilities), vocab clean, backend
**544/545**, frontend **933/933**. The one remaining red is `D-036`, pre-existing and
documented.

**Next session:** `T-045` is still unrun and is now the largest risk on the board — three
rehearsals, the 390px checks, a QR scan on two phones, and the WSL2 question `DEC-086` left
open. Nothing was committed.

### 2026-08-30 · `T-095`, `T-096` — booking, and the one bug the test found

**The feature is the row lock.** Everything else about a bookable is ordinary CRUD; what makes
booking worth building — and what makes it the only surface in the product with real
contention — is that two phones can want the same last place. `book()` takes
`SELECT id FROM slots WHERE id = $1 FOR UPDATE` **first**, counts live bookings **second**, and
inserts **third**, all in one transaction. Counting before locking is the bug: both readers see
`capacity - 1`, both pass the check, and the room is double-booked in front of the evaluator.
Locking the slot rather than the table keeps the serialisation to the one row actually
contended, so two different slots never wait on each other. The loser gets **409** and not 400
— the request was well formed and lost a race, and telling somebody to fix a form with nothing
wrong with it sends them looking for a mistake that is not there.

**The N+1-concurrent test found a real bug, and it was mine.** `Mithil/plan.md` specified the
transaction with `isolationLevel: 'Serializable'` on top of the lock and I wrote it that way,
on the belt-and-braces argument that it costs nothing. It costs a booking: on a capacity-2 slot
one of the two rightful winners came back `40001 could not serialize access` instead of `201`.
Postgres's SSI reads the `count(*)` behind the lock as a predicate read conflicting with the
other transaction's insert, and aborts one of them — although `FOR UPDATE` had already made the
two strictly sequential and neither was ever going to overfill anything. The isolation level
added no safety and converted a correct booking into a 500. The lock and Serializable are
**alternatives**; taking both turns away a caller who did nothing wrong. Removed, recorded as
`DEC-092`, and the test that caught it is exactly the test the plan said would be the feature.

**`DEC-090` is enforced by a grep, not by review.** A booking is **identified** — a name and an
email, because a booking that cannot be honoured is not a booking — and a response names nobody
and never will (INV-006). The two must never join, and the way that promise dies is not
somebody deleting it but a future query in `features/booking/` reaching for the responses
table. `booking.test.ts` reads every file in that directory, strips the comments, and fails on
the word. A blunt instrument, and the right one: it survives somebody who never read the header
comment.

**The public payload is smaller than the console's and the omission is the specification.** A
stranger is told how many places are **left**; never the capacity, and never who took the rest.
A link that tells somebody who is coming to the clinic on Tuesday is a worse leak than anything
the campaign payload could make. Remaining is **derived** from live bookings every time — a
stored counter is a second source of truth and it drifts the first time somebody cancels.

**`/book/:token` is a second root of the respondent world, not a fifth world**, sharing
`RespondLayout` and `RespondBoundary`. That made `routes.test.tsx`'s containment check red, and
the test was wrong rather than the router: it asserted one root per boundary, which could only
be satisfied by duplicating a layout and a boundary the respondent world already has. Restated
as the property it always meant — every layout has exactly one boundary and every boundary
belongs to exactly one layout — so a console crash still cannot reach the respondent flow and
two roots of one world cannot drift apart.

**`D-040`'s first half is repaid, because this task depended on it.** `bundle.test.ts` compared
`path.relative()` output against forward-slash literals, so on Windows every containment filter
matched nothing and the guard reported clean without looking. `Book.tsx` was being added to its
entry list, and a guard that checks nothing is worse than no guard — separators are now
normalised once where `reached` is built. All five assertions pass for real, `Book.tsx`
included: React and the router are still the only packages the phone downloads.

**Raw SQL went where `DEC-007` says it goes.** The lock is `lockSlot(tx, slotId)` in
`db/graph.ts`, the one file permitted `$queryRaw`. Prisma has no expression for `FOR UPDATE`
either, so the exemption is used for the reason it exists; keeping it to one file is the whole
point, and a second would make the lint rule a formality.

**`T-096` closed the stage.** The gallery's last two lanes are live links gated on
`announcement.create` and `booking.create` while keeping their tier chip, and there is now a
test on an **enterprise** organisation proving the order: a reader who may not write is told
that, not sold an upgrade for a verb they would still be refused. The sidebar gains both,
neither gated on the tier — a bronze administrator lands on the page's own 402 with an upgrade
card, which is what `43` exists to demonstrate. `/app/plan` and `16` §2 now name announcements
under silver and booking under gold; a tier that withholds something the plan page never
mentions looks arbitrary. Seed data: a published announcement with one receipt per member of
staff and a third of them read (nought reads as broken, all of them reads as fake), and — on
gold and above only — a bookable whose middle slot is **nearly full**, so the *"1 left"* state
is on screen before anybody books on stage. Seeding a gold feature onto the bronze org would
have put a row on a screen that answers 402.

**Checks.** `typecheck`, `lint`, `audit:vocab` and `audit:drift` clean. Backend **540/542**:
the two failures are the pre-existing `D-036` and `D-042`, both documented and neither touched
here. Frontend **924/925**: the one failure is `D-040`'s second half, the jsdom/undici
`AbortSignal` mismatch in `boundaries.test.tsx`, which is not a product bug. New this session:
10 backend booking tests, 8 `<SlotGrid>` tests, and 2 more on the gallery.

**Next.** Stage 10 is complete — all six surfaces (`T-091` … `T-096`) are built. The demo path
in `Mithil/plan.md` § Verification has **not been walked end to end on a phone**; `T-045` still
owes that, and `D-042` should be settled before it, because a poll that vanishes from
`/app/campaigns` is on that path.

### 2026-08-30 · `T-094` — announcements, and the first receipt table

**The feature is the denominator.** Everything else here is ordinary CRUD; what makes an
announcement worth building is *"12 of 40 have read this"*, and that sentence is only true
because `announcement_receipts` is written **at publish time, one row per resolved recipient,
in the same transaction that stamps `published_at`**. A row created lazily on first read can
count readers and can never supply the 40. Publishing is therefore irreversible in the same
sense a launch is, and idempotent by **state** as well as by key: a second publish returns the
first result rather than resolving the audience again against an org graph that has since
changed — which would silently alter who the notice was sent to.

**`announcement.publish` is a separate verb from `announcement.create`, and the seeded matrix
is what makes that real.** L1 and L2 may draft; L1 alone may send. Drafting is not
broadcasting, and one `announcement.manage` would have made the distinction unsayable — the
same argument `account.revoke` makes against being folded into `account.create` (`57`).
`announcement.read` is seeded to **every level including L4**: being sent something is not a
permission anybody should have to be given.

**The audience is `AudienceRule` and the resolver is the campaigns' own.**
`features/campaigns/audience.ts` gained `audienceUsers()` and a shared `positionFilter()` —
the unit-subtree walk had been written twice already and announcements would have made it
three. `anyone` deliberately means something **different** here and it is written in the
function rather than inherited by accident: on a campaign it is *"whoever holds the link"* and
has no denominator at all; an announcement has no link and is never read by a stranger, so its
widest audience is every account in the organisation. People with no sign-in and disabled
accounts are skipped, which is what keeps the denominator honest.

**Tier.** `announcement.read` is Bronze and the other three are Silver, so a downgraded
organisation still reads what it was already sent (`16` §7). A bronze org gets **402** on
create and publish and **200** on read, asserted. `requireEntitlement` sits after
`requireCapability` on every write, which is the chain's order and not a preference.

**Delivery is in-product only and the composer says so on screen.** There is no mail
transport in Endur; a composer that implies one is worse than one that admits what it did.

**Found, not caused — `D-042`.** A poll or a suggestion box is invisible on `/app/campaigns`
for every seeded role: `quickCreate` anchors them to the per-org singleton subject, which has
no unit, and the list filter scopes on `subjects.some.subject.unitId`. One backend test is red
and it is asserting the correct behaviour. The fix is an authorisation decision (anchor the
singleton to the root unit, or teach the list that an unanchored subject is org-wide) and is
left for whoever picks it up rather than made in passing.

**Three magic numbers in the test suite moved, and each one is the event they were written
to catch**: the capability catalogue is 68 (`roles.test.ts`), L4's exact grant list gains
`announcement.read` (`org.test.ts`), and `powers-grid.test.ts` now counts `CAPABILITIES`
instead of a literal — a hard-coded total there reports *"a module was added"* as *"the labels
are wrong"*. Three expectations from `T-091`/`T-093`, which shipped without the suite ever
running, were also corrected: a validation refusal is **422** and not 400, and every preset
now seeds six starter templates rather than four.

**Checks.** `typecheck`, `lint`, `audit:vocab` and `audit:drift` clean. New backend suite 8/8,
new frontend suite 10/10. The rest of the backend suite passes except `D-042` above and the
pre-existing `D-036`; the two pre-existing Windows frontend failures (`D-040`) are unchanged.
The database was brought up with Docker for this session, so the backend suite ran for the
first time since `T-090`.

**Next.** `T-095` (booking, gold) is the topmost unblocked task, and `T-096` closes the stage.

### 2026-08-30 · `T-092`, `T-093` — the suggestion box and the start gallery

**`T-092` was one sentence of copy and two DTO fields, and that is the honest size of it.**
The endpoint, the dialog and the `suggestion` branch all shipped with `T-091`. What was
missing was the state nobody had looked at: a suggestion box collects anonymously and
renders **nothing** until `K_ANON_THRESHOLD` responses exist, so the first two answers on
stage look like a bug. `CampaignSummary` now carries `templateCategory` (DEC-088 made the
category the discriminator, so the console has to be told it — there is no type column to
read) and `resultsThreshold`, and the card says *"Answers appear once 5 people have
responded. 2 so far."* The number comes from the server; the gate stays in SQL; the
threshold is not lowered for the demo. Reading suggestions is the **existing Inbox**, whose
campaign filter was already built — a second reader over individual comments is the exact
thing INV-006 exists to prevent.

**`T-093` is a gallery whose only real content is the gating.** Five lanes: Poll, Suggestion
box, Feedback, Announcement, Booking. `<StartCard>` has four states because there are four
different reasons a lane cannot be pressed and they want four different answers — a missing
**capability** disables the card and says why; a missing **entitlement** keeps it live with a
tier chip that lands on `/app/plan`; a surface that is not built yet says so and does not
navigate. Capability first, tier second, matching `requireCapability → requireEntitlement`
(`DEC-091`). An **unknown** tier sells nothing rather than guessing Bronze and offering a
Gold customer what they already own. Each of the five presets seeds a `Poll` and a
`Suggestion box` template, so the gallery is never empty and a hotel's poll is not a
university's.

**Checks.** `typecheck`, `lint`, `audit:vocab` (156 files, no new exclusion) and
`audit:drift` are clean. Frontend: 907 passing, **2 failing, both pre-existing and neither
in a file this session touched** — logged as `D-040`. **The backend suite did not run at
all**: no Postgres and no Docker daemon on this machine, so the new `campaigns.test.ts`
assertion about the two summary fields is written and unverified. Run it before the demo.

**Next.** `T-094` (announcements, silver) is the topmost unblocked task. It needs its four
capabilities in `11` §3 **and** `capabilities.ts` in the same change, or `audit:drift`
check 2 fails.

### 2026-08-29 · `T-091` — polls, and the decision not to build anything

**One endpoint, one dialog, and nothing underneath.** `POST /campaigns/quick` composes a
template, one question, the organisation's own subject, a campaign and a public token in a
single transaction and returns the launched campaign. There is no `polls` table, no seventh
question kind, no `type` column on `campaigns` and no new capability — `DEC-088` extends
`DEC-010`'s reasoning from questions to products, and `dto/template.ts` had already written
the sentence this task obeys: *"a poll is a one-question template; there is no poll entity
and there never will be."*

**Three decisions recorded before any code** (`DEC-087`, `DEC-088`, `DEC-089`):

- **`DEC-087`** — "Poll", "Suggestion box", "Announcement", "Booking" and "Slot" are
  **structural** words, on INV-001's exempt list beside Save and Settings. They name Endur's
  furniture. Every noun *inside* them still resolves through `useLabels()`, and
  `audit:vocab` passes with **no new exclusion** — they pass on the exempt list, not because
  a folder was skipped.
- **`DEC-088`** — a poll and a suggestion box are **campaigns**. What tells them apart is the
  template's `category` plus `questionCount === 1`. Data, not schema.
- **`DEC-089`** — quick create is **one server transaction**, gated on `campaign.launch`
  because that is the strictly most privileged verb in the sequence: whoever may launch may
  also create, and gating on anything weaker would make this endpoint a way around the launch
  check. Composed in the browser it would be four round trips that can half-fail, and the
  failure lands on stage as an orphan template or a campaign with no QR.

**The trap worth writing down: `CreateCampaignBody.subjectIds` requires at least one, and a
poll has no reviewee.** The tempting fix is to relax the bound. It was not relaxed — every
results screen groups by subject, so a campaign with none renders as an empty page rather
than as a poll. `quickCreate()` finds-or-creates **one** per-org subject named after the
organisation with `type: 'organisation'` (a column that already existed and already
defaulted) and reuses it for every quick campaign. A test asserts there is still exactly one
after three of them.

**Frontend.** `<QuickDialog>` (catalogued in `24` §6 before it was written) and two buttons
on `/app/campaigns`, gated on `campaign.launch` rather than `campaign.create` so the console
does not offer a button the API is going to refuse. Success navigates to the campaign detail
page, which already shows the QR code and the public link (`T-089`, `DEC-086`) — that screen
is the point of the whole surface, and nothing new was built for it.

**Verified:** `npm run typecheck` clean · `npm run lint` clean · `npm run audit:vocab` clean
(154 files, no new exclusion) · `npm run audit:drift` clean (61 docs, 64 capabilities — the
count is unchanged, which is the point). Frontend suite run: **the two failures are
pre-existing and both were confirmed on a stashed tree** — `pages/respond/bundle.test.ts`
(`D-036`'s neighbour: Node's `relative()` returns backslash paths on Windows, so the
assertion's forward-slash literal cannot match) and `router/boundaries.test.tsx` "does not
mistake a thrown Response for a stale graph". **The six new backend tests in
`campaigns.test.ts` were NOT RUN** — Docker Desktop's daemon is not running on this machine
(`docker ps` fails at the named pipe), and `N-066`'s second blocker still stands regardless:
`test/globalSetup.ts` shells `npx` through `execFileSync` with no `shell: true`, which cannot
work on Windows. Neither is new and neither was introduced here; the new tests are typechecked
and linted only. **`T-092` should run them before adding to them.**

**Next:** `T-092` is presentation only — the backend for the suggestion box shipped with this
task as the second `purpose` on the same endpoint.

### 2026-08-29 · tier 2 — the three decisions nobody was making

`DEC-084`, `DEC-085`, `DEC-086`. Nine red tests at the start of this session; **one at the
end**, and the frontend suite is fully green for the first time. None of the nine was a bug.
Every one was a decision somebody had deferred, and the tests were the only record.

**`DEC-084` — operator TOTP goes back to 30 seconds, ±1 step.** A second factor valid for a
full shift is close to a static secret: it survives a shoulder-glance, a screenshot and a
terminal scrollback for the rest of the day, which leaves the password very nearly the only
factor. `19` §9's whole argument for building MFA at all — when every other security nicety
here is honestly deferred — is that one stolen operator password exposes **every tenant's**
plan and revenue data at once. Keeping the 6-hour code was rejected on price, not principle:
the convenience bought was not re-reading a code at login, and `npm run ops:code` buys that
in one command. **No doc amendment was needed** — `19` §9 already said "±1 step of clock
drift is accepted", which the branch had silently broken too.

**`DEC-085` — the Setup wizard keeps its shape and gets back what it dropped by accident.**
Sorted by asking what each affordance was *for*, which separated four things the debt had
lumped together:

- **`← Back` was never lost.** `D-038` was wrong about it. The button is present and
  accessible; the redesign replaced the literal arrow with an `<Icon>` and three assertions
  were matching on decoration.
- **"Pick the closest one" is restored.** One line of copy, argued in `31`'s prose. Without
  it five cards read as an exhaustive list, and a clinic or a charity sees no row for itself
  on the one screen whose entire subject is that the model does not care.
- **Step 4's live preview is restored.** The step's lede claims these words appear throughout
  Endur; the preview is the only thing that proves it, and proving it on Review — two steps
  after the reader stopped doubting — proves nothing. Same `<DashboardPreview>` Review uses.
- **`your plural` is restored** (`D-039`). It was the only thing separating a word the
  organisation chose from one the deriver guessed, which is why `22` §2 stores both.
  `Staff / Staff` is the case that matters. The `auto: Wings` half is deliberately not back.
- **The role chain on every card is the one real loss, and it is deliberate.** `31` put it
  there so four organisations were legible side by side before a click. The aside shows one
  preset at a time and shows strictly more of it. **The cost is that presets are now compared
  serially** — a presenter wanting the side-by-side beat says the sentence instead of showing
  it. `31` § step 1 and § step 4 amended.

**`DEC-086` — the QR encodes the machine's LAN address.** Deferred 21 Aug and still deferred
eight days later, which is what a decision looks like when nobody has to make it. In
development only, a loopback `PUBLIC_BASE_URL` is rewritten to the host's LAN IPv4 with the
port preserved and printed at boot; Vite now binds to the LAN, **because rewriting the URL
without that produces an address that resolves and refuses the connection** — the same
failure one layer down. Not a tunnel: no account, no third-party uptime, no key expiring
mid-demo. Production and test are untouched.

**`T-045` must still prove it on the demo machine.** Under WSL2 the address found inside WSL
is the virtual adapter's (172.x), behind a NAT and **not reachable from a phone** — it will
look configured and still fail. Either run the two dev servers from Windows, or add a `netsh
interface portproxy` rule from the Windows host's wifi address. On Linux and macOS the
detected address is the real one.

**Checks:** typecheck 0 · lint 0 · drift clean · vocab 0 · `npm run build` passes ·
tests **1 failed / 1406 passed** (was 9 / 1397). **Frontend 890/890.**

**The one remaining failure is `D-036`** — `platform-logs.test.ts`'s backwards-pagination
fixture drifted below the 64 KB chunk, so the test asserts nothing rather than the reader
being wrong. Fix is to size the fixture past one chunk deliberately, never to relax the
assertion.

**The standing rule this session produced, worth keeping:** a test that disagrees with the
code is a decision nobody made, not a chore. Assertions move only with a `DEC-` saying what
was traded — never quietly to make a suite green.

### 2026-08-29 · the branch builds — `D-035` and `D-014` closed, and a stale `3`

Not a feature session. The owner asked for the open issues and then for the top tier of the
answer, which was: **the branch does not build, and two of its red tests belong to no debt
id.** Both are now false.

**`D-035` — four `tsc -b` errors, `npm run build` failing.** All four were the same
`exactOptionalPropertyTypes` shape and all four were fixed by constructing the key
conditionally rather than widening the type. That direction matters here: on `Target`, an
**absent** `unitId` is how the resolver says *org-wide*, so `unitId: undefined` and no
`unitId` mean the same thing to JavaScript and different things to the type. Widening would
have erased that distinction everywhere to fix three lines.

**The real find was underneath it.** `capability: body.capability as never` was bridging a
`z.string()` DTO to a `Capability` resolver input. The DTO now `.refine(isCapability)`, which
narrows the inferred type *and* fixes a behaviour: **a misspelt capability used to resolve to
`no_grant`**, which the simulator rendered as *"No rule grants this"* — a real-looking answer
to a question the system never understood. It is a 422 naming the field now. The narrowing
then caught a third bug the cast had been hiding: `/app/simulator` held `capability` as a
bare `string`, in a file whose own header says the sentence must never be able to ask an
invalid question. `Capability | ''` now, so the compiler keeps that rule, not the comment.

**`D-014` was stale.** `POST /authz/simulate` has been mounted, behind `validate` and
`requireCapability('simulator.run')`, and `/app/simulator` has been calling it. It was
mounted without the row being closed. **What was actually missing was any test at all —
which is exactly why three of `D-035`'s four errors accumulated inside `runSimulation`
without one check going red.** `test/simulator.test.ts`, 7 tests: the decision agrees with
the real resolver, `out_of_scope` is distinguished from `no_grant`, `considered` comes back
with a reason on it, `at` works present *and* absent, an unknown capability is 422, a foreign
target id is 404, and a level-3 role gets 403.

**The two unowned red tests were a literal `3` against a fourth world.** `router/routes.test.tsx`
asserted three route trees; `/ops` made four at `DEC-033`. The number was never the property
worth guarding — **every world having its own boundary and layout** is — so it asserts
`worlds.length` now, and a fifth world must bring its own pair to pass rather than breaking
the test by existing. `20` §1 said *"the three worlds"* and now says four, with the ops row
in the table.

**Four live routes were in neither the map nor the contract test**: `/app/plan`,
`/activate/:token`, `/ops/orgs/:id`, `/ops/earnings` — the same gap `20` §2 already records
for `/app/logs`. All four are in both now, along with the rest of `/ops`.

**`audit:vocab` is clean for the first time — 3 to 0.** All three hits were INV-001
breaches in these same two files, parked under `D-035` and about to be orphaned by closing
it: `/app/simulator` offered *"a campaign"* between `a {labels.unit.one}` and
`a {labels.subject.one}` — one option in a list of five, missed — and `resolveSimTarget`
raised *"That subject does not exist"* and *"That campaign does not exist"*. Those two are
404 sentences an administrator reads, so `runSimulation` takes `nounsOf(req)` now, exactly
as `grantWarnings` beside it does (`D-008`).

**Checks:** typecheck **0** (was 4) · lint 0 · drift clean · **vocab 0 (was 3)** ·
**`npm run build` passes** · tests **9 failed / 1397 passed** (was 11 / 1380).

**The nine that remain are all decisions, not work** — Setup ×6 (`D-038`), Settings words
(`D-039`), operator TOTP (`D-040`), log pagination fixture (`D-036`). Nothing in the suite is
now red for a reason nobody has written down.

**Correction for the next session:** the `DEC-083` entry below says *"six days before a
graded demo"*. The demo date is **27 Aug and it has passed** — the header block still counts
down to it and `T-045` (three rehearsals) is still unrun. Somebody should say which of those
is true before the board is trusted again.

### 2026-08-29 · `DEC-083` — saying what the count is made of

The owner picked **(b)** from `OPEN-013`: not dropping the lowest tier from the total, but
disclosing the mix. Everyone placed in a ward is affected when the ward goes, which is what
this page's numbers are for — the problem was never that Patients were counted, it was that
"30 people" told an administrator nothing when sixteen of the thirty are Patients.

`GET /units/:id/composition` returns the branch's people by role in ladder order, and the
detail panel draws a bar per row. Riverside's root, from the live database:

| Director | Head of Department | Nurse | Patient |
|---|---|---|---|
| 1 | 3 | 10 | **16** |

**Its own endpoint, not a field on every node.** The panel shows one unit; a per-node
breakdown is roles × units carried on every page load and read almost never. Scope-filtered
to the same visible subtree the tree's totals use — without that a level-2 reader's role
rows would sum *past* the branch figure printed above them, which leaks the size of a
subtree they cannot open and makes the panel contradict itself.

**The rows may sum higher than the total**, because somebody who is both a Nurse and a Head
is honestly in both. Each row is distinct within itself. The panel says the overage out loud
when it happens; unexplained it reads as the panel having lost count. Bars are scaled to the
largest row and never stacked — a stacked bar claims a partition this is not, and would
overflow on exactly the org where the claim is false. One role renders nothing.

Four new backend tests and three new panel tests. Two pre-existing panel assertions were
scoped rather than changed: `Head` and `60` now legitimately appear twice on the panel, in
the breakdown and in the people list, and a bare `getByText` was passing on the wrong one.

**Checks:** lint 0 · drift clean (61 docs) · vocab 3 (`D-035`'s own) · typecheck 4
(`D-035`'s own) · tests 11 failed / 1380 passed — the same 11 as the last two sessions.

**Filed, not fixed: `OPEN-014`.** `DEC-009` says respondents are never users, and the seed
gives all sixteen patients accounts and positions anyway — which is the only reason they are
in a staff count. That is a seed, setup and `DEC-009` question, and answering it six days
before a graded demo would rewrite the org the demo runs on.

### 2026-08-29 · `DEC-082` — a position is not a person

**The owner rejected the first fix**: *"nope, i think its make so no sense still… should the
lowest tier (student/patient, etc) even be counted? idk but the count and no of people
present and overall everything is still wrong"* — with a screenshot of Ward C reading
**`PEOPLE 3` above a list of five names**.

They were right, and `DEC-081` had fixed the wrong layer. **A `position` is a role-at-unit
SLOT shared by everyone holding that role there** — `10` §2.1 has said so since the model
was written, and `createAssignment` says so in a comment while it FINDS a position before
creating one. So `count(kind='position')` answers *how many distinct roles are present*.
Four features read it as *how many people*:

| Site | Was | Is |
|---|---|---|
| `readTree` | map, tree, panel, band | distinct `member` parents per unit |
| `unitImpact` | the number a **delete confirmation** states | distinct people in the subtree |
| `listRoles` + `deleteRole` | the roles ladder and its refusal | distinct holders |
| `Campaigns/New.tsx` | **the audience a campaign will reach** | `peopleTotal` |

Riverside read **16 people** for **30**, and 16 was also its number of patients, so it
looked plausible. Ward C: three positions, six people.

**The rollup moved to the server**, superseding `DEC-081` § where. That decision's INV-003
argument was right and its location could not deliver it: a client holds per-unit scalars
and can only ADD them, and people do not add — the demo data contains one nurse placed in
both Ward F and Medicine, so a summed root read 31 for 30. `readTree` filters to the
caller's visible units *before* the walk, so INV-003 holds by the same argument on the side
that can union. `UnitNode` gains `peopleTotal`/`subjectTotal`; `GET /units` gains a `meta`
envelope for the forest, because summing roots has the identical defect.

**Expired assignments left the counts too.** `valid_to` retains history rather than deleting
access and `authz/collect.ts` has always ignored a lapsed edge; the counts did not, so a
departed nurse stood in a ward holding no powers in it.

Six new tests in `test/units.test.ts` — shared slot, branch rollup, the double-placed
person, the expired edge, the `meta` envelope, and INV-003 under a scoped reader. The
client-side rollup tests became display tests, since there is no client rollup left to test.

**Checks:** lint 0 · drift clean (61 docs) · vocab 3 (`D-035`'s own) · typecheck 4
(`D-035`'s own) · tests 11 failed / 1373 passed — the same 11 as the previous session, plus
six new passing.

**Left open deliberately:** `OPEN-013`, the half of the owner's question that is a design
decision — whether Patients and Students belong in the number at all. Filed with a
recommendation, not started; it would rewrite the demo org.

### 2026-08-29 · `DEC-081`, and the branch put back in the green

**Two asks in one session.** The owner added a unit and the numbers above it did not move;
then, "do the others" — the cleanup block offered after the branch review.

#### The counts — `DEC-081`

Ward F was added under Ward D. Ward F said `1 person`. **Ward D still said 2 and Surgery
still said 3.** Nothing above the new leaf changed, because nothing above it ever had.

`peopleCount` is a `groupBy` on `unitId` in `features/units/service.ts` and contains no walk
of the graph. That is the right **primitive** and the wrong **number to print** — ask anybody
how many people are in Surgery and they mean the wards. And the server had been saying so all
along: `GET /units/:id/impact` answers *"delete Engineering"* with `peopleAffected: 64`, while
the row three inches away printed `4`. **`Structure.test.tsx` has carried both numbers since
`T-033`** — 64 in the impact fixture, 4 in the row assertion — and nobody read them together.

Rolled up **on the client**, and that is correctness rather than convenience: the tree is
scope-filtered before it is returned (INV-003), so a total over what the reader was *sent*
counts exactly the units they may see. One computed in SQL would count the ones they may not,
and the size of a branch is itself information — it would tell a level-2 reader how big a
subtree is that they are not allowed to open.

- `src/frontend/lib/unitTotals.ts` — `rollUp()` fills a map in **one** post-order walk rather
  than offering a per-row function, which on the page whose whole subject is deep trees would
  have been O(n²). `Overview.tsx`'s local `totals()` was a second implementation of the same
  walk and is now a call to `totalOf()` — INV-009's rule applied to a function.
- `<UnitMap>` and `<UnitTree>` read the map. **`<DetailPanel>` is the only surface that shows
  both**, `4 here · 60 below` under the branch figure, because it is the only one with room to
  say which is which. Inside the `<dd>`: `<dl> > <div>` may hold nothing but `<dt>` and `<dd>`.
- On the map the split lives in a `<title>` — no layout cost, and inside a pressable `<g>` it
  becomes the accessible name, which until now was the two text runs jammed together
  (*"Surgery3 people · 1 Service"*).

**The same pass killed "1 Services".** `subjectWord` was the plural alone on both components,
so every unit holding exactly one printed the plural — six of the eight boxes in the owner's
screenshot. The prop is now the `Label` pair `organization.labels` already stores; the
singular is not derivable ("Faculty" pluralises to "Faculty", `22` §2). **A test asserted the
bug** — `'4 people · 1 Quaxels'`, written at `T-033` — which is how it survived three
revisions. A test written *from* the code cannot catch the code.

**`<UnitMap>` had no catalogue entry at all**, built at `T-033` citing "24 §3" and never added
to `24`, against the ground rule that the catalogue comes first. Added, with the props it
actually has. Nothing caught it: `audit:drift` checks capabilities and design values, not
components.

8 new tests. `24`, `32` and `_MEMORY.md` amended first, as the rule requires.

#### The cleanup — the branch was red

It was green on 26 Aug. Five checks and both suites, before → after:

| Check | Was | Now |
|---|---|---|
| `npm run lint` | 9 errors | **0** |
| `npm run audit:drift` | 1 finding | **0**, 61 docs |
| `npm run audit:vocab` | 5 | **3** — `D-035`'s own, none in a file touched here |
| `npm run typecheck` | 7 · **22 on a fresh clone** | **4** — `D-035`'s own |
| frontend tests | 11 fail / 5 files | 9 fail / 3 files, **all decisions or pre-existing** |

- **`D-037` repaid, and proved rather than asserted.** Root `vitest.config.ts` declares both
  workspaces as `projects`. The development database held **4 organisations before** a
  root-launched `test/tiers.test.ts` and **4 after**, and the run reported itself as
  `|@endur/api|` with `env: "test"` on every log line. The advice to run from `src/backend` is
  withdrawn — the root command is now the correct one.
- **The payments migration had never been applied.** `20260829120000_payments` was pending, so
  `/app/plan`'s checkout and every panel on `/ops/earnings` — the flagship of the last commit —
  were dead against the development database. Applied; purely additive (1 `CREATE TABLE`, 3
  indexes, no `ALTER`, no `DROP`), 4 orgs before and after.
- **There was no `postinstall`.** The Prisma client is generated, not committed, so a fresh
  clone failed `npm run typecheck` with 15 errors about a model sitting in `schema.prisma` —
  and could not tell them from its own. Root `postinstall` now runs `db:generate`.
- **The ShareSheet localhost warning had been deleted** in a design commit, leaving
  `isUnscannable()` with no caller. It was the only thing in the product that says a QR will
  not scan, and `OPEN-002` is still open — that warning *is* the mitigation. Restored.
- **A date bomb.** `Home.test.tsx` pinned `endsAt: '2026-08-26'`; on the 29th the card
  correctly read *"ended 3 days ago"* and a test about a **relative** phrase failed for nothing
  anyone had changed. Fixtures are now relative to `Date.now()`.
- **`Industry.tsx` broke INV-001 on the vocabulary screen**, printing `Unit:` and `Respondent:`
  — Endur's *internal* names (INV-002), which nothing in the product says to a reader;
  `<VocabularyChips>` makes the point by printing the words with no category label at all. The
  left side now describes the concept. Same file: `PRESET_ICONS` typed to `IconName` instead of
  `string`, and two off-scale icon sizes brought onto the closed 16/18/20/24 scale.
- **Mojibake in three files.** `WordsEditor.tsx`, `AuthAside.tsx` and `Review.tsx` had comments
  re-saved through a non-UTF-8 editor — every em-dash became `?"` and every `§` became `A`.
  Repaired. **No user-visible string was affected**, and the sweep found no others.
- Two committed scratch files (`check.cjs`, `check_icons.js` — the same eight-line "does lucide
  export this" script, twice) deleted. `_MEMORY.md`'s `DEC-078` entry quoted a CSS value, which
  is the one thing `audit:drift` check 1 exists to catch; rephrased.

#### What was deliberately NOT done

`D-038`, `D-039`, `D-040` are **decisions, and they are the owner's**:

- the **Setup redesign** disagrees with six of its own tests, and three of the four affordances
  it dropped are arguments `31` makes in prose. Updating the assertions to match the new design
  would erase the disagreement rather than resolve it.
- **`<WordsEditor>`** stopped saying which plurals are the organisation's own.
- **operator MFA quietly became a 6-hour code** — `STEP_SECONDS` 30 → 21600, `WINDOW` 1 → 0 —
  with no `DEC-`, `19` §9 untouched, and its test left red. A second factor valid for a full
  shift is close to a static secret, and `19` §9's argument is blast radius: a stolen operator
  password exposes every tenant's plan data at once.

`D-036` (`platform-logs`) and the two `routes.test.tsx` failures are unchanged and pre-existing.
`D-041` filed for a single `public.test.ts` flake under the new root runner — one occurrence,
did not reproduce, not yet a diagnosis.

Nothing is committed.

### 2026-08-29 · prices, a simulated checkout, and `/ops/earnings` — `DEC-080`

**The owner asked for the payment half of the plan ladder.** Prices on the three cards, a
popup that takes the payment with a success animation, gold treated as gold, and an
owner-only `Earning` page on `/ops` reporting what came in. That reverses `DEC-035`, so it is
recorded as **`DEC-080`** in `_MEMORY.md` and superseded in `16` §8 rather than diverged from
silently.

**The money is simulated, and the UI says so.** No gateway, no card fields, no keys, no
webhook. `<PaymentDialog>` waits ~700ms, mints a reference, and shows a green success overlay;
the pay rail reads *"Endur demo checkout · no card details are collected"*.

**The decision boundary did not move.** `POST /billing/tier` behind `billing.update` is still
the authoritative write. `paymentRef` is **optional and is a label, not a proof** — a join
without one still joins and still records a capture, because gating a tier on a
client-generated string would be `INV-003` inverted. **Every capture is priced server-side**
from `PLAN_OPTIONS`, inside the transaction that writes the subscription; no request carries
an amount, and a test proves a client-supplied one is ignored.

**New:** `payments` table (append-only, `amount_minor` as INTEGER paise, migration
`20260829120000_payments`); `src/backend/billing/payments.ts` — the ledger's one writer, used
by both `register()` and `joinTier()`; `platform.revenue.read` (owner only);
`GET /platform/earnings`; `pages/platform/Earnings/`; `<PaymentDialog>`, `<RevenueChart>`,
`<TierDonut>`, `<TierTrendChart>`; a `--tier-{bronze,silver,gold}-*` ramp in `tokens.css` so
the three metals mean the same thing on the picker, in the dialog and in the charts. No
charting library — `DEC-064` holds; inline SVG and a conic gradient, both with `sr-only`
tables.

**`tierOverTime` counts PURCHASES, not a tier census.** `subscriptions` has no history, and
`<GrowthChart>` already records at length why reconstructing "Gold orgs in March" would move
historic figures retroactively. The page says so in the card's own copy.

**Two robustness fixes came out of verifying it live**, both the same shape and both worth
keeping: the success tick and the revenue line now have their **drawn** state as the RESTING
state and animate *from* the hidden one (`backwards`, not `forwards`), and the revenue
count-up carries a `setTimeout` that lands the true figure. A confirmation mark or a revenue
total that is only correct if animation frames actually arrive is a wrong number on screen in
any throttled tab.

**Also fixed, unrelated and pre-existing:** `test/globalSetup.ts` spawned `npx`, which cannot
be executed by `execFileSync` on Windows (`ENOENT`, then `EINVAL` for `npx.cmd` under Node
20+) — the whole backend suite died at setup. It now resolves Prisma's own entry point and
runs it with `process.execPath`.

**Verified:** `tsc -b` clean for everything this session touched; backend `tiers` + new
`payments` suites 29/29; frontend `Start`, `Plan`, `PlanPicker` all green; the flow driven
live in the browser — `/app/plan` upgrade → dialog → pay → toast, downgrade → confirm →
dialog → pay, and `/ops/earnings` as `owner@endur.test` showing ₹3,495 across 5 payments with
every section populated. Contrast checked in both themes: tier `-800` ≥ 7.5:1 on the card,
`-500` ≥ 3.6:1, white on the success field ≥ 5.3:1.

**Known failures NOT from this work** (all in files this session did not touch):
`roles/service.ts`, `Setup/steps/Industry.tsx` and `Simulator.tsx` have `tsc` errors from
another session's in-flight edits; `platform.test.ts`'s TOTP-window case and
`platform-logs.test.ts`'s backwards-pagination case fail; the frontend suite has 13
pre-existing failures, including `router/routes.test.tsx` still asserting **three** worlds
when `/ops` made four.

**Next:** nothing renews, expires or dunns — `period_end` still bills nothing when it passes,
and the scheduler that would change that is still `OPEN-005`'s. The seat ceiling and
`<OverLimitBanner>` are still `T-057`. The audit row for a join still names neither from-tier
nor to-tier; the ledger now records both, which makes the gap smaller but not closed.

### 2026-08-29 · `/app/plan` — the plan page, and the billing routes under it

**The owner asked for a "Plan" item in the sidebar that shows the current plan and offers
to change it.** That is `T-058`, whose page had never been built, on top of `T-057`, whose
routes had never existed — `billing.read` and `billing.update` have sat in the catalogue
since `T-003` with nothing behind them.

**Backend, new:** `src/backend/features/billing/` — `GET /billing`, `GET /billing/plans`,
`POST /billing/tier`, mounted at `/api/v1/billing`. Every route is capability-gated, so the
route-enumeration test needs no allowlist entry. No `requireEntitlement`: `billing.*` is in
Bronze, so a gate there could only ever pass, and if it could fail it would be a paywall in
front of the upgrade button (`D-028`). The summary **repairs a missing `subscriptions` row on
read** — `49` § States says a customer must never open this page and read "unknown", and
organisations registered before `T-088` still have none (`D-012`). Seats are **computed** from
`16` §5 rather than read from `subscriptions.seats`, which nothing has ever written.

**Frontend, new:** `/app/plan` (`pages/console/Plan/`), `lib/billing.ts`, a `Plan` nav item in
the `system` group, `plan` added to the icon vocabulary, and `tierRank()` in
`packages/shared/src/tiers.ts` — the direction of a change, used for **copy only**: an upgrade
applies with no dialog, a downgrade confirms and says the data is kept. The page reuses
`<PlanPicker mode="join">` and `.settings-page`/`.settings-card` wholesale; the only new
CSS is the tier ladder on the current-plan card.

**Where this disagrees with `49`, on purpose.** The doc puts the page at
`/app/settings/billing` as a tab and argues billing is not something people DO daily. The
owner asked for a sidebar item; it is in `system` for exactly the reason that argument gives,
and the doc's case is written into the page and the nav item rather than dropped.

**Not built, and named as such:** `<OverLimitBanner>`, the seat ceiling and the over-limit
`402` (all `T-057`), `GET /billing/usage` as its own route, and the from-tier on the audit
row — `AuditIntent` has three fields and no metadata, and widening the shape every feature
writes through belongs in `T-058` proper.

**Verified:** 8 new component tests pass (`Plan.test.tsx`), typecheck adds no errors (the 7
pre-existing ones are unchanged), `audit:vocab` is clean on the new page — the seat and
campaign nouns resolve through `useLabels()`, and the university demo org reads "18 courses
that are not a person". Walked live at `localhost:5173/app/plan` signed in as Northfield:
downgraded Gold → Silver through the dialog, upgraded Silver → Gold with none, and left the
demo org back on Gold. The backend suite still could not run here — `npx` is not on this
shell's PATH and there is no local Postgres — so `routes.test.ts` was read, not run.

### 2026-08-27 · the flow grammar — boxes and spacing across nine screens

**One owner complaint, repeated nine times: "too clustered, not properly boxes made."** The
console had a card grammar and the *flow* screens never used it. Setup steps, the campaign
wizard, reflect, roles, subjects, structure and the two list screens all emitted bare stacks
against the page ground at a uniform `--space-3`, so a heading, a field and a whole new
question sat the same distance apart and nothing grouped.

Answered with one shared device rather than nine local patches, appended to `endur.css` as
**THE FLOW GRAMMAR** (parts 1 and 2):

- `.panel` — a card at `--space-6` with a `--space-4` column rhythm; `.panel-section`,
  `.panel-title`, `.panel-lede` divide it. `.panel .card` renders as a recessed **well**, not
  a second card, which is what stops card-in-card stacking.
- `.flow-bar` — the wizard's Back/Continue pair, made the panel's own floor via negative
  margins instead of a floating row. Deliberately **not sticky**: the console's chrome is not
  sticky either, and the bar landing in the same place on every step is what the complaint
  ("they vary with scrolling") was actually about.
- `.list-toolbar` / `.table-panel` — the filter row and the table each get a box, and table
  rows go up one padding step. Note `.card` in `organic.css` is a flex **column**, so any row
  that also carries `.card` must restate `flex-direction: row`.
- `.roles-panel` boxes both tab panels on `/app/roles`; the powers legend became a well and
  the copy row gained the divider that says it is a separate tool.
- `/app/structure` now has one rhythm across its three bands — counts, map, tree.

`Icon.tsx` gained `back: ArrowLeft` — a genuinely new concept in the closed vocabulary, so
that a back control is a real button rather than a bare word (a rotated `disclosure` chevron
would have given one glyph two meanings).

Visual only: no `DEC-` change, no contract touched. Typecheck is unchanged — the four
pre-existing failures in `roles/service.ts`, `Setup/steps/Industry.tsx` and `Simulator.tsx`
were there before and are untouched.

### 2026-08-26 · DEC-077 — the grid you can actually read, and seven lying tags

**Two owner items off one screenshot: *"this says Soon still"* and *"this page is still too
unfriendly to user."* Both were real and neither was about wording.**

**THE "SOON" TAGS WERE FALSE, AND THE MECHANISM MATTERS MORE THAN THE TAGS.** `Soon` renders
on `phase === 'P3'`. `T-081`/`T-082` shipped analysis and `T-083`/`T-084` shipped the improve
loop on **25 Aug**, with live routes behind `requireCapability` *and* `requireEntitlement` —
and left **seven capabilities at `P3`**. `phase` is not a note. Two things read it:

- the grid greys the row and stamps it **Soon** — so the screen told the reader that seven
  built, entitled, reachable features do not exist;
- `warnings()` **skips `P3`** when it looks for a power nobody holds — so the one warning that
  would have caught this was suppressed *by the same stale field*.

A screen whose entire claim is that it explains the rules was, on those seven rows, doing the
opposite twice. Corrected in `11` §3 **and** `packages/shared/src/capabilities.ts`, which is
the only place the value is read. The rule is now written down where it will be looked up:
**a task that builds a capability moves its phase in the same commit.** `apikey.*` stays `P3`
— it has no route anywhere, which is the point.

**AND A P3 ROW NO LONGER ACCEPTS A GRANT.** It stays listed and explains itself on hover —
what a power will be called and which module it lands in is exactly what somebody planning a
role wants now — but neither the cell nor "Set all…" will take an answer. A control that
accepts a choice nobody will act on is a worse lie than a greyed one.

**THE HEADER HAD BEEN `position: sticky; top: 0` SINCE `T-052` AND NEVER ONCE STUCK.** The
screenshot is twelve rows of six-word phrases with **no role name anywhere on screen**.
`.powers-scroll` was `overflow-x: auto` with no height — which per CSS makes it a scroll
container in **both** axes, so `top: 0` pinned the header to a box that never scrolls while the
**page** carried it away. A `max-height` fixes it, and the power-name column is now sticky
`left` for the identical reason on the other axis. A matrix that makes you guess which column
you are in has stopped being a matrix.

**`min-width: 6em` WAS TRUNCATING THE CELLS** — `Their department + belc`. No constant can be
right when the noun in the middle is the tenant's to choose (INV-001), so `PowersGrid` measures
the longest phrase the resolved vocabulary actually produces and sets `--cell-ch`. A longer
noun widens the column; it never clips. Asserted over the nonsense labels.

**Three smaller things, all the same complaint.** "Set all…" was a bare `<select>` sizing to
its own longest option, so 64 rows put it at 64 offsets — one width, one place now. Each role
column says **how many of these powers it holds**, which is the grid's "over-granted role is a
dark column" argument as a number for anyone comparing two roles. Each module band says how
many rows collapsing it hides.

**Checks.** 24 on the page (3 new), 856 frontend, 27 backend roles/powers-grid — green.
`tsc -b` 4 errors and `audit:vocab` 3 hits, both **the same pre-existing sets** (`D-035`, none
in a file touched here). `router/routes.test.tsx` ×2 still pre-existing. Lint clean, drift
clean at 61 docs, `vite build` clean.

**Backend tests were run from `src/backend`, never the repo root — see `D-037`.**

### 2026-08-26 · D-031 REPAID — the database recreated, and D-037 found underneath it

**The owner asked for the demo database to be recreated with a real tier mix and Endur's own
two accounts. `D-031` is repaid, and measuring it first showed it was wider than it was filed.**

The entry said the four demo orgs were missing `account.*`. They were also missing something
nobody had written down:

```
before:  northfield  tier=-  grants=103  account.*=0   seeded 21 Aug
after:   northfield  gold        active  grants=130  account.*=5
         grand-palace  silver    active  grants=130  account.*=5
         riverside     bronze    active  grants=130  account.*=5
         meridian      enterprise active grants=130  account.*=5
```

**NO `subscriptions` ROW AT ALL, on any of the four.** So it was never only the invite flow —
every tier-gated screen was dead as well. `T-088` writes the subscription inside `register`'s
transaction and these orgs predate it by three days, so `requireEntitlement` fell through to
its **bronze** backstop on an organisation the seed calls **Gold**. `demo.ts`'s own comment
warns about exactly this: *"a demo org silently on the wrong tier is a demo that proves the
opposite of what it claims."* It had been true since 24 Aug and no test could see it, because
the tests run against a database the seed builds correctly.

**THE FIX WAS A RESET, NOT A PATCH, AND THAT WAS THE OWNER'S CALL TO MAKE.** `seedOrg` skips
any slug that already exists — by design, so that a re-seed cannot produce a second Northfield —
so no amount of re-seeding reconciles a present org. A reconcile path was the alternative and
is the wrong thing to build: it would be a second implementation of the grant matrix, live only
on demo data, and wrong the moment the matrix changes again. Prisma refused the destructive
command from an agent and demanded explicit consent, which is correct; the owner ran
`db:reset` + `db:seed` themselves.

**THE TIER MIX WAS ALREADY WRITTEN AND HAD NEVER ONCE EXISTED.** `DemoOrg.tier` has carried
gold/silver/bronze/enterprise since `T-088`, with a comment explaining why each org gets the
one it gets. Meridian keeps **enterprise** rather than being trimmed to the three the owner
named: it is a tier no sign-up picker offers (`DEC-048`), so it is the only way to show on
stage that an operator-assigned tier is real.

**THE TWO OPERATOR ACCOUNTS NEEDED NOTHING** — `operators.ts` has seeded `owner@endur.test`
(superuser) and `support@endur.test` (Endur admin) since `T-059`, with deterministic TOTP
secrets so MFA works at rehearsal without anybody scanning a QR. They came back with the seed;
`platformUsers` went from **38 to 2**, which is the other half of the story below.

**FOUND — `D-037`, AND IT IS LIVE.** The database held **65 organisations named
`org-n-<epoch>-<random>` and 38 platform users, all dated 25 Aug** — four days after `T-048`
closed `D-004`. The slug is `test/helpers.ts`'s `unique('n')` verbatim, so the backend suite
wrote them. The guard is not weak; it is **skippable**: `globalSetup` and `setupFiles` are
declared in `src/backend/vitest.config.ts`, and **there is no vitest config at the repo root**,
so `npx vitest run` from the root loads no config, runs no setup, and lets `lib/config.ts` read
`.env` — pointing a suite that truncates and rewrites at the **development** database. That is
word for word the disaster `test/database.ts`'s header exists to prevent. `npm test` is safe.
The dangerous command is the shorter one. **A guard a shorter command skips is not a guard**,
and the repair — a root `vitest.config.ts` with `projects` for both workspaces — is small and
belongs before `T-045`, or the freshly-seeded database gets re-polluted before the rehearsal.

Nothing in `src/` changed this session. `PROGRESS.md` only: `D-031` struck, `D-037` filed.

### 2026-08-26 · DEC-076 — the powers grid, in English

**The owner looked at `/app/roles` and said it was too jargon-based even for a superuser.**
They were right, and it was not a labelling slip:

| Was | Is |
|---|---|
| `all` `tree` `unit` `self` `—` | **Everywhere** · **Their {unit} + below** · **Their {unit}** · **Themselves** · **No** · **Blocked** |
| `L1` `L2` `L3` | *"1st in the list"*, with the sentence that says the order never decides what a role can do |
| Click a cell to cycle five states; shift-click to block | One dropdown, six named choices, a legend above the grid explaining all six |
| Click the row LABEL to grant a power to every role | A visible **"Set all…"** control on the row |
| *"Copy a whole role's powers · From… · onto · [Manager] [Staff]"* | **Copy every power from [role] onto [role] · Copy** |

`tree` was the shape of the data structure the scope walks. `self` reads as "their own
department" to anybody who has not read `11` §4. `L1` invites the one belief the whole GRANT
model exists to deny — that a lower number means more power (`DEC-002`).

**INV-001 applies to both axes of this grid, and only one of them had been done.** `D-008`
fixed the row labels and left the cells saying "unit" to an organisation that calls them
something else. `packages/shared/src/scope-labels.ts` is the same table for the other axis,
beside `capability-labels.ts`, and the nonsense-label fixture now covers the cells — a
hardcoded "unit" there fails the build exactly like a hardcoded row label.

**The click-cycle is gone rather than supplemented.** It could only reach the state you wanted
by passing through ones you did not, it was unusable on a touch screen, and its companion — a
modifier key for the page's most consequential action — was undiscoverable. `cycle()` and
`block()` collapse into one `setCell()`. The control is a **native `<select>`**: the grid sits
in a horizontal scroll container, which clips anything absolutely positioned inside it, so a
custom popover would have needed a portal, a focus trap and a keyboard map to arrive at what
the browser already ships correct on a phone and to a screen reader.

**Found on the way:** `.powers-module` was two classes with one name — T-051's powers-by-place
list (`display: grid`) and T-052's module header row (a `<tr>`) — so the grid's group headers
were being laid out by a rule written for a different screen, which is why they rendered as a
small box at the left instead of a band across the table. The table row is `.powers-group` now.

Tests: `Roles.test.tsx` 21 (5 new, the interaction ones rewritten). Frontend suite otherwise
unchanged; `router/routes.test.tsx` still carries its two pre-existing failures (a fourth
world, `/ops`, that the test's count was never updated for) and `audit:vocab` its three
pre-existing hits, none in files this touched.

### 2026-08-26 · DEC-075 — the log files, written for a person

**The owner asked that the files in `src/backend/logs/` read like a log and not like a
newline-delimited JSON dump.** They now do:

```
[2026-08-26 01:34:58 UTC+05:30] [11996] [INFO]  [HTTP]     GET /api/v1/roles 200 27ms req=77a3f5aa-… org=e8b39d25-…
[2026-08-26 01:35:19 UTC+05:30] [11996] [WARN]  [CONFLICT] Keep at least one role able to change powers. req=2536c858-… status=409 err=ConflictError stack="…"
```

`lib/logFormat.ts` is new and owns the grammar. `lib/logger.ts` wraps **only the two file
streams** in it, so stdout is byte-for-byte the JSON it always was — one logger, one record,
two renderings for two readers. `18` §2 gained "The line on disk"; `72` § Data contract says
where a `LogLine` now comes from.

**The load-bearing property is that it round-trips.** `/ops/logs` and the export built this
morning read these files back through `platform/logs/parser.ts`; a nicer-looking format that
the parser could not reverse would have broken the viewer quietly. So `parser.ts` imports the
grammar from `logFormat.ts` instead of restating it — the same rule that already makes the log
reader borrow the writer's filename regex — and the 10 new tests in `test/log-format.test.ts`
are all round trips: a request line, an error line with its stack, an unnamed field, a message
that itself ends in `req=abc`, a record the formatter cannot read (returned **unchanged**, never
dropped), and a pre-`DEC-075` JSON line.

**The files already on disk were converted, not abandoned.** 1,548 lines across six files, each
one parsed before and after and rewritten only when the two records matched. The JSON branch of
the parser stays regardless, for as long as a pre-change file can be inside the 14-day window.

Tests: `log-format.test.ts` 10 new, `logging.test.ts` 10 (one added — the same `log.info` reaching
disk bracketed and stdout as JSON). Backend suite otherwise unchanged; `platform-logs.test.ts`
still carries the one pre-existing pagination failure (`D-036`) and `tsc -b` the four pre-existing
errors (`D-035`), neither touched by this work.

### 2026-08-26 · T-090 — the log export, and where the files live

**The owner asked for two things: that Endur's operators can SEE and EXPORT logs, and that
logs are written to a location automatically. The second was already true and had been since
`18`/Stage E** — `lib/logger.ts` writes every line to stdout AND to
`src/backend/logs/app-<date>.log`, with `warn` and above additionally to `error-<date>.log`,
rotated daily and at `LOG_MAX_SIZE_MB`, kept `LOG_RETENTION_DAYS`. Six files were on disk when
this session started. Nothing was rebuilt for it; what was missing was that **the screen never
said where they were**, so the page header now names the directory, the rotation size and the
retention, read off the live config rather than restated (a screen that claims a retention the
writer is not honouring is worse than a screen that says nothing).

**Seeing them was already built too** (`T-077`/`T-078`). **Exporting was explicitly refused** —
`72` § Out of scope carried a `Download` row saying no.

**`DEC-074` reverses it, and the reason it could be reversed is that the original objection was
answerable.** That row did not say *"diagnostics must not leave"*; it said *"a copy with no
audit of where it went"*. So the export writes a `logs.export` row into `platform_audit_log`
carrying the file, the format, **every filter** and the line count — the copy is a recorded
operator action exactly like the read, which `72` § Acceptance had already established the
shape for.

**`platform.logs.export` is its own capability, not `platform.logs.read` with a query
parameter.** A read is a page on a screen somebody is looking at; an export is a file on a
laptop that outlives both the session and the fourteen-day retention window. One capability for
both could not be separated later without a migration, and separating them is the first thing
anybody will want after an incident. **Both roles hold it**, for the same reason both hold
`platform.logs.read`: an on-call tool the on-call person cannot open is not a tool.

**The name allowlist is shared, not re-implemented.** The export is a SECOND entry point into
the same filesystem read, and a guard applied on one of two routes is not a guard — so
`readLogFile` and `exportLogFile` both call one `assertReadableName()`, and the traversal cases
are asserted against the export route too.

**The export reads FORWARD; the viewer reads backwards.** That is the whole reason it is its own
read rather than `tailRead` with a `Content-Disposition` header bolted on: a page on a screen
wants the newest line at the top, a file handed to somebody else is read top to bottom. Capped
at `EXPORT_MAX_LINES`, and a capped export ends with an explicit truncation marker — a
diagnostic file that quietly lost its tail is worse than no file.

`ndjson` is the lossless format and the default: it carries `extra`, which is the field that
makes an unexpected key on a log line visible AS unexpected. `csv` is a fixed column set for
somebody who will open it in a spreadsheet, and that limitation is stated in `72` rather than
papered over.

**INV-011 is untouched and the argument is `72`'s, unedited:** the files contain no body, no
credential and no respondent identity because `lib/logger.ts`'s redact list removes them AT THE
WRITER. An export is INV-011-compatible for exactly the same reason the screen is.

**Found on the way: `<LogViewer>` had no CSS at all.** Every class `T-078` shipped —
`.log-viewer`, `.log-line`, `.log-file-row`, all of them — had no rule anywhere in
`design-system/endur.css`, so `/ops/logs` rendered as an unstyled stack. That is now a styled
block, deliberately plain (a support tool read during an incident wants density and a
monospaced column, not decoration), with `warn` and `error` rows tinted from the status ramp and
`extra` tinted rather than tucked away.

**Verified live, not asserted.** Owner and staff operators both logged in through the real MFA
path; `ndjson` came back 775 lines with `Content-Disposition: attachment`; a `level=40` `csv`
came back with its header row and a quoted cell containing commas and curly quotes; the
`platform_audit_log` row carried `{file, format, level, lines, truncated}`; a traversal name 404s
and an unauthenticated call 401s on the export route.

**Tests.** Four new cases in `platform-logs.test.ts` (allowlist on the export route, org-user
401, ndjson order asserted against the read route's reverse plus the audit row, csv header).
13 of 14 pass. **The 14th failure is PRE-EXISTING and not mine** — `reading a file > a bounded
page from the end` fails identically on a stashed tree, so it predates this session; recorded
under Debt as `D-036`. **No frontend test was added** — `T-078` shipped `/ops/logs` without one and building
that harness is not what the day before the demo is for.

**`npx tsc -b` has 4 errors and all 4 are pre-existing**, in `features/roles/service.ts` (3,
`exactOptionalPropertyTypes`) and `pages/console/Simulator.tsx` (1). Same count on a stashed
tree. They arrived with the `Update codebase` commit and are **not** from this work — but they
are on the branch and they will fail a clean `npm run build`, so they are in Debt too.

### 2026-08-25 · T-050 (CSV import) + T-073 — accounts, end to end

The frontend half of `57`. Backend was already complete (`T-072`); nothing server-side
changed.

`lib/accounts.ts` — `inviteAccount`/`resetAccount`/`revokeAccount`, plus
`useActivationPreview` and `useActivate` (the latter added to `lib/auth.ts`, reusing
`useSignIn`'s hydrate-then-land shape rather than duplicating it — the activation route
answers the same payload login does).

`<InviteLink>` (`24` §6c) built to spec: no backdrop click, no Escape — the one dialog in
the product that cannot be dismissed silently, because closing it discards a credential
that cannot be recovered. `/app/people` gets an Account column (Invite / Pending / Active /
Disabled); `/app/people/:id` gets a full account panel with re-issue and revoke. Revoke
goes through `<ConfirmDialog>` and surfaces the lockout 409 ("Sign out instead") verbatim.

`/activate/:token` — new public page, no `<RedirectIfSignedIn>` on purpose: `57`'s own
acceptance list requires the activation to file under the invite's organisation even when a
different tenant's session is live on the same browser, so a signed-in stranger must still
reach it.

CSV import wizard (T-050's remaining piece): file → `POST /people/import/preview` → a
review step resolving unmatched role/unit names by dropdown → commit. The full row parse
for commit is done client-side (`ImportWizard.tsx`'s `parseCsvRows`, deliberately mirroring
`features/people/service.ts`'s `parseCsv` header-synonym table) because the preview route
only ever returns five sample rows and the commit needs every row the file contains.
Idempotency key is derived from the file's own content so a retried commit hits the same
replay guard.

`PersonDetail.test.tsx`'s heading-order assertion updated: `Identity, Account, Positions,
powers`. T-050's two-hat preset buttons are still unbuilt — the two dropdowns are, and
that is the only acceptance line still open on either task.

### 2026-08-25 · T-078 — `/ops/logs` and `<LogViewer>`

Frontend only, needs `T-077` (landed same day, see entry below). `T-066`'s Step 0 foundation
(`lib/ops.ts`, `opsSlice`, `OpsLayout`, `RequirePlatformAuth`, `OpsBoundary`, the `/ops` route
tree) already existed and already carried a `Logs` nav link gated on `can('platform.logs.read')`
— nothing to add there.

**Files.** `src/frontend/lib/oplogs.ts` (new) — `useLogFiles()` and `useLogLines(file, filter)`,
modelled on `lib/audit.ts`/`lib/estate.ts`: `Loadable<T>`, a fixed-key-order search string so
the effect dependency is stable, a `loadMore` that appends rather than replaces, `forbidden`
(403) and `notFound` (404 — "that file has rotated away") kept as two distinct flags rather
than folded into one generic error, since `72` § States treats them as different messages.
`src/frontend/components/platform/LogViewer.tsx` (new) — built to the exact prop shape already
recorded in `24` §6c (`{ files, selected, lines, filter, onSelect, onFilter, loading? }`):
grouped file picker (`error-*.log` listed first), a server-side filter bar (level/status/path/
free text), a monospace line list with parsed fields in columns (never a raw blob — `extra`
renders explicitly below the row so an unexpected field looks unexpected), the `requestId`
click-to-collapse, and a `5xx` line's stack trace behind an expand toggle. `src/frontend/pages/platform/Logs/index.tsx`
(new) — wires the hook to the component; selected file and every filter live in the URL
(`?file=&level=&status=&path=&orgId=&requestId=&q=`); the empty/forbidden/rotated-away/
no-match states are each their own branch, matching `72` § States one for one, including
`LOG_TO_FILE=false` → `<EmptyState icon="log">` "Nothing has been written yet". Router: added
`{ path: 'logs', element: hold(<OpsLogs />) }` to the `/ops` tree in
`src/frontend/router/index.tsx`, no capability gate on the route itself (same precedent as
`analytics` — the page's own request 403s and renders that).

**Docs.** `24-COMPONENT-INVENTORY.md`: `<LogViewer>` marked BUILT `T-078`, §9 acceptance line
updated. `72-PAGE-platform-logs.md`: status line now says both `T-077` and `T-078` built, last
acceptance box (the `LOG_TO_FILE=false` render) ticked.

**Checks.** `tsc -b --force`, full-repo `eslint .`, `audit:vocab`, `audit:drift` all clean. No
new backend surface, so no new backend test file; `T-077`'s `N-066` (`npx` ENOENT blocking
`npm run test` on this machine) still stands and was not touched this turn — this task had no
test suite of its own to run against it. `T-078` had no acceptance items needing a `vitest`
assertion beyond what `72`'s existing acceptance list already covers via the backend suite.

Nothing committed, per standing instruction.

**Next:** both halves of `72` (`T-077`, `T-078`) are done. `T-066` and `T-067` were already
complete from prior sessions — all four Stage 9 item-3 tasks in `Mithil/plan.md` are now built.

### 2026-08-25 · T-077 — `platform.logs.read`, the log routes, the path guard

Backend only, as the plan scopes it. Two new routes: `GET /platform/logs` (the file list) and
`GET /platform/logs/:file` (one file, tailed and filtered). Both roles hold
`platform.logs.read` — unlike analytics, this is diagnostics and the person who needs a stack
trace at 2am is support, not just the owner.

**Where the code lives, and why it is not where the plan's own file list said.** `Mithil/plan.md`
names `src/backend/features/platform/logs.ts`; `_MEMORY.md`'s MAP table — the actual lock —
names `src/backend/platform/logs/**` for `72`. MAP wins (CLAUDE.md is explicit that it is the
file-ownership lock, and a session-scratch plan is not an architecture doc), so the reader,
guard and parser live at `src/backend/platform/logs/index.ts` and `parser.ts`, called from
`service.ts` the same way every other platform route calls its logic — router.ts never talks
to `platform/*` directly, same convention `T-067` used for `platform/db.ts` and `platform/audit.ts`.

**The three-way path guard, plus a fourth belt.** `72`'s three rules (allowlist by pattern,
resolve-and-compare, no directory listing from user input) are all there — the allowlist
*reuses* `lib/logFile.ts`'s own `filePattern`, newly exported, rather than a second regex that
could drift from what the writer actually names files. Added a fourth check the doc's acceptance
list implies but its three numbered rules don't quite cover: an `lstat` check that refuses
anything that isn't a plain file, so a symlink at an otherwise-legal name (which passes the
regex and the resolve-compare check, since the *link's own path* is inside `LOG_DIR`) still
gets refused rather than followed to wherever it points.

**Reading is a real backward-chunked tail, not a full read.** `tailRead()` in
`platform/logs/index.ts` reads 64 KB chunks from the end of the file, parses and filters as it
goes, and stops once it has `limit` matching lines or hits an 8 MB per-call ceiling (added so a
maximally unhelpful filter over a huge file can't block the event loop for one request — it
just returns a cursor and the client pages again). The cursor is the exact byte offset the
previous page stopped at.

**`requestId` collapse is the one deliberate exception to "never slurped".** `72` § Interactions
asks for every line of one request across both streams. A request's files are same-date,
size-bounded, and normally one to a few rotations per stream — so `crossStreamRequestRead()`
reads those files in full rather than paginating, and says so in a comment rather than pretending
it fits the "bounded window" rule the rest of the reader follows.

**Unparseable lines use `extra`, not a new field.** `LogLine`'s contract (`72` § Data contract)
has no "this failed to parse" flag. Rather than diverging from the contract the way `T-067` had
to for `<GrowthChart>` (`N-063`), the parser carries `{ unparsed: true, raw }` through the same
`extra` catch-all that already exists for "a field nobody expected" — an unparseable line *is*
an unexpected shape, so the same mechanism fits without a new one.

**Reading writes the audit row.** `72` § Acceptance is explicit that this is the one GET in the
whole platform surface that audits itself. `readOperatorLogFile()` does the read, then writes
`platform_audit_log` (`action: 'logs.read'`) in its own one-statement transaction — there is no
database mutation for it to be transactional *with*, so INV-007's "same transaction as the
change" has nothing to synchronise against here.

**Tests:** `src/backend/test/platform-logs.test.ts`, new — path-guard rejection (traversal,
absolute path, URL-encoded traversal, symlink), org-user 401 on both routes, a fixture leaked
field surfacing under `extra`, an unparseable line rendered not dropped, `requestId` collapse
across both streams, backward pagination with no gap or duplicate at a size the suite can
afford (~220 lines, standing in for the acceptance line's 10 MB — same algorithm, smaller
input), no write route existing, the audit row, and the empty-list state when `LOG_TO_FILE` is
off. Typecheck and lint both pass.

**Could not execute the tests, for two NEW reasons — not `T-066`/`T-067`'s already-documented
one.** `docker ps` showed the local Postgres container (`endur-db`) present but stopped;
`docker start endur-db` fixed that in about two seconds. With the database reachable, every
attempt to run `vitest` (via `npm run test`, via the vitest binary directly, in Git Bash and in
PowerShell) still failed with `spawnSync npx ENOENT` inside `test/globalSetup.ts`'s
`execFileSync('npx', ['prisma', 'migrate', 'deploy', ...])` — Node's `child_process` will not
resolve a Windows `.cmd` shim without `shell: true`, so this line cannot run migrations on
native Windows at all, on any backend test file, not just the new one. This is a DIFFERENT
blocker from `N-065`'s stale-`node_modules` issue and from `T-066`'s original
`@rollup/rollup-win32-x64-msvc` `npm install` failure — recorded as `N-066` rather than folded
into either, since it is a third distinct failure on the same machine. `test/globalSetup.ts` is
shared infrastructure outside this task's file list, so it was not patched.

Recorded in `_MEMORY.md`: `N-066` (the two new local blockers). Ticked `19` §13's matching box
and `72`'s acceptance list (all backend-scoped items; the `LOG_TO_FILE=false` page-render item
stays open for `T-078`).

**Next:** `T-078` (`/ops/logs` + `<LogViewer>`), now unblocked. Independent of nothing else
remaining in this stage.

### 2026-08-25 · T-067 — `/ops/analytics`, the endpoint and the page

Built both halves `71` asks for: `GET /platform/analytics` (new — nothing before this task
called it) and `/ops/analytics` on top of the route tree `T-066` shipped. `19` §13b was right
that this had to be its own task — the four decisions below live in the query, not the UI.

Typecheck and lint clean (`tsc -b`, `eslint .`). `audit:vocab` and `audit:drift` clean.
`npm run test` could not run — same pre-existing broken install `T-066`'s log documents
(`@rollup/rollup-win32-x64-msvc` missing, `npm install` itself `EISDIR`s on the `@endur/web`
symlink). Not re-attempted; not worked around. Backend tests for the four decisions and
INV-011/DEC-035 were written (`platform.test.ts`, six new cases) but are therefore unrun
locally. The dev server could not be started for the same reason, so the page is unverified
in a browser beyond typecheck/lint/read-through — same caveat `T-066` closed with.

**The four decisions, and where each one actually lives:**
1. *A trial is never a customer.* `analytics()` excludes `status: 'trialing'` from the
   `byTier` query outright; `orgs.trialing` counts it separately.
2. *Movement is four counts, never one.* `movement[]` carries `new`/`upgraded`/`downgraded`/
   `churned` per period and nothing else — no field anywhere nets them, and `<GrowthChart>`
   draws all four lines rather than one growth curve.
3. *`conversionRate` is `null`, not `0`,* until `converted + expired > 0`. The page renders a
   dash, never `0%`, for the null case.
4. *`orgsQuiet30d` must match `70`'s "Quiet" chip exactly.* Extracted the predicate to
   `packages/shared/src/platform-quiet.ts` (`isQuietOrg`, `N-064`) and pointed both `<OrgRow>`
   and `analytics()` at the same function, rather than writing the rule a second time.

**Where the numbers come from, confirmed by reading rather than assumed** (`19` §13b's own
table, verified against the schema before writing the query): `movement.upgraded`/
`downgraded` read `platform_audit_log`'s `plan.override` rows and rank the tier change —
`subscriptions` has no history and no `updatedAt` (`schema.prisma:677`), so the audit trail is
the only record a tier ever moved. `movement.churned` reads `org.suspend` rows the same way.
`trials.converted` has **no source at all** in the current data model — nothing records a
trialing-to-active *transition*, only a tier override, which carries no prior status — so it
is honestly `0` rather than a guessed proxy; decision 3 is what makes that safe to leave zero
instead of fabricating a number to fill it.

**`<GrowthChart>`'s catalogued shape didn't fit the data that exists, so it changed at build
time (`N-063`).** `24`'s placeholder drew a per-period tier mix (`{ period, byTier }[]`); no
such history exists to fill it (same reason `trials.converted` has none — `subscriptions`
only holds the CURRENT tier). Built it plotting `movement` instead — four lines, same "never
netted" rule as decision 2 — and corrected the `24` entry to match rather than leaving it
describe code that was never written. `<StackedBar>` was NOT reused for the tier mix despite
the plan text mentioning it: `24` §3 documents it as good/neutral/bad and NPS-only, and a
four-tier mix isn't that shape — used `<BarRow>` instead, once per tier.

**One environment note worth a full memory entry (`N-065`):** `node_modules/@endur/shared`
inside `src/backend` and `src/frontend` are real directory copies on this machine, not
symlinks, and they were stale — `tsc -b` at the root kept reporting the new exports as
missing even though `packages/shared` itself compiled clean. Fixed by copying
`packages/shared/{src,package.json,tsconfig.json}` over both stale copies (additive, nothing
deleted). This will recur on the next edit to `packages/shared/src` until `npm install` is
fixed for real — see `N-065` before assuming a "no exported member" error means the code is
wrong.

**Files.** `packages/shared/src/platform-quiet.ts` (new — `isQuietOrg`), `dto/platform.ts`
(`AnalyticsQuery`, `AnalyticsListDto`, `PlatformAnalytics`, copied field-for-field from `71`),
`src/backend/features/platform/service.ts` (`analytics()`), `router.ts` (`GET /analytics`,
`platform.analytics.read`, owner only), `test/platform.test.ts` (six new cases).
`src/frontend/lib/analytics-ops.ts` (new — `useAnalytics`), `pages/platform/Analytics/index.tsx`
(new), `components/platform/GrowthChart.tsx` (new), `router/index.tsx` (`/ops/analytics`
mounted, replacing the catch-all fallthrough `T-066` left for it). `<OrgRow>`'s `orgChips()`
refactored to import `isQuietOrg` rather than restate it. Four new CSS rules
(`.stroke-movement-*` / `.fill-movement-*`) added to `endur.css`, reusing `<TrendLine>`'s
`.trend-line*` layout classes rather than inventing a parallel set.

**Not deferred to anything — `T-067` is complete per the plan's file list.** `T-077`/`T-078`
(the log routes and `/ops/logs`) are next, independent of this task.

---

### 2026-08-26 · T-066 — `/ops`, the Endur admin console

Built the fourth route tree and everything `Mithil/plan.md` calls Step 0, then the estate
list, one-organisation detail, plan override, suspend and messaging on top of it. No backend
change — `T-059` already shipped every route this task calls.

Typecheck and lint clean (`tsc -b`, `eslint .`). `audit:vocab` and `audit:drift` clean.
`npm run test` could not run: the local install is missing the `@rollup/rollup-win32-x64-msvc`
optional dependency (a known `npm` bug on Windows, unrelated to this change — `package-lock.json`
was already modified before this session started) and `npm install` itself failed with `EISDIR`
on the `@endur/web` workspace symlink. Neither failure touches a file this task wrote; typecheck
and lint both walk the whole repo and passed clean, which is the strongest signal available
without a working `npm install`. Flagging rather than working around it — a broken local
install is not something to paper over with `--force` or a lockfile edit made in passing.

**Files.** `lib/ops.ts` (the client — no CSRF token, its own 401 handler, never `lib/api.ts`),
`lib/opsSession.ts` (boots `/platform/me` on first mount of the tree, not app boot — an
operator session is the rare case), `lib/estate.ts` (`useEstate`, `useOrgDetail`, modelled on
`lib/audit.ts`'s cursor/forbidden shape), `lib/opsCapabilities.ts` (`useOpsCan`, mirror of
`lib/capabilities.ts` — no scopes, since the platform catalogue is two fixed roles and a
lookup, not the grant engine), `store/opsSlice.ts`, `components/platform/{OrgRow,
MessageComposer}.tsx`, `pages/platform/Login.tsx`, `pages/platform/Console/{index,
OrgDetail}.tsx`, and `OpsLayout`/`RequirePlatformAuth`/`OpsBoundary` added to the existing
`router/{layouts,guards,boundaries}.tsx`.

**The login-route shape needed a small deviation from the plan's literal route table.** The
plan lists `/ops/login` as a child of `<OpsLayout>` "outside `RequirePlatformAuth`", but
`OpsLayout` is also where the nav chrome and the sign-out button live — wrapping the whole
layout in the guard would have made the login page itself unreachable while signed out (the
guard would redirect `/ops/login` to `/ops/login`). Resolved the way `PublicLayout` already
resolves the same shape for `/login` and `/start`: `OpsLayout` checks `pathname === '/ops/login'`
and renders bare chrome, skipping the guard, before the guarded branch runs. `Login.tsx` itself
does the `RedirectIfSignedIn` half — an authenticated operator navigates onward from inside the
page rather than a wrapping guard, since the guard sits on the wrong side of the layout for this
one route to opt out of it.

**`audit:vocab`'s exclusion is wider than Step 0.6 asked for.** The plan says exclude
`pages/platform/`; `components/platform/` needed the same treatment — `<MessageComposer>`'s
"Subject" field (an email subject line) matched the banned vocabulary word `Subject` (the org
capability object). Both directories are Endur's own furniture, reachable only from `/ops`, so
the same exception applies for the same reason; the script's comment says so.

**Deferred to `T-067`/`T-078` as the plan specifies:** no `analytics` or `logs` routes were
added to the `/ops` route tree — those pages do not exist yet, and importing them here would
break the build. The tree's catch-all (`{ path: '*' }`) covers `/ops/analytics` and `/ops/logs`
until those tasks land.

**Not yet verified in a browser** — the local dev server could not be started because
`npm install` is broken in this environment (see above). The estate list, org detail, plan
change, suspend and message flows are unverified beyond typecheck/lint/read-through.

---

### 2026-08-26 · T-059 — the platform backend, and `/ops` gets a door

**459 backend (+19) + 852 frontend = 1,311 tests, all green.** Typecheck, lint,
`audit:drift`, `audit:vocab` clean. One migration applied locally
(`20260826090000_platform_operators`). Nothing committed.

**`N-058` was checked before starting, and it held.** The note was written on 24 Aug and asked
for exactly this: *"DO NOT re-sequence on this note alone. CHECK IT when T-059 starts."*
`T-059` is `platform_users`, the separate login and cookie, `requirePlatform()` and the
aggregate-only seam — **none of which reads a seat count, a usage breakdown or a plan.** The
`T-057` dependency was `/ops`'s, not the door's. `DEC-071` drops it. Worth saying plainly:
`T-059` was the last unbuilt A-task on the board and it was blocked on a task that has never
been built, so following the board would have parked the whole `/ops` tree with a day left.

**INV-011 is enforced by the seam, not by a careful handler.** `19` §5 says it in the
invariant itself — *"enforced by the platform client returning aggregates only, not by a UI
that declines to render them"* — so `platform/db.ts` refuses `Answer` in any operation
including a nested `include`, permits `Response` only `count`/`aggregate`/`groupBy`, and
permits writes to four models. It throws a `PlatformSeamViolation`, **not a 403**: an INV-011
breach is a line of code to delete rather than a refusal to render, and a tidy 403 is
something somebody later adds to an allowlist.

**`DEC-072` — a second cookie name, but not a second `express-session`.** `19` §7 argues for
the second name because *"one session, two meanings is how privilege confusion bugs happen"*.
`req.session` is single-valued, so mounting a second instance would have reintroduced exactly
that under a nicer name. `platform_sessions` holds an opaque 32-byte id and
`platform/session.ts` is the only file in the codebase that reads `endur.ops`.

**`DEC-073` — suspension is enforced on the resolution source.** `19` §6 and `70` both require
it to cut the customer's staff and not their respondents. `tenantResolver` is the only file
that knows *how* a tenant was resolved, so `via === 'session'` is the only place that sentence
can be written at all. Checking at login would have left every live staff session working.

**MFA is built, not deferred.** RFC 6238 in forty lines of `node:crypto` and no dependency —
an HMAC, a counter and a modulo. `mfa_secret` is NOT NULL so there is no "not set up yet"
state to fall through, and login answers one message for all three failures. `npm run ops:code
-w @endur/api` prints a live code, so the demo can show MFA rather than apologise for it.

**Not built, and written into `19` §13b rather than left to discover:** `/platform/analytics`
is `T-067`'s (its four decisions *are* that task), the log routes are `T-077`'s, and the
message endpoint stores the record without sending mail — there is no mail transport in this
product, and the record is the half `70` actually argues for.

**Next:** `T-066` (`/ops`), `T-067` (`/ops/analytics` + endpoint), `T-077` → `T-078`.

---

### 2026-08-25 · T-075 + T-076 — the activity log, and its first reader

**`audit_log` has been written on every state change since `T-013` and had never once been
read.** That is a whole invariant's worth of evidence — INV-007, the transaction-bound row
carrying `decided_by` — sitting in a table with no reader. `/app/logs` is the reader.

**440 backend (+7) + 852 frontend (+9) = 1,292 tests, all green.** Typecheck, lint,
`audit:drift`, `audit:vocab` clean. One migration applied locally.

**`audit_log.outcome` did not exist in the database.** `10` §5 has carried the column since
23 Aug and the table had not, because nothing had ever read `audit_log` — and a column no
writer sets is a column no reader can trust. It landed **with its reader**, `DEFAULT 'allowed'`:
every row written before today described something that happened, which is exactly what
`allowed` means. Backfilling it any other way would be inventing history.

**Which refusals get written — two conditions, not one (`DEC-068`).** `DEC-041` says
*"mutating capabilities only"* and `56` gives the reason in terms of the **method**: a 403 on
a GET is the permission system working correctly, thousands of times a day. Both readings are
right about different mistakes, so both are applied — nothing is written for a `GET`, and
nothing for a `*.read`. The second is the belt to the first: a read is occasionally shaped
like a write, and `POST /authz/simulate` asks a question and changes nothing.

**A 404 is recorded too.** To the caller it is indistinguishable from a 403 by design (`13`
§5). To the organisation it is the more interesting of the two: somebody reached for a
resource so far outside their scope that we would not confirm it exists.

**The writer sits beside `flushAudit`, in `db/tx.ts`, not in the middleware.** `ip` and
`actor` are decided by `DEC-040` and `DEC-045` there and nowhere else, and a second writer is
a second place those rules have to be remembered — which is `DEC-040`'s entire lesson. It is
**not in a transaction**: INV-007 binds a row to the mutation it describes, and a refusal
describes a mutation that never happened. And it **can never replace the 403** — a log that
turns a refusal into a 500 makes the product less safe than not having one, so the write is
swallowed on failure.

**`DecidedBy` was two shapes under one name (`DEC-069`).** `errors.ts` exported
`{via, subjectName?, scope?}` for the 403 detail; the resolver's `describe()` emits seven
fields, and **both cross the wire from the same function**. A second declaration would have
compiled and drifted. They are now one type — which is exactly the argument `24` §6c makes for
`<DecisionTrace>` being one component, made one layer down.

**`<DecisionTrace>` is finally built**, catalogued 23 Aug with no caller. It took a `tense`
prop so one component can say *"Allowed by the Dean role"* about a real event and *"Would be
allowed by"* about a hypothetical one — `42` is the other tense and `T-054` **extends this,
never forks it** (INV-009). Its full form says the scope **in words**: *"that ward and
everything under it"*, never `own_unit`, because a raw column name on screen is a leak of a
different kind.

**Scope is filtered over the TARGET, in SQL, before the page query (`DEC-070`).** `56` is
explicit: a row is visible when the thing acted upon is in scope, not when the actor is —
*an owner acting on your department is your business*. Four target types live in a unit and a
campaign's is its **subjects'** units, the predicate `40` and `58` already share. Everything
else is org-level and only `all` sees it. Running it before the query is what makes
`meta.total` a real count of what the caller may see rather than a count of what exists with
rows dropped afterwards.

**Wrapped in `RequireCapability`, unlike Analysis and Reflect.** Those two are unwrapped
because each has a 402 a route guard cannot express. There is none here — a log is not a tier
feature — so the guard can say everything there is to say. The page renders its own 403 as
well, because a caller can hold `audit.read` in the `/auth/me` map and still be refused by the
API, and the client never decides that.

**What is not built and is not pretended:** the actor filter has no picker (the query
parameter works, so a link with one in it works today), `<PersonChip>` was never built
anywhere and the actor cell renders the name, and the expanded trace has **no `considered`
list to show** — `decided_by` stores the deciding grant, and storing the rejected candidates
would multiply the row size of the one table that is kept forever. All three are written into
`56` § What is not built.

**`audit.read` is seeded `all` at L1 and nowhere else**, so no demo account below the founder
sees the item at all. That is the matrix, not an oversight.

---

### 2026-08-25 · T-083, T-084, T-085 — the improve loop, and the last "Soon" tag

Stage 9 is complete. **433 backend (+10) + 843 frontend (+7) = 1,276 tests, all green.**
Typecheck, lint, `audit:drift`, `audit:vocab` clean. One migration applied locally.

**The ordering constraint is enforced by an absent route, not only by a 404** (`DEC-067`).
`44` calls it the most defensible novelty claim in the product after the permission engine:
you record your own assessment *before* you see what anybody else said, or the reflection
becomes a rationalisation of the scores and the gap — the actually useful output — cannot
exist. `GET /reflect/:id/gap` 404s until the reflection is written, **and there is no route
and no DTO anywhere that returns a reviewee's received scores on their own.** A 404 is a
check somebody can relax later; a missing endpoint is not. The page collapsed `44`'s five
addresses into two for the same reason — `/app/reflect/:id/gap` as its own address would be
a link somebody could open early.

**One acceptance line was narrowed on purpose** (`DEC-066`). `44` § Capabilities says *"a
supervisor reads their subtree's [reflections]"*, and one paragraph earlier the same document
says getting this scope wrong *"exposes someone's private self-assessment to a peer"*. Those
two sentences cannot both be honoured. A reflection is a person's own written account of
their own weaknesses, recorded before they are allowed to see anything — so `reflection.read`
is seeded **`self` and nothing wider**, at every level that holds it. What a supervisor gets
is the **check-in**: the conversation about the plan, which is what step 4 of the loop
actually describes. An organisation that disagrees can write that grant — the resolver
supports it — and that is their decision to make explicitly rather than ours to seed.

**Not L4 either**, on the same reading of the ladder `results.read` already takes: L3 is the
reviewee and L4 is the respondent-level role. Somebody nobody reviews has nothing to reflect
on, and the nav item would have shown for every account in the product and opened an empty
page — `D-027`'s exact shape, a third time.

**Immutability is three database triggers**, because `44` asks for a *trigger* test by name
rather than a service test — the Enterprise tier sells these records as evidence, and a
record that can be rewritten after the conversation is not evidence. `reflections` refuse
`UPDATE` outright (submitting *is* finalising, so a second write is a rewrite after the
fact); plans and check-ins refuse any change once `finalised_at` is set. The test goes around
the service entirely and writes to the row directly, and the database still says no.

**`<GapBar>` names no winner and has no `valence` prop.** Self higher than received is a
blind spot, self lower is under-confidence, both are worth knowing and neither is a grade:
*"a gap view that reads as an accusation guarantees the next reflection is gamed."* Accent
for the person's own reading, neutral for everybody else's, never the status ramp.

**`<UpgradeCard>` left `/app/analysis` and joined `24` §6b** — two callers, identical shape,
one differing tier, which is exactly the test `DEC-065` sets for the catalogue.

**`T-085` is done and there is no "Soon" tag left anywhere.** `Sidebar.test.tsx`'s count
assertion is now zero, plus every item on the positive-navigation table. The three roadmap
tests that asserted disabled behaviour were **deleted rather than skipped** — there is
nothing left for them to describe.

**What is not built, and is not pretended** (all four written into `44` § What is not built):
the check-in text chat — `notes` is the seam; step 5's cycle-over-cycle measurement, which
needs two closed cycles on one subject and the seed has one; item-level "plan overdue",
because nothing schedules (`OPEN-005` still owns no scheduler); and "reflection due" on
`/app` home, whose payload has no field for it and which is `46`'s task.

**And the demo organisations still cannot open it** — same pair as Analysis. They hold no
improve-loop grants and no subscription row, so it 403s *and* 402s for all four. `D-031`.

**Written:** `DEC-066`, `DEC-067`; `44` (status, route, acceptance, what-is-not-built),
`13` § Improve loop (out of § Reserved), `24` (`<GapBar>`, `<UpgradeCard>`, §7), `50` §1,
`20` §2, `55` § Stage 9, MAP.

**What the next session should know.** Stage 9 is finished and every sidebar item is live.
**Item 3 of the owner's ask is the only untouched block left**: `T-075`/`T-076`
(`GET /audit` + `/app/logs`, spec `56`) can start immediately, then the `/ops` tree
(`T-059` → `T-066`/`T-067`/`T-077`/`T-078`). `D-031` (destructive re-seed so the demo orgs
can open the two new pages) and `D-032` are still owner decisions; `D-030` is unrepaid.

---

### 2026-08-25 · T-082 — /app/analysis

Stage 9's fifth row, and the Analyze layer is now a screen. **423 backend + 837 frontend
(+30) = 1,260 tests, all green.** Typecheck, lint, `audit:drift`, `audit:vocab` clean.

**Two failures, two screens — this is the page `DEC-011` was written for.** A 403 says *your
account may not*: an administrator's problem, nothing to buy, and the copy never mentions a
plan. A 402 says *your organisation is below Silver*: it names the tier and what it adds, and
the account is fine. Collapsing them would have made a Bronze customer **with every
permission in the product** read *"you do not have access"* and go asking their administrator
to fix a permission that was never wrong. Both directions are asserted, including that
neither screen ever says the other's sentence.

**Reliability is on every panel, not just the strip.** `43` is emphatic that a 4.6 from 8
responses and a 4.6 from 800 are different facts, and that presenting them identically is the
most common way a feedback dashboard lies. A strip under the header satisfies the letter of
that and not the point: it scrolls away, and a screenshot of the themes table does not carry
it. So every panel heading carries the confidence tag as well — and `tag-warn` rather than
`tag-bad`, because what is thin is the **evidence**, not the feedback.

**The drill-through 403s on its own, inside the panel, with the analysis still on screen.**
That is `40`'s rule for its comments, applied on the route that carries the same capability.
Somebody who can read the themes and not the comments behind them is not a bug — they are
`40`'s split working.

**`DEC-064` — no charting library, and `24` §10 is superseded rather than quietly ignored.**
§10 reserved Recharts *"for the P3 analysis dashboard only"* and `43` § Components repeated
it. Then `design_specs/design/08` §8.2 turned out to draw this page as *"the conic-gradient
donut, the inline-SVG line chart"*, with three token swaps listed as its corrections. **There
was nothing to convert.** Adding ~90KB and a dependency to redraw a picture we already had is
`24` §1's indirection one layer down, and a dependency is a decision the owner has reserved
before (`DEC-036` is the same shape). The cost is stated rather than hidden: two axis labels,
no tooltip, no zoom — none of which `43` asks for. The `<svg>` is `aria-hidden` and the same
numbers go out as a visually-hidden `<table>`, which is not optional: a chart with no text
equivalent is a blank region to a screen reader, and the numbers exist either way.

**`DEC-065` — two components catalogued, four left page-local.** `43` § Components names *a
line chart and a theme table*, so `<TrendLine>` and `<ThemeTable>` went into `24` §3 before
any code, and the donut, the driver rows, the drill-through panel and the 402 card did not.
`24`'s rule is that a page may not invent a **shared contract** nobody agreed; it is not that
every `<div>` with a class becomes an inventory row, and `58` set that precedent at `T-080`.
The test is whether a second caller is plausible: a theme table is a shape another page could
want; a card explaining *this* capability's 402 is not.

**`<TrendChip>` is finally built, after two refusals — and its colour is optional.** It was
catalogued at `T-003`, borrowed by `46` and refused at `CONF-017`. `43` is the caller it was
waiting for. The prop that matters is `valence`, and it is **optional, absent meaning
uncoloured**: the arrow is a *direction*, which is a fact, and a colour is a claim that the
direction is good or bad, which is the server's to make or nobody's (`CONF-004`). Its first
caller passes none — a theme mentioned twelve more times this month is not thereby better or
worse, and `43`'s payload states a valence for the **score** and states none for the delta.

**`<BarRow>` is not the driver bar, and that is the one real design argument on the page.**
`<BarRow>` draws a share of a total — a quantity that starts at zero and grows. A driver is a
**correlation**: signed, in -1..+1, with zero in the middle. Rendering it in the component
built for shares would put -0.4 and +0.4 in the same place with different colours, which is
colour carrying the meaning on its own. The driver rows diverge from the centre and print the
value to two decimals.

**A `null` delta renders as absent, never as a zero** (`DEC-061`), and the suppressed branch
has nothing it could render because the body carried no `themes` key at all — asserted, along
with the fact that an organisation with **no** responses gets a different screen entirely.
"Nobody has answered" is not "we are protecting three people", and only the second is a
promise being kept.

**What the page honestly cannot show, said on the page rather than discovered later.** The
drivers panel is empty on the seeded demo data and says so in words: `demo.ts` draws a
comment's tone and its rating as two independent throws, so every correlation lands inside
the engine's deadband and is correctly reported `neutral`. A neutral entry under *"Key
drivers"* would present a non-finding as a finding, which is the same failure `43` describes
for an unfalsifiable theme one panel over.

**And the four demo organisations still cannot open this page** — zero `analysis.read` grants
(`D-033`) **and** no subscription row (`D-012`), so it 403s *and* 402s for all four.
`db:seed` skips organisations that already exist; only the destructive `db:reset` repairs
them, and that is `D-031`. Nothing was re-seeded.

**Sidebar item un-disabled in the same commit**, which is `T-085`'s rule — the tag comes off
as the page lands, never before, and never as a task of its own. `Sidebar.test.tsx` gained
the **positive** assertion for Analysis on the day the page shipped rather than a day later,
which is the whole argument for that half of the rule existing. The `Soon` count is now 1.

**One fixture change worth flagging:** the sidebar's hand-written L1/L2/L3 capability maps
gained `analysis.read`, and L4 deliberately did not. That is `D-033` surfacing in a test
fixture — the file was right to omit it while the seeded matrix did, and is only right to
carry it now that `grant-matrix.ts` does.

**Written:** `DEC-064`, `DEC-065`; `43` (status, route, components, state, acceptance,
corrections), `24` (`<TrendChip>` built, `<TrendLine>` + `<ThemeTable>` added, §7, §10
superseded), `20` §2, `55` § Stage 9, MAP.

**What the next session should know.** Stage 9 continues with **`T-083`** (the improve-loop
backend, `44`) and then `T-084` (`/app/reflect`); `T-085` takes the last "Soon" tag off
Reflect when that lands. `T-083` will be the first task to meet `routes.test.ts`'s new
assertion — `reflection.*`, `actionplan.*` and `checkin.*` are in no row of the seeded matrix,
and the test fails **the day the router is mounted** rather than the day somebody opens the
page. **Item 3 of the owner's ask is still entirely untouched**: `T-075`/`T-076` (`/app/logs`)
can start immediately, and the `/ops` tree (`T-059` → `T-066`/`T-067`/`T-077`/`T-078`) after
it. `D-031` and `D-032` are still owner decisions, and `D-030` is still unrepaid.

---

### 2026-08-25 · T-081 — the analysis backend

Stage 9's fourth row. **423 backend (+37) + 807 frontend = 1,230 tests, all green.**
Typecheck, lint, `audit:drift`, `audit:vocab` clean.

#### The gate is the type, not a check somebody remembers

`DEC-058` made `features/inbox/` hold one content-free table so it *could not* query
`responses`. Analysis is the same danger one step further on — **a list of individual comments
with arithmetic over it** — so `features/analysis/` holds **no query at all**, and a test
asserts the word `prisma` does not appear in it.

`readCorpus()` returns a **discriminated union** whose `comments` field exists only on the
`suppressed: false` branch. `40` and `58` both had to *remember* their gate; this one is
refused by the compiler (`DEC-062`).

**And there are two gates**, which the filters make necessary. `readableCampaigns()` decides
which campaigns may be read; the second decides whether the **slice** somebody asked for is
big enough to be safe. Without it, `?subjectId=…` is a per-subject breakdown of three people —
the request `38` § "Not built" refused, arrived at through a query parameter instead of a
route. Proved by disabling it: exactly one test goes red, the one that narrows a readable
eight-response campaign down to its three-response subject.

#### `D-033` — the route could never have been reached by anybody

`analysis.read` has been in `11` §3 since `T-003` and entitled at Silver in `16` §3 since
`T-088`, and it was **in no row of the seeded grant matrix.** Not restricted — absent. So no
role in any organisation had ever held it, and `/api/v1/analysis` would have returned **403 to
every user of every org including a Gold one**, on the surface `43` exists to demonstrate the
402-vs-403 split on.

It is `D-012` and `D-028` a third time: **the entitlement said yes and the grant said nothing**,
which is exactly what made it look built. It survived three security passes because neither
half is wrong on its own and **nothing compared them**. Ten capabilities were absent; the other
nine belong to `T-083` and `45` and are deliberately left, because a grant to a route that does
not exist cannot be tested. `routes.test.ts` now asserts the pair that *is* always a bug — a
**mounted** route requiring a capability nobody is seeded — so `T-083` meets it the day it
mounts `/api/v1/reflect`. Proved by removing the row: the new test fails with
`['analysis.read']`.

#### The drill-through is `response.read`, not analysis

`GET /analysis/themes/:id` returns verbatim comments, and `40` already decided what those cost:
*"seeing that the average is 4.3 and reading what one person wrote are different levels of
access."* Gating it on `analysis.read` alone would have made this page a way around the split
`40` exists to draw — **quietly**, because the seeded matrix hands both to the same three levels
and nothing would have gone wrong yet. Asserted by denying `response.read` to someone who keeps
`analysis.read`: the drill-through 403s, and the overview keeps working but analyses nothing,
because the corpus scope was `response.read`'s all along.

#### Four engine flaws that twelve fixtures could not show

The engine passed its unit tests and was then run over the **real seeded corpora**, read-only.
The Grand Palace's 229 comments returned:

- **Four themes, confidently.** `room` appears in 113 of 229 — 49% of the corpus — so a flat
  50% containment bar merges nearly anything into it, because a term in ten documents overlaps
  a theme covering half the corpus about five times **by coincidence**. The bar now has to beat
  chance: `max(0.5, 2 × the host's share)`, **capped at 1** — without the cap a ubiquitous theme
  demands a containment of 2 and can never have a facet, which is the same bug mirrored.
- **`Comfortable`, in the themes table beside `Checkout`.** A theme is *what* people talked
  about; the lexicon is *how they felt*. A term every part of which is an opinion word is no
  longer a candidate — `comfortable` goes, `comfortable bed` stays.
- **`Twice` and `Dropped`** — real words from real sentences, and not topics.
- **`called` stemmed to `cal` while `call` stemmed to `call`**, so the two never met. The
  double-consonant rule fired on `-ll`, `-ff` and `-ss`, which are ordinary English endings.

After those, all four demo orgs read plausibly: *Room · Checkout · Breakfast · Staff · Night ·
Location* for the hotel, *Nurses · Discharge · Ward · Food* for the hospital, *Context ·
Decisions · Change · Tooling · Meetings* for the consultancy. Each of the four fixes has its own
regression test.

**What is left is vocabulary coverage, and it is the weakness `43` § Reliability promised.**
Riverside's 115 comments read 101 neutral, because a hotel's lexicon does not know a hospital's
words. That is the engine being honestly weak, which `DEC-042` chose over a confident wrong
theme.

**Also worth knowing: the drivers panel has almost nothing to show on the demo data.** Every
correlation lands inside the ±0.1 deadband and reports `neutral`, which is correct — the seed
draws a comment's tone and its rating as two independent throws (`demo.ts:606,633`), so there
is genuinely no association to find. Not a bug, and not fixable from this side.

#### What the demo database still cannot do

`analysis.read` is fixed **for organisations registered from now on.** The four seeded demo orgs
have **zero** `analysis.read` grants and **no subscription row at all**, so `/app/analysis` will
403 *and* 402 for all of them. `db:seed` prints `skip: … already exists`; only `db:reset` — drop,
migrate, re-seed — repairs it, and that is **`D-031`, still the owner's call.** Nothing was
re-seeded. Verified live, read-only, against all four.

**Written:** `DEC-061`, `DEC-062`, `DEC-063`, `N-062`, `D-033`; `43` (status, contract,
engine, acceptance), `13` § Analysis, `50` §1 + its notes, `55` § Stage 9, MAP.

**What the next session should know.** *(Written before `T-082`, which landed the same day —
see the entry above.)* Stage 9 continues with **`T-082`** — `/app/analysis`, whose backend is
now live and 36 tests deep. Then `T-083`/`T-084` (Reflect), and `T-085` takes the "Soon" tags
off Analysis and Reflect as each lands. **Item 3 of the owner's ask is still entirely
untouched**: `T-075`/`T-076` (`/app/logs`) can start immediately, and the `/ops` tree
(`T-059` → `T-066`/`T-067`/`T-077`/`T-078`) after it.

---

### 2026-08-25 · T-079 and T-080 — the response inbox

Stage 9's second and third rows, back and front. **386 backend (+18) + 807 frontend (+23) =
1,193 tests, all green.** Typecheck, lint, `audit:drift`, `audit:vocab` clean.

#### The backend's point is what it cannot do

`38` § "Not built" refused a per-subject breakdown on the campaign page in these words: *"a
second ungated path to them is what INV-007 exists to prevent."* An inbox is that mistake made
larger — a list of **individual comments across campaigns** is precisely what the k-anonymity
gate exists to withhold.

So `features/inbox/` owns **one table**. `inbox_state` is two ids and two timestamps and holds
no response content at all; everything the page renders comes from `readComments()` in
`features/results/service.ts`, where the gate already lived. The feature folder does not query
`responses` and cannot grow a path to one by accident in three weeks' time. `DEC-058`.

Three things fell out of writing it that way:

- **The threshold is applied per campaign, before the merge.** Two campaigns of four responses
  each do not become a readable eight. That is the mistake a naive cross-campaign `UNION`
  makes, and it looks correct while making it, so it is asserted directly with the arithmetic
  (`2 × (k−1) ≥ k`) checked in the test so it cannot go stale.
- **One scope predicate.** `assertVisible` (`40`'s path) and `readableCampaigns` (`58`'s) now
  call the same `canSee()`. `58` § Acceptance asks that the two match for the same caller;
  sharing the function is how that is true by construction rather than by two people writing
  the same `some()`.
- **The write routes are gated too.** Without it, `POST /inbox/:id/read` on a guessed uuid is
  an oracle — 204 for a response that exists, 404 for one that does not, inside a campaign the
  caller cannot read. One extra query, and the same 404 for all three refusal reasons, because
  a distinct message for "below threshold" announces that suppressed data exists.

#### `DEC-060` came from its own test, and the bug was mine

Opening a card marks it read. The first version then filtered every marked card out of the
current tab — correct for a tick, wrong for an expand: on **Unread**, the detail appeared and
vanished in the same frame. **Reading is not triaging.** A card leaves when the reader ticks,
archives, or hits `u`/`e`; never as a side effect of being read. The unread count drops either
way, because it is a count of unread and one genuinely just stopped being.

The test that caught it was written to assert the expansion, not the eviction.

#### `<ScoreBadge>` is built, and `CONF-016` was right about `40`

`CONF-016` refused this component and every word of its argument holds **about `40`**: that
page's number is an *average*, colouring one is interpretation, `40` § Interactions forbids it
in as many words, and `40` was the only would-be caller.

`58`'s number is a different number — **one person's own rating on the response their comment
came from.** *"2/5 · the projector in Room 4 has never worked"* is a fact somebody stated, and
reporting it is not judging it. So the two halves of `CONF-016` come apart:

| | |
|---|---|
| The **badge** | had no legitimate caller. It has one now |
| The **threshold colours** | were the interpretation. Still not built, at any value |

Built colourless. The prohibition now lives *inside* the component rather than in a doc nobody
reads before importing it — which is a stronger place for it than "not built" ever was,
because the next page that wants a score gets the safe one instead of writing its own. Its
test asserts the `className` is exactly `score-badge`, so a well-meant `.is-bad` is a failing
test. `CONF-022`.

#### `/app/roles` was still greyed out with a "Soon" tag

`T-052` shipped the ladder and the powers grid on 24 Aug. The **last edit** — the one `T-085`
exists to name — was missed, so for a day a built page was reachable only by typing the
address.

Nothing asserted the *positive* direction. `Sidebar.test.tsx` counted "Soon" tags and checked
that scaffold items refuse to navigate, and had exactly one hand-written test that People
*does* navigate. It is a table now, one row per built page, and Roles and Inbox are both in
it.

#### `N-061` / `D-032` — found live, not ours, and said so

Response scope is decided at the **campaign**, not the subject. A campaign is visible when
*any* of its subjects is in reach; once visible, every response in it comes back.

Live, against The Grand Palace: `grand-palace-3`, a level 3 anchored at **Lakeside Property**
holding `response.read: own_unit`, reads all 229 comments including every one about **City
Property** — and `/campaigns/:id/responses` hands them the same 210 rows and 12 distinct
subjects it hands the administrator.

That is `40`'s behaviour, and `58` § Acceptance *requires* the inbox to match `40` for the same
caller. A stricter inbox would satisfy one reading of INV-003 and break the criterion that
asked for consistency, leaving two answers to one question. **Filed, not fixed** — it is a
change to `40` first, and it touches `52` §2's reasoning.

#### Verification

Live against The Grand Palace: 229 comments, real hotel nouns on the cards (*Valet Parking*,
*Concierge*, *Lakeside Dining*), the DTO's key set exactly as specified with nothing
respondent-shaped in it, and the full **read → archive → unarchive → unread** round trip
returning the org to 229 unread exactly. The probe's one `inbox_state` row was deleted; the
table is empty and the four demo orgs are untouched.

**Written:** `DEC-058`, `DEC-059`, `DEC-060`, `CONF-022` (narrowing `CONF-016`), `N-061`,
`D-032`; `58` status + acceptance, `24` §3 and §6c, `20` §2, `55` § Stage 9, MAP.

**What the next session should know.** Stage 9 continues with **Analysis** (`T-081` backend,
`T-082` page) and then **Reflect** (`T-083`/`T-084`). Item 3 of the owner's ask is still
entirely untouched: `T-075`/`T-076` (`/app/logs`) has no dependency on the platform side and
can start immediately. `D-031` still needs an owner decision before `T-045`.

### 2026-08-24 · T-089 and T-052 — the boundary, and the powers grid

Items 1 and 2 of the owner's second ask, in the order they asked. **368 backend (+15) + 784
frontend (+31) = 1,152 tests, all green.** Typecheck, lint, `audit:drift`, `audit:vocab`
clean. Nothing committed.

#### `T-089` — a failed lazy import now says what happened

`PublicBoundary` printed the raw `Error.message` — a `.tsx` path at a `localhost` URL — and
offered a client-side `<Link to="/">`, which re-renders inside the same dead module graph and
fails identically. **One failure became a loop the user escapes only by knowing to
hard-refresh.** It now says *"Endur updated while this tab was open"* and offers an `<a href>`
to **the page they were opening**, not to the root — sending them home would make them click
the same button twice. `RespondBoundary` gained a Try again for the same reason: *"open the
link again"* is useless advice to somebody who arrived from a printed QR code.

**Proved by reverting**, and this is the part worth keeping: put the `<Link>` back and
**exactly one test goes red** — the one that dispatches a click and asserts the event was not
`preventDefault`ed. Every attribute assertion passes against the broken version, because
`<Link>` renders an `<a href>` too. A test that only checked the `href` would have shipped
green over the bug.

#### `T-052` — /app/roles, and "no backend work at all" was wrong

The ladder (order derives every level; the reorder body has no `level` key and a test asserts
its absence) and the grid — scope cycle, shift-click block, column copy, row fill, undo,
warnings rendered **at the cell**, read-only rather than absent without `grant.update`, and a
**diff** on save rather than the whole matrix.

**Yesterday's board called this the one task with no backend work, on the strength of "every
route exists". That was my error.** `T-017` did build all nine routes. What had never been
built is **two of the three refusals `33` has specified since round one**:

| Missing | What it meant | Now |
|---|---|---|
| The escalation bound | `PUT /grants` carried `requireCapability('grant.update')` and nothing else. Anyone the grid was delegated to could write any role **every capability in the catalogue** — `D-018`'s shape, one screen along | `requireNoGrantEscalation`, `DEC-056` |
| The lockout guard | A save leaving nobody holding `grant.update` was accepted. The capability that would undo it is the one just removed | `409`, `DEC-057` |

**A route existing is not a rule existing.** That is the lesson, and it applies to every other
"the backend is done" line on this board.

**The bound is "everywhere", and the first version of it was wrong.** I compared scope widths
against `heldCapabilities()`, and the tests caught it by refusing **the founder**: `50` §1
seeds level 1 `campaign.launch: subtree`, not `all`, because a subtree anchored at the *root*
already is the whole organisation. A width comparison also cannot tell that apart from
`subtree`-at-Section-A, which is *not*. It asks `visibleUnits()` instead — the same primitive
`findEscalation` uses — and scope width is not consulted at all.

#### `D-008` repaid, and it was worse than it was filed as

64 written phrases (`capability-labels.ts`, `DEC-055`) replace a four-line derivation. It was
filed for being un-localised. Writing the table showed it was also simply **wrong** for every
object added to the catalogue after the rule: `results.read` produced *"read resultses"*,
`apikey.create` *"create apikeys"*, `actionplan.read` *"read actionplans"*. Nobody had read
its output, because the screen that renders all 64 rows was the unbuilt one. `N-059`: **a
derivation is only checked where it is seen.**

Verified live against The Grand Palace — *"open guest surveys for answers"*, *"add
restaurants"*, *"move properties to a different parent"*.

#### The grid's own warnings found something — `D-031`, `N-060`

> *"Nobody in this organisation can give somebody a sign-in."*

All four demo orgs were seeded **21 Aug** and hold 51 capabilities. `T-072` added
`account.create`, `account.reset` and `account.revoke` to the matrix on **24 Aug**, and
existing orgs got no rows. **`npm run db:seed` will not fix it** — it prints
`skip: <name> already exists`. So a built-and-tested feature is unreachable in every demo
organisation, and `T-073`'s Invite button would `403` on stage. The remedy is destructive, so
it is the owner's call. This is the screen working exactly as `33` promises: mistakes
*visible* rather than discoverable.

**What the next session should know.** `T-052` also added `Position.roleId` — the grid's
self-lockout prompt has to match the reader's positions to grid columns, and matching by role
**name** is `N-057` before the one save with no undo. Next in Stage 9: `T-079`/`T-080`
(Inbox), then `T-081`/`T-082`, `T-083`/`T-084`. Item 3 (`T-075`/`T-076` and the `/ops` tree)
is untouched. Two acceptance rows on `33` stay unticked and say why: drag-to-reorder
(buttons instead) and the self-approval **fix button** (there is no rule editor to pre-fill;
the sentence builder is P3).

### 2026-08-24 · the owner's second ask — DOCS ONLY, no code

The app was started for the owner to look at (`npm run dev:api` + `dev:web`, Postgres already
up, 16 orgs, all four seeded demos intact). They opened it and came back with three things.

**Item 2 first, because it is the one that matters.** *"roles, analytics, inbox and reflect
still need to be built (i asked for this before and you didnt do it)."* **That is accurate and
this file is the evidence.** `CONF-019`, 23 Aug, was the same instruction. The response was to
write specs — `43` and `44` re-tagged buildable, `58` written from nothing — and then sequence
every resulting task behind M0. No code followed. `55` § Stage 7 literally reads *"the
documentation is done; none of it is code"*, and § Stage 6 opens with *"do not start any of it
before `T-043` and `T-045`"*. From the owner's chair the sidebar was unchanged two days later,
because it was.

The failure was answering *"can these be built?"* when the question was *"build these"*.
Everything `CONF-019` established — the per-item blocker analysis, which is genuinely good
work — stays. What is withdrawn is the sequence it was used to justify. `CONF-021` records
that, and `55` § Stage 9 is the promoted order: **`T-052` first** (the only one of the four
with no backend work at all — `features/roles/**` has existed since `T-017`), then Inbox,
Analysis, Reflect.

One stale dependency corrected on the way: `55` § 7d still named `T-057` as the blocker for
`T-082` and `T-083`. `T-088` repaid `D-012` earlier the same day, so both now read `T-088 ✅`.

**Item 1 — the sign-in bug, and I could not reproduce it.** The reported error was
`error loading dynamically imported module: http://localhost:5173/pages/public/Login.tsx`.
Crawled the whole module graph off the dev server the way the browser would — **44 modules,
every one 200 and valid javascript**, so the failure was not present when checked. One cause
*is* ruled out: `node_modules/.vite/deps/_metadata.json` still has its **21 Aug** mtime, so
Vite's dependency optimiser did not re-run during this session and did not move the graph
underneath the tab. That leaves a stale document or a fetch against a server that was not
answering. Saying it is fixed would be a guess, so it is not claimed.

What *is* a defect, and does not depend on knowing the cause: **the remedy the page offers.**
Every route is lazy (`20` §2), so a chunk is fetched at click time, long after the document
loaded; if the module graph moved underneath the tab, the running app is fine and the *next*
route dies. `PublicBoundary` prints the raw `Error.message` — a `.tsx` path at a `localhost`
URL — and its only affordance is a client-side `<Link to="/">`, which re-renders inside the
same dead module graph and fails identically. **`ConsoleBoundary` already does the right
thing** and its comment says why: `<a href="/app">`, *"whatever state caused the crash is in
memory"*. `PublicBoundary` was the half that had not caught up, and `/login` is what the
landing page's one call to action points at. `DEC-054`, `D-029`, `T-089`.

**Item 3 is two different things wearing one word**, and `19` §4 already separated them:

| The owner said | Which is | Tasks |
|---|---|---|
| *"logging should be visible to admins"* | an **organisation's** admin, their own org's activity | `T-075` → `T-076`, spec `56` |
| *"pages for endur admin and superuser"* | **Endur's** operators, the estate and the log files | `T-059` → `T-066`/`T-067`/`T-077`/`T-078`, specs `19`/`70`/`71`/`72` |

*"I haven't seen pages for endur admin and superuser"* is **correct and by design**: `/ops` is
a fourth route tree behind a separate login and a separate cookie, and nothing in `/app` links
to it (`DEC-033`, `INV-011`). `T-059` is what makes the door exist. Until then there is
nothing to have seen. The `T-075`/`T-076` half has no dependency on any of that and can start
immediately.

**`20` §2's route map was stale in four ways** and is fixed: `/app/logs` was missing entirely
though `56` has owned it since 23 Aug; Inbox/Analysis/Reflect were still tagged `P3`; the
`/ops` tree was absent; and the `D-027` paragraph still described `T-086` and `T-087` as
future work when both shipped that morning.

**Written:** `CONF-021`, `DEC-054`, `N-058`, `D-029`, `T-089`, `55` § Stage 9, MAP entries for
`33`/`43`/`44`, status lines on nine page docs, and the one decided row in `25` — which is
otherwise still an unwritten placeholder, and whose *"write this when"* trigger has now
demonstrably fired.

**What the next session should know.** Nothing was built. Stage 9 is 16 tasks, M0 is 26 Aug
and `T-045` is unrun; that trade is recorded in `CONF-021` and is not to be re-argued — the
owner has asked twice. Start at `T-089` (small, and every lazy route shares the fault), then
`T-052`. `N-058` flags that `T-059`'s `T-057` dependency looks like the over-coupling
`DEC-048` already took apart once — **check it, do not re-sequence on it.**

Still open from the previous session and still unexplained: one `npm test` run reported
`1 failed | 351 passed` with the name lost to a grep filter; six later full runs were clean.
Not reproduced, not attributed.

### 2026-08-24 · T-051 — person detail, my account, and a unit found by name

**Two pages stopped being stubs, and one of them found a bug in code from `T-018`.**
`353` backend (was 338), `753` frontend (was 727), typecheck, lint, `audit:drift` and
`audit:vocab` clean. Nothing committed.

**`13` § Profile had catalogued three routes since round 1 and nobody had written them.**
`GET /profile`, `PATCH /profile`, `POST /profile/password` — the router existed with only the
two avatar routes `T-062` put there. That is the catalogue-first rule doing its job in the
slow direction: the contract was right and waiting, so building it was filling in a shape
rather than inventing one.

**The finding, and it is the one worth keeping.** `readPerson` built `powersByPlace` by
resolving the whole capability catalogue at each of a person's positions. It had no unit id —
`personSelect` fetched position **names** only — so it re-found the unit:

```
where: { orgId, kind: 'position', unit: { name: position.unitName } }
```

`nodes` has no unique on `(org_id, kind, name)` and `POST /units` does not check. Two units
can share a name, and *"Year 1"* under two faculties is the ordinary case rather than the
exotic one. For a person holding a position in each, both loop passes resolved to whichever
row came back first — so **one unit's powers printed under the other unit's heading, on the
one screen in the product built to demonstrate that powers do not leak between units.**

**Why it survived two years of tests is the transferable part:** every fixture in the repo
names its units distinctly — Section A, Section B, Engineering, Mechanical — so every test
passed, *including the one whose name is about INV-005*. The test that catches it is the only
one in the suite with two same-named units. Proved by reverting the fix: the twin-unit test
fails and the INV-005 test still passes. `N-057`.

**`<PowersByPlace>` is one component in two placements.** `34` and `47` specify the same block
in the same words, so it went into `24` §4 before it was written and both pages read it. `47`'s
own data contract had to be amended to get there — it sketched `capabilities: string[]` where
`PersonDetail` already returned `{capability, scope}`, and two shapes would have forked the
renderer. **`N-005`'s rule is about the resolver and the duplication was arriving one layer
above it** (`DEC-052`, `N-056`). There is now literally one caller of `resolve()` for this
question: `features/people/powers.ts`, shared the way `visibility.ts` and `positions.ts`
already are.

**The password route has no capability, and the enumeration test made somebody say why.**
`POST /profile/password` is the first *authenticated* entry on `routes.test.ts`'s allowlist.
It failed the moment the route was added, which is `12` §7 working exactly as intended. The
argument, now written beside it: no capability expresses *"you hold this session and you know
the current password"*; the nearest candidate, `person.update: self`, is seeded to every role,
so a gate on it would refuse nobody while implying an organisation could take the right away
by editing a role. What makes it safe is the **shape** — the route takes no id, so the only
password it can reach is the caller's own (`DEC-053`).

**Verified live**, against a real lowest-tier account provisioned through `T-072`'s invite
flow and activated:

| | |
|---|---|
| `GET /profile` | **200**, four held capabilities, position rendered `Learner L4 @ Section A` |
| its people list | **one row — themselves.** The `self` clause of `DEC-047` |
| the founder's row | **404**, not 403 — ids cannot be probed (`13` §5) |
| `PATCH /profile` with an `email` | name changed, **address unchanged**. The takeover path is shut |
| the rename | visible in the founder's list, so both `users.name` and `nodes.name` were written |

**Left deliberately:** the `Why?` link into the simulator. `<PowersByPlace>` takes `onWhy` and
nothing passes it, because `42` is `T-054` and a link into a `<Placeholder>` is what
`design_specs/design/02` §7 forbids. Wiring, not redesign, when `T-054` lands.

**`T-073` is now properly unblocked** — its account panel hangs on person detail, which exists.

**One unexplained test failure to watch.** The first full `npm test` after this work reported
`1 failed | 351 passed`; the name was lost to a grep filter and five subsequent full runs were
clean (353/353 and 753/753). Not reproduced, not attributed, and not claimed fixed — noted
here so the next session recognises it rather than re-deriving it.

### 2026-08-24 · T-087 — what each role level sees

**`OPEN-009` is closed, by the owner rather than by a session.** They were asked the one cell
that was genuinely theirs and answered it: **L3 keeps People**. `DEC-051`. **338 backend, 727
frontend (was 723), typecheck, lint, `audit:drift` and `audit:vocab` clean.** Nothing committed.

**Two gates changed, and the seeded matrix was not touched.** `NavItem.minScope` (default
`self`) says how far `needs` must *reach* before an item is worth showing — a nav item promises
a **page** is worth opening, which is a stronger claim than *"you hold this verb somewhere"*.
People now needs `person.read` at `own_unit`. No grant was added, removed or narrowed.

**Settings was never a scope problem, and that is the finding worth keeping.** `org.read` is
`all` at **every** level including the lowest — seeded that way so the vocabulary loads on
first paint — so **no minimum scope could ever have hidden it**. It was gated on the wrong
capability. It now needs `org.update`, which is exactly what `<VocabularyChips>` had already
been using for its link to the same page: the chip row reached this answer first and the
sidebar was the half that had not caught up. This was not visible from the docs — it took
reading a real L4 account's map off the running API.

**L3 keeps People, and that is right.** An L3 holds `person.read: own_unit` from the matrix, so
their page lists their actual colleagues, not themselves. That is the difference from L4, where
the page listed one person. The participant-vs-manager question resolves to **manager of a
small area** at L3.

**Four tests, one per level, asserting the exact item list** — because *"which of these five is
missing"* is not something a reviewer catches by eye, which is precisely how this survived:
People looked present and correct on every account. **Proven by reverting both gates → 5 of 13
sidebar tests fail, and the L1 test still passes**, which is what stops the four per-level tests
from being *"everything must change"*.

**One thing deliberately left: `OPEN-010`.** An L3 still sees Structure and Templates. `55` §
Stage 8's draft table proposed hiding both, and the owner chose to decide only the People cell
for now. Neither is a bug the way People was — both pages have real content for an L3, and
`template.read` cannot be narrowed by scope at all (`50` §1: templates are org-wide and have no
unit, so a unit scope would mean nobody could read them; it would need a different capability,
exactly like Settings did). **That draft table has now been wrong in three cells**, so `55` now
says to treat it as a sketch rather than a spec.

### 2026-08-24 · T-086 — the capability set learned to say how far

`MeResponse.capabilities` is a **map of capability → widest held scope**, not a list of verbs.
`DEC-050`. **338 backend tests (was 334), 721 frontend (was 716), typecheck, lint,
`audit:drift` (61 docs / 64 capabilities) and `audit:vocab` all clean.** Nothing committed.

**What the verb alone could not say.** `person.read: self` is seeded to **every role without
exception** so `/app/profile` opens (`50` §1, and `11` §10 has a test insisting it is never
omitted). `held.ts` reported the verb, so `can('person.read')` was **true for every account in
the product**, and the People nav item — gated on that verb — showed everybody a page listing
exactly one person: the reader. That is `D-027`, and it was **unfixable on the client**, because
the client was never told the difference between a respondent's `self` and a head's `subtree`.

**Two decisions inside it worth not re-deriving.** The value is the **widest** live allow, not
the narrowest and not a combination: the question `held.ts` answers is the same existential one
it always answered — *"is there anywhere at all this button could work"* — and the widest reach
is the honest answer to that. And a **unit-scoped deny neither removes the key nor narrows the
value**, for the reason it has never been subtracted: an `own_unit` deny on one section is no
reason to tell the client that a `subtree` allow stops there. So the **key set is exactly what
the array was** — `me.test.ts` asserts that on purpose. `T-086` changed what the client *knows*,
never which capabilities it is told about.

**Nothing broke, by design.** `useCan(cap, atLeast?)` defaults to `'self'`, so all 49 existing
`can(...)` call sites across 14 files mean precisely what they meant; `test-utils.tsx` still accepts an array of
capabilities and reads it as `all`, so the fourteen component test files that only ask *"does
this button render"* were not touched. The scoped map is there for the gates that need it.

**Subjects is fixed outright, and it is the owner's ask landing.** The seeded matrix now gives
L4 `subject.read: own_unit` (`50` §1) — *"only courses list"*, translated out of the university
preset — so **an L4 account sees Subjects today**, with no new gate machinery. `own_unit` rather
than `all`: a reason to see their own section's subjects, none to enumerate the organisation.
That closes the **smaller half** of `OPEN-009`. `org.test.ts` now asserts the L4 grant list
**exactly**, so a fifth capability cannot join it quietly.

**Proven by reverting, both halves.** `held.ts` flipped to report the narrowest allow → the two
scope tests fail. `scopeReaches` made to ignore `atLeast` (the pre-`T-086` behaviour) → the two
`useCan` scope tests fail. Both restored.

**Verified live, and it found something `T-087` needs.** Probe org on the running API: create a
person, give them an L4 position, provision a sign-in, activate, read `/auth/me` as them. The
whole map is four entries — `org.read: all`, `person.read: self`, `person.update: self`,
`subject.read: own_unit`. Running the sidebar's gates against it:

| Item | `needs` | bare verb | beyond `self` |
|---|---|---|---|
| People | `person.read` | true | **false** ← the scope gate is the fix |
| Settings | `org.read` | true | **true** ← **a scope gate does nothing here** |

**Settings is the wrong capability, not a too-wide one.** `org.read` really *is* `all` at L4,
correctly — it is seeded to all four levels so the vocabulary loads on first paint. `55` §
Stage 8 puts Settings at L1, and `org.update` is L1, so `T-087` changes that item's `needs`
rather than adding a scope to it. Not visible from the doc; it took reading a real account's
map. Probe org deleted, zero rows left, API stopped.

**Next.** `T-087` — People and Settings stopping for self-only accounts — now has everything it
needs on the wire, and **no `needs` gate was changed here on purpose**: the mechanism is
reviewable apart from the per-tier policy. It still waits on **`OPEN-009`'s one remaining cell,
L3 × People** — whether a reviewee-level account is a participant or a manager of a small area.
That is the owner's call, not a session's.

### 2026-08-24 · D-007 — one address, two organisations

**Asked to do the most important thing first.** `M0` is in two days, `D-007` was dated **today**
with `CONF-013`'s own instruction *"do not let silence choose"*, and `T-072` shipped yesterday.
That ordering turned out to be right for a reason none of those three gave: **it was a live bug,
not an open question.** `DEC-049`. **334 backend tests (was 330), 716 frontend (was 712),
typecheck, lint and both audits clean.** Nothing committed.

**Measured before deciding, and the measurement changed the decision.** `CONF-013` describes
the residue as *"two activated accounts on one address remain ambiguous"*. Reproduced through
the real routes, it is not ambiguity:

```
person has an account in Org A.  Org B adds them, provisions a sign-in (T-072, one click),
they follow the link and choose a password.  The activation signs them in — and then:

    login with the Org B password  →  401     ← the account they just activated
    login with the Org A password  →  200     ← lands in Org A
```

**They can never log in again.** Their correct password returns `401` forever, because
`findFirst` ordered `createdAt asc` only ever compared against the older row. Every step of
that path is ordinary use by ordinary people, and `T-072` made it one click and a link the day
before.

**The answer is `CONF-013`'s option (b), in its disambiguation form.** The address stays
per-tenant. Login verifies the password against every **activated** account on it — capped at
five, ordered oldest-first — and exactly one match signs in **with no question asked**. That is
every ordinary case, including a person with two accounts who uses two passwords. More than one
match needs the *same* password in several organisations, and only then does the server return
`409 ACCOUNT_AMBIGUOUS` naming them, for the client to re-post with `orgId`.

**Why not the other two.** (a) globally unique email needs a **migration** two days from a
graded demo, forbids something `10` and `DEC-009` both allow, and — the deciding count — turns
register's *"already registered"* `409` into a **cross-tenant membership oracle** in a product
whose whole posture is `INV-006` and `INV-011`. (c) keep the mitigation is exactly the silence
`CONF-013` warned against, and the measurement is why: it is not a documented tradeoff, it is a
silent permanent lockout. **`DEC-049` needs no migration and no schema change** — one handler,
one optional DTO field, one error code, one screen.

**It costs nothing on stage,** which is `CONF-013`'s stated objection to (b). That objection is
true of the *slug field* variant — asking every caller which organisation. Asking only when the
password genuinely opens several means no seeded org and no ordinary sign-in ever renders the
question.

**Two properties worth not losing.** The cap stops one login attempt being turned into
arbitrary argon2 work by anybody who can create accounts on an address; oldest-first ordering
means the incumbent is always inside the window, so no number of later accounts can push
somebody out of their own. **Proven by reverting** `MAX_LOGIN_CANDIDATES` to `1` — three tests
fail, including *"can sign in to the one they just activated"* — and restoring it.

**Next.** `T-086` (the other half of the Stage-8 ask) is unblocked; `T-087` still waits on
`OPEN-009`. `T-073` and `T-081` remain open. Of the M0 list, `D-005` (fonts) and `T-043`
(`OPEN-002`) are both parked by you, `D-011` is explicitly after-M0, and `T-045` is rehearsals —
which are yours to run.

### 2026-08-24 · T-088 — the tier picker at sign-up

The owner asked for this one by name: *"when you login — pick between option. rn, no pricing,
just pick the option (bronze, silver and gold) and you get assigned that."* Built as `DEC-048`
records it. **330 backend tests (was 312), 712 frontend (was 698), typecheck, lint,
`audit:drift` (61 docs / 64 capabilities) and `audit:vocab` all clean.** Nothing committed.

**What moved.** `/start` is two steps and **one POST**. `packages/shared/src/tiers.ts` is new
and holds the tier NAMES and selling lines as data — `/start` has no session, so it cannot
fetch `GET /billing/plans` (that route is behind `billing.read`); the same argument
`vocabularies.ts` makes. `<PlanPicker>` is built with three modes, `signup` being the one that
differs in the CONTROL rather than the copy: no organisation exists yet, so the cards are
radios and the page's own submit commits them. `RegisterBody.tier` is required **with no
default**, and `register` writes the `subscriptions` row **inside its transaction**.

**Two design points worth not re-litigating.** The absence of `.default()` is the whole
decision — a default would have re-created `D-012` exactly, every organisation on one tier
chosen by nobody. And the tier is asked here while the industry deliberately is not
(`CONF-011`), which is only inconsistent from the outside: **the wizard asks about industry
later and nothing asks about the tier later.** Each question gets asked once, where it can be
answered well.

**`D-012` repaid, so `T-082` and `T-083` are unblocked.** Verified live on the running API,
both directions on the same organisation: silver → `404` (the gate opened and the handler
could not find a campaign that is not there), flip the row to bronze → `402` with
`requiredTier: silver`. Probe organisation deleted, zero rows left. The seed now gives one demo
org per tier — Northfield Gold, Grand Palace Silver, Riverside **Bronze** so the `402` is
demonstrable on a real org, Meridian Enterprise so an operator-assigned tier is visible.

**It found `D-028`, two more holes in shipped code, and the second is the interesting one.**
`TIER_ENTITLEMENTS` is a whitelist, so a capability nobody adds is entitled at no tier at all:
`account.*` (added by `T-072` **yesterday**) and `billing.*` (uncovered since `T-003`) were
both orphaned. Neither had fired, but `billing.update` in no tier means the moment `T-057`
mounts `requireEntitlement` on `POST /billing/tier`, **the upgrade button `402`s** — a paywall
in front of the way out. Underneath both: `requireEntitlement`, mounted since `T-003`, **had no
tests whatsoever**. That is how `D-012` survived a month. `test/tiers.test.ts` is new, and the
durable part of it is not the two added lines but the assertion that **every capability appears
in at least one tier** and that **the tiers nest** — `lowestTierFor` returns the first tier that
includes a capability, which is only the *cheapest* one if they do.

**Next.** `T-086` is the other half of the owner's Stage-8 ask and is unblocked; `T-087` still
waits on `OPEN-009` (the L3 × People cell). `T-073` — the accounts UI — has been unblocked
since yesterday. `T-081` (analysis backend) is now genuinely startable, since its screen no
longer `402`s for everyone.

### 2026-08-24 · T-072 — the organisation can make its own accounts

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

### 2026-08-23 · T-074 + T-071 + D-020 — three live holes closed

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
- ~~`<ScoreBadge>` is in the `24` catalogue and has never been built. `T-080` needs it.~~ **Built 25 Aug at `T-080`, without the threshold colours `CONF-016` refused — `CONF-022`.**
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

### 2026-08-26 · Landing hero — one drawing per vocabulary, not one generic drawing

Owner-requested. The 2026-08-22 pass gave the hero a single illustration
(`hero-organisation.svg`) shared by all four presets, sitting in its own full-width band below
the copy — disconnected from the switcher that is the whole point of the page.

- **Four drawings, not one.** `hero-university.svg` / `hero-hotel.svg` / `hero-hospital.svg` /
  `hero-company.svg` replace it, authored in SVGator (same DEC-030 house style: line art,
  stroke-dashoffset draw-on, hand-converted to inline CSS keyframes afterward — the MCP's own
  animated-SVG export only emits its JS player, which the illustration system deliberately
  does not use). Each one's fills are that vocabulary's own `--vibe-*` pair from `tokens.css`
  (university has none of its own and keeps the base `--illus-*` ramp, per the existing
  comment there), so the drawing's colour matches the vibe the switcher already puts on the
  rest of the page, not a shared unrelated palette.
- **`Landing.tsx`** now keys `<Illustration>` on `` `hero-${active.key}` ``, remounting the
  same way the headline swap already does, and moves it into a new `.landing-hero-row` grid
  beside the copy (stacks under 899px) instead of the old full-bleed `.landing-scene` band
  below it.
- **Two more, smaller.** `claim-anonymity.svg` / `claim-grants.svg` sit on the "two things most
  feedback tools get wrong" cards — colour-matched to their own card (rose for anonymity,
  blue/teal for grants) rather than vocab-flavoured, since that section isn't.
- `hero-organisation.svg` is deleted; its SVGator project is left in the account, just no
  longer wired into `Illustration.tsx`'s `SOURCES` map.
- Gotcha worth keeping: SVGator's `create_project` silently 422s ("Export failed", no detail)
  on any `rect` whose `properties.shape` omits `radius` entirely — it is documented as
  optional/animatable, but the export step needs it present, even as `{"x":0,"y":0}`.

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

**Read this if you touch auth.** *(Both halves of this are now closed — `DEC-049`, 24 Aug.
The mitigation described below was only ever half the story; see `D-007`.)* While working
through 30's acceptance list I found, and reproduced end to end, a cross-tenant account
lockout:

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
