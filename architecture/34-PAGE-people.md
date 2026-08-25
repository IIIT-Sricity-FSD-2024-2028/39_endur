# 34 — People

Phase: P2 · Milestone: — (cut-list item 7 — seed only if behind) · Related: `57` (accounts)
Status: **LIST BUILT 2026-08-23 (`T-050`) · DETAIL PAGE BUILT 2026-08-24 (`T-051`) · CSV import + accounts BUILT 2026-08-25 (`T-050`/`T-073`)** — only the two-hat preset buttons remain unbuilt
Owns: `src/frontend/pages/console/People/**`, `src/frontend/lib/people.ts`
Design ref: `design_specs/design/04` §4.4, `customization.md` §9 screen 9

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
| Update | `PATCH /api/v1/people/:id` | `UpdatePersonBody { name?, email? }` — **no `status`, see below** |
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

**The primary flag is not cosmetic, and stopped being so on 2026-08-23.** `DEC-044` anchors a
per-person grant at the primary position's unit, so which position is primary decides where a
per-person override applies — and a person with two positions and none flagged has no anchor
at all. The editor therefore makes the **first** position primary by default and shows the
checkbox from the second onwards, rather than hiding it as an advanced option.

**Creating and assigning are two calls, and the screen hides the seam without removing it.**
Adding somebody opens the position editor on their new row immediately: a person with no
position can do nothing at all, so leaving the administrator on a list with a new row that
does nothing is leaving the job half done.

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

**Accounts.** A person in the graph cannot sign in until somebody provisions an account for
them — `57-FEATURE-accounts-and-invites.md` owns that flow and this page is where it is
reached. The row action is `Invite`; the detail page carries an account panel with status, last
sign-in, re-issue and revoke.

**A person you have just created is visible to you.** `POST /people` creates a person and no
position — `14` §8 requires that, because granting a position is a permission change and must
be its own audited call — so until `DEC-047` an unanchored person matched no unit-scoped
caller and disappeared from this very page the moment they were created. The scope filter now
reads: a position in a unit you can see, **or no positions at all**, or your own row. One
predicate, used by the list and the detail route, so a row cannot appear in the table and then
`404` when somebody clicks it. See `D-026`.

**`PATCH /people/:id` no longer accepts `status`.** It was a second way to disable an account
— behind `person.update` rather than `account.revoke`, leaving live sessions and the password
hash intact, so an administrator saw "disabled" and believed access had ended when it had not.
Ending access is `DELETE /people/:id/account` and nothing else (`DEC-046`, `57` § Revocation).

The distinction the panel has to make visible, because it is the one everybody gets wrong:
**positions are the powers, the account is the key.** Revoking an account ends somebody's
access without dismantling the org chart they are still in; removing their position takes the
powers and leaves them able to sign in to their own profile and nothing else. Two separate
actions, two separate audit rows, and the panel never merges them into one button.

**Assigning a position is now bounded by INV-012.** A caller cannot give somebody a role that
resolves to a capability the caller does not hold at that unit (`11` §5b) — so a coordinator
with `assignment.create` cannot mint an owner. The refusal is `403 WOULD_ESCALATE` and it
**names the capability**, because a bare refusal on a button that worked one row above reads as
a bug rather than a rule.

## States

| State | Behaviour |
|---|---|
| Empty | `<EmptyState>`: *"No {respondents-plural} yet"* + Add / Import actions |
| Empty after filter | Different copy: *"No one matches those filters"* + Clear filters |
| Loading | Skeleton rows |
| Error | Inline above the table; the last good page stays |
| 403 | Full-page 403 on direct navigation |
| No account | An `Invite` action. See `57` for the four account states |
| 403 `WOULD_ESCALATE` | The action is **present and fails loudly**, naming the capability — the one refusal in this product shown as an error rather than hidden, because the caller can perform it on most rows and an absent button would read as a rendering bug |
| Import partial | Never partial — commit is all-or-nothing per file, with a per-row error report |

Distinguishing "empty" from "empty after filtering" matters: the first needs an add action,
the second needs a clear-filters action, and showing the wrong one is a small daily
frustration.

## Acceptance

Ticked items are asserted in `src/frontend/pages/console/People/People.test.tsx` (17 tests)
or in the backend suite where the guarantee is the API's.

- [x] The list is scope-filtered by the API; `meta.total` reflects the caller's scope —
      the page never filters for permission reasons (INV-003)
- [x] A person can hold two positions at different units, shown as two chips
- [x] **A position is never rendered without its place.** The unit half is what boxes the
      powers (INV-005), so a chip reading only "Dean" would hide the model's most important
      behaviour on the screen where somebody is setting it
- [x] A person with **no** position says so in words — an empty cell would not
- [ ] Adding a two-hat person via preset takes under 60 seconds — **presets not built**; the
      two dropdowns are, and a second position is four interactions
- [x] Effective powers on the detail page are produced by the shared resolver — one caller
      of it, `features/people/powers.ts`, shared with `/profile` (`47`). Proved by a
      person-level DENY removing a power from the page: a list built from the role's grants
      cannot see that deny, and INV-004 says it wins
- [x] The powers view proves INV-005: powers on unit A do not appear under unit B — **and
      building it found a live break of exactly that.** `readPerson` had no unit id to work
      with (`personSelect` fetched position NAMES only), so it re-found the unit by name:
      `where: { orgId, kind: 'position', unit: { name: position.unitName } }`. Nothing stops
      two units sharing a name — `nodes` has no unique on `(org_id, kind, name)` and
      `POST /units` does not check — so a person holding a position in each of two same-named
      units had both resolved to whichever row came back first, and one unit's powers printed
      under the other's heading. On the one screen in the product built to show that powers do
      not leak between units. Fixed by putting `unitId` on the position DTO; the test that
      catches it is the only one in the repo with two same-named units, because every other
      fixture names them distinctly (`profile.test.ts`, `_MEMORY.md` `N-057`)
- [x] Create-person requests cannot carry a role or capability — the DTO refuses it and the
      form does not ask, and **says on screen why the position comes next**
- [x] Every assignment change writes an audit row (INV-007, backend since `T-018`)
- [x] **An assignment that would escalate is refused inline and verbatim** — INV-012's
      message names the capability, and replacing it with generic copy would throw away the
      only actionable part (`11` §5b)
- [x] CSV import maps columns, previews five rows, and resolves unmatched roles by dropdown —
      built `T-050` 2026-08-25 (`People/ImportWizard.tsx`)
- [x] A retried import with the same key does not duplicate people (backend, `T-018`)
- [x] Empty and empty-after-filter show different copy and different actions
- [ ] Table collapses to cards at 390px — `<ResponsiveTable>` does it; the device check is
      `T-045`
- [ ] A caller cannot assign a role resolving to a capability they lack at that unit —
      `403 WOULD_ESCALATE`, naming it (INV-012)
- [x] The account panel shows all four states, and revoke leaves positions intact — built
      `T-073` 2026-08-25
- [x] Every noun from `useLabels()` (INV-001) — `audit:vocab` clean, and the page's own tests
      run against nonsense labels

## Out of scope

| Not building | Why |
|---|---|
| Bulk edit of positions | Import covers bulk; a bulk position editor is a permission change at scale with no undo story |
| Org-chart view of people | The tree holds units; people are the leaves. Person-centric visualisation is P3 (`customization.md` §10) |
| Deactivation workflows / offboarding | `users.status` exists and `DELETE /people/:id/account` sets it (`57`); a *workflow* around it is P3 |
| Bulk avatar upload | Single avatar upload is specified in `48`; a bulk path has no demand |
| Direct password setting by an admin | Invite links only — an admin who sets passwords can impersonate. **Re-examined on 2026-08-23 when accounts were specified, and kept** (`57` § "Why an administrator still cannot set a password") |
