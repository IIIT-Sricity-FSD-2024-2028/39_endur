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

`TemplateSummary` carries `questionCount`, `estimatedSeconds` and — added by **T-035** —
`campaignCount`. **All three are derived**, never stored by hand (`24` §7): `estimatedSeconds`
is computed from question kinds, so a template cannot claim to be shorter than it is.

`campaignCount` closes a gap `design_specs/design/05` §5.1 has always drawn and the contract
never carried: the card's *"Used in 2 campaigns"* / *"Never used"* line. It does a second job
that matters more — the delete dialog can state a real consequence **before** the button is
pressed, rather than the reader discovering the `409` by pressing it. It is 0 on every library
template: nothing campaigns against `orgId IS NULL`, and a combined count across every
customer is a number this organisation cannot act on.

Cloning copies the template and its questions into the org and records `cloned_from_id`
(`10` §4.2), which is what lets us later say "23 orgs use a variant of this template".

## State

Local. `useTemplateLibrary()` and `useTemplates()` in `lib/templates.ts`. The industry filter
defaults to the org's own industry — a hotel should not have to filter past university
templates to find theirs — and every other industry stays one segment away rather than hidden.
The default is applied on read, **not written into the URL**, so an absent parameter still
means "not chosen yet".

The two lists are fetched differently on purpose. The library is small, fixed and browsed by
eye: one request, then filtered in the browser, so switching a segment is instant and "show me
everything" costs nothing. The org's own list grows without limit and is cursor-paginated by
the server.

**One search box, two mechanisms, and this is a deliberate departure from the table above.**
`q` exists only on `GET /templates`, so the org's own list is searched by the server while the
library is searched in the browser over the array already loaded. The reader sees one field
and one result. Adding `q` to `/templates/library` would be a second contract for a list that
never exceeds a few dozen rows, and `industry` / `category` are likewise applied client-side
for the same reason — the endpoint still accepts them, and a public gallery later can use them
without changing anything here.

## Components

`<PageHeader>` · `<EmptyState>` · a card grid · `<QuestionInput>` set in `readOnly` mode for
the preview · `<ConfirmDialog>` · `<Toast>`.

**The preview uses the same `<QuestionInput>` components as the live respondent form**
(INV-008). One implementation, parameterised. Two implementations means the preview eventually
lies about what respondents see, and the first time you find out is on stage.

**T-035 therefore BUILT the six inputs**, which `55-BUILD-ORDER` pairs with the six editors
under T-036. It had no choice: this page's whole purpose is a preview that is exactly what a
respondent gets, and INV-008 rules out a stand-in. The six EDITORS have no caller until the
builder and stay at T-036, which is now editors-only. Same shape as `N-025`, where the wizard
built `<UnitTree>` a task early; recorded as `N-031`.

`<Toast>` was built here too. `<PersonChip>`-style honesty about what was *not*: there is no
app-level toast host, so a success that navigates away — clone, blank form — shows no toast
at all, and only the delete uses it. It carries no `undo`: undoing a delete needs a restore
endpoint, and an undo that cannot undo is worse than none.

The **card** is page-local and deliberately not catalogued, like `32`'s detail panel: `24` §10
rules out a generic card abstraction, and the two variants differ in what they can *do* rather
than in how they look.

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

- [x] Question count and completion time are derived and shown on every card — and the time
      is dropped rather than shown as `~0 sec` when there is nothing to answer
- [x] No seeded template exceeds 10 questions — enforced by a seed test, because this is a
      product constraint, not a preference (`01` §5)
- [x] Preview uses the same `<QuestionInput>` components as the respondent form (INV-008) —
      **closed at T-039.** There is one implementation, this page renders through it, and the
      live respondent form renders through the same file — asserted by the import-graph walk
      in `pages/respond/bundle.test.ts` rather than by reading the imports
- [~] Preview renders correctly at phone, tablet and desktop widths — the three frames exist
      at 390 / 720 / unbounded and the toggle is tested; whether the CONTENT reads right at
      390 is the same device check as everywhere else (`T-045`)
- [x] Clone lands in the builder in one action, with no intermediate step — note that
      `/app/forms/:id/build` is still T-037's placeholder, so the landing is currently a
      page that says so. The route and the navigation are correct and do not change
- [x] A double-clicked clone produces one template — twice over: the button stops accepting
      the second press, and the idempotency key covers the retry a button cannot
- [x] `cloned_from_id` is recorded
- [x] The industry filter defaults to the org's own industry, without writing that default
      into the URL behind the reader's back
- [x] Deleting a template used by a live campaign returns 409 with a clear message — and the
      dialog now says so first, with `confirmDisabled`. The 409 path is still handled,
      because the count can be stale by the time the button is pressed
- [x] Library templates from other industries are visible but not defaulted to
- [x] Every noun from `useLabels()` (INV-001)
- [ ] Card grid reflows at 390px — device check with `T-045`

## Out of scope

| Not building | Why |
|---|---|
| Describe-to-draft generation | P3, gated on OPEN-003 |
| Template versioning | Clone-and-edit is the versioning story |
| Sharing templates between orgs | Interesting, and a whole permissions question. P3 |
| Template ratings or usage stats | `cloned_from_id` collects the data; the surface is P3 |
| A public unauthenticated gallery | The endpoint already allows it; the marketing surface is not this phase |
