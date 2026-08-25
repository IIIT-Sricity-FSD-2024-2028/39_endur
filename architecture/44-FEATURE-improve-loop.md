# 44 — The improve loop

Phase: **P3, re-tagged buildable 2026-08-23 — CONF-019** · Milestone: —
Status: **BUILT 2026-08-25** — backend `T-083`, page `T-084`. `D-012` was the hard blocker
here and `T-088` repaid it: this surface would have `402`d for **every user in the product**
if it had been built before 24 Aug
Source: `design_specs/SCOPE.md` §"Improve", `_MEMORY.md` § GLOSSARY

> **Status changed 2026-08-23.** This document said *"do not build before P3"* and the owner
> asked for every disabled sidebar item to be completed (`CONF-019`). `Reflect` is the sidebar
> item this specifies.
>
> **It has one hard prerequisite and it is not negotiable: `D-012`.** Every capability here is
> **Gold**-entitled, and no organisation has ever had a `subscriptions` row — so
> `requireEntitlement` reads `'bronze'` for everyone and this entire surface returns `402` to
> every user in the product, forever. Building the screens first would produce a feature that
> nobody, including the demo, can open. **`T-057` before `T-081`**, and that ordering is the
> single most important line in this document today.
>
> The P3 tag stays on the parts that need a scheduler or an engine: cycle-over-cycle
> measurement (step 5), and the coaching suggestions already ruled out below.

## Purpose

The part that separates Endur from a survey tool, and the Gold tier's entire value
proposition. Five steps:

1. The person being reviewed records their **own self-assessment first, before seeing results**
2. Endur shows the **gap** between how they see themselves and how others see them
3. They write an **improvement plan**
4. Their supervisor **discusses it** with them
5. The next cycle **measures whether anything actually improved**

Step 1's ordering is the whole mechanism. If someone sees the scores first, the reflection
becomes a rationalisation of whatever the scores said, and the gap — the actually useful
output — cannot exist. **This is enforced in the API, not in the UI**: results for a reviewee
are refused until their reflection for that cycle is submitted.

That single ordering constraint is the most defensible novelty claim in the product after the
permission engine (`53`).

## Route & access

Console world, session required. **Live since `T-084` — the last "Soon" tag in the sidebar
came off with it.**

```
/app/reflect                   my cycles
/app/reflect?campaign=<id>     the form, then the gap, then the plan — in that order
```

**One route, three views, chosen by what the server returns.** The built page collapsed the
spec's five addresses into two, and the reason is the ordering constraint rather than
economy: `/reflect/:id/gap` as its own address would be a link somebody could open *before*
writing their reflection, and it would answer 404. A view the URL cannot reach early is a
view nobody has to be told not to reach. The check-in is rendered inside the plan it belongs
to for the same reason `/plans` is not a top-level API prefix.

## Capabilities

| Action | Capability | Entitlement |
|---|---|---|
| Submit / read own reflection | `reflection.create` `reflection.read` | **Gold** |
| Write / read an action plan | `actionplan.create` `actionplan.read` | Gold |
| Hold / read a check-in | `checkin.create` `checkin.read` | Gold |

Scope matters here more than anywhere: a reviewee reads their **own** reflection (`self`); a
supervisor reads their **subtree's** (INV-005). Getting this wrong exposes someone's private
self-assessment to a peer.

## Data model additions

```sql
CREATE TABLE reflections (
  id UUID PRIMARY KEY, org_id UUID NOT NULL, campaign_id UUID NOT NULL,
  subject_id UUID NOT NULL, author_user_id UUID NOT NULL,
  answers JSONB NOT NULL,                 -- same question set as the campaign
  submitted_at TIMESTAMPTZ NOT NULL,
  UNIQUE (campaign_id, subject_id)
);

CREATE TABLE action_plans (
  id UUID PRIMARY KEY, org_id UUID NOT NULL, reflection_id UUID NOT NULL,
  items JSONB NOT NULL,                   -- [{ text, dueAt, status }]
  finalised_at TIMESTAMPTZ                -- immutable once set
);

CREATE TABLE checkins (
  id UUID PRIMARY KEY, org_id UUID NOT NULL, action_plan_id UUID NOT NULL,
  supervisor_user_id UUID NOT NULL, notes TEXT,
  held_at TIMESTAMPTZ, finalised_at TIMESTAMPTZ
);
```

**Immutability once finalised** is a v1 requirement worth carrying forward (`README.md`
original spec): reflections, plans and check-ins cannot be edited after finalisation. A record
that can be rewritten after the conversation is not evidence, and the Enterprise tier sells
these as evidence.

Enforced by a database trigger, not by service-layer discipline.

## Data contract — provisional

| Action | Endpoint | DTO |
|---|---|---|
| My cycles | `GET /api/v1/reflect` | → `ReflectionCycle[]` with status per cycle |
| Submit reflection | `POST /api/v1/reflect/:campaignId` | `SubmitReflectionBody { subjectId, answers }` |
| Gap | `GET /api/v1/reflect/:campaignId/gap` | → `GapView { perQuestion[] }` — **404 until the reflection exists** |
| Create plan | `POST /api/v1/reflect/:campaignId/plan` | `CreatePlanBody { items[] }` |
| Finalise plan | `POST /api/v1/plans/:id/finalise` | — irreversible |
| Check-in | `POST /api/v1/checkins` · `PATCH /api/v1/checkins/:id` | `CheckinBody { actionPlanId, notes, heldAt }` |

`answers` reuses the `AnswerValue` discriminated union (`14` §4) — self and received are the
same shapes, which is what makes the gap arithmetic meaningful at all.

The gap endpoint returning 404 before a reflection exists is the ordering constraint expressed
in the API rather than in the UI. A client that ignores the lock still cannot read the data.

## State

P3, shaped by the `23` decision (OPEN-001). The reflection form is a draft with autosave, so
it follows the same pattern as the form builder (`37`) and would become a slice under Option A.

## Components

Existing: `<QuestionInput>` × 6 (INV-008) · `<PageHeader>` · `<ProgressRail>` ·
`<ConfirmDialog>` · `<EmptyState>` · `<BarRow>`.

New for P3: a paired-bar gap row showing self and received on one axis. It is a variant of
`<BarRow>` and is added to `24-COMPONENT-INVENTORY.md` before it is built, not after.

## The gap view

Self-assessment and received scores on the same axis, per question, with the delta.

Two directions and they mean different things:

| Gap | Meaning |
|---|---|
| Self **higher** than received | A blind spot — the useful case, and the reason step 1 comes first |
| Self **lower** than received | Under-confidence — worth naming, because it is common and demoralising |

Presented without judgement language. The tool's job is to show the delta, not to grade
someone on it — a gap view that reads as an accusation guarantees the next reflection is
gamed.

## Interactions

- `/app/reflect` lists cycles where the user is a linked subject, with clear status.
- The reflection form reuses the **same `<QuestionInput>` components** (INV-008) with the
  campaign's own question set — self and received are then directly comparable, which is what
  makes the gap arithmetic meaningful at all.
- Results stay locked with an explicit explanation, not a mysterious empty state:
  *"Your results unlock after you record your own assessment."*
- The action plan is a list of items with optional due dates.
- The check-in is a shared note between reviewee and supervisor, finalised by the supervisor.

## Text chat

`SCOPE.md` lists "text chat between a person and their reviewer" as in scope. It attaches to a
check-in — **not** a general messaging feature (`01` §10: Endur does not replace WhatsApp).
Scoped to one check-in, it stays a feature; unscoped, it becomes a product.

## States

| State | Behaviour |
|---|---|
| Locked | Results hidden with the explanation above — never a bare empty state |
| Reflection due | Prominent on `/app` home with the cycle deadline |
| Plan overdue | Item-level, visible to both parties |
| 402 | Upgrade card explaining what Gold adds |
| Finalised | Read-only, with a visible finalisation timestamp |

## Acceptance

- [x] **`D-012` is repaid first** — an org has a real `subscriptions` row and a Gold org can
      open this at all. Assert it by opening the page as a Bronze org and getting `402`, and
      as a Gold org and getting the page: two orgs, two outcomes, which is impossible while
      every org is silently Bronze
- [x] Results for a reviewee are refused by the **API** until their reflection is submitted —
      `GET /reflect/:id/gap` 404s, and there is no sibling route that returns the received
      scores alone
- [x] A reviewee cannot read another reviewee's reflection at the same level — asserted with
      a peer at the same level **in the same unit**, which is the case a scope string alone
      would have let through. 404, not 403
- [x] A supervisor reads their subtree's **check-ins** and nothing outside it (INV-005), via
      `visibleUnits()` rather than a hand-written walk. **They do not read the reflection** —
      see the note below, which is a deliberate narrowing of this line
- [x] Finalised records cannot be edited — **trigger test**, asserted by going around the
      service entirely and writing to the row directly
- [x] The gap view uses the same question set as the campaign
- [x] Reflection reuses `<QuestionInput>` (INV-008)
- [ ] Chat is scoped to a check-in and cannot be opened standalone — **not built**; see below
- [x] `402` below Gold, distinct from `403`, with `403` first

### One acceptance line was narrowed, deliberately

*"A supervisor reads their subtree's reflections"* is **not** what was built, and the reason
is one line further up this document: getting the scope wrong here *"exposes someone's
private self-assessment to a peer"*. A reflection is a person's own account of their own
weaknesses. `reflection.read` is therefore seeded **`self` at every level that holds it, and
nothing wider** — there is no scope value that opens somebody else's.

What a supervisor gets is the **check-in**: the conversation about the plan, which is the
thing `44` § Purpose step 4 actually describes. If an organisation later wants a supervisor
to read the reflection itself, that is a grant they can write — the resolver already supports
it — and it is their decision to make explicitly rather than ours to seed.

### What is not built, and is not pretended

| Not built | Why |
|---|---|
| **Text chat on a check-in** | `44` § Text chat scopes it to one check-in so it stays a feature. The check-in carries `notes`, which is the shared-note half; a threaded conversation needs a message table and a read model, and neither is on the M0 board. The `notes` field is the seam |
| **Step 5 — cycle-over-cycle measurement** | Still P3, exactly as the status note reserved. It needs two closed cycles on the same subject and the seed has one |
| **Plan overdue, item-level** | `44` § States lists it. `dueAt` is stored and rendered; nothing computes overdue, because nothing schedules (`OPEN-005` owns no scheduler) |
| **"Reflection due" on `/app` home** | `46`'s payload has no field for it and adding one is `46`'s task, not this one |

## Out of scope

| Not building | Why |
|---|---|
| 360° / peer review | Enterprise tier, later. The model supports it — a campaign whose audience is peers |
| Goal tracking across years | Plans are per cycle. Long-term goals are an HR product |
| Calendar integration for check-ins | Adjacent, not ours |
| Automated coaching suggestions | Needs the analysis engine first (OPEN-003) |
| General messaging | Explicitly out of scope (`01` §10) |
