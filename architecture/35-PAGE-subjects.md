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
| Detail | `GET /api/v1/subjects/:id` | → `SubjectDetail` — the summary **plus `cycles[]`** |
| Create | `POST /api/v1/subjects` | `CreateSubjectBody { name, unitId, type?, linkedUserId? }` |
| Update | `PATCH /api/v1/subjects/:id` | `UpdateSubjectBody { name?, unitId?, linkedUserId? }` |
| Archive | `POST /api/v1/subjects/:id/archive` | — |

`SubjectSummary` carries the campaign counts the list renders — `activeCampaigns`,
`totalResponses`, `lastResponseAt` — computed server-side. Fetching them per row from the
client would make an 18-row list into 19 requests.

`SubjectDetail` was specified here from revision one and **implemented by T-034**: the
summary plus `cycles[]`, every campaign this subject appeared in, oldest first, each with the
responses that came back *about this subject* — not the campaign's total. Two queries, never
one per cycle. It carries **no scores**: aggregates live behind the results endpoints where
the k-anonymity gate is (INV-007), and a per-subject average here would be a second path to
them with nothing in front of it.

## State

Local: `useSubjectList()` for the list and its writes, `useSubject()` for the detail
(`lib/subjects.ts`). Filters and cursor in the URL. Inline rename is optimistic with revert
(`24` §7). The detail page borrows the list controller's mutations rather than growing a
second set — one place knows how to write a subject.

## Components

`<PageHeader>` with vocabulary chips · `<ResponsiveTable>` · `<StatCard>` and `<BarRow>` on
detail · `<ConfirmDialog>` · `<EmptyState>` · `<InlineName>` in the name cell · `<UnitTree>`
in `mode="select"` inside the create form — **the tree's third placement**, and the reason
that mode exists (INV-009).

T-034 built `<ResponsiveTable>`, `<StatCard>` and `<BarRow>`, all three catalogued in `24`
first. **`<PersonChip>` was NOT built here**: its contract takes a `PersonSummary` and renders
`Role · L{n}`, and the subjects API carries only `linkedUserId` + `linkedUserName`. Rendering
it against half a person would either invent a level or quietly drop it, so the linked person
is a plain link until `34` builds the chip with the data it needs.

## Interactions

**List.** Search, filter by unit, toggle archived. Each row: name, unit, linked person if any,
active campaigns, total responses. The primary action reads `Add a {subject.one}` — "Add a
course", "Add a restaurant" — which is the vocabulary system at its most visible.

**Create.** Name, unit (from `<UnitTree>` in `mode="select"`), optional linked person. The
form says what the link means for the bill rather than hiding it — **and the sentence above
was wrong until T-034 checked it against `16` §5**. Linking does not add a reviewee: a linked
subject IS a user and is already counted, while an UNLINKED subject is the one that costs a
seat. The form now says exactly that. `16` §5 is authoritative on metering; this doc is not.

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

- [x] Every noun on the page comes from `useLabels()` — this screen is the vocabulary
      showcase and the nonsense audit must find nothing here (INV-001)
- [x] The list is scope-filtered by the API
- [x] Counts are computed server-side; the list is one request
- [~] A subject can link to a user — **the link works; `billable_seats` does not exist yet.**
      Nothing computes it: `16` §5 specifies the formula, `subscriptions.seats` is a column
      with a default of 0, and metering is `16`'s P3 work over `src/backend/billing/**`. The
      create form states the rule correctly in the meantime, which is the half that is
      visible: a LINKED subject is already a user and adds no seat; an unlinked one is one
      seat. (A first reading of this doc suggests the opposite — `16` §5 is authoritative)
- [x] Archiving retains responses and removes the subject from new campaign audiences —
      `POST /campaigns` refuses an archived subject with a 404 rather than dropping it
      silently
- [x] An archived subject still appears in the results of past campaigns
- [x] Inline rename commits on `Enter`, reverts on `Esc`
- [x] Empty and empty-after-filter differ in copy and action
- [x] Detail shows a response trend across cycles — the change between the last two ANSWERED
      cycles, so an unlaunched draft does not read as a collapse in participation
- [ ] Collapses to cards at 390px — the contract it rests on is tested (one DOM, every cell
      labelled, the hide-below classes present); the pixels are a device check with `T-045`

## Out of scope

| Not building | Why |
|---|---|
| Subject types as a configurable taxonomy | `type` is a free string; a taxonomy editor is a feature per organisation type, which is the trap (`customization.md` §13) |
| Subject hierarchies | Subjects belong to units; units are the tree. A second tree would double the scoping complexity |
| Bulk import of subjects | CSV import is `34`'s pattern; extend it in P3 if demand appears |
| Per-subject permissions | Scope comes from the unit. Per-subject grants would explode the grant table |
| Auto-linking subjects to users by name | Silent wrong matches. Explicit selection only |
