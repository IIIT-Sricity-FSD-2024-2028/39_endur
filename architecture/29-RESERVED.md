# 29 — Reserved

> **PLACEHOLDER — unassigned slot.** Nothing is planned for this number.

Phase: — · Milestone: — · Status: **unassigned**

---

## What this is

The last slot in the frontend block (`20`–`29`), deliberately left free.

The numbering uses blocks with headroom rather than a contiguous sequence, so a new document
can be inserted next to related ones instead of being appended at the end where nobody looks:

| Block | Covers | Free |
|---|---|---|
| `00`–`09` | Foundations — product, phases, tooling | `04`–`09` |
| `10`–`19` | Backend and API | — |
| `20`–`29` | Frontend | **`29`** |
| `30`–`49` | Pages and features | — |
| `50`–`59` | Cross-cutting, and pages added after `30`–`49` filled | `59` |
| `60`–`69` | P3 stretch features | `64`–`69` |
| `70`–`79` | Endur's own platform surfaces | `73`–`79` |

`README.md` § Numbering is the authority; this copy exists because someone reading *this* file
is deciding where to put a document. **If the two disagree, `README` wins and this one is
stale** — it has been twice (`19` and `49` were listed free after they were written, and the
`70`s block was missing entirely until 2026-08-23).

## If you use this slot

1. Give it a real name; do not leave it as `29-RESERVED.md`
2. Add it to `README.md`'s index
3. Add its owned path to `_MEMORY.md` § `MAP`, so the parallel-work lock table stays complete
4. Delete this file

## Candidates considered and rejected for now

| Candidate | Why not |
|---|---|
| Frontend routing deep-dive | Fits inside `20`; splitting it would fragment one story |
| Animation and motion | `21` §7 covers it, and there are only four places motion is allowed |
| Icon system | Four lines in `21` §5. A document would be longer than the rule |
