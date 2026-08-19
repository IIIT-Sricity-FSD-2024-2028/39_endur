# Endur — project instructions

Feedback management and performance analysis platform. Multi-tenant, generic across
organisation types. This file is auto-loaded; keep it short and stable.

## Every session starts here

1. **`PROGRESS.md`** (repo root) — the live state: current phase, what is done, what is next,
   which decisions are outstanding. Read it before doing anything.
2. **`architecture/_MEMORY.md`** — the decision ledger. Read before changing anything
   architectural.
3. Pick up the topmost unblocked task from `PROGRESS.md` § Board, read the spec doc it names,
   and build that.

**Before you finish a session, update `PROGRESS.md`** — the board, the session log, and any
decision you made. The next session trusts it, so a stale one is worse than none.

Work is tracked as stable task ids (`T-001`…) defined in `architecture/55-BUILD-ORDER.md`.
Reference them in commits: `feat: T-010 grant resolver`.

## Before you change anything architectural

Read **`architecture/_MEMORY.md`**. It is the decision ledger — every architectural
decision, invariant, resolved conflict, and file-ownership lock lives there. If your change
contradicts a `DEC-` entry, you must supersede it explicitly in that file, not silently
diverge.

Then read **`architecture/README.md`** for the doc index and reading order.

Three catalogues are authoritative and additions go in them **first**, before any code:
capabilities in `11` §3, components in `24`, endpoints in `13`. That rule is what has kept
52 docs consistent across three revisions.

## Stack

| Layer | Choice | Non-negotiable because |
|---|---|---|
| Frontend | React 18 + Vite + **TypeScript** | — |
| State | RTK store, thin in P1–P2, deepened in P3 | Redux is a Phase-3 evaluation criterion |
| Backend | **Express 5 + TypeScript** | Phase-1 evaluation grades the middleware chain |
| Validation | Zod schemas as DTOs, in `packages/shared` | One source of truth across client and server |
| Database | **PostgreSQL** + Prisma | Recursive CTEs for the org graph; JSONB for labels/params |
| Auth | **Cookie sessions** (staff) · opaque tokens (respondents) | Respondents never hold accounts; CSRF is therefore a real middleware concern |

Do not introduce NestJS, Mongo, GraphQL, or a component library. Each was considered and
rejected; see `_MEMORY.md`.

## The five invariants

These are load-bearing. Breaking one is a bug even if tests pass.

1. **No user-facing domain noun is hardcoded.** Every one resolves through `useLabels()`
   from `organization.labels`. "Department", "Course", "Student", "Faculty" are *data*.
   Structural words (Save, Cancel, Settings, Question) are not and correctly stay literal.
2. **Nothing is education-specific.** No `Course`, `Faculty`, `Student`, or `Semester` as a
   type, table, enum, or route. The generic names are Unit, Subject, Respondent, Reviewee.
3. **Every authorised route passes through `requireCapability()`.** Authorisation is never
   decided inside a handler, and never in the frontend. The API returns only what the caller
   may see; the UI trusts it.
4. **A deny always beats an allow.** In the GRANT resolver this is absolute — no scope,
   role level, group membership, or delegation overrides an explicit deny.
5. **Anonymity is enforced in SQL, not in a view.** An anonymous response has no retrievable
   link to a respondent, and results below the k-anonymity threshold do not render at all.

## Phases

`P1 MIDDLEWARE` (current) → `P2 REACT` → `P3 REDUX`, matching the evaluation schedule.
Every doc carries a `Phase:` tag. Milestone **M0 = 26 Aug 2026** is a graded demo and cuts
vertically through all three layers; see `architecture/02-PHASES-AND-EVALUATION.md` for the
cut-list.

Do not build `P3`-tagged work early. Do not skip `P1` middleware to make screens look
finished sooner.

## Where design lives

`design_specs/` is authoritative for **visual** design — tokens, type, colour, spacing,
component anatomy, copy. `architecture/` is authoritative for **contracts** — schema,
routes, DTOs, capabilities, state, acceptance criteria.

Never copy colour, font, or spacing values into `architecture/`, and never invent a route or
DTO inside `design_specs/`. When the two disagree, `_MEMORY.md` records the resolution.

## Working conventions

- Two team members drive Claude in parallel. Before creating or heavily editing a source
  file, check the `MAP` section of `_MEMORY.md` — it is the lock table for which doc owns
  which path.
- Commit messages: `feat|fix|code|docs: <lowercase summary>`, matching existing history.
  Include the task id where one applies, and cite the `DEC-` id when a commit changes an
  architectural decision.
- The old v1.0 codebase was deleted deliberately. Do not restore it from git history; it is
  education-shaped and fights the generic model.
