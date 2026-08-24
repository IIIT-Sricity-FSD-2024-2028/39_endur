# 33 — Roles and the powers grid

Phase: P2 · Milestone: — · Invariants: INV-004, **INV-012** · Design ref: `design_specs/design/04` §4.3, `design_specs/customization.md` §9 screens 1, 3–8
Status: **BUILT 2026-08-24 (`T-052`)** — first of `CONF-021`'s four sidebar pages.
Owns: `src/frontend/pages/console/Roles/**`, `src/frontend/lib/roles.ts`,
`packages/shared/src/capability-labels.ts`, `src/backend/middleware/requireNoGrantEscalation.ts`

> **"No backend work at all" was wrong, and the error was mine.** The board said so on the
> strength of "every route exists", which is true — `T-017` built all nine. What did not
> exist is **two of the three refusals this document specifies**: § The lockout guard and
> § The escalation bound were written in round 1 and never implemented, so `PUT /grants`
> carried `requireCapability('grant.update')` and nothing else. Anyone the administrator
> delegated the grid to could write any role every capability in the catalogue, and any
> administrator could leave the organisation unadministrable with no undo. `DEC-056`,
> `DEC-057`. A route existing is not a rule existing.

## Purpose

Where "adjustable role-based access" stops being a claim. Two surfaces on one route: the role
ladder (rank order, which derives levels), and **the powers grid** — a single matrix of role ×
capability that replaces what would otherwise be a configuration file.

This is the strongest novelty artifact in the product after the simulator. It is also the most
dangerous screen, because `grant.update` can lock everyone out.

## Route & access

`/app/roles` — console world. Two tabs: `Roles` and `Powers`.

## Capabilities

| Action | Capability |
|---|---|
| View roles | `role.read` |
| Add / rename / reorder / delete a role | `role.create` `role.update` `role.delete` |
| View the grid | `grant.read` |
| Edit the grid | `grant.update` |
| View warnings | `grant.read` |

`grant.update` is the most dangerous capability in the system. Seeded to level 1 only
(`11` §8), and every change is audited with the decision that permitted it.

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| Roles | `GET /api/v1/roles` | → `Role[]` |
| Create | `POST /api/v1/roles` | `CreateRoleBody { name }` |
| Rename | `PATCH /api/v1/roles/:id` | `UpdateRoleBody { name }` |
| Reorder | `POST /api/v1/roles/reorder` | `ReorderBody { orderedIds: string[] }` |
| Delete | `DELETE /api/v1/roles/:id` | `{ reassignTo?: string }` |
| Catalogue | `GET /api/v1/authz/capabilities` | → `CapabilityMeta[]`, grouped by module |
| Grid | `GET /api/v1/grants` | → `GrantCell[]` |
| Save grid | `PUT /api/v1/grants` | `PutGrantsBody { cells: GrantCell[] }` — **bulk** |
| Warnings | `GET /api/v1/grants/warnings` | → `GrantWarning[]` |

```ts
export const GrantCell = z.object({
  roleId:     z.string().uuid(),
  capability: z.string(),
  scope:      z.enum(['self','own_unit','subtree','all']).nullable(),  // null = no grant
  effect:     z.enum(['allow','deny']).default('allow'),
  params:     z.record(z.number()).optional(),
});
```

**`PUT /grants` is bulk and replaces the whole matrix in one transaction** (`13` §3). The grid
is edited by clicking many cells; one request per cell would make undo incoherent and
recompute the warnings dozens of times.

**Levels are never sent.** They are derived from `orderedIds` order (`24` §4).

## State

Local. The grid holds a working copy; `PUT` on save, with an explicit Save button rather than
autosave — this is the one screen where an accidental change is genuinely harmful.

Undo is a client-side stack over the working copy, plus the `<Toast>` undo after a save.

## Components

`<PageHeader>` · `<RoleRow>` · `<PowersGrid>` · `<ConfirmDialog>` · `<Toast>`.

## Interactions — the roles tab

Drag to reorder; levels renumber live and the generated "Sees…" text updates per row. Inline
rename. The lowest role cannot be deleted. Deleting a role with holders requires a
reassignment target, and the confirmation states how many people move.

## Interactions — the powers grid

Rows are capabilities grouped by module and collapsible; columns are roles.

| Interaction | Effect |
|---|---|
| **Click a cell** | Cycle the scope: `—` → `self` → `own_unit` → `subtree` → `all` → `—` |
| **Type a number** | Set a param limit in place — no side panel, no separate form |
| **Shift-click** | Hard block (`effect: deny`). Renders distinctly and **beats every other grant** |
| **Click a column header** | Copy an entire column from another role, then edit |
| **Click a row header** | Grant a capability to everyone or nobody |

**The row labels are not written yet, and INV-001 applies to them** (`D-008`). The backend's
`capabilityCatalogue()` builds them from the capability key — `campaign.launch` becomes
*"launch campaigns"* — which is an English domain noun on a grid a hotel administrator reads.
The T-044 vocabulary audit found it and deliberately left it here rather than guessing: four
of the objects in that catalogue (`role`, `person`, `template`, `org`) have no label at all,
and deciding what a row says for those is this document's work. `audit:vocab` cannot catch it
either, because the string is assembled from a key rather than written down.

**Colour intensity tracks scope width.** An over-granted role appears as a visibly dark
column; an orphan capability appears as a visibly empty row. Mistakes are *visible* rather
than discoverable, which is the entire argument for a grid over a list of permissions.

The hard-block cell carries a tooltip stating the one resolution rule an administrator
genuinely benefits from knowing: **a deny always beats an allow** (INV-004). It is what makes
a block on external vendors safe even after someone adds them to a committee.

## Warnings

Rendered as badges **at the site of the problem**, never as a list at the bottom of the page
(`customization.md` §6).

| Warning | Meaning |
|---|---|
| Orphan capability | No role can perform it — an empty row |
| Duplicate role | Two roles, same level, identical capability sets, different names — usually a naming mistake |
| **Self-approval loop** | A person who is both requester and approver of the same thing through two hats |
| Vacancy | A position exists with nobody in it |
| Expiry | "This project ends in 19 days; 12 people will lose access" |

**Self-approval loop detection is the highest-value check in the system**, because real
organisations break there and nobody notices until money moves. When detected it **proposes a
fix** rather than merely complaining — a `fix it` button opening a pre-filled rule. Problem
and cure in the same place.

Warnings never block a save. They are judgement calls, and blocking on a judgement call is how
administrators learn to fight the tool.

## The lockout guard

Saving a grid that would leave **no role holding `grant.update`** is refused with a `409`, not
a warning. It is the one unrecoverable mistake on this screen, and the only case where the
product overrides the administrator's intent.

Likewise, removing `grant.update` from your own only role prompts explicitly:
*"You will not be able to edit powers after this."*

## The escalation bound — INV-012, and it generalises the lockout guard

**A save that would raise a role above what the saver holds is refused** (`11` §5b, DEC-039).
Editing a role's row raises everyone holding it, so this screen is the highest-leverage place
in the product to hand out a power you do not have.

The lockout guard above is the same idea in one specific case — *do not let this save produce
an organisation nobody can administer* — and INV-012 is the general form: *do not let this save
produce an actor more powerful than you*. They stay separate rules because they fail
differently: the lockout guard protects the org from the administrator, and the escalation
bound protects the org from a delegate.

Refusal is `403 WOULD_ESCALATE` naming the capability and the cell, so the grid can highlight
it. **The cell is not pre-disabled**, unlike an out-of-scope row: which cells would escalate
depends on the whole submitted matrix, not on any one cell, and greying half a grid on the
strength of a guess teaches the wrong model of a system whose whole claim is that it explains
its refusals.

## States

| State | Behaviour |
|---|---|
| Empty | Not possible — the preset seeds a full matrix |
| Loading | Grid skeleton at the real row/column count |
| Error | Save failure keeps the working copy and shows one line above the grid |
| 403 | Roles tab renders read-only without `grant.update`; the grid renders with cells non-interactive and a one-line explanation |
| Conflict | `409` on lockout, with the specific reason |
| Would escalate | `403 WOULD_ESCALATE`, the offending cell highlighted and named. Never pre-disabled — see above |

## Acceptance

Ticked items are asserted in `src/frontend/pages/console/Roles/Roles.test.tsx` (18 tests) or
`src/backend/test/powers-grid.test.ts` (15 tests) — the guards are the API's, so they are
proved there.

- [x] Levels derive from row order and are never sent to the API — the reorder call sends
      `orderedIds` and the test asserts the body has no `level` key at all
- [x] Cell click cycles scope; the change is visible without a reload
- [x] Shift-click produces a deny that beats an allow from a group and a delegation — and a
      plain click does **not** cycle into one. Cycling *through* a deny would arm the grid's
      most consequential state by accident, four clicks into a scope walk
- [x] Column copy fills a role from another in one action
- [x] Colour intensity makes an over-granted column and an orphan row visually obvious —
      `--weight` on the cell tracks scope width, not "is there a grant here"
- [x] Saving is one bulk request in one transaction — and it sends a **diff**. `33`'s
      "replaces the whole matrix" describes the transaction, not the payload: `PUT /grants`
      writes what it is given and leaves the rest alone, so sending every cell would clear
      `derived` on every row and make the audit entry claim a change nobody made
- [ ] Self-approval loop is detected and offers a pre-filled fix — **the detection exists**
      (`grantWarnings`, `kind: 'self_approval'`) and renders at the cell. The **pre-filled
      fix button does not**, because there is no rule editor to pre-fill: the sentence
      builder is `P3` in § Out of scope below
- [x] Warnings render at the offending cell, not in a list
- [x] A save that would remove the last `grant.update` holder is refused with a clear
      reason — `409`, `DEC-057`, computed on the **resulting** matrix. A `deny` counts as
      not holding it (INV-004), so a matrix that *looks* like it has a holder does not pass
- [x] Removing your own `grant.update` prompts before saving — the half the server cannot
      do, and the reason `Position` gained `roleId`: matching the reader's positions to grid
      columns by role **name** is `N-057` exactly, before the one save with no undo
- [x] Every grid change writes an audit row with `decidedBy` (INV-007) — and a **refused**
      save writes nothing, because the guard is middleware and runs before the transaction
      opens
- [x] Without `grant.update`, the grid is visibly read-only rather than absent
- [x] Usable at 390px — the grid scrolls horizontally inside its own container, and the page
      body never does. Not cards: a matrix with its columns stacked has stopped being a matrix
- [x] **Row labels use the org's vocabulary** — `D-008` repaid by `DEC-055`. Verified live
      against The Grand Palace: *"open guest surveys for answers"*, *"add restaurants"*,
      *"move properties to a different parent"*
- [ ] Drag to reorder — **buttons instead**, recorded rather than glossed. A keyboard-
      reachable move is what `26` requires anyway, so a drag surface would need these as its
      fallback; what is missing is the drag affordance, not the capability

## Out of scope

| Not building | Why |
|---|---|
| The sentence builder for conditional rules | `customization.md` §9 screen 7. P3 — the grid plus the proposed self-approval fix covers the real cases |
| Multiple chart dimensions in the UI | P3 |
| Group and delegation editors | P2 later, separate surfaces; the schema supports them now |
| User-defined capabilities | The restriction that makes this UI possible (`11` §11) |
| Per-person overrides in the grid | Schema supports person grants; they are edited on the person detail page (`34`) |
