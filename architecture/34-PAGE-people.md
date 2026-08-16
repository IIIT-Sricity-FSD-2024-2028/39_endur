# 34 — People

Phase: P2 · Milestone: — (cut-list item 7 — seed only if behind) · Design ref: `design_specs/design/04` §4.4, `customization.md` §9 screen 9

## Purpose

The structure exists; this is where the bodies go. A person is a name and an email plus **one
or more positions**, each a `Role — Unit` pair. The multi-position model is the thing that
makes a dean who is also a professor representable without a special case, and this screen is
where it becomes visible.

## Route & access

`/app/people` list · `/app/people/:id` detail — console world.

## Capabilities

| Action | Capability |
|---|---|
| List / view | `person.read` |
| Add / edit / remove | `person.create` `person.update` `person.delete` |
| Give or remove a position | `assignment.create` `assignment.delete` |
| CSV import | `person.import` |
| Per-person grant override | `grant.update` |

**The list is scope-filtered by the API** (INV-003). A head of department sees their own
subtree's people; others are absent, not greyed. `meta.total` counts what the caller may see
(`13` §4).

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| List | `GET /api/v1/people?cursor&limit&q&unitId&roleId` | → paginated `PersonSummary[]` |
| Detail | `GET /api/v1/people/:id` | → `PersonDetail` incl. positions and effective powers |
| Create | `POST /api/v1/people` | `CreatePersonBody { name, email, positions[] }` |
| Update | `PATCH /api/v1/people/:id` | `UpdatePersonBody { name?, email?, status? }` |
| Add position | `POST /api/v1/people/:id/assignments` | `CreateAssignmentBody { roleId, unitId, isPrimary?, validFrom?, validTo? }` |
| Remove position | `DELETE /api/v1/people/:id/assignments/:edgeId` | — |
| Import preview | `POST /api/v1/people/import/preview` | multipart → `{ columns, mapping, sample[], unmatchedRoles[] }` |
| Import commit | `POST /api/v1/people/import` | `ImportPeopleBody { mapping, rows[] }` — idempotent |

**No create-person DTO accepts a role, level, or capability** (`14` §8). Positions are a
separate, audited call, because granting someone a position is a permission change and must
appear in the audit log as one.

## State

Local, with a `usePeople()` hook. Filters and cursor live in the URL query string so a
filtered list is linkable and survives a reload.

The CSV import wizard holds its mapping in local state across the preview → commit steps.

## Components

`<PageHeader>` · `<ResponsiveTable>` · `<PersonChip>` · `<ConfirmDialog>` · `<EmptyState>` ·
`<Toast>`.

## Interactions

**List.** Search by name or email, filter by unit and role. Columns: name, positions, unit,
email. Below 640px the table collapses to stacked cards with the name as the title
(`24` §3).

**Position chips.** A position is always rendered `Role — Unit`. The unit half is what keeps
powers boxed to the right place (INV-005), so it is never abbreviated away. Adding a position
is two inline dropdowns, never a modal.

**Two-hat presets.** Pairs configured during setup ("Dean + Professor") appear as one-click
buttons on the detail page. Adding a person with two hats must take under 60 seconds
(`customization.md` §12).

**Person detail** shows, in order: identity, positions, and **effective powers by place** —
the powers this person actually has, grouped by unit:

```
On Computer Science    campaign.launch, results.read, person.read
On School of Eng.      results.read
Anywhere else          nothing
```

This is the per-person view of INV-005 and it explains the whole scoping model without a
paragraph of documentation. It is computed by the same resolver the middleware uses
(`11` §6) — never a second implementation.

**CSV import.** Column mapper (your column → our field), a preview of the first five rows, and
a "did you mean" dropdown for every unmatched role name. **It never fails silently.** A file
with 60 crew members and four unrecognised roles resolves in four dropdowns.

Commit is idempotent by `Idempotency-Key` (`13` §7) — a retried upload does not double the
staff list.

**Invite links** are issued per role. People fill in their own name and email; an
administrator approves a queue. For a 500-person organisation this reduces typing to nearly
zero.

## States

| State | Behaviour |
|---|---|
| Empty | `<EmptyState>`: *"No {respondents-plural} yet"* + Add / Import actions |
| Empty after filter | Different copy: *"No one matches those filters"* + Clear filters |
| Loading | Skeleton rows |
| Error | Inline above the table; the last good page stays |
| 403 | Full-page 403 on direct navigation |
| Import partial | Never partial — commit is all-or-nothing per file, with a per-row error report |

Distinguishing "empty" from "empty after filtering" matters: the first needs an add action,
the second needs a clear-filters action, and showing the wrong one is a small daily
frustration.

## Acceptance

- [ ] The list is scope-filtered by the API; `meta.total` reflects the caller's scope
- [ ] A person can hold two positions at different units, shown as two chips
- [ ] Adding a two-hat person via preset takes under 60 seconds
- [ ] Effective powers on the detail page are produced by the shared resolver
- [ ] The powers view proves INV-005: powers on unit A do not appear under unit B
- [ ] Create-person requests cannot carry a role or capability
- [ ] Every assignment change writes an audit row
- [ ] CSV import maps columns, previews five rows, and resolves unmatched roles by dropdown
- [ ] A retried import with the same key does not duplicate people
- [ ] Empty and empty-after-filter show different copy and different actions
- [ ] Table collapses to cards at 390px
- [ ] Every noun from `useLabels()` (INV-001)

## Out of scope

| Not building | Why |
|---|---|
| Bulk edit of positions | Import covers bulk; a bulk position editor is a permission change at scale with no undo story |
| Org-chart view of people | The tree holds units; people are the leaves. Person-centric visualisation is P3 (`customization.md` §10) |
| Deactivation workflows / offboarding | `status` exists; a workflow around it is P3 |
| Profile photos | Initials avatars only |
| Direct password setting by an admin | Invite links only — an admin who sets passwords can impersonate |
