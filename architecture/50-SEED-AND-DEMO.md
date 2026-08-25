# 50 — Seed data and the demo

Phase: P1 · Milestone: **M0** · Owns: `src/backend/database/seed/**`, `src/backend/presets/**`
Source: `design_specs/BUILD_PLAN_EVAL1.md` §3, §6, §7

> **Seed data lands 22 Aug, not 26 Aug.** A seeded demo alone can pass. An unseeded live build
> cannot (`02` §2).

---

## 1. Industry presets

A from-scratch wizard takes ten minutes on stage. That is too slow, and silence kills a demo.
Presets pre-fill roles, unit structure, labels and starter templates — all still editable — so
live creation becomes ~90 seconds and customizability is still fully demonstrated, because you
edit the preset in front of them.

**Ship five: University · Hotel · Hospital · Company · Custom.**

A preset is **data, not code**. Adding a sixth must never require a migration
(`01` §7).

```ts
// src/backend/presets/types.ts
export type Preset = {
  key: Industry;
  displayName: string;
  roles:  { name: string }[];            // order IS the level
  units:  { name: string; children?: UnitSeed[] }[];
  labels: LabelSet;
  templates: TemplateSeed[];             // 3 starter templates each
  grants: GrantSeed[];                   // the derived level rule, 11 §8
};
```

| | University | Hotel | Hospital | Company | Custom |
|---|---|---|---|---|---|
| L1 | Dean | General Manager | Director | Executive | Level 1 |
| L2 | Head of Department | Manager | Head of Department | Manager | Level 2 |
| L3 | Faculty | Staff | Nurse | Team Lead | Level 3 |
| L4 | Student | Guest | Patient | Employee | Level 4 |
| unit | Department | Property | Ward | Team | Unit |
| subject | Course | Restaurant | Service | Project | Subject |
| respondent | Student | Guest | Patient | Employee | Respondent |
| reviewee | Faculty | Staff member | Clinician | Manager | Reviewee |
| campaign | Feedback cycle | Guest survey | Patient survey | Review cycle | Campaign |

### The seeded grant matrix — authoritative

`11` §8 gives the *rule*; this is the *table*, and it is what `GrantSeed[]` compiles to. Every
preset uses the same matrix — only the role **names** differ, which is the whole point of the
generic model.

All grants are written `derived: true`. Editing one in the powers grid clears that flag so
regeneration never silently reverts an administrator's change (`10` §9).

| Capability | L1 | L2 | L3 | L4 |
|---|---|---|---|---|
| `org.read` | all | all | all | all |
| `org.update` | all | — | — | — |
| `org.delete` | all | — | — | — |
| `unit.read` | subtree | subtree | own_unit | — |
| `unit.create` `unit.update` | subtree | subtree | — | — |
| `unit.delete` `unit.reparent` | subtree | — | — | — |
| `role.read` | all | all | all | — |
| `role.create` `role.update` `role.delete` | all | — | — | — |
| `grant.read` | all | all | — | — |
| `grant.update` | all | — | — | — |
| `person.read` | subtree | subtree | own_unit | — |
| `person.create` `person.update` | subtree | subtree | — | — |
| `person.delete` `person.import` | subtree | — | — | — |
| `assignment.create` `assignment.delete` | subtree | own_unit | — | — |
| `account.create` `account.reset` | subtree | subtree | — | — |
| `account.revoke` | subtree | — | — | — |
| `group.*` `delegation.*` | subtree | — | — | — |
| `subject.read` | subtree | subtree | own_unit | **own_unit** |
| `subject.create` `subject.update` `subject.archive` | subtree | subtree | — | — |
| `template.read` `template.clone` | all | all | all | — |
| `template.create` `template.update` | all | all | — | — |
| `template.delete` | all | — | — | — |
| `campaign.read` `campaign.create` `campaign.launch` `campaign.close` | subtree | subtree | own_unit | — |
| `campaign.update` | subtree | subtree | own_unit | — |
| `campaign.delete` | subtree | — | — | — |
| `response.read` `results.read` | subtree | subtree | own_unit | — |
| `response.export` `results.export` | subtree | subtree | — | — |
| `analysis.read` | subtree | subtree | own_unit | — |
| `reflection.create` `reflection.read` | **self** | **self** | **self** | — |
| `actionplan.create` `actionplan.read` | **self** | **self** | **self** | — |
| `checkin.create` `checkin.read` | subtree | subtree | own_unit | — |
| `simulator.run` | all | subtree | — | — |
| `audit.read` | all | — | — | — |
| `billing.read` `billing.update` | all | — | — | — |

**Plus, for every role without exception:**

```
person.read    scope: self   allow
person.update  scope: self   allow
```

Those two back `/app/profile` (`47`). A default-deny model silently produces an unopenable
profile page if `self` is forgotten, so the seed must never omit them — and `11` §10 has an
acceptance test for exactly this.

Notes on four rows that look surprising:

- **`template.*` is `all`, not `subtree`.** Templates are org-wide artefacts with no unit, so
  a unit scope would mean nobody could read them. Scope is about the org graph; templates are
  not in it.
- **L3 gets `results.read own_unit`.** A reviewee seeing their own feedback is the product
  working. In P3 the improve loop adds a gate on top — results stay locked until the
  self-reflection is submitted (`44`) — but that is an additional check, not a different grant.
- **The improve-loop rows are `self` and stay `self` — added at `T-083`.** These are the nine
  capabilities `D-033` deliberately left, and their scopes are **not** copied from the block
  above. A reflection is a person's own account of their own weaknesses, and `44` says
  getting this wrong *"exposes someone's private self-assessment to a peer"*. There is no
  seeded value that opens somebody else's. What a supervisor gets is the **check-in** — the
  conversation about the plan — and that is the only row here that reaches past the caller.
  **Not L4**, for the same reading of the ladder `results.read` already takes: L3 is the
  reviewee and L4 is the respondent-level role, and somebody nobody reviews has nothing to
  reflect on.
- **`analysis.read` matches `results.read` exactly, and it was MISSING ALTOGETHER until
  `T-081` (2026-08-25, `D-033`).** Not restricted, not deliberately withheld — absent, so no
  seeded role in the product had ever held it and `/api/v1/analysis` would have returned 403
  to every user of every organisation including a Gold one. It is the same shape as `D-012`,
  where every org was silently Bronze because nothing wrote a `subscriptions` row, and as
  `D-028`, where `account.*` and `billing.*` were in no tier at all: **the entitlement said
  yes and the grant said nothing.** `analysis.read` is entitled at Silver (`16` §3), which is
  what made it look built.

  Nine more are still absent and they are the same bug waiting: `reflection.*`,
  `actionplan.*`, `checkin.*` (`T-083`'s, `44`) and `apikey.*` (`45`, not on the M0 board).
  They are left for the task that mounts their routes, because a grant to a route that does
  not exist cannot be tested and would just be a second thing to remember. What is NOT left
  to memory is the discovery: `test/routes.test.ts` now asserts that **every capability a
  mounted route requires is seeded to at least one role**, so the next one fails a test the
  day its router is mounted rather than the day someone opens the page.

  The scope matches `results.read` for the same reason `results.read` has it: the themes in
  a reviewee's own feedback are their own feedback. The drill-through is separately gated —
  see below.
- **`account.revoke` stops at L1, where `account.create` and `account.reset` reach L2.**
  `57` gives the reason: creating a sign-in is routine and re-issuing is the support path,
  but revoking ends somebody's access in the middle of their working day. The three are
  separate verbs precisely so this row can differ from the two above it.
- **L4 gets `org.read`, `subject.read: own_unit`, and nothing else** beyond the two universal
  self rows. L4 is the respondent-level role. Respondents are not `users` (DEC-009), so this
  row only matters for the case of someone at that level who *does* hold an account.

  **That case stopped being rare on 2026-08-24.** `T-072` made provisioning a sign-in for
  anybody in the graph a one-click action, and the owner's first question about it was what
  such an account should see. The answer wanted is *the Subjects list and nothing else in
  `organize`*, which this row could not produce, because it had **no `subject.read` at all**.

  **`T-086` added one, at `own_unit`, on 2026-08-24** — closing the smaller half of
  `OPEN-009`. `own_unit` rather than `all`: a respondent-level account has a reason to see
  the subjects of the section they are in and no reason to enumerate every subject in the
  organisation. `own_unit` rather than `subtree` for the reason `unit.read` stops there at
  L3: L4 sits at the bottom, so a subtree below them is usually empty and, when it is not,
  they are not the person who should be reading it.

  It is a change to what **every** organisation gets by default, which is why it waited for
  the owner rather than a session assuming it. `org.test.ts` asserts the L4 row exactly, so a
  fifth capability cannot join it quietly. The genuinely open cell — L3 × People — is still
  `OPEN-009`'s and still blocks `T-087`. See `55` § Stage 8.

Presets ship **no deny grants**. A `deny` is a deliberate administrator act, and seeding one
would teach the wrong lesson about a rule that is absolute (INV-004).

**Custom is not blank.** Even the custom path seeds a working four-level structure — a blank
start is the enemy, and someone who picks Custom and presses Continue four times must still
end with a functioning organisation (`customization.md` §8).

When an evaluator names something unexpected — a gym, an NGO, a school district — pick the
nearest preset and rename three things. A gym is a Company. That handles the hard question
gracefully instead of freezing (`31` § Step 1).

## 2. Starter templates

Three or four per preset, and **none exceeds 10 questions** — enforced by a seed test,
because short forms are the product thesis and not a preference (`01` §5, `36`).

**Amended 2026-08-19, while building T-015.** This section said "three per preset" and gave
university and hospital no one-question form — which contradicted §7's acceptance item
*"Each preset ships at least one 1-question pulse template"*. The acceptance list is the
definition of done, so both gained a `Quick pulse` and the table above now matches what
actually ships.

| Preset | Templates |
|---|---|
| University | Course feedback (8q) · Facilities pulse (3q) · Semester review (6q) · Quick pulse (1q) |
| Hotel | Stay experience (6q) · Restaurant feedback (4q) · Quick pulse (1q) |
| Hospital | Patient experience (7q) · Ward facilities (4q) · Discharge pulse (3q) · Quick pulse (1q) |
| Company | Manager feedback (8q) · Team health (5q) · Quick pulse (1q) |
| Custom | General feedback (5q) · Quick pulse (1q) |

The 1-question "quick pulse" templates are deliberate: they make DEC-010's *"a poll is a
one-question template"* concrete rather than theoretical, and they demonstrate the claim
without a word of explanation.

Library templates are seeded with `orgId = null` (`10` §4.2) and cloned into orgs on demand.

## 3. Demo organisations

Four fully populated orgs, each with **historical responses** — not empty shells. An empty org
proves the schema; a populated one proves the product.

| Org | Preset | Tier | Scale |
|---|---|---|---|
| Northfield University | University | **Gold** | 2 schools, 6 departments, 18 courses, ~40 staff, 3 closed campaigns, ~1,800 responses |
| The Grand Palace | Hotel | **Silver** | 3 properties, 9 units, 12 subjects, ~25 staff, 2 campaigns, ~600 responses |
| Riverside Hospital | Hospital | **Bronze** | 4 wards, 8 subjects, ~30 staff, 1 campaign, ~400 responses |
| Meridian Consulting | Company | **Enterprise** | 5 teams, 10 projects, ~35 staff, 2 campaigns, ~500 responses |

**One organisation per tier, added 2026-08-24 (`T-088`), and it is what `D-012` asked for.**
Until then no demo org had a `Subscription` row at all, so all four were silently Bronze and
the `402` path could be described but never shown. The assignment follows the demo script in
§5 rather than being alphabetical: **Northfield** is opened first and is where the improve loop
lives, so Gold; **The Grand Palace** is step 2 and keeps analysis, so Silver; **Riverside** is
Bronze, because the screen that says *"that feature is not included in your plan"* is only
convincing on an organisation that genuinely is not on it; **Meridian** is Enterprise, a tier
no picker offers (`DEC-048`), which is the only way to see that operator-assigned tiers are
real.

Response generation rules — realistic data is what makes the results screen convincing:

- Ratings are **not uniform**. Skew positive with a long negative tail, which is what real
  feedback looks like.
- Response counts vary by subject. A uniform 100 per course reads as fake at a glance.
- Comments are drawn from a written pool of realistic sentences, varied per subject. Lorem
  ipsum in a comment list destroys the illusion instantly.
- Timestamps spread across each campaign window, with a spike at the start and before the
  close.
- At least one subject deliberately scores badly, so the results screen has something to show.
- One campaign is left `open` and under-subscribed, so the k-anonymity suppression state is
  reachable during the demo (`40`).

## 4. Commands

```
npm run db:seed            presets + library templates + 4 demo orgs
npm run db:seed -- --demo  demo orgs only, assumes presets exist
npm run db:reset           drop → migrate → seed
```

**`db:reset` must stay fast and reliable — it is the recovery path during a live demo.**
Target under 30 seconds. Rehearse it.

Seeded logins are printed at the end of the seed run and are the same credentials the
development-only login affordance prefills (`30`).

## 5. The demo script

From `design_specs/BUILD_PLAN_EVAL1.md` §6. Rehearse it end to end at least three times.

1. Open **Northfield University** — familiar ground, fully populated
2. Switch to **The Grand Palace** — *same product, entirely different vocabulary.* This lands
   the core claim in ten seconds, and the vocabulary chips are what visibly change first
3. Ask the evaluator to **name an organisation type**
4. Create it live: preset → rename roles → add two units → adjust labels (~90 seconds)
5. Add a subject, clone a template, tweak a question
6. Launch a campaign → **show the QR code**
7. **The evaluator scans it on their own phone and submits**
8. Refresh results — **their response is there**

Steps 7–8 are what gets remembered. Rehearse on the actual venue network, with a hotspot as
backup.

If there is time, step 9: open the **simulator** and let the evaluator ask why someone can or
cannot do something (`42`). It is the strongest answer available to a permissions question.

## 6. Risks

| Risk | Mitigation |
|---|---|
| QR points at `localhost` | OPEN-002 — decide the tunnel by 24 Aug; test on two phones |
| Venue network fails | Local build + phone hotspot + **a recorded backup video of the QR flow** |
| Live creation breaks on stage | Pre-seeded orgs are always demoable; `Skip setup` is the escape hatch (`31`) |
| Seed is slow or flaky | Target < 30 s for `db:reset`; rehearse it |
| Fonts blocked at the venue | Self-hosted by 24 Aug (`21` §4) |
| Response data looks fake | §3 generation rules — this is why they are specified |

## 7. Acceptance

- [ ] Five presets seed correctly, each producing a working org with no further input
- [ ] No seeded template exceeds 10 questions — enforced by test
- [ ] Each preset ships at least one 1-question pulse template
- [ ] Four demo orgs seed with historical responses matching §3's realism rules
- [ ] Switching orgs visibly changes the vocabulary chips first
- [ ] One org has an under-subscribed open campaign, so suppression is demonstrable
- [ ] `db:reset` completes in under 30 seconds
- [ ] Seeded credentials are printed and match the dev login affordance
- [ ] Those four words appear outside `presets/**` and `database/seed/**` only in prose —
      never as an identifier, a string key or a path (INV-002).

      **Amended 2026-08-19, while building T-025.** This item used to be a bare
      `grep -riE` for the words themselves, which flags the sentences that *explain* the
      invariant as though they broke it. A check that cries wolf gets ignored — the same
      lesson the drift script learned at T-003. The identifier half is now enforced
      continuously by an ESLint rule, and `test/seed.test.ts` covers the rest.
- [ ] The full demo script has been rehearsed three times before 26 Aug

## 8. Out of scope

| Not building | Why |
|---|---|
| A seed UI | CLI is fine and faster |
| Randomised seeds | Deterministic seeds so the demo is identical every run |
| More than four demo orgs | Four covers the range; a fifth is maintenance |
| Faker for comments | A written pool reads real; generated text does not |
