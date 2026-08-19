# 44 — The improve loop

Phase: **P3** · Milestone: — · Source: `design_specs/SCOPE.md` §"Improve", `_MEMORY.md` § GLOSSARY

**Do not build before P3.** Sidebar item disabled with a "Soon" tag, no page behind it.

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

Console world, session required. Disabled with a "Soon" tag until P3.

```
/app/reflect                   my reviews, by cycle
/app/reflect/:cycleId          submit self-reflection    — before results unlock
/app/reflect/:cycleId/gap      self vs. received
/app/reflect/:cycleId/plan     write an improvement plan
/app/checkins/:id              the supervisor conversation
```

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

## Acceptance — P3

- [ ] Results for a reviewee are refused by the **API** until their reflection is submitted
- [ ] A reviewee cannot read another reviewee's reflection at the same level
- [ ] A supervisor reads their subtree's reflections and nothing outside it (INV-005)
- [ ] Finalised records cannot be edited — trigger test, not a service test
- [ ] The gap view uses the same question set as the campaign
- [ ] Reflection reuses `<QuestionInput>` (INV-008)
- [ ] Chat is scoped to a check-in and cannot be opened standalone
- [ ] `402` below Gold, distinct from `403`

## Out of scope

| Not building | Why |
|---|---|
| 360° / peer review | Enterprise tier, later. The model supports it — a campaign whose audience is peers |
| Goal tracking across years | Plans are per cycle. Long-term goals are an HR product |
| Calendar integration for check-ins | Adjacent, not ours |
| Automated coaching suggestions | Needs the analysis engine first (OPEN-003) |
| General messaging | Explicitly out of scope (`01` §10) |
