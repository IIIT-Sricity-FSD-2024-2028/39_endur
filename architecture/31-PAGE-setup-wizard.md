# 31 — Setup wizard

Phase: P2 · Milestone: **M0 — the centrepiece** · Design ref: `design_specs/design/03` §3.4–3.5

## Purpose

Five steps that turn an industry choice into a working organisation. **Target: 90 seconds
from an evaluator saying "a gym" to a functioning org.** Every decision on this screen serves
that number.

This is the screen the evaluation is actually about. `02` §2 lists four things that are never
cut, and this is the first of them.

## Route & access

`/app/setup?step=industry|roles|structure|words|review` — console world, session required.
The step is in the query string so Back works and a step is linkable during a rehearsal.

**Focused frame** (T-032, `_MEMORY.md` `N-026`): `AppShell` takes `focused`, and
`ConsoleLayout` turns it on here — no sidebar, no drawer, no hamburger, matching
`design_specs/design/03` §3.4. During setup every sidebar item leads to a page that is empty
*because setup has not happened yet*, so offering them invites the one click that makes the
product look broken. It is still the console: same session, same capability gate.

`Skip setup →` in the top bar drops into the console with the Custom preset applied. **It is
the emergency exit for a stage failure and it must work.**

## Capabilities

| Action | Capability |
|---|---|
| View the wizard | `org.read` |
| Finish setup | `org.update` |

One commit, one capability. The wizard writes through `POST /api/v1/org/setup`, not through
the individual unit/role endpoints — so a user who may configure an org needs one permission,
not five.

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| Load presets | `GET /api/v1/org/presets` | → `Preset[]` |
| Commit | `POST /api/v1/org/setup` | `SetupOrgBody { industry, roles[], units[], labels }` |

```ts
export const SetupOrgBody = z.object({
  industry: z.enum(['university','hotel','hospital','company','custom']),
  roles:  z.array(z.object({ name: z.string().min(1).max(60) })).min(2).max(12),
  units:  z.array(z.object({ tempId: z.string(), name: z.string().min(1).max(80),
                             parentTempId: z.string().nullable() })).min(1),
  labels: LabelSet,
});
```

**One request, one transaction.** A five-step wizard that writes five times leaves half-built
organisations behind when someone closes the tab. The server seeds roles, units, derived
grants (`11` §8) and the preset's starter templates atomically.

Role **level is derived from array order** — index 0 is level 1. It is never sent as a field,
because a client-supplied level and a client-supplied order can disagree.

## State

**All five steps live in one object**, held in local state in the wizard route, persisted only
on Finish.

```ts
type WizardState = {
  industry: Industry | null;
  roles: { id: string; name: string }[];      // order IS the level
  units: UnitDraft[];                          // flat with parentTempId
  labels: LabelSet;
};
```

Not in the store (`23` §2) — it is one route's transient state, and putting it in Redux now
would be undone in P3.

**Back and forward must never lose typed input.** A wizard that forgets a rename is a wizard
that dies on stage. Selecting a different industry on step 1 after editing later steps prompts
before overwriting.

## Components

`<ProgressRail>` · `<RoleRow>` · `<UnitTree>` (mode `edit`) · `<InlineName>` · `<Toggle>` ·
`<ConfirmDialog>` and the live-preview pattern (`24` §7).

`<UnitTree>` here is the **same component** as `/app/structure` and the audience picker
(INV-009). **All six were built by T-032**, not by the tasks that catalogue them — the
wizard needed them first, and a second implementation later is exactly what INV-009 exists
to prevent. `T-033` extends the tree; it does not write one (`N-025`).

## Interactions

**Step 1 · Industry.** ~~Five cards showing the role chain and the vocabulary pair up front, so
the choice is made without clicking.~~ **AMENDED 29 Aug by `DEC-085`: a split pane. Five simple
cards on the left; the role chain and the vocabulary pair move to an aside on the right, for
the preset currently under consideration.** Selecting enables Continue; double-click selects
and advances.

The aside shows strictly more than a card could — all four roles as a chart, and both terms in
full sentences — and none of that fits on a card in a five-card grid. **What it costs is the
side-by-side beat**: presets are now compared serially, so a presenter who wants *"four
organisations, four vocabularies, one product"* says the sentence rather than showing it. That
trade is the whole of `DEC-085` § where, and it is the only one of this doc's step-1 claims
that did not survive.

When an evaluator names something unlisted — a gym, an NGO, a school district — the copy under
the grid is the presenter's script: *"Not listed? Pick the closest one — you'll rename
everything in the next three steps anyway."* A gym is a Company. Say it and move on. **This
line was dropped in the redesign and restored by `DEC-085`** — without it the five cards read
as an exhaustive list on the one screen whose entire subject is that the model does not care.

**Step 2 · Roles.** Drag to reorder; levels renumber live. The **"Sees…" column is generated,
not entered**, and it is the most important thing on the screen: it states the visibility rule
in plain English per row. When an evaluator asks "how do permissions work?", the answer is
that column.

The lowest level always reads "Responds only" and cannot be deleted. Validation: ≥ 2 roles,
unique, non-empty.

**Step 3 · Structure.** `+` on a row adds a child under it and focuses the new name input
immediately — the demo's "add two units" beat must be two clicks and two words. The button
label uses the vocabulary: "Add a Department" here, "Add a Property" in the hotel org.

**Step 4 · Words.** The live preview is the point of the step: a scaled, non-interactive
render of the real sidebar and a real sentence, updating on every keystroke. Type "Studio"
over "Course" and watch the nav change. That is the customization claim proven rather than
asserted.

**Confirmed 29 Aug by `DEC-085` after the redesign moved it to Review.** It belongs on both,
and it is the *same* `<DashboardPreview>` in both places (INV-009) — but Review is not a
substitute for here. This step's lede claims these words appear throughout Endur; proving it
two steps later, after the reader has stopped doubting, proves nothing.

Plurals auto-derive (`+s`, `y → ies`) with an override, because the hotel org needs
"Staff / Staff" and deriving it would be wrong exactly where someone is watching (`22` §2).

**Step 5 · Review.** Four summary cards, each with a pencil jumping back to its step. Finish
seeds starter templates and lands on `/app` with a one-time banner and a primary action to
`/app/subjects`.

**Keyboard:** `Enter` advances. `Esc` never closes the wizard — too destructive.

**AMENDED 2026-08-31 — `DEC-105` (built 31 Aug, `T-104`). `Enter` advances only from outside a text field.** Owner
report on `?step=structure`: *"clicking enter goes to next page when I am just trying to form
the team."*

The global handler skips `BUTTON` and `TEXTAREA` and **nothing else**, so an `INPUT` falls
through to *advance the step* — and steps 2 and 3 are built around typing into inputs. Step 3 is
the sharp case: `+` adds a child unit **and focuses its name input immediately**, so the wizard
hands the user a text field and then treats the natural key for finishing that row as the key
for leaving the screen. The work is not lost — the draft is in state — but the user is now a
step away from the thing they were building and has to find their way back.

**The handler's own comment already had the rule and applied it to one tag:** *"from anywhere
that is not a button (which has its own meaning for Enter)."* **A text input has its own meaning
for `Enter` too.** The test is *does this element take text* — `INPUT` (bar the button-like
types), `TEXTAREA`, and anything `contenteditable` — not a tag list to extend one bug at a time.

Advancing on `Enter` stays right on steps 1 and 4, where there is nothing to type, and the
existing assertion that `Enter` must not advance the step **behind a confirm dialog** is
untouched.

**Inside a text field, `Enter` belongs to the field** — on steps 2 and 3 that means *commit this
row and give me another*, which is what the user was reaching for.

### Dark mode — the cards have no edge  ·  `DEC-106` (built 31 Aug, `T-105`)

Owner report: *"in dark mode I can't see the cards, the card layout and padding are not clear
and hard on the eyes."* **It is a system fault, not a Setup fault**, and Setup is simply the
screen that is nothing but cards.

`design_specs/design/01` §4 defines Content surfaces as a white fill plus a resting shadow — a
**light-mode-only table**, written before `DEC-028` shipped dark and never revisited. On dark
the page and the card sit one step apart, at the edge of visibility on a laptop panel, and
`.preset-card`'s border is transparent. **The values themselves live in `design_specs/design/01`
§4 and are deliberately not restated here** (`DEC-012`). **The theme block already says so in
its own comment** — *"shadows on a dark ground do almost nothing; the lift has to come from the
edge instead"* — and the components never followed. Elevation is carried by an edge on dark.

**The padding half is a separate and simpler fault: `D-045`.** `endur.css` carries the setup
step's layout block **twice, 157 lines duplicated verbatim** (`/* Industry Split Layout */`
appears at two line numbers), so `.preset-grid` is declared **three times** across the file with
different `minmax()` and different `gap`, and `.preset-card`'s padding is overridden by
`.preset-card-simple` in the duplicated blocks. What renders is whichever copy the cascade
reaches last, which is not a layout anybody chose.

## States

| State | Behaviour |
|---|---|
| Empty | Never empty. Every preset ships a working default |
| Loading | Presets load before step 1 renders; the wizard does not open half-populated |
| Error | Commit failure keeps all state and shows one line above the Finish button. **Never lose the typed input** |
| 403 | Full-page 403 if the user lacks `org.update` |
| Partial | Not possible — the commit is atomic |

## Acceptance

- [ ] **`Enter` inside a text input does not change the step** — asserted on step 3 with the
      focus `+` leaves behind, which is the exact sequence reported (`DEC-105`)
- [ ] **`Enter` still advances from steps 1 and 4**, and still does nothing behind a confirm
      dialog — the two properties the fix must not cost
- [ ] **Every card on this page has a visible edge in dark mode**, not a shadow (`DEC-106`)
- [ ] **`.preset-grid` is declared once** — the duplicated block is gone and the step's spacing
      no longer depends on cascade order (`D-045`)

- [ ] Industry → Finish completes in **under 100 seconds** with a stopwatch. If over, cut a
      field, not a step
- [x] Pressing Continue four times from a preset produces a working org in ~8 seconds
- [x] Back and forward preserve every edit, including a rename made three steps earlier
- [x] Role levels renumber live on drag and are never typed — and on the keyboard/touch
      Move buttons, which is the path drag cannot serve
- [x] The "Sees…" text updates as rows are dragged
- [x] The lowest role cannot be deleted
- [x] Step 4's preview updates on keystroke, with no save
- [x] Plural override persists for "Staff / Staff"
- [x] Finish is one request; a forced failure leaves the org untouched
- [x] `Skip setup` produces a usable console with the Custom preset
- [x] Every noun on every step comes from the draft labels, including button labels (INV-001)
- [ ] Works at 390px; the tree is usable with touch
- [ ] Rehearsed end to end at least three times before 26 Aug

## Out of scope

| Not building | Why |
|---|---|
| The Tier-2 board editor | P3 (CONF-008). The wizard writes canonical objects the board will later edit |
| The powers grid | Step in its own right, `33`. Adding it here would blow the 90 seconds |
| Groups, delegation, dimensions | Configured later in the console, not during setup |
| Autosave per step | Deliberate: one atomic commit (§Data contract) |
| Importing people | Separate flow, `34` |
