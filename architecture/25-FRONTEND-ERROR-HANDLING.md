# 25 — Frontend error handling

> **PLACEHOLDER — reserved slot, not yet written.** Nothing below is decided **except
> § "The one row that could not wait"**, which is `DEC-054` and is **live in
> `router/boundaries.tsx` since `T-089`** (2026-08-24).

Phase: P2 · Milestone: — · Status: **unwritten, except one decided row** (`DEC-054`, 24 Aug)

---

## Why this slot is reserved

The pieces exist but are scattered: the error envelope in `13` §5, the `ApiError` wrapper in
`20` §4, the 422 field-path mapping in `14` §6, per-page error states in every doc from `30`
onward, and the copy rules in `design_specs/design/10` §4.

Nothing yet says how they compose — in particular, how a `details.fields[0].path` of
`body.questions.0.text` finds the right input in the builder. That mapping is specified as a
requirement in `37` but not as a mechanism.

## What will go here

- The `ApiError` → UI decision table: inline field · inline form · full page · toast
- Field-path resolution from a 422 into a rendered form control
- Error boundaries per world (`20` §2) and what each renders
- **Module-load failure — one row is already decided, see below**
- Retry policy: which requests retry silently, which surface, which never retry
- Offline and network-failure handling — most acute in the respondent flow (`39`)
- The rule already fixed in `24` §6: **errors never use a toast**

## The one row that could not wait — `DEC-054`

Reported by the owner on 2026-08-24 as *"sign in button on homepage is broken"*, with the
message `error loading dynamically imported module: …/pages/public/Login.tsx`.

**A failed module import is not a bug in the page it names.** Every route here is lazy
(`20` §2), so the browser fetches a chunk at **click time**, long after the document loaded.
If the module graph moved underneath the tab in between — a deploy replacing hashed chunks, a
dev-server restart, a Vite dependency re-optimisation — the already-running app keeps working
and the **next** lazy route is the thing that dies. The failure surfaces at whichever route
the user happened to click, which is why it points at `Login.tsx` and means nothing of the
kind.

The rule, live in `router/boundaries.tsx` since `T-089` rather than waiting for this doc to
be written:

1. Say **the app updated**. Not "something went wrong" — the user did nothing wrong and the
   page is not broken.
2. Offer a **full document load**. Never a client-side `<Link>`: a router navigation
   re-renders inside the same dead module graph and fails identically, which turns one
   failure into a loop the user escapes only by knowing to hard-refresh.

The class is identifiable from the thrown value without knowing which of the three causes
fired, and all three want the same remedy — so the boundary never has to diagnose. **Which is
the point**, because on 24 Aug it was not diagnosable after the fact: the module graph crawled
clean (44 modules, all `200`) and `node_modules/.vite/deps/_metadata.json` still carried its
21 Aug mtime, so the dependency optimiser had **not** re-run and that cause is ruled out for
that incident. A remedy that needs no diagnosis is the only kind that helps here.

`ConsoleBoundary` already did this and its comment says why. `PublicBoundary` did not, and
`/login` is the most-navigated lazy route in the product — it is what the landing page's one
call to action points at. `T-089`, `D-029`.

**The test that matters is not the one you would write first.** `<Link>` renders an `<a href>`
too, so every attribute assertion passes against the broken version. The only observable
difference is at click time: react-router calls `preventDefault()` on a plain left click it
intends to handle in memory, and a plain anchor leaves the event alone. Reverting the fix
turns exactly one test red — that one.

## Write this when

- [x] Two or more pages have implemented error states and the duplication is visible —
      **true since `T-050`/`T-051`**; the trigger has fired and the doc is still the debt
- [ ] Before the builder's inline validation is wired, since that is the case the field-path
      mapping exists for

Until then, per-page `## States` sections are authoritative and this document does not
override them — **except for the module-load row above**, which is decided (`DEC-054`) and
which no page doc owns, because it is not about any one page.
