# 37 — Form builder

Phase: P2 · Milestone: **M0** · Design ref: `design_specs/design/05` §5.2–5.4
Decisions: `_MEMORY.md` DEC-010 — **six question types, frozen**

## Purpose

Where a form is authored. Six question types, no branching, no logic. The build plan names
scope creep here as a top risk, and the type select is where creep enters.

The form engine is built once and serves everything: feedback, surveys, and polls. **A poll is
a one-question template.** There is no separate poll feature, ever — this is the clearest
example in the product of generality replacing a feature, and it is worth saying out loud
under questioning (`_MEMORY.md` N-006).

## Route & access

`/app/forms/:id/build` builder · `/app/forms/:id/preview` preview — console world.

## Capabilities

| Action | Capability |
|---|---|
| Open the builder | `template.read` |
| Save | `template.update` |
| Preview | `template.read` |

A template used by a launched campaign is **read-only**. Editing questions under a running
campaign would invalidate the responses already collected — the builder shows a banner with a
`Duplicate to edit` action rather than silently disabling controls.

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| Load | `GET /api/v1/templates/:id` | → `TemplateDetail` |
| Save meta | `PATCH /api/v1/templates/:id` | `UpdateTemplateBody { name?, description?, category? }` |
| Save questions | `PUT /api/v1/templates/:id/questions` | `PutQuestionsBody { questions: Question[] }` — **bulk** |

**`PUT` replaces the whole question set in one transaction** (`13` §3). The builder autosaves
a *document*, not a stream of field edits, and reordering is one operation on an array rather
than N position updates.

`position` is derived from array index and never sent as a field. `questions.position` is
deferrable-unique so the reorder is a single statement (`10` §4.2).

`QuestionConfig` is a discriminated union over the six kinds (`14` §4) — which is what stops
`config` from becoming an untyped bag and makes a mismatched config a compile error.

## State

Local draft in the builder route, autosaved. This is the largest piece of genuinely
client-side state in the product, and in P3 it becomes `builderSlice` with an undo stack
(`23` §4) — the reducer work that makes the Redux phase substantive.

For P2: a draft object, a dirty flag, debounced autosave at 800 ms, and a save indicator.
Exactly one question is expanded at a time, tracked at the parent's level.

## Components

`<QuestionCard>` · `<QuestionEditor>` × 6 · `<QuestionInput>` × 6 (for the preview) ·
`<Toggle>` · `<ConfirmDialog>` · `<PageHeader>` · `<Toast>` (the delete undo).

T-035 built the six inputs (`N-031`); T-036 built the six editors, `<QuestionCard>` and
`kinds.ts`; **T-037 built the page** — `pages/console/Builder/` (the stack, `useBuilder`, the
save indicator, the preview route).

T-037 added two things to the catalogue, both in `24` first. `<FormPreview>` is new: **two
screens preview a form**, this one and the template library, and they must show the identical
thing — so the preview T-035 wrote inline on the template page was lifted into a component and
that page rewired to it. `<QuestionCard>` gained `onMove`, because HTML5 drag does not exist
on touch and § Acceptance requires 390px; the grip stays draggable and the buttons do the same
job by click and by keyboard, exactly as `<UnitTree>` and `<RoleRow>` already do.

`kinds.ts` is where `Change type` actually lives. `changeKind(question, kind)` returns the
converted question and, when something cannot survive, one sentence saying so; the card holds
that sentence until the reader accepts it. The builder should not re-implement any of it.

**Multi choice gained a `maxSelections` control** that `design_specs/design/05` §5.3 does not
draw. The table below has listed the field since revision one, and a config field with no way
to set it is a field nobody can use. It is a toggle plus a number, and turning it off DROPS
the key rather than setting it to zero — `maxSelections: 0` would mean "choose none".

**No question images.** `design_specs/design/05` §5.2 draws an image button in the card header
and an image block in the tool rail (marked nice-to-have there). `QuestionConfig` has nowhere
to put one — adding a field to the frozen union is a DEC-010 conversation, not a card-header
button — so it is not built and not stubbed.

## The six types — frozen

| Type | Config | Respondent |
|---|---|---|
| **Rating scale** | `max: 5 | 10`, low and high anchor labels | Circles, 44px hit area |
| **Single choice** | `options[]`, `allowOther` | Radio rows, whole row tappable |
| **Multi choice** | `options[]`, optional `maxSelections` | Square dot with a check |
| **Free text** | `multiline`, optional placeholder | Input or 3-row textarea |
| **Yes / No** | none — renders "No settings for this type." | Two 50/50 pills |
| **NPS** | none — fixed 0–10, fixed anchors | 11 circles, 6+5 on mobile |

**Not in scope, and say so if asked:** conditional logic, branching, page sections, file
upload, date/time, matrix/grid, ranking. The mockup shows Date and File upload rows — those
are Google Forms artefacts and are not Endur scope (`design_specs/design/05` §5.3).

Adding a seventh type violates DEC-010 and requires superseding it in `_MEMORY.md`, not a pull
request.

## Interactions

**Add.** The type select is a grouped dropdown: `SCALES` (rating, NPS), `CHOICE` (single,
multi, yes/no), `TEXT` (free text). Grouping is what keeps six options from reading as a
list of unrelated things.

**Change type.** Preserves question text and, where possible, options. Changing from a type
with options to one without warns once: *"Changing to Free text removes the 4 options."*

**Reorder.** Drag by the handle. Position is array index.

**Duplicate / delete.** Per card. Delete is immediate with an undo `<Toast>` — a confirmation
dialog per question deletion would make authoring miserable, and undo is the better answer for
a cheap, reversible action.

**Completion time** is derived from the question set and shown in the header, live. It is what
enforces the short-forms constraint socially rather than by a hard limit: watching the number
climb past two minutes is more persuasive than an error message.

**Preview** renders the form exactly as a respondent sees it, using the **same
`<QuestionInput>` components** (INV-008), at three widths.

**Autosave** shows `Saving…` → `Saved` in the header. A failed save keeps the draft, retries
once, then surfaces an inline error with a manual retry — and **never discards typed input**.

## States

| State | Behaviour |
|---|---|
| Empty | A form with no questions shows an inline "Add your first question" affordance inside the card stack, not a full-page empty state — the builder chrome is the point |
| Loading | Card skeletons |
| Saving | Header indicator; the form stays editable |
| Save error | Inline in the header with retry; draft preserved |
| 403 | Read-only rendering with an explanation |
| Locked (campaign live) | Banner + `Duplicate to edit`; all editors read-only |

## Acceptance

`[x]` closed by T-036 or T-037; `[~]` is honest about the half that cannot be asserted yet.

- [x] Exactly six types exist; the type select has no seventh option — asserted against
      `KIND_LABELS` and against the groups, so a kind the select cannot reach fails too
- [x] `QuestionConfig` is a discriminated union; a mismatched config fails at compile time —
      and `changeKind()` is tested to produce a config matching its new kind for all six,
      because a mismatch is a 409 from `putQuestions`, not a rendering bug
- [x] Save is one bulk `PUT` in one transaction
- [x] `position` is derived from array order and never sent — `useBuilder` drops it when it
      turns a template into a draft, and a test asserts no draft question carries the key
- [x] Reordering 8 questions is one request — the autosave sends the whole set, so any number
      of moves inside one debounce window is one `PUT`
- [x] Changing type preserves text and warns once before dropping options — `changeKind()`,
      and the card holds the change until the warning is accepted. It also warns before
      replacing hand-written rating anchors, which is the same class of loss `37` did not
      name; it stays quiet when the anchors were never touched, because warning about losing
      a default trains people to click through warnings
- [x] Completion time is derived and updates live as questions change — from the DRAFT, not
      from the server's stored value, so it moves on the keystroke rather than on the save
- [~] Preview and the live respondent form use the same components (INV-008) — the preview
      side is done and goes through `<FormPreview>` → `<QuestionInput>`, the only set that
      exists. The respondent form is `39`, so the second half is still unassertable
- [x] Autosave never loses typed input, including across a failed save and a retry — the
      case that needed the most care is a keystroke arriving mid-request: the dirty flags are
      cleared BEFORE the request, so a late success cannot swallow it, and the indicator says
      `Unsaved changes` rather than `Saved`. Six tests in `useBuilder.test.ts` cover it
- [x] A template used by a live campaign is read-only with a duplicate path — the banner
      names the org's own word for a campaign, every control is disabled rather than hidden,
      and `useBuilder` refuses writes outright so nothing can queue up behind the banner
- [x] Deleting a question offers undo rather than a confirmation dialog — and the undo puts
      it back at its own index, not at the end
- [x] Exactly one question is expanded at a time — enforced by the stack; the card cannot
      expand itself, which is what makes it possible
- [x] Every noun from `useLabels()`; question text itself is user content and is not a label
- [~] Usable at 390px — the tool rail becomes a sticky bottom bar in CSS and the reorder works
      without drag, which is the half that is structural. The pixels are a device check
      (`T-045`)

## Out of scope

| Not building | Why |
|---|---|
| Conditional logic and branching | Directly contradicts the short-forms constraint (`01` §5) |
| Page sections | Same reason. One scrolling column is the respondent design (`39`) |
| Date, file upload, matrix, ranking | Google Forms artefacts, not Endur scope |
| Question banks / reusable questions | Templates are the reuse mechanism |
| Collaborative editing | One editor at a time. Conflict detection via `updatedAt` is enough |
| Rich text in question text | Plain text. Formatting in a question is a smell |
