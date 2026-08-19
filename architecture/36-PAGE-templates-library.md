# 36 — Template library

Phase: P2 · Milestone: **M0** (cut-list item 6 — three seeded templates if behind) · Design ref: `design_specs/design/05-PAGE-TEMPLATES-AND-FORM-BUILDER.md` §5.1

## Purpose

A browsable gallery of ready-made forms organised by industry, then use case. Customers
preview a template exactly as respondents will see it, then clone it and edit freely. It is
also the organic-search entry point — people looking for "student feedback form template" find
the product through it (`01` §8).

Commercially it carries a load-bearing constraint: **templates are deliberately short.**
Competitors ship 40+ question templates. Copying that would rebuild the exact problem Endur
exists to solve, so question count and completion time are shown before anything else.

## Route & access

`/app/templates` library · `/app/templates/:id` preview → clone — console world.

The library tab shows both `orgId IS NULL` library templates and the org's own. `GET
/templates/library` is `authenticateOptional`, so a public gallery is possible later without a
second endpoint.

## Capabilities

| Action | Capability |
|---|---|
| Browse library | — (auth optional) |
| List org templates | `template.read` |
| Preview | `template.read` |
| Clone | `template.clone` |
| Create blank | `template.create` |
| Delete | `template.delete` |

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| Library | `GET /api/v1/templates/library?industry&category` | → `TemplateSummary[]` |
| Org's own | `GET /api/v1/templates?cursor&q` | → paginated `TemplateSummary[]` |
| Preview | `GET /api/v1/templates/:id` | → `TemplateDetail` with questions |
| Clone | `POST /api/v1/templates/:id/clone` | `{ name? }` → `TemplateDetail`. Idempotent |
| Create blank | `POST /api/v1/templates` | `CreateTemplateBody { name, category }` |
| Delete | `DELETE /api/v1/templates/:id` | — |

`TemplateSummary` carries `questionCount` and `estimatedSeconds`. **Both are derived**, never
stored by hand (`24` §7) — `estimatedSeconds` is computed from question kinds, so a template
cannot claim to be shorter than it is.

Cloning copies the template and its questions into the org and records `cloned_from_id`
(`10` §4.2), which is what lets us later say "23 orgs use a variant of this template".

## State

Local. `useTemplateLibrary()` and `useTemplates()`. The industry filter defaults to the org's
own industry — a hotel should not have to filter past university templates to find theirs.

## Components

`<PageHeader>` · `<EmptyState>` · a card grid · `<QuestionInput>` set in `readOnly` mode for
the preview · `<Toast>`.

**The preview uses the same `<QuestionInput>` components as the live respondent form**
(INV-008). One implementation, parameterised. Two implementations means the preview eventually
lies about what respondents see, and the first time you find out is on stage.

## Interactions

**Browse.** Segmented control for industry, `.tag-outline` chips for category. Each card
shows: name, category, question count, completion time, and a one-line description. Related
templates are suggested on the preview.

**Preview.** Renders the template exactly as a respondent sees it, at the three widths — phone,
tablet, desktop — via a segmented control. This is what makes "preview exactly as respondents
will see it" true rather than approximate.

**Clone.** One action, lands directly in the builder at `/app/forms/:id/build`. Do not show an
intermediate confirmation — cloning is cheap and reversible, and a confirmation step on a
cheap action is friction on the demo path.

Clone is idempotent by key (`13` §7): a double-click does not create two copies.

**Describe-to-draft.** `01` §8 promises that someone who knows what they want can describe it
and get a draft. **P3, and gated on OPEN-003** — it needs the same LLM decision as the analysis
engine. Until then the browse path is the only path, and the library must be good enough that
this does not matter.

## States

| State | Behaviour |
|---|---|
| Empty (org's own) | `<EmptyState>`: *"No forms yet"* + "Browse the library" as the primary action — not "create blank", because a blank start is the enemy |
| Empty (library filter) | *"No templates for that combination"* + Clear filters |
| Loading | Card skeletons |
| Error | Inline above the grid |
| 403 | Clone button absent without `template.clone`; browsing still works |
| Deleting in use | `409` — a template used by a live campaign cannot be deleted, only archived |

## Acceptance

- [ ] Question count and completion time are derived and shown on every card
- [ ] No seeded template exceeds 10 questions — enforced by a seed test, because this is a
      product constraint, not a preference (`01` §5)
- [ ] Preview uses the same `<QuestionInput>` components as the respondent form (INV-008)
- [ ] Preview renders correctly at phone, tablet and desktop widths
- [ ] Clone lands in the builder in one action, with no intermediate step
- [ ] A double-clicked clone produces one template
- [ ] `cloned_from_id` is recorded
- [ ] The industry filter defaults to the org's own industry
- [ ] Deleting a template used by a live campaign returns 409 with a clear message
- [ ] Library templates from other industries are visible but not defaulted to
- [ ] Every noun from `useLabels()` (INV-001)
- [ ] Card grid reflows at 390px

## Out of scope

| Not building | Why |
|---|---|
| Describe-to-draft generation | P3, gated on OPEN-003 |
| Template versioning | Clone-and-edit is the versioning story |
| Sharing templates between orgs | Interesting, and a whole permissions question. P3 |
| Template ratings or usage stats | `cloned_from_id` collects the data; the surface is P3 |
| A public unauthenticated gallery | The endpoint already allows it; the marketing surface is not this phase |
