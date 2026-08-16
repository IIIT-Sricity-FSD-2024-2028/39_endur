# 35 — Subjects

Phase: P2 · Milestone: **M0** · Design ref: `design_specs/design/04` §4.5

## Purpose

Subjects are **the things being reviewed** — the single biggest generalisation in the product
(`01` §4). A course, a restaurant, a ward, a trainer, an event, a bus route. This screen is
where an evaluator sees that the same product reviews a course and a restaurant with no code
difference, so the vocabulary must be perfect here above anywhere else.

A subject optionally links to a user, which is what turns "review the thing" into "review the
person" without two code paths.

## Route & access

`/app/subjects` list · `/app/subjects/:id` detail — console world.

## Capabilities

| Action | Capability |
|---|---|
| List / view | `subject.read` |
| Create | `subject.create` |
| Edit | `subject.update` |
| Archive | `subject.archive` |

Scope-filtered by the API (INV-003) — a head of department sees only their own unit's
subjects, and the campaign audience picker inherits that filtering (`38`).

Archive rather than delete: a subject with responses attached must survive for the history to
mean anything (`10` §9).

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| List | `GET /api/v1/subjects?cursor&limit&q&unitId&archived` | → paginated `SubjectSummary[]` |
| Detail | `GET /api/v1/subjects/:id` | → `SubjectDetail` |
| Create | `POST /api/v1/subjects` | `CreateSubjectBody { name, unitId, type?, linkedUserId? }` |
| Update | `PATCH /api/v1/subjects/:id` | `UpdateSubjectBody { name?, unitId?, linkedUserId? }` |
| Archive | `POST /api/v1/subjects/:id/archive` | — |

`SubjectSummary` carries the campaign counts the list renders — `activeCampaigns`,
`totalResponses`, `lastResponseAt` — computed server-side. Fetching them per row from the
client would make an 18-row list into 19 requests.

## State

Local, `useSubjects()`. Filters and cursor in the URL. Inline rename is optimistic with revert
(`24` §7).

## Components

`<PageHeader>` with vocabulary chips · `<ResponsiveTable>` or a card grid · `<PersonChip>` for
linked subjects · `<StatCard>` on detail · `<ConfirmDialog>` · `<EmptyState>`.

## Interactions

**List.** Search, filter by unit, toggle archived. Each row: name, unit, linked person if any,
active campaigns, total responses. The primary action reads `Add a {subject.one}` — "Add a
course", "Add a restaurant" — which is the vocabulary system at its most visible.

**Create.** Name, unit (from `<UnitTree>` in `mode="select"`), optional linked person. The
linked-person field is what makes this subject a reviewee for billing purposes (`16` §5), and
the form says so plainly rather than hiding it.

**Detail.** Identity, unit, linked person, then campaign history with response counts and a
trend across cycles. The cross-cycle trend is the first hint of the Improve layer and is worth
having even though the loop itself is P3 — it is what "did anything actually change?" looks
like in miniature.

**Archive.** `<ConfirmDialog>` stating what is retained:

> *"Archiving Data Structures keeps its 612 responses and removes it from new feedback cycles."*

## States

| State | Behaviour |
|---|---|
| Empty | `<EmptyState>`: *"No {subjects} yet"* + `Add a {subject}`. This is the post-setup landing state, so its copy carries weight |
| Empty after filter | *"No {subjects} match those filters"* + Clear filters |
| Loading | Skeleton rows |
| Error | Inline above the list |
| 403 | Full-page 403 on direct navigation |
| Archived | Rendered muted with an `Archived` tag, hidden unless the toggle is on |

## Acceptance

- [ ] Every noun on the page comes from `useLabels()` — this screen is the vocabulary
      showcase and the nonsense audit must find nothing here (INV-001)
- [ ] The list is scope-filtered by the API
- [ ] Counts are computed server-side; the list is one request
- [ ] A subject can link to a user, and the link is reflected in `billable_seats` (`16` §5)
- [ ] Archiving retains responses and removes the subject from new campaign audiences
- [ ] An archived subject still appears in the results of past campaigns
- [ ] Inline rename commits on `Enter`, reverts on `Esc`
- [ ] Empty and empty-after-filter differ in copy and action
- [ ] Detail shows a response trend across cycles
- [ ] Collapses to cards at 390px

## Out of scope

| Not building | Why |
|---|---|
| Subject types as a configurable taxonomy | `type` is a free string; a taxonomy editor is a feature per organisation type, which is the trap (`customization.md` §13) |
| Subject hierarchies | Subjects belong to units; units are the tree. A second tree would double the scoping complexity |
| Bulk import of subjects | CSV import is `34`'s pattern; extend it in P3 if demand appears |
| Per-subject permissions | Scope comes from the unit. Per-subject grants would explode the grant table |
| Auto-linking subjects to users by name | Silent wrong matches. Explicit selection only |
