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
`<Toggle>` · `<ConfirmDialog>` · `<PageHeader>`.

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

- [ ] Exactly six types exist; the type select has no seventh option
- [ ] `QuestionConfig` is a discriminated union; a mismatched config fails at compile time
- [ ] Save is one bulk `PUT` in one transaction
- [ ] `position` is derived from array order and never sent
- [ ] Reordering 8 questions is one request
- [ ] Changing type preserves text and warns once before dropping options
- [ ] Completion time is derived and updates live as questions change
- [ ] Preview and the live respondent form use the same components (INV-008)
- [ ] Autosave never loses typed input, including across a failed save and a retry
- [ ] A template used by a live campaign is read-only with a duplicate path
- [ ] Deleting a question offers undo rather than a confirmation dialog
- [ ] Exactly one question is expanded at a time
- [ ] Every noun from `useLabels()`; question text itself is user content and is not a label
- [ ] Usable at 390px — the tool rail becomes a sticky bottom bar

## Out of scope

| Not building | Why |
|---|---|
| Conditional logic and branching | Directly contradicts the short-forms constraint (`01` §5) |
| Page sections | Same reason. One scrolling column is the respondent design (`39`) |
| Date, file upload, matrix, ranking | Google Forms artefacts, not Endur scope |
| Question banks / reusable questions | Templates are the reuse mechanism |
| Collaborative editing | One editor at a time. Conflict detection via `updatedAt` is enough |
| Rich text in question text | Plain text. Formatting in a question is a smell |
