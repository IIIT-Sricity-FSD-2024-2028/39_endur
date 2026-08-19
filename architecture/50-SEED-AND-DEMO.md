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
| `group.*` `delegation.*` | subtree | — | — | — |
| `subject.read` | subtree | subtree | own_unit | — |
| `subject.create` `subject.update` `subject.archive` | subtree | subtree | — | — |
| `template.read` `template.clone` | all | all | all | — |
| `template.create` `template.update` | all | all | — | — |
| `template.delete` | all | — | — | — |
| `campaign.read` `campaign.create` `campaign.launch` `campaign.close` | subtree | subtree | own_unit | — |
| `campaign.update` | subtree | subtree | own_unit | — |
| `campaign.delete` | subtree | — | — | — |
| `response.read` `results.read` | subtree | subtree | own_unit | — |
| `response.export` `results.export` | subtree | subtree | — | — |
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

Notes on three rows that look surprising:

- **`template.*` is `all`, not `subtree`.** Templates are org-wide artefacts with no unit, so
  a unit scope would mean nobody could read them. Scope is about the org graph; templates are
  not in it.
- **L3 gets `results.read own_unit`.** A reviewee seeing their own feedback is the product
  working. In P3 the improve loop adds a gate on top — results stay locked until the
  self-reflection is submitted (`44`) — but that is an additional check, not a different grant.
- **L4 gets `org.read` and nothing else.** L4 is the respondent-level role. Respondents are
  not `users` (DEC-009), so this row only matters for the rare case of someone at that level
  who *does* hold an account.

Presets ship **no deny grants**. A `deny` is a deliberate administrator act, and seeding one
would teach the wrong lesson about a rule that is absolute (INV-004).

**Custom is not blank.** Even the custom path seeds a working four-level structure — a blank
start is the enemy, and someone who picks Custom and presses Continue four times must still
end with a functioning organisation (`customization.md` §8).

When an evaluator names something unexpected — a gym, an NGO, a school district — pick the
nearest preset and rename three things. A gym is a Company. That handles the hard question
gracefully instead of freezing (`31` § Step 1).

## 2. Starter templates

<<<<<<< HEAD
Three per preset, and **none exceeds 10 questions** — enforced by a seed test, because short
forms are the product thesis and not a preference (`01` §5, `36`).

| Preset | Templates |
|---|---|
| University | Course feedback (8q) · Facilities pulse (3q) · Semester review (6q) |
| Hotel | Stay experience (6q) · Restaurant feedback (4q) · Quick pulse (1q) |
| Hospital | Patient experience (7q) · Ward facilities (4q) · Discharge pulse (3q) |
=======
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
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
| Company | Manager feedback (8q) · Team health (5q) · Quick pulse (1q) |
| Custom | General feedback (5q) · Quick pulse (1q) |

The 1-question "quick pulse" templates are deliberate: they make DEC-010's *"a poll is a
one-question template"* concrete rather than theoretical, and they demonstrate the claim
without a word of explanation.

Library templates are seeded with `orgId = null` (`10` §4.2) and cloned into orgs on demand.

## 3. Demo organisations

Four fully populated orgs, each with **historical responses** — not empty shells. An empty org
proves the schema; a populated one proves the product.

| Org | Preset | Scale |
|---|---|---|
| Northfield University | University | 2 schools, 6 departments, 18 courses, ~40 staff, 3 closed campaigns, ~1,800 responses |
| The Grand Palace | Hotel | 3 properties, 9 units, 12 subjects, ~25 staff, 2 campaigns, ~600 responses |
| Riverside Hospital | Hospital | 4 wards, 8 subjects, ~30 staff, 1 campaign, ~400 responses |
| Meridian Consulting | Company | 5 teams, 10 projects, ~35 staff, 2 campaigns, ~500 responses |

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
<<<<<<< HEAD
- [ ] `grep -riE '\b(course|faculty|student)\b' src/ packages/ --include=*.ts` hits only the
      university preset (INV-002)
=======
- [ ] Those four words appear outside `presets/**` and `database/seed/**` only in prose —
      never as an identifier, a string key or a path (INV-002).

      **Amended 2026-08-19, while building T-025.** This item used to be a bare
      `grep -riE` for the words themselves, which flags the sentences that *explain* the
      invariant as though they broke it. A check that cries wolf gets ignored — the same
      lesson the drift script learned at T-003. The identifier half is now enforced
      continuously by an ESLint rule, and `test/seed.test.ts` covers the rest.
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
- [ ] The full demo script has been rehearsed three times before 26 Aug

## 8. Out of scope

| Not building | Why |
|---|---|
| A seed UI | CLI is fine and faster |
| Randomised seeds | Deterministic seeds so the demo is identical every run |
| More than four demo orgs | Four covers the range; a fifth is maintenance |
| Faker for comments | A written pool reads real; generated text does not |
