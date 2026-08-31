# Demo run — IIIT Sri City, a whole college on Endur (Gold)

**Date:** 30 August 2026
**Build:** branch `vishv`, commit `57628706`, Stage 11 complete
**Ran against:** the real stack — Postgres 16 in `endur-db`, `@endur/api` on `:4000`, `@endur/web` on `:5173`
**Nature of the run:** end-to-end, through the real HTTP API with real cookie sessions and real
CSRF tokens, plus a browser pass over the React console. Every account below was created
through the product's own routes; nothing was inserted straight into the database.
**Code changed:** none *during the run*. Not one source file was edited while it was going on;
everything found was written down here instead.
**Follow-up (30 Aug, same day):** all five findings and four of the six smaller notes are now
FIXED, each with a regression test — see section 9. This document is left as it was WRITTEN, so
the symptoms below still read in the present tense; section 9 says what happened to each one.

---

## 1. How the run was performed

A throwaway harness (in the session scratchpad, not in the repo) drove the API exactly as a
browser would: it kept a cookie jar per actor, read `endur.csrf` out of the `Set-Cookie`
header and echoed it back as `x-csrf-token`, and followed the same order of operations the
console follows. Ten phases ran in sequence, 583 HTTP calls in total. Twenty-eight separate
signed-in identities took part, plus dozens of anonymous respondents holding only a public
link.

Two things had to be fixed in the **environment** before anything could run. Neither is a code
defect, but both will bite the next person:

1. Two migrations were unapplied on the dev database — `20260831090000_pending_tier` and
   `20260831100000_notifications_and_enterprise`. `prisma migrate deploy` applied them.
2. Even after that, the generated Prisma client was stale: it had no `notification` delegate,
   so `GET /inbox/messages` answered `500 — Cannot read properties of undefined (reading
   'findMany')`. `npm run db:generate -w @endur/api` fixed it, but the running dev server had
   to be killed first, because tsx holds the query-engine DLL open on Windows and
   `prisma generate` fails with a file lock while it is running.

Tally across all ten phases: **162 passes, 13 failures, 9 recorded observations.** The
thirteen failures collapse into five distinct issues, described in section 5. Several of the
"failures" are the system correctly refusing something — those are counted as passes when the
refusal was expected, and as failures only where a real user would be stuck.

---

## 2. The organisation that was built

**IIIT Sri City** — slug `iiit-sri-city`, industry `university`, **Gold** plan, paid at
sign-up (₹999, one `payments` row, `kind: signup`).

### Vocabulary

The whole console was re-skinned from `organization.labels` with no code change, which is
INV-001 working: Unit → **Department**, Subject → **Course**, Respondent → **Student**,
Reviewee → **Faculty**, Campaign → **Feedback cycle** (later renamed live to **Feedback
drive** through `PATCH /org/labels`, and every screen picked it up on the next `/auth/me`).

### Structure — 15 units, four levels deep

```
IIIT Sri City
├── Academics
│   ├── Computer Science and Engineering
│   ├── Electronics and Communication
│   └── Mathematics and Basic Sciences
├── Hostel and Mess
│   ├── Boys Hostel
│   ├── Girls Hostel
│   └── Central Mess
├── Sports and Physical Education
├── Administration
│   ├── Housekeeping
│   ├── Security
│   └── Transport
└── Library
```

Three more units (`Summer School 1..3`) were later created from a single range expression, and
a `Design Studio` unit was created, reparented to the root and deleted again to exercise the
structure editor.

### Role ladder — 10 roles

Director (L1), Dean (L2), Head of Department (L3), Professor (L4), Assistant Professor (L5),
Hostel Manager (L6), Mess Manager (L7), Sports Officer (L8), Support Staff (L9), Student (L10).

This ladder is the single most informative thing in the run, and section 5 is mostly about
what happens below level 4.

### People — 34, all created through `POST /people` and `POST /people/:id/assignments`

| Name | Role | Home unit | Sign-in | Account |
|---|---|---|---|---|
| Prof. Rajesh Kumar | Director | IIIT Sri City | `director+mtfzqplf@iiits.in` | active (founder) |
| Prof. Anitha Rao | Dean | Academics | `dean.acad+mtfzqplf@iiits.in` | active |
| Dr. Vikram Shetty | Head of Department | Computer Science and Engineering | `hod.cse+mtfzqplf@iiits.in` | active |
| Dr. Meera Nambiar | Head of Department | Electronics and Communication | `hod.ece+mtfzqplf@iiits.in` | active |
| Dr. Sanjay Iyer | Professor | Computer Science and Engineering | `prof.cse1+mtfzqplf@iiits.in` | active (password later changed to `iiits-new-password-2026`) |
| Dr. Kavya Reddy | Professor | Computer Science and Engineering | `prof.cse2+mtfzqplf@iiits.in` | active |
| Dr. Arun Prasad | Professor | Electronics and Communication | `prof.ece1+mtfzqplf@iiits.in` | no account |
| Dr. Nisha Varma | Assistant Professor | Computer Science and Engineering | `asst.cse1+mtfzqplf@iiits.in` | active |
| Dr. Rahul Menon | Assistant Professor | Mathematics and Basic Sciences | `asst.math1+mtfzqplf@iiits.in` | no account |
| Mr. Suresh Babu | Hostel Manager | Boys Hostel | `warden.bh+mtfzqplf@iiits.in` | active |
| Ms. Lakshmi Devi | Hostel Manager | Girls Hostel | `warden.gh+mtfzqplf@iiits.in` | no account |
| Mr. Ganesh Pillai | Mess Manager | Central Mess | `mess.mgr+mtfzqplf@iiits.in` | active |
| Mr. Joseph Thomas | Sports Officer | Sports and Physical Education | `sports.officer+mtfzqplf@iiits.in` | active |
| Mr. Ravi Kumar | Support Staff (cook) | Central Mess | `mess.cook1+mtfzqplf@iiits.in` | **revoked** during the account-lifecycle test |
| Ms. Sunitha Bai | Support Staff (cook) | Central Mess | `mess.cook2+mtfzqplf@iiits.in` | active |
| Mr. Mahesh Naik | Support Staff | Housekeeping | `house.1+mtfzqplf@iiits.in` | no account |
| Mr. Prakash Singh | Support Staff | Security | `sec.1+mtfzqplf@iiits.in` | no account |
| Mr. Imran Shaikh | Support Staff | Transport | `trans.1+mtfzqplf@iiits.in` | no account |
| Ms. Divya Krishnan | Support Staff | Library | `lib.1+mtfzqplf@iiits.in` | no account |
| Aditya Sharma | Student | CSE **+ Boys Hostel** | `student.cse1+mtfzqplf@iiits.in` | active |
| Priya Menon | Student | CSE **+ Boys Hostel** | `student.cse2+mtfzqplf@iiits.in` | active |
| Rohit Verma | Student | CSE **+ Boys Hostel** | `student.cse3+mtfzqplf@iiits.in` | no account |
| Sneha Patil, Karthik Raj, Ananya Gupta | Student | CSE | `student.cse4/5/6+mtfzqplf@iiits.in` | no account |
| Faisal Ahmed | Student | Electronics and Communication | `student.ece1+mtfzqplf@iiits.in` | active |
| Deepika Nair, Manoj Tiwari | Student | Electronics and Communication | `student.ece2/3+mtfzqplf@iiits.in` | no account |
| Shreya Joshi | Student | Mathematics and Basic Sciences | `student.ece4+mtfzqplf@iiits.in` | no account |
| Vishal Rana, Tanvi Desai | Student | CSE | imported from CSV | no account |
| Harsh Vardhan, Neha Kulkarni | Student | Electronics and Communication | imported from CSV | no account |
| Om Prakash | Support Staff | Housekeeping | imported from CSV | no account |

Every account password is `iiits-demo-password` unless the table says otherwise. Thirteen
activation links were minted, previewed and redeemed; all thirteen then signed in
successfully. The last five people were created through the CSV importer, which matched all
five role names and all four unit names with no manual mapping.

Three students were deliberately given a **second, non-primary position** in Boys Hostel, so
one person sits in two branches of the tree at once. The hostel announcement audience went
from 1 recipient to 4 the moment that happened, which is the audience resolver reading the
graph rather than a denormalised column.

### Subjects — 12

Five courses (`CS301 Operating Systems`, `CS402 Machine Learning`, `CS210 Data Structures`,
`EC305 Signals and Systems`, `MA201 Probability and Statistics`) with the first four linked to
the faculty member who teaches them, plus seven facility subjects (Central Mess, both hostel
blocks, Sports Complex, Library, Campus Transport, Housekeeping). Campus Transport was
archived at the end to test the archive path.

### Two more organisations, for contrast

* **Sri Valley Junior College** — registered on **Bronze**, used to prove the entitlement gates
  and tenant isolation, then moved to **Enterprise** by an Endur operator, suspended, and
  reinstated.
* **IIIT Sri City — Academic Pilot** — a second **Gold** college with only four roles
  (Dean / HoD / Faculty / Student). It exists because the ten-role ladder cannot reach the
  Gold improvement loop at all; see finding **F2**.

---

## 3. What was actually exercised

### Feedback and polls

| Feedback drive | Owner | Template | Audience | Responses | Result |
|---|---|---|---|---|---|
| Course feedback — Autumn 2026 (CSE) | HoD CSE | Course feedback (8 questions) | CSE subtree | 18 | readable, avg 3.83, NPS +22 |
| Course feedback — Autumn 2026 (ECE) | Director | Course feedback | ECE subtree | 7 | readable |
| Mess feedback — week 34 | Mess Manager | **own 6-question template** | anyone | 11 | readable, then closed by its owner |
| Hostel services — Boys Hostel | Hostel Manager | Facilities pulse | Boys Hostel subtree | 6 | readable, avg 3.8 |
| Sports complex feedback | Sports Officer | Facilities pulse | anyone | 3 | **suppressed** — under the k=5 threshold, as designed |
| Support staff review — Mess team | Director | Quick pulse | role = Support Staff | 1 | non-anonymous, organisation-only |
| Mess menu poll (4-week rotation) | Director | quick poll, 3 options | anyone | 9 | **results unreachable — see F1** |
| Suggestion box ("what to fix first") | Director | quick suggestion box | anyone | 8 | **responses unreachable, and absent from the Inbox — see F1** |

All six question kinds were used at least once: `rating`, `single`, `multi`, `text`, `yesno`,
`nps`. Sixty-three responses landed in IIIT Sri City and eight more in the pilot college. Both
`link` and `qr` channels were used.

Things that were proved along the way:

* A closed feedback drive's public link answers **404** to a late respondent.
* A second submission from the same signed-in person answers **409 — "You have already
  responded to this one."**
* A signed-out stranger opening an `access: organization` drive gets **401**; the same drive
  opens normally for a signed-in member of staff.
* The k-anonymity gate does not merely hide the numbers — the `questions` array is **absent**
  from the payload below the threshold, so there is nothing for a client to leak.
* A HoD from ECE asking for the CSE drive's results gets **404**, not 403 — the campaign does
  not exist as far as that reader is concerned.

### Reviews (the Gold improvement loop)

Run end to end in the pilot college: a Professor opened their cycle, filled in the
self-assessment, and read the **gap analysis** — self `5` against a received `3.25` on "How
clearly was the material explained?", a delta of `1.75`. They wrote a three-item action plan,
finalised it, their HoD held a check-in on it, added notes and finalised that too, and the
cycle read back as `finalised`. A Student attempting to hold a check-in on that plan was
refused with 403.

The same loop **could not be run in IIIT Sri City itself** — finding **F2**.

### Announcements

Four written, three published: one to everyone (34 recipients), one to the CSE subtree (12),
one by the Hostel Manager to Boys Hostel (1, then 4 once students had hostel positions), and
one draft to the Support Staff role (7 recipients) which was deliberately left unpublished and
then deleted. A student saw exactly the two addressed to them, did not see the draft, marked
one read, and the author's read count moved to `read=1 of 12`. A student trying to create an
announcement got 403.

### Slot booking

The Sports Officer created a badminton-court bookable, wrote nine slots (three days × three
hours, capacity 2 on the 17:00 slot and 4 on the others), opened it, and the public page
offered all nine. Three people tried to book the same capacity-2 slot: two succeeded, the
third got **409 — "That slot just filled. Pick another one."** One booker cancelled with their
own cancel token, and the freed seat was immediately bookable again. Staff then cancelled
somebody else's booking through `booking.cancel`, closed the bookable, and the public link went
to 404. The Director separately published eight fifteen-minute office-hour slots. A student
trying to create a bookable got 403.

### Powers, trust and safety

* The powers grid was read (177 rows), edited (30 cells across four roles), and re-read.
* `GET /grants/warnings` correctly flagged the self-approval case: *"Director can change any
  role's powers, including its own."*
* The simulator explained a decision in full — grant id, role, scope and anchor unit.
* **INV-004 held**: Support Staff were given `results.read` at `own_unit` and an explicit
  **deny** on `response.read` at the same scope. The simulator answered
  `allowed=false, reason=explicit_deny`, and the route itself answered 403.
* A state-changing POST with the CSRF cookie removed answered **403 CSRF_FAILED**.
* An unauthenticated `GET /people` answered **401**.
* The Bronze college could not read IIIT Sri City's campaign or people by id — **404** both
  times.
* The audit log recorded 219 rows for IIIT Sri City; a student reading it got 403.

### Billing

`GET /billing` reported Gold / active / 24 seats. Plans priced ₹99, ₹499, ₹999, ₹4,999. A
sideways move to Gold was refused 409; a *downgrade* through `POST /billing/tier` was refused
409 with the right explanation, while `POST /billing/downgrade` scheduled Silver for the period
end (30 September 2026) and `DELETE /billing/downgrade` cancelled it. An Enterprise enquiry was
raised and appeared on the operator's desk.

### Entitlements (the Bronze college)

`/analysis` → **402**, `/announcements` → **402**, `/bookables` → **402**, `/reflect` → **402**,
each naming the tier required. After the operator assigned Enterprise, announcements worked
immediately.

### The operator console

Signed in with password **plus TOTP** (a wrong code is refused 401). Read the estate (517
organisations), one customer's detail, platform stats, analytics, earnings (₹11,085 across 15
payments), the enterprise-request queue, the platform audit log and the log-file index. Sent a
message to IIIT Sri City, which arrived in the customer's own inbox. Assigned Enterprise to the
Bronze college — the only path to that tier. Suspended that organisation, confirmed the console
went 403 for them **and that IIIT Sri City was untouched**, then reinstated it. A customer
account calling `/platform/orgs` got 401.

### The React console

Signed in as the Director in a real browser. The shell renders the college's own vocabulary
(Department / Course / Student / Faculty), the published announcement appears as a banner, the
activity tiles read 63 responses across 9 courses and 5 collecting drives, the feedback-drive
cards show per-drive counts with Share / Results / Open, and a results page renders the rating
histogram, average, comment count and CSV export button. The poll card's **Results** button
lands on *"That is not here — that feedback drive does not exist"*, which is finding **F1**
seen from the user's side.

---

## 4. What it felt like to use

A few impressions that are not defects but are worth having on record.

**The vocabulary system genuinely works.** Nothing in the console had to be told it was a
college. Renaming `campaign` to "Feedback drive" mid-session changed every heading, the empty
states and the 404 copy — the not-found page literally says *"That feedback drive does not
exist"*. That is the strongest single demo moment in the product.

**Authorisation is honest.** Wrong-department reads answer 404 rather than 403, so a reader
cannot map what exists by probing. Deny beating allow was verifiable both through the
simulator and through the route. The simulator's explanation names the grant row that decided
it, which is exactly what the "why was this allowed?" screen needs.

**The seeded role ladder assumes four levels and a college has ten.** Everything below level 4
receives the level-4 grant row, and the level-4 row is thin. A Mess Manager could not create
a template; a Sports Officer could not create a bookable; a Professor cannot see the campaigns
list at all (403) or open the improvement loop. All of that is repairable from the powers grid
— except the improvement loop, which is not (finding **F2**). For a ten-role college the setup
wizard leaves you with an organisation where six of the ten roles can do essentially nothing
until an administrator goes and edits the grid by hand, and nothing on screen tells them that.

**Response rate can read above 100%.** The CSE drive shows 135% and the hostel drive 150%,
because a public link can be answered by anybody holding it while the denominator comes from
the audience rule. It is arithmetically defensible and it looks wrong on a dashboard an
evaluator is reading.

**A college needs people in two places at once and the model supports it, but nothing leads you
there.** Students only started receiving hostel announcements after a second, non-primary
position was added by hand. There is no import column and no obvious wizard step for "this
student also lives in Boys Hostel", so the natural first pass at a college produces hostel and
mess audiences of one person — the warden.

**Sign-in for a suspended organisation succeeds and then every page 403s.** The login itself
returns 200 and only the first console call fails. It works, but the user is told nothing
useful at the moment they would understand it.

---

## 5. Findings

No code was changed. Each entry below is what was observed, with the evidence and the place in
the code that appears to be responsible.

### F1 — Blocker · Quick polls and suggestion boxes have unreachable results, and their comments never reach the Inbox

> **FIXED 30 Aug** — `D-046`. The private copy of the predicate is gone; `results/service.ts`
> calls `campaignInScope` from `features/campaigns/visibility.ts` and both `select`s now fetch
> `subject.type`. Regression: `src/backend/test/quick-results.test.ts`, which was confirmed to
> fail against the old service before the fix landed.

**Symptom.** A poll with 9 recorded votes and a suggestion box with 8 recorded answers both
answer **404 NOT_FOUND** on `/campaigns/:id/results`, `/campaigns/:id/responses` and
`/campaigns/:id/export` — for the Director of the organisation that created them, one minute
after creating them. `GET /campaigns/:id` on the very same id returns 200. In the React console
the card shows "9 responses" and its **Results** button lands on the not-found page.

A second, quieter symptom: none of the 8 suggestion-box answers appear in the Inbox. The Inbox
holds 42 comments from 4 campaigns and contributes 0 from the suggestion box — and reading
comments in the Inbox is the entire stated purpose of that surface. `GET /analysis` for the
same campaign does not 404; it returns **200 with `responseCount: 0`**, which is worse, because
it reports an empty corpus as fact.

**Cause.** `src/backend/features/results/service.ts` carries its own copy of the visibility
predicate:

```ts
/** The one scope predicate, shared by assertVisible and readableCampaigns. */
function canSee(visibility, subjects) {
  if (visibility.all) return true;
  return subjects.some(({ subject }) =>
    subject.unitId !== null && visibility.unitIds.includes(subject.unitId));
}
```

at [service.ts:632](src/backend/features/results/service.ts:632). The shared predicate in
[features/campaigns/visibility.ts](src/backend/features/campaigns/visibility.ts) has a second
clause that this copy is missing — `subject.unitId === null && subject.type ===
'organisation'` — the clause DEC-093 exists to provide, because a quick campaign hangs off the
per-organisation singleton subject which has no unit. The two `select`s that feed it
([service.ts:377](src/backend/features/results/service.ts:377) and
[service.ts:606](src/backend/features/results/service.ts:606)) do not even fetch
`subject.type`, so the clause could not be evaluated if it were there.

**Why nobody noticed.** It only bites when `visibility.all` is false, and the seeded grant
matrix gives **no role** `results.read` or `response.read` at `all` — the widest seeded scope is
`subtree`. So this fails for every role in every organisation, including the founder. The
comment above the function claims it is shared with `assertVisible`; it is shared with
`assertVisible`, but not with the rest of the product.

**Affected:** `GET /campaigns/:id/results`, `/responses`, `/export`, the Inbox comment queue,
and the analysis corpus — all quick polls and all suggestion boxes.

---

### F2 — Blocker · The Gold improvement loop is unreachable for any organisation whose reviewee role sits below level 3, and cannot be granted

> **FIXED 31 Aug** — `DEC-112`, `T-107`, as a consequence of `F4`'s fix rather than by touching
> either rule below. Both are still exactly as written: `reflection.*` is still `self` at levels
> 1–3 and absent at 4, and the no-escalation guard still requires the granter to hold a
> capability at `all`. **What changed is which role lands on which row.** A ladder longer than
> four now puts its middle — the reviewees — on level 3, so `reflection.create` is there to be
> held, and nobody has to grant what nobody can grant.

> **FIXED 30 Aug** — `D-047`, `DEC-107`. Cause 2 was the real one and it is the one that
> changed: a grid cell whose scope is `self` claims no unit, so it is now bounded by whether the
> saver HOLDS the capability rather than by whether they hold it everywhere. Cause 1 — the
> matrix stopping at level 3 — is left alone deliberately: the loop is grantable in two clicks
> now, and whether a respondent-level role should reflect BY DEFAULT is a product question, not
> a defect. Regression: `src/backend/test/powers-grid.test.ts`.

**Symptom.** In IIIT Sri City, `GET /reflect` as a Professor answers **403**. When the Director
tried to fix that from the powers grid — the documented way to fix exactly this — `PUT /grants`
answered:

```
403 WOULD_ESCALATE
"You cannot give a role "write a self-reflection" — a role can be given to anybody anywhere,
 and you do not hold that everywhere in this organisation."
```

So the Gold feature the college paid for is unreachable, and there is no in-product path to
reach it.

**Cause.** Two rules that are individually reasonable and jointly fatal.

1. `GRANT_MATRIX` in [presets/grant-matrix.ts](src/backend/presets/grant-matrix.ts) gives
   `reflection.create`, `reflection.read`, `actionplan.create` and `actionplan.read` the row
   `S('self','self','self')` — levels 1, 2 and 3 only. `org/service.ts` clamps every role below
   the fourth to the level-4 row, and the level-4 row for these four capabilities is empty.
2. The no-escalation guard requires the granter to hold a capability **at `all`** before they
   can attach it to a role. Nobody holds `reflection.create` at `all`, because the matrix only
   ever grants it at `self`. Therefore nobody can ever grant it.

**Confirmed by contrast.** A second Gold college was registered with the four-role preset
ladder, where Faculty lands at level 3. There the whole loop ran clean: cycles listed,
self-assessment submitted, gap analysis computed (self 5 vs received 3.25, delta 1.75), a
three-item plan written and finalised, the HoD's check-in held and finalised, and the cycle
read back as `finalised`.

**Practical effect.** Any college with a realistic ladder — Director, Dean, HoD, Professor,
Assistant Professor, … — puts Faculty at level 4 or below and silently loses the entire Gold
tier. The demo works only because the seeded preset happens to have exactly four roles.

---

### F3 — Major · `GET /inbox/messages` returns 500 when the Prisma client is stale

> **FIXED 30 Aug** — `D-049`, `N-072`. `prisma generate` is now a `predev` script, so it runs
> BEFORE `tsx watch` takes the DLL lock, and the dev server prints any unapplied migrations at
> boot (`src/backend/db/preflight.ts`, reading through `db/graph.ts` because DEC-007 confines
> `$queryRaw` to that file). Both halves of the environment trap now announce themselves.

**Symptom.** `500 INTERNAL — "Something went wrong: Cannot read properties of undefined
(reading 'findMany')"`.

**Cause.** [features/inbox/service.ts:178](src/backend/features/inbox/service.ts:178) calls
`prisma.notification.findMany`. The `Notification` model arrived in migration
`20260831100000_notifications_and_enterprise`; if the client has not been regenerated since,
`prisma.notification` is `undefined`. The `postinstall` hook covers a fresh `npm install`, and
nothing covers "pulled a branch that added a model".

**Severity note.** It is an environment condition rather than a logic bug, but on the demo
machine it presents as a 500 on the operator-message inbox — a screen the operator story ends
on. After `npm run db:generate -w @endur/api` the route returned 200 and the operator's message
arrived correctly.

**Windows detail worth writing down:** `prisma generate` fails with a file lock while the tsx
dev server is running. The server has to be stopped first.

---

### F4 — Major · A ten-role college leaves six roles with almost no powers, and nothing says so

> **FIXED 31 Aug** — `DEC-112`, `T-107`. **The third suggestion below is the one taken**, after
> the owner met the same thing from the other end: *"logging with professor Kavya Reddy, nothing
> is coming on her account."* `levelForRole()` maps the BOTTOM role to the respondent row and
> the middle of the ladder to the reviewee row, so a ten-role college now gets one thin role
> instead of six. Four-role organisations are byte-for-byte unchanged. **This also closes `F2`**
> — `reflection.*` is `self` at levels 1–3 and absent at 4, so putting the middle of the ladder
> on level 3 hands the Gold loop back without touching either rule `F2` named.
>
> The 30 Aug note, kept because it is still true and still shipped: `D-048`. The first of the
> three suggestions below was taken first:
> `GET /grants/warnings` returns a `thin_starter_row` warning naming every role clamped to the
> level-4 row, so the grid says what the wizard did not. The DEFAULTS are unchanged — they are
> right for a four-role organisation — and a longer preset ladder for the industries whose real
> ladders are longer is still open.

**Symptom, as encountered.** The Mess Manager was refused `POST /templates` (403, `no_grant`).
The Sports Officer could not create a bookable. The Professor gets 403 on the campaigns list
and holds only 5 capabilities in `/auth/me`; a Student also holds 5.

**Cause.** `GRANT_MATRIX` defines four levels. `org/service.ts:130` clamps everything below to
the level-4 row, with a comment explaining that this is better than nothing — which it is, but
the level-4 row contains no `template.*`, no `campaign.read`, no `booking.*`, no
`announcement.create` and no `reflection.*`.

**Recovered by hand.** Thirty grant cells through `PUT /grants` gave Mess Manager, Hostel
Manager and Sports Officer the verbs their jobs need, after which every one of their flows
worked first time. So the model is right; the defaults are shaped for a four-role
organisation.

**Suggestion (not applied).** Either the setup wizard says plainly *"roles below the fourth
start with almost no powers — review the grid"*, or the wizard offers a per-role starting
template, or the preset defines more than four levels for the industries whose real ladders are
longer.

---

### F5 — Minor · Response rate renders above 100%

> **FIXED 30 Aug** — `N-069`, in the presentation and not in the arithmetic. Above the roll the
> results card stops printing a percentage and states the two counts instead — *"18 of 13 asked
> — more answers than people asked, anyone holding the link can respond"* — and the home card
> keeps the number with the same explanation. Dropping public campaigns from the rate was
> rejected: nearly every drive is public, so the card would be a dash everywhere.

`Course feedback (CSE)` shows **135%** and `Hostel services` shows **150%** on the results page
and the home tiles. The numerator counts every response to a public link; the denominator comes
from the audience rule. Anyone holding the link may answer, so the two are not commensurable.
PROGRESS.md records that a similar figure was fixed once before (rates of 1750–4675% from a
per-subject denominator); this is a different route to the same bad impression.

---

### Smaller notes

| # | Note |
|---|---|
| N1 | `GET /campaigns/:id/export` is 403 for a HoD, because `results.export` is seeded to levels 1–2 only. Correct by the matrix, but the console still shows an **Export CSV** button to someone who cannot use it. — **NOT REPRODUCED.** The button is already behind `can('results.export')` in `Results/index.tsx`, and only the Director's view was walked in the browser. No change made. |
| N2 | Sign-in for a suspended organisation returns **200**, and only the first console call returns 403. The user is not told why at the moment it happens. — **FIXED 30 Aug** (`N-070`): login answers 403 with the resolver's own sentence, AFTER the password is verified, so it never becomes an oracle for which organisations exist. |
| N3 | `POST /authz/simulate` takes `principalUserId` and a discriminated `target`, not `userId`/`unitId`. Fine, but easy to get wrong from the endpoint name alone. — **No change.** A naming observation; the shape is deliberate. |
| N4 | Announcements addressed to a unit reach only people **positioned** in it. A college's hostel and mess audiences are empty until students are given a second position, and nothing in the CSV importer or the wizard leads you to do that. — **FIXED 30 Aug** (`N-071`, `DEC-109`): the importer reads an **Also in** column and creates a second, non-primary position with the row's own role, bounded by INV-012 exactly like the first. |
| N5 | The dev database is full of junk from earlier test runs — 517 organisations, most named `Test Org n-1787…`, and the operator estate list is unusable because of it. Some suite was pointed at `DATABASE_URL` rather than `TEST_DATABASE_URL` at some point. — **NOT FIXED, and no code fix is owed.** `test/database.ts` already refuses any database that is not `_test` and refuses the one named in `.env` (`D-004`). The rows are data, most likely this run's own harness. Cleaning them is a `db:reset` plus `db:seed`. |
| N6 | `/analysis` on a campaign the caller cannot see returns `200 { responseCount: 0 }` rather than 404. Reporting "no data" for "not allowed to see the data" is a misleading answer, and it hid F1 for a while. — **FIXED 30 Aug** (`N-068`, `DEC-108`): `readCorpus` asserts visibility first. A campaign the reader CAN see but which sits below the threshold still answers `suppressed`, so the owner of a thin poll is not told it vanished. |

---

## 6. Done / not done

| Area | Status | What ran | What did not |
|---|---|---|---|
| Registration + payment | **Done** | Gold sign-up, `payments` row written, slug minted, session issued | — |
| Setup wizard | **Done** | 10 roles, 15 units, university labels, starter templates, one transaction | — |
| Vocabulary | **Done** | All five nouns re-skinned; live rename picked up everywhere | — |
| Structure | **Done** | Create, reparent, delete, range-expand (`Summer School 1..3`), composition, impact | — |
| Roles | **Done** | Ten-role ladder, levels derived from order | Reorder (`POST /roles/reorder`) and delete-with-reassign not exercised |
| Powers grid | **Done** | Read 177 cells, wrote 30, warnings, simulator, deny-beats-allow | Granting `reflection.*` — blocked by F2 |
| People | **Done** | 28 created, 5 imported from CSV, filters by unit and role, second positions, powers-by-place | Avatar upload; delete-person |
| Accounts | **Done** | 13 invites minted, previewed, redeemed; sign-in; reset; revoke; revoked account refused | — |
| Subjects | **Done** | 12 created, 4 linked to faculty, archive + archived list | — |
| Templates | **Done** | Library list, clone, create, 6 questions across all 6 kinds | Template delete |
| Feedback drives | **Done** | 6 full drives + 2 quick surfaces, launch, audience preview, close | — |
| Responses | **Done** | 71 submissions, link + QR channels, duplicate guard, closed-link 404, org-only gating | Kiosk/API channels |
| Results | **Partly → whole** | Aggregates, per-course filter, NPS, distributions, k-anonymity suppression, CSV export | Quick poll / suggestion box results — F1, **fixed 30 Aug** |
| Inbox | **Partly → whole** | 42 comments queued, read/unread, operator message received | Suggestion-box comments never arrive — F1, **fixed**; `/inbox/messages` 500 on a stale client — F3, **fixed** |
| Analysis | **Done** | Themes, sentiment, trend, reliability; theme drill-down with quotes | Reported the wrong thing for invisible campaigns — N6, **fixed 30 Aug** |
| Announcements | **Done** | 3 published + 1 draft, three audience kinds, preview counts, receipts, delete, 403 for students | Scheduled publishing (does not exist) |
| Booking | **Done** | Bookable, 9 slots, open, public page, capacity contention 409, self-cancel, re-book, staff cancel, close, 404 after close | Booking reminders / calendar export (do not exist) |
| Improvement loop | **Partly → reachable** | Full loop in the 4-role pilot college: reflect → gap → plan → finalise → check-in → finalised | Unreachable in the 10-role college — F2, **fixed 30 Aug**: grantable from the powers grid, still not on by default below level 3 |
| Audit | **Done** | 219 rows read by the Director; 403 for a student | Filtering by actor/date not exercised |
| Billing | **Done** | Summary, plans, upgrade refusal, scheduled downgrade + cancel, enterprise request, 403 for students | A real upgrade (the org was already on the top self-serve tier) |
| Entitlements | **Done** | Bronze blocked from analysis, announcements, booking, reflect — 402 with the required tier named | — |
| Tenant isolation | **Done** | Cross-org reads answer 404; suspension is per-organisation | — |
| Security middleware | **Done** | CSRF rejection, 401 without a session, TOTP on the operator console, wrong code refused | Rate-limit lockout not driven to its limit |
| Operator console | **Done** | Login with MFA, estate, org detail, stats, analytics, earnings, enterprise queue, message to customer, audit, logs, plan assign, suspend/reinstate, 401 for customers | Operator management (`POST /platform/operators`) not exercised |
| React console | **Partly** | Signed in, home, feedback-drive list, results page, vocabulary, announcement banner | Only the Director's view was walked in the browser; every other role was checked over the API |

---

## 7. The flow this suggests for a college

Running it as a college rather than as a test made one ordering obvious. If this is going to be
demonstrated, this is the sequence that works, in this order:

1. **Sign up on Gold** and complete the wizard with the *four-role* ladder — Dean, Head of
   Department, Faculty, Student. A longer ladder no longer LOSES the Gold tier (F2 is fixed and
   `reflection.*` is grantable from the grid), but the four-role ladder still needs no grid
   editing at all, which is one less thing to do on stage.
2. **Build the tree once**, including hostel, mess, sports and administration, even if only
   academics gets used. It costs one request and it is what makes the org look like a college.
3. **Import people from CSV.** It matched every role and unit name without mapping and it is
   the fastest thing in the product.
4. **Give the students who live in hostels a second position** in their block — now an
   **Also in** column in the CSV, so it costs nothing (N4). Do it before the announcement demo,
   or the hostel audience will be one person.
5. **Mint accounts for the handful you will actually sign in as** — one HoD, one Professor, one
   student, one facility manager. Activation is a two-request flow and it is convincing.
6. **Link each course to the faculty who teaches it.** Everything in the improvement loop hangs
   off `linkedUserId`, and it is invisible until it is missing.
7. **Launch the course feedback drive from the HoD's own account**, not the Director's. Scope
   is the interesting part, and it only shows when the launcher is not omnipotent.
8. **Collect at least five responses per subject you intend to open.** Under five, the results
   page shows nothing at all — which is itself a good thing to demonstrate deliberately, using
   the sports drive, rather than by accident on the main one.
9. **Show the Inbox** for the free-text comments, then **Analysis** for the themes. The
   suggestion box is safe to show since F1 was fixed; the course drive is still the richer one.
10. **Show the gap analysis.** Self 5 against a received 3.25 is the single most persuasive
    screen in the product, and it needs the professor's own account.
11. **Announcements and booking last** — they are the fastest to demonstrate and they survive a
    shortage of time.
12. **The operator console as the closer**: estate, earnings, assign Enterprise, suspend,
    reinstate. The MFA prompt is worth showing.

Both of the things that had to be fixed before this flow was safe to run in front of anyone —
**F1**, because the poll and the suggestion box are the two one-click surfaces most likely to be
tried on stage, and **F2**, because it decided whether the Gold tier existed at all for the
shape of ladder a real college has — were fixed on 30 August. See section 9.

---

## 8. Reproducing this

```bash
docker start endur-db
cd "src/backend" && npx prisma migrate deploy
npm run db:generate -w @endur/api     # stop the dev server first on Windows
npm run dev:api
npm run dev:web
```

Then sign in at `http://localhost:5173` as `director+mtfzqplf@iiits.in` /
`iiits-demo-password`. The operator console is at `/ops` with `owner@endur.test` /
`endur-ops-password` and a TOTP code from `npm run ops:code -w @endur/api`.

The three organisations created by this run are `iiit-sri-city`,
`iiit-sri-city-academic-pilot-mtg03z6q` and `sri-valley-junior-college-mtg01sn2`. They are
still in the dev database.

Final state of IIIT Sri City: 18 units, 34 people, 34 user rows, 13 subjects, 8 feedback
drives, 63 responses, 3 announcements, 2 bookables, 3 bookings, 219 audit rows.

---

## 9. What was done about all this — 30 August 2026

Written after the run, in the same day. Every finding above was fixed or deliberately not
fixed, with the reason recorded. Nothing was renumbered: `F1`…`F5` and `N1`…`N6` below are the
same items as above, and the `D-`, `N-` and `DEC-` ids are the ledger entries they became in
`architecture/_MEMORY.md` and `PROGRESS.md` § Debt.

| Finding | Ledger | Outcome |
|---|---|---|
| F1 quick-surface results unreachable | `D-046` | **Fixed** — the duplicated predicate deleted |
| F2 improvement loop ungrantable | `D-047`, `DEC-107` | **Fixed** — `self` cells bounded by holding, not by reach |
| F3 stale Prisma client 500s the inbox | `D-049`, `N-072` | **Fixed** — `predev` generate + boot-time migration check |
| F4 ten-role college has six thin roles | `D-048` | **Warned** — `thin_starter_row`; defaults unchanged |
| F5 response rate over 100% | `N-069` | **Fixed in presentation** — counts, not a percentage |
| N1 Export button for a caller who cannot export | — | **Not reproduced** — already gated on `can('results.export')` |
| N2 suspended org signs in, then 403s | `N-070` | **Fixed** — refused at the sign-in, after the password |
| N3 `/authz/simulate` argument shape | — | **No change** — deliberate |
| N4 no path to a second position | `N-071`, `DEC-109` | **Fixed** — an `Also in` column in the importer |
| N5 517 junk orgs in the dev database | — | **Not fixed** — data, and the test resolver already refuses `DATABASE_URL` |
| N6 `/analysis` says "no data" for "not yours" | `N-068`, `DEC-108` | **Fixed** — 404, with `suppressed` kept distinct |

### The two that were worth the run on their own

**F1 was one predicate written twice.** `features/campaigns/visibility.ts` exists BECAUSE the
same rule had already been written twice and the copies drifted (DEC-093); a third copy was
sitting in `results/service.ts` the whole time, missing the organisation-subject clause, and its
`select`s did not fetch `subject.type` — so the clause could not have worked had somebody added
it. It failed for **every role in every organisation**, because no seeded role holds
`results.read` or `response.read` at `all`. The fix is a deletion: the copy is gone and the
shared predicate is called, which is INV-009 as written.

**F2 was two correct rules meeting.** `reflection.*` and `actionplan.*` are seeded at `self` and
at no other scope; the grid's escalation bound demanded the saver hold a capability EVERYWHERE
before handing it out. Nobody can hold at `all` what the matrix only ever writes at `self`, so
the row was unreachable by construction — on the one screen documented as the way to reach it.
A `self` cell claims no unit, so it is now bounded by holding, which is the reading
`authz/escalation.ts` has always taken when bounding a POSITION. What did NOT change: a
capability the saver does not hold at all is still refused, and a capability with even one
unit-scoped cell in the same save is bounded the old way, so `self` cannot wrap a wider cell
past the guard.

### Files touched

```
packages/shared/src/dto/grant.ts             thin_starter_row warning kind
packages/shared/src/dto/person.ts            ImportRow.alsoUnitName
src/backend/db/graph.ts                      appliedMigrations()  (DEC-007 keeps $queryRaw here)
src/backend/db/preflight.ts                  NEW — pending-migration warning at boot
src/backend/server.ts                        calls it, after the port is bound
src/backend/package.json                     predev: prisma generate
src/backend/middleware/requireNoGrantEscalation.ts   self cells bounded by holding
src/backend/features/results/service.ts      shared predicate; readCorpus asserts visibility
src/backend/features/analysis/{router,service}.ts    req threaded through for the 404's wording
src/backend/features/roles/service.ts        thin_starter_row warning
src/backend/features/auth/router.ts          suspended org refused at login
src/backend/features/people/{service,positions}.ts   the second unit, and its INV-012 bound
src/frontend/pages/console/Results/stats.ts  counts instead of a percentage above the roll
src/frontend/pages/console/Home/cards.ts     the same, explained
src/frontend/pages/console/People/ImportWizard.tsx   Also in column, sample table, copy
```

Tests: `src/backend/test/quick-results.test.ts` is new (F1, N6). `powers-grid.test.ts` gains the
F2 and F4 cases, `people.test.ts` the two N4 cases, `platform.test.ts` the N2 assertion, and
`test/helpers.ts` now carries each session's credentials so a test can sign in a second time.

### How the checks were run, and one thing to know

`npm run typecheck`, `npm run lint`, `npm run audit:vocab` and `npm run audit:drift` are all
clean. The backend suite was run **in batches** with `--pool=forks --poolOptions.forks.singleFork`:
the full parallel run on this machine dies with `Memory allocation error` from argon2, which is
memory-hard by design and does not survive that many workers at once — unrelated to any of these
changes. `src/frontend/router/boundaries.test.tsx` fails identically before and after (an
undici/`AbortSignal` mismatch in the test environment); it was checked against a clean stash.
