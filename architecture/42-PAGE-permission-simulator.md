# 42 — Permission simulator

Phase: P2 · Milestone: — · Design ref: `design_specs/customization.md` §9 screen 10, §15
Source: `_MEMORY.md` N-005

## Purpose

> *"If **Ramesh** tries to **approve leave** for **Suresh** — allowed or blocked, and why?"*

The simulator turns invisible resolution logic into something pokeable, and it **always shows
the decision chain, not just the verdict**. It is the cheapest trust-builder in the product
and the single best viva artifact: an evaluator can interrogate the permission model directly
instead of taking a diagram's word for it.

`customization.md` §10 is explicit that this belongs on a main screen, not behind an advanced
menu. It is also in the Bronze tier (`16` §3) — gating it would mean the customers least able
to configure permissions correctly are the ones who cannot check their work.

## Route & access

`/app/simulator`, plus an embedded panel on `/app/roles` under the powers grid — the same
component in two placements, because the moment you most want to test a rule is right after
editing one.

## Capabilities

| Action | Capability |
|---|---|
| Run a simulation | `simulator.run` |

Seeded to administrative roles. It reveals the org's permission structure, so it is not a
default-for-everyone capability.

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| Simulate | `POST /api/v1/authz/simulate` | `SimulateBody` → `Decision` |
| Catalogue | `GET /api/v1/authz/capabilities` | → `CapabilityMeta[]` |

```ts
export const SimulateBody = z.object({
  principalUserId: z.string().uuid(),
  capability:      z.string(),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('org') }),
    z.object({ kind: z.literal('unit'),     unitId:    z.string().uuid() }),
    z.object({ kind: z.literal('person'),   userId:    z.string().uuid() }),
    z.object({ kind: z.literal('subject'),  subjectId: z.string().uuid() }),
    z.object({ kind: z.literal('campaign'), campaignId:z.string().uuid() }),
  ]),
  at: z.coerce.date().optional(),     // "would this be allowed on 20 Aug?"
});
```

Returns the full `Decision` **including `considered`** (`11` §5) — this is the one endpoint
where the rejected candidates are exposed, because they are the entire point.

`at` enables testing delegation windows and temporary units before they take effect, which is
what makes an expiry warning actionable rather than alarming.

## Implementation constraint — the one that matters

> **`simulate.ts` must call the same `resolve()` the middleware calls** (`11` §6).

If the simulator ever re-implements the algorithm it becomes worse than useless: it would show
a decision the system did not actually make, and every conclusion drawn from it would be
false. A property test asserts that `simulate()` and the live guard return identical decisions
for identical inputs over random org fixtures (`11` §10).

## State

Local. The last five simulations are kept in component state as a session history — during a
demo you run three in a row and want the previous answers still on screen.

## Components

`<PersonChip>` in the pickers · `<EmptyState>` · sentence-shaped selects. No new components
(`24` preamble).

## Interactions

**The sentence builder.** The query reads as English, with every blank a dropdown populated
from existing objects, so an invalid query cannot be constructed:

```
If  [ Ramesh Kumar ▾ ]  tries to  [ approve leave ▾ ]
for [ Suresh Patil ▾ ]  on        [ 02 Sep 2026 ]        [ Test ]
```

**The verdict.** Large, unambiguous, and immediately followed by the chain:

```
ALLOWED
  because  Dean can approve leave up to 15 days
           via role "Dean", anchored at School of Engineering, scope: subtree
  his Professor role allows 0 days — the higher one was used
```

```
BLOCKED
  On Night Bus he is an Editor. Editors cannot approve spending.
  His Director powers apply only on Ayaan.
  → this would be allowed if the project were Ayaan
```

**The counterfactual is the most valuable line on the screen.** *"This would be allowed if…"*
teaches INV-005 in one sentence and turns the simulator from a checker into an explainer.
Derived from `considered`: a grant rejected only by scope yields exactly this line.

**Hard blocks** state the rule explicitly, because it is the one resolution detail an
administrator genuinely benefits from knowing:

```
BLOCKED
  hard block on External. Cannot be overridden by any team or grant.
```

**The many-hats view.** Selecting a person shows every node they occupy glowing across every
chart, with a side panel listing their powers per place. This picture is what makes the
dean-is-also-a-professor model click without a paragraph of documentation.

**From a warning.** A `fix it` button on a `33` warning opens the simulator pre-filled with the
offending combination. Problem and diagnosis in the same place.

## States

| State | Behaviour |
|---|---|
| Empty | The sentence with unfilled blanks and a one-line explanation of what it does |
| Incomplete | `Test` disabled until every blank is filled |
| Loading | The button shows a spinner; the previous result stays on screen |
| Error | Inline under the sentence; the query is preserved |
| 403 | Full-page 403 — the simulator reveals structure |
| No grants at all | *"BLOCKED — no rule grants this."* Explicitly, not an empty result |

## Acceptance

- [ ] `simulate()` and the live middleware return identical decisions — property test over
      random fixtures (`11` §10)
- [ ] Every result shows the decision chain, never a bare verdict
- [ ] The counterfactual line appears when a grant was rejected only by scope
- [ ] A hard block states that it cannot be overridden
- [ ] `at` correctly predicts a delegation that has not started and one that has expired
- [ ] The INV-005 case is demonstrable: Director on A, Editor on B, denied on B with the
      reason
- [ ] Answering "why can this person do that?" takes **under 30 seconds**
      (`customization.md` §12)
- [ ] Every blank is a dropdown from existing objects; an invalid query cannot be built
- [ ] A `fix it` from a `33` warning arrives pre-filled
- [ ] The last five simulations remain visible
- [ ] Available on the Bronze tier
- [ ] Works at 390px

## Out of scope

| Not building | Why |
|---|---|
| Bulk simulation (a matrix of everyone × everything) | The powers grid already shows the matrix; this answers a specific question |
| Editing a grant from the simulator | Diagnosis and treatment stay separate. `fix it` links to `33` |
| Simulating a hypothetical role that does not exist | Would need a whole draft-org concept |
| Impact preview before save | Related but different; it lives on `32` and `33` |
| Exporting a simulation as evidence | P3, with the audit surface |
