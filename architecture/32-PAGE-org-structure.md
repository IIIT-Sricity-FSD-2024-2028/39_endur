# 32 — Organization structure

Phase: P2 · Milestone: **M0** · Design ref: `design_specs/design/04-PAGE-ADMIN-CONSOLE.md` §4.2

## Purpose

The unit tree — the substrate everything else scopes against. Editing it changes who can see
what, which is why every destructive action here states its real consequence in numbers.

## Route & access

`/app/structure` — console world, session required.

## Capabilities

| Action | Capability | Target |
|---|---|---|
| View the tree | `unit.read` | scoped |
| Add a unit | `unit.create` | parent unit |
| Rename | `unit.update` | the unit |
| Move | `unit.reparent` | the unit |
| Delete | `unit.delete` | the unit |
| Preview impact | `unit.read` | the unit |

`unit.reparent` is separate from `unit.update` on purpose: renaming a department is cosmetic;
moving it changes the scope of everyone inside it.

**The tree is scope-filtered by the API** (INV-003). A level-2 role sees their own subtree
rooted at their unit, not the whole org with the rest greyed out. Out-of-scope units are
absent.

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| Load | `GET /api/v1/units` | → `UnitNode[]` — a scoped tree |
| Create | `POST /api/v1/units` | `CreateUnitBody { name, parentId, isTemporary?, endsAt? }` |
| Rename | `PATCH /api/v1/units/:id` | `UpdateUnitBody { name?, isTemporary?, endsAt? }` |
| Move | `POST /api/v1/units/:id/reparent` | `ReparentBody { newParentId }` |
| Delete | `DELETE /api/v1/units/:id` | `DeleteUnitBody { reassignChildrenTo?: string }` |
| Impact | `GET /api/v1/units/:id/impact` | → `{ peopleAffected, subjectsAffected, gained[], lost[] }` |

`reparent` is cycle-checked server-side via `wouldCreateCycle()` (`10` §6); a cycle returns
`409 CONFLICT`. The client also prevents the obvious cases in the drag interaction, but the
server is the authority.

## State

Local. The tree is loaded through `useUnits()` and mutations refetch it (`23` §3). No
optimistic update on reparent — a move that silently fails a cycle check and then snaps back
is worse than a brief wait.

Inline rename **is** optimistic, with revert on failure. It is a single field and the demo
depends on it feeling instant.

## Components

`<PageHeader>` with vocabulary chips and the scope chip · `<UnitTree>` in `mode="edit"` ·
`<ConfirmDialog>` · `<EmptyState>`.

`<UnitTree>` is the same component as the wizard and the audience picker (INV-009). Assign it
to one person — it is the component most likely to be rewritten three times.

## Interactions

**Add.** `+` on a row adds a child under it and focuses the new name input immediately. Two
clicks, two words.

**Rename.** Inline (`24` §7). `Enter` commits, `Esc` reverts, blur commits. Never a dialog —
renaming three units must not open three dialogs.

**Move.** Drag to reparent, with a dashed accent outline on the drop target. Dropping onto a
descendant is refused with an inline message, not a dialog.

**Delete.** Always through `<ConfirmDialog>` with the real number:

> *"Deleting Computer Science moves 64 people and 12 courses to School of Engineering."*

Never "Are you sure?" (`24` §6). The numbers come from `GET /:id/impact`, fetched when the
dialog opens. If the impact call fails, the delete button stays disabled — never confirm a
destructive action with unknown consequences.

**Temporary units.** A unit marked temporary gives every child an end date; when it passes,
every position inside expires automatically (`10` §9). The badge is visible on the row, and
the "ends in N days" warning appears within 30 days.

**Range syntax.** Typing `Floor 1..8` in a name field creates eight siblings. Hotels, colleges
and hospitals are full of numbered repetition, and this turns eight actions into one
(`customization.md` §11). Supported forms: `1..8`, `A..F`. Capped at 50 to prevent an
accidental `1..10000`.

## States

| State | Behaviour |
|---|---|
| Empty | `<EmptyState>`: *"No {units} yet"* + "Add a {unit}". Only reachable if setup was skipped |
| Loading | Skeleton rows at the tree's shape, not a centred spinner |
| Error | Inline retry above the tree; the last good tree stays on screen |
| 403 | Full-page 403 for direct navigation without `unit.read` |
| Cycle | `409` → inline message on the dragged row, tree snaps back |

## Acceptance

- [ ] The tree is scope-filtered by the API; out-of-scope units are absent, not greyed
- [ ] A level-2 user sees their subtree rooted at their own unit
- [ ] Reparenting into a descendant is refused with a clear message and no data change
- [ ] Delete confirmation states real numbers, fetched before the dialog is actionable
- [ ] Deleting with the impact call failing is impossible
- [ ] `Floor 1..8` creates eight siblings; `1..10000` is refused
- [ ] Inline rename commits on `Enter` and reverts on `Esc`
- [ ] A temporary unit's children carry end dates and expire positions on schedule
- [ ] Every noun comes from `useLabels()`, including the add button (INV-001)
- [ ] `<UnitTree>` has one implementation across three pages (INV-009)
- [ ] Usable with touch at 390px

## Out of scope

| Not building | Why |
|---|---|
| Multiple dimensions in the UI | Schema supports them (`10` §2.2); the second chart tab is P3 |
| Bulk move | Reparenting a subtree already moves everything under it |
| Undo beyond the toast | A persistent undo bar is P3 with the Tier-2 board |
| Org chart visualisation | The tree is the visualisation. A rendered chart is P3 (`customization.md` §10) |
| CSV import of units | Range syntax and paste cover the real cases |
