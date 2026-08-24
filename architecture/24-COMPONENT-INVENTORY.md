# 24 — Component inventory

Phase: P2 · Milestone: M0 · Owns: `src/frontend/components/**`
Design ref: `design_specs/design/09-COMPONENTS-AND-PATTERNS.md` — **authoritative for anatomy**

Twenty-six components. **A page doc may not invent a component** — if a screen needs something
not listed here, that is a design decision and it gets added here first
(`design_specs/design/09` preamble).

This document owns the **prop contracts**. Visual anatomy — sizes, states, spacing, colour —
lives in the design spec and is not repeated (DEC-012).

---

## 1. From the base layer — use as-is

`.btn` `.tag` `.field` `.input` `.radio` `.dot` `.seg` `.card` `.elev-*` `.nav` `.table`
`.dialog` `.hr` — all from the vendored `organic.css` (`21` §2).

**Do not wrap a base class in a React component that adds nothing.** A `<Button>` that only
forwards props to `<button className="btn">` is indirection without benefit. Wrap only when
there is real behaviour: `<Toggle>` and `<ConfirmDialog>` qualify; a button does not.

### `<Icon>`
```ts
{ name: IconName; size?: 16 | 18 | 20 | 24; className?: string; label?: string }
```
The one exception to the rule above, and it earns it: `design_specs/design/01` §5 fixes both
the stroke weight and a **closed vocabulary** of concept → icon, and neither survives being
remembered eighteen times. `IconName` is that vocabulary as a union, so a concept without an
agreed icon does not compile.

Decorative by default (`aria-hidden`); pass `label` only when the icon is the *only* thing
carrying the meaning. Added by T-030 — the sidebar is the first consumer.

## 2. Layout

### `<AppShell>`
```ts
{ children: ReactNode }
```
Top bar + sidebar + content well. Console world only. Owns the mobile drawer and the org
switcher. Built **first**, before any page, and handed from track B to track C (`02` §6).

### `<Sidebar>`
```ts
{ items: NavItem[]; currentPath: string }
type NavItem = { to: string; label: string; icon: IconName;
                 group: 'organize'|'collect'|'understand'|'system';
                 disabled?: boolean; soonHint?: string;
                 needs?: Capability; minScope?: Scope };
```
P3 items render disabled with a "Soon" tag and a hover hint. **They never navigate and have
no page behind them** (`20` §2).

`needs` hides an item the caller does not hold. **`minScope` says how far that hold must
reach** (`DEC-051`, default `self`) — a nav item promises a *page* is worth opening, which is
a stronger claim than *"you hold this verb somewhere"*. People carries `person.read` at
`own_unit`, because `person.read: self` is seeded to every role and the bare verb showed the
item to every account in the product (`D-027`).

**A minimum scope is not always the right tool, and Settings is the case to remember.**
`org.read` is `all` at every level, seeded so the vocabulary loads on first paint, so no
minimum could hide it — the item was gated on the wrong capability and now needs `org.update`.
When an item shows for someone it should not, check *which* capability before reaching for a
scope.

Usability, never enforcement (INV-003): every route behind these is guarded server-side, and
the lists already scope-filter. Removing every gate here exposes nothing.

### `<TopBar>`
```ts
{ orgs: OrgSummary[]; currentOrgId: string; onSwitchOrg: (id: string) => void; user: SessionUser }
```
The org switcher is the second most important control in the demo after the QR code — it is
how you go from University to Hotel in one click. It stays in the top bar on mobile.

### `<PageHeader>`
```ts
{ title: string; subtitle?: string; vocabulary?: boolean;
  filters?: FilterChip[]; scope?: ScopeChip; action?: ReactNode }
```
**Every console page opens with this.** It is what makes differently-shaped screens feel like
one product. `scope` renders the unit-scope chip: a dropdown for a top-level role, a plain
non-interactive tag for a constrained one — so the constraint is legible rather than
mysterious (`design_specs/design/02` §5).

### `<VocabularyChips>`
```ts
{}   // reads useLabels() directly
```
The signature element (`22` §4). No props by design — a prop would let a page pass the wrong
labels, and there is only ever one correct source.

## 3. Data display

### `<StatCard>`
```ts
{ kicker: string; value: string | number; delta?: { value: number; valence: Valence };
  context?: string; breakdown?: BarRowProps[] }
```
Built at T-034 for the subject detail, ahead of its track — `35` needs it and one component
built early beats two built in parallel. `Valence` is the shared `results.ts` enum
(`positive | neutral | negative`), not a fourth spelling of the same idea.

### `<BarRow>` — the workhorse
```ts
{ label: string; value: number; total: number;
  tone?: 'accent' | 'good' | 'neutral' | 'bad'; showPercent?: boolean }
```
Built at T-034. Used in stat breakdowns, results distributions, per-subject shares, theme
scores — and the subject detail's per-cycle response counts, which is what a trend looks like
before there is a chart. Never colour alone (`21` §8): the number renders beside the bar.
Default tone is `accent` — single colour. **Valence tones only when the meaning is genuinely
valenced**; do not rainbow a single question's options.

`showPercent` was added at T-040 for the results distribution, which
`design_specs/design/08` §8.1 draws as `count` *and* `percent` in separate columns. It is
off by default because a stat breakdown of four items does not need two numbers per row.
The percentage is derived here from `value / total` rather than taken as a prop, so the bar's
width and the number beside it can never disagree — even though `ResultsView` also carries a
`percent` the server computed.

### `<StackedBar>`
```ts
{ good: number; neutral: number; bad: number; showLegend?: boolean }
```
Always paired with a legend or numbers — never colour alone (`21` §8). Built at T-040, and
**NPS is its only caller in P1–P2**: it is the one place a three-colour split is a definition
rather than a judgement, because the instrument itself names promoters and detractors
(`CONF-004`). Using it anywhere else on `40` would be the interpretation that page refuses.

### `<ScoreBadge>` — **built at T-080, and deliberately colourless**
```ts
{ score: number; max?: number }
```
One score, one neutral surface, at every value.

**`CONF-016` refused to build this and was right about `40`.** That page's number is an
*average*, `40` § Interactions forbids colouring one, and it was the only would-be caller — a
component whose single use is the place the docs rule out is one that eventually acquires an
illegitimate use.

`58` changed the premise. The number on an inbox card is **one person's own rating on the
response their comment came from** — *"2/5 · the projector in Room 4 has never worked"* is a
fact somebody stated, and reporting it is not judging it. So the two halves of `CONF-016`
came apart: the **badge** had no caller and now has one; the **threshold colours** were the
interpretation and are not built, at any value. `CONF-022`.

The prohibition now lives inside the component rather than in a doc nobody reads before
importing it, which is a stronger place for it than "not built" ever was — the next page
that wants a score gets the safe one instead of writing its own. Its test asserts the
`className` is exactly `score-badge`, so a well-meant `.is-bad` is a failing test rather than
a code review nobody runs.

`40` still renders its average as plain display type (`CONF-016`, `design_specs/design/08`
§8.1) and does not use this. A *judged* score against a rubric remains `43`'s, and a
different component.

### `<TrendChip>` — **not built in P1-P2**
```ts
{ delta: number; suffix?: string }
```
**The arrow is mandatory**, not decorative — it is the non-colour cue that keeps trend
readable for colour-blind users and in print.

Its only P2 caller was `46` § Components, and `46` § Out of scope rules trends off that page
(*"that is `43`, and it is P3"*) while its payload carries nothing to compare "today"
against. Resolved as `CONF-017` at T-041; the remaining caller is `43`, which is P3. Second
component after `<ScoreBadge>` to be listed by a page that forbids what it does — both were
catalogued from `43`'s needs and then borrowed by a P2 page that only looked like it needed
one.

### `<ResponsiveTable>`
```ts
{ columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string;
  onRowClick?: (r: T) => void; empty: ReactNode; caption?: string }
type Column<T> = { key: string; header: string; render: (r: T) => ReactNode;
                   primary?: boolean; hideBelow?: 'sm' | 'md' };
```
Collapses to stacked cards below 640px; the `primary` column becomes the card title. **Build
it once** — there are four tables in the app, and doing the collapse four times is exactly
where the mobile experience rots (`design_specs/design/09` §3.1).

Built at T-034, first used by `/app/subjects`. **One DOM in both shapes**, not two: the cards
are the same `<table>` with each cell carrying `data-label`, because a second markup tree for
small screens is how the two versions start disagreeing about which columns exist. `caption`
(added T-034) names the table for a screen reader — sighted readers have the page header, and
a `<table>` with no accessible name is one a screen reader announces as nothing at all.

## 4. Organisation

### `<UnitTree>`
```ts
{ nodes: UnitTreeNode[]; selectedId?: string; mode: 'browse' | 'edit' | 'select';
  addLabel?: string; subjectWord?: string; focusId?: string;
  request?: { id: string; action: 'rename' | 'move'; nonce: number };
  rowMessage?: { id: string; text: string };
  onSelect?: (id: string) => void; onRename?: (id: string, name: string) => void;
  onCancelEdit?: (id: string) => void;
  onAddChild?: (parentId: string) => void; onDelete?: (id: string) => void;
  onReparent?: (id: string, newParentId: string) => void }

type UnitTreeNode = { id: string; name: string; children: UnitTreeNode[];
                      peopleCount?: number; subjectCount?: number; isTemporary?: boolean;
                      endsAt?: string | null; placeholder?: string }
```

**Built at T-032, not T-033** (`_MEMORY.md` `N-025`) — wizard step 3 needed it first, and
there is only ever one. `UnitTreeNode` asks for the least it needs rather than the API's
`UnitNode`, so the wizard's draft satisfies it without inventing counts that do not exist
yet, and `UnitNode` satisfies it without adaptation.

`addLabel` carries the vocabulary in from the caller ("Add a Department" / "Add a Property")
— the component must not reach for `useLabels()` itself, because the wizard's draft is not
the saved org's. `subjectWord` does the same for row counts, and its absence hides them
rather than inventing "Subjects". `focusId` is what makes `+` then type a two-click beat.

**The five props T-033 added are all optional**, which is why extending beat forking:
`subjectWord`, `endsAt` and `placeholder` on the node, `rowMessage` (a server refusal shown
under its own row, never a dialog), `onCancelEdit` (Escape or an empty blur — the structure
page drops the placeholder row `+` created), and `request`, which is how a control OUTSIDE
the tree — the detail panel's Rename and Move — reaches a row. `request` carries a `nonce`
because asking twice for the same row is a real thing a reader does, and an unchanged
`{id, action}` would be a no-op the second time.

Re-parenting has **two paths**: HTML5 drag, and a Move control that works by click and by
keyboard. Not a nicety — drag does not exist on touch, and `31` § Acceptance requires the
tree to be usable there.
Recursive. **One component, three placements** — wizard step 3, `/app/structure`, and the
campaign audience picker. Do not fork it (INV-009). The `mode` prop is what makes one
component serve all three; a second implementation is how the three drift apart.

Assign it to one person. It is the component most likely to be rewritten three times.

### `<RoleRow>`
```ts
{ name: string; level: number; total: number; autoFocus?: boolean;
  peopleCount?: number; grantCount?: number; editable?: boolean; busy?: boolean;
  onRename: (name: string) => void; onDelete: (() => void) | undefined;
  onMove?: (direction: -1 | 1) => void }

export function seesText(level: number, total: number): string
```
**Extended at T-052, not forked (INV-009).** `/app/roles` is the second placement — same
rung, same generated "Sees…" line, same undeletable bottom row. It adds four **optional**
props and the wizard passes none of them: the two counts (the wizard is creating roles nobody
holds yet), `editable` because `33` § States requires the tab to render read-only rather than
absent without `role.update`, and `busy` so a reorder in flight cannot queue a second one.

**Its CSS was already written and stayed written.** `endur.css` § "step 2 · roles" owns
`.role-row`, `.role-level`, `.role-sees`, `.role-grip` and `.role-move`. `T-052` added only
`.role-counts` and `.role-name-static`; re-declaring the shared selectors would have won the
cascade and quietly restyled wizard step 2. **A component shared by two screens has its CSS
shared too, or INV-009 is true of the markup and false of the appearance.**
**Level is derived from row order, never entered.** The "Sees…" description is generated from
the level, not stored — `seesText` is exported so `33`'s grid states the rule the same way.

Amended at T-032 from `{ role: Role; …; dragHandleProps? }`: the row cannot compute its own
level (only the list knows the order), and `onDelete: undefined` is how the bottom row is
made undeletable — a disabled state the type system hands you rather than a flag to
remember. `onMove` is the keyboard and touch path; the list that owns order handles drag.

### `<PersonChip>`
```ts
{ person: PersonSummary; showRole?: boolean }
```
Role level is always visible as `Role · L{n}`. It makes the hierarchy inspectable during
questioning, which is exactly when it gets probed (`design_specs/design/02` §5).

### `<PowersByPlace>`  ·  **BUILT 2026-08-24 (`T-051`)**
```ts
{ places: PowersAtPlace[]; emptyHint: string;
  onWhy?: (capability: string, unitId: string) => void }
```
**One block, two placements** — `/app/profile` (`47`) and `/app/people/:id` (`34`). Both docs
independently specify the same thing in the same words: powers grouped by unit, produced by
the resolver, proving that the same person has different powers in different places. It is
the INV-009 rule again — the second placement extends, it does not fork.

It renders the places it is given and then, always, a closing line for everywhere else. That
line is the component's, not the API's: `47` § Interactions writes it as a third row
(*"Anywhere else — nothing"*) and it is not a row, because inventing a null-unit entry would
put a place in the data that the organisation does not have. `emptyHint` is that sentence,
because the two screens say it about different people — *"You hold nothing anywhere else"* is
not what an administrator reading somebody else's record needs to see.

**It prints the capability KEY, not an English label**, and that is what both page docs
already specify — `47` § Interactions and `34` § Interactions both draw the block with
`campaign.launch · results.read · person.read` in it. It is also the better answer here:
`roles/service.ts`'s `describe()` renders `results.read` as *"read resultses"*, which is
`D-008` in one line, and a person trying to match what they see to an error message or a doc
needs the key. Grouped by `CAPABILITY_CATALOGUE[key].module` from `packages/shared`, which is
where the grouping already lives — so the component reads the catalogue and fetches nothing.

**The scope is rendered, never hidden.** `person.read · self` and `person.read · subtree` are
different answers to the only question this block exists to answer, and `T-086` is the whole
argument for why the verb alone is not enough. A person asking *"why can I not see the other
department's results?"* is answered by the scope, not by the verb.

`onWhy` is the `Why?` link `47` § Interactions specifies — it opens `42` pre-filled. Optional,
because `42` is `T-054` and a link to a `<Placeholder>` is what `design_specs/design/02` §7
forbids; the prop exists so that task is a wiring change rather than a redesign.

### `<PowersGrid>`
```ts
{ grid: GridController; editable: boolean; myRoleIds: string[] }
```
The most complex component in the product. Full interaction spec in
`33-PAGE-roles-and-powers-grid.md`. Colour intensity tracks scope width, so an over-granted
role is a visibly dark column and an orphan capability is a visibly empty row — mistakes are
*visible* rather than discoverable.

**Amended at T-052 from the controlled shape** `{ capabilities, roles, grants, onChange,
warnings }`. The catalogue is authoritative and additions go here first, so the divergence is
recorded rather than left to be discovered: the working copy, the undo stack and the **last
saved matrix** have to live together, because the save sends a *diff* and a diff needs both
sides. A controlled `onChange(next: GrantCell[])` would push all three into the page, and
every page placing this grid would have to reimplement them identically. `usePowersGrid()` in
`lib/roles.ts` holds them; the component renders them.

`myRoleIds` is the reader's own roles, for the self-lockout prompt — the half of `33`'s
lockout guard the server cannot do, because only the client knows which column is the
reader's. It is why `Position` gained `roleId`: matching by role **name** is `N-057` exactly,
before the one save in the product that has no undo.

### `<WordsEditor>`
```ts
{ labels: ResolvedLabels; overrides: LabelKey[];
  onSetOne: (key: LabelKey, one: string) => void;
  onSetMany: (key: LabelKey, many: string) => void;
  onResetPlural: (key: LabelKey) => void; readOnly?: boolean }
```
The five vocabulary fields and the live preview, extracted from wizard step 4 at T-046 so
`41` could have it too. `41` § Interactions requires *the same five fields and the same live
preview as wizard step 4, so the pattern is learned once and there is one implementation* —
which is only true if there is one component. Same rule as `<UnitTree>` (INV-009): the second
placement extends, it does not fork.

Like `<UnitTree>`, it never calls `useLabels()` itself. The wizard edits an unsaved draft and
the settings page edits the saved org, and a component that reached for the store would
render the wrong one of the two. The caller owns the state; this renders it and reports edits.

`readOnly` covers `org.read` without `org.update`: the words render, the controls do not.
Read-only rather than absent, because the vocabulary is what every other screen is speaking
and hiding it would hide the explanation.

The preview is a scaled, `pointer-events: none` render of the real sidebar shape rather than
a picture of it — a separately-maintained preview eventually lies about what saving will do.

## 5. Form engine

### `<QuestionCard>`
```ts
{ question: Question; index: number; expanded: boolean; onExpand: () => void;
  onChange: (q: Question) => void; onDuplicate: () => void; onDelete: () => void;
  readOnly?: boolean }
```
Exactly one is expanded at a time, controlled at the parent's level. Built at T-036 with the
editors it hosts — they have no other home, and the type select that drives them lives here.

Two props beyond the original contract, both recorded here first. `index` gives a card whose
text is still empty an accessible name (*"Question 3"*); without it a blank new question is
unreachable by name, for a reader and for a test. `readOnly` is the launched-campaign case
(`37` § States) — the banner is the builder's, this is the half that stops the controls.

T-037 added `onMove?: (direction: -1 | 1) => void`, and it is the same rule `<UnitTree>` and
`<RoleRow>` already follow: **HTML5 drag does not exist on touch at all**, and `37`
§ Acceptance requires the builder to be usable at 390px. The grip stays draggable; the two
buttons beside it do the same job by click and by keyboard, calling the same handler.

The card **holds a pending type change**: a change that would drop options renders its cost
inline with `Keep it as it is` / `Change anyway`, and calls `onChange` only when accepted.
Warning after the fact is not a warning.

### `<QuestionEditor>` × 6
```ts
{ question: Question; onChange: (q: Question) => void; readOnly?: boolean }
```
`RatingEditor` `SingleChoiceEditor` `MultiChoiceEditor` `TextEditor` `YesNoEditor`
`NpsEditor`. Built at T-036.

**One file, not six.** The original reason for six was two people taking three each; that did
not happen, and the real risk turned out to be the opposite one — these six drifting from the
six INPUTS they author. `QuestionEditor.tsx` mirrors `QuestionInput.tsx` line for line (one
dispatcher on `config.kind`, six named renderers under it), and one pair of parallel files is
far easier to keep in step than twelve.

`question` is the **draft** shape — `packages/shared`'s `QuestionInput` DTO, re-exported as
`QuestionDraft` — not the API's question row. `position` is derived from array order on save
(`37`) and `id` is absent until the first save, so a card holding an API row would be holding
two fields it must not send.

`YesNoEditor` has nothing to configure and renders "No settings for this type." rather than an
empty body. `NpsEditor` has nothing to configure either, and says **what is fixed and why**
rather than repeating that line: 0–10 with those two anchors is what makes a score comparable
to anybody else's, and pointing at the rating scale is the answer to the question the reader
is about to ask.

The type-change rules are `components/form/kinds.ts` — a pure module with `KIND_LABELS`,
`KIND_GROUPS`, `defaultConfig()` and `changeKind()`. The kind map is exhaustive with no
default branch, so a seventh kind fails to compile rather than falling through (DEC-010).

### `<QuestionInput>` × 6
```ts
{ question: Question; value?: AnswerValue; onChange: (v: AnswerValue) => void;
  error?: string; readOnly?: boolean }
```
**These are the components the builder preview also uses.** One implementation, parameterised
by `readOnly`, never two (INV-008). Two implementations means the preview eventually lies
about what respondents see, and the first time you find out is on stage.

**Built at T-035, not T-036.** `36` § Components requires the template preview to render
through these, and INV-008 forbids a second set — so the library's preview is the call site
that forced them into existence. `55-BUILD-ORDER` pairs them with the six editors because
both are "the form engine"; the editors have no earlier caller and stay at T-036, which is
now editors-only. Same shape as `N-025`. See `N-031`.

`<QuestionInput>` is the exported dispatcher — one component, switching on `question.kind` —
with the six renderers beside it as named exports. Two internals are shared on purpose:
`<Scale>` under rating and NPS, `<Choices>` under single and multi, because
`design_specs/design/05` §5.3 defines each of those pairs as *the same control with one
difference*, and writing them twice is how the difference silently becomes three.

### `<FormPreview>`
```ts
{ title: string; description?: string | null; questions: Question[];
  width?: 'phone' | 'tablet' | 'desktop'; onWidth?: (w) => void; respondentWord: string }
```
The respondent view, framed. Added at T-037 and not in the original inventory, for a reason
that is the same one INV-008 exists for: **two screens preview a form** — the template library
(`36`) and the builder (`37` §5.4) — and they must show the identical thing. T-035 wrote the
first one inline on the template page; T-037 lifted it here and rewired that page to it rather
than writing a second, which would have made "exactly as respondents will see it" true on one
screen and approximate on the other.

It owns the three width frames (390 / 720 / unbounded), the *"Preview — nothing is saved"*
banner, and the disabled Submit. It renders questions **only** through `<QuestionInput>`.

### `<Toggle>`
```ts
{ checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }
```
`label` is required — an unlabelled toggle is inaccessible.

## 6. Feedback and flow

### `<ProgressRail>`
```ts
{ steps: { key: string; label: string }[]; current: number; onStepClick?: (i: number) => void }
```
Completed steps are clickable; future ones are not.

### `<ShareSheet>`
```ts
{ url: string; campaignName: string; status: CampaignStatus;
  endsAt?: string | null; anonymous?: boolean;
  access?: CampaignAccess;                    // 'public' | 'organization' — DEC-037
  onClose: () => void }
```
QR canvas, short URL, three actions, presentation mode. Built at T-038.

**Highest-risk component in the build. Write it on 22 Aug, not 26 Aug** (`_MEMORY.md` N-004).
The QR renders locally on canvas — no external image service, which would fail exactly when
the network does. `url` comes from `PUBLIC_BASE_URL`; if it says `localhost` the code does not
scan from a phone (OPEN-002).

Three props beyond the original contract, all in service of the footer line the design draws
(`design_specs/design/06` §6.3): *"Open until 26 Aug, 23:59 · anonymous"*. `status` also
decides whether the sheet says the campaign is collecting or has closed — a sheet that says
"is collecting" over a closed campaign is worse than no sheet.

**It warns when the URL will not scan.** `PUBLIC_BASE_URL` defaulting to `localhost` is the
single failure that ends the demo, so the sheet checks its own URL and says so in place
rather than leaving it to a checklist. That is `OPEN-002`'s operational half made visible; the
value itself is still the team's to set.

`access` (added with DEC-037) changes one line of the footer and nothing else about the
sheet: an `organization` campaign says *"Only people in {org} can answer — they'll be asked
to sign in"*. Somebody scanning a restricted code and hitting a sign-in wall with no warning
is a support ticket, and the person handing the link out is the one who can prevent it.

### `<FileUpload>`
```ts
{ current: string | null;            // the stored image, as a url
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  shape: 'circle' | 'square';        // avatar | logo
  label: string; hint?: string;      // label REQUIRED — see <Toggle>, same reasoning
  maxBytes?: number; disabled?: boolean }
```
**Built T-062.** Org logo (`41`) and user avatar (`47`). Full spec, including the validation
rules that make an upload endpoint safe, in `48-FEATURE-file-upload.md`.

A real `<input type="file">` underneath — the drop zone is an enhancement, never the only
path, or the control is unusable by keyboard.

Client-side type and size checks mirror the server's and **never replace them** (`14` §7).
They exist so a 4 MB photo fails instantly rather than after a 4 MB round trip, and the
message names both numbers: *"That file is 4.2 MB. The limit is 2 MB."*

### `<EmptyState>`
```ts
{ icon: IconName; title: string; body: string; action?: ReactNode }
```
Never an illustration, never more than one action. Copy from `design_specs/design/10` §3.
Built at T-033, first used by `/app/structure`.

### `<Toast>`
```ts
{ message: string; undo?: () => void }
```
**Success only. Errors never use a toast** — they appear where the problem is
(`design_specs/design/10` §4).

Built at T-035. It self-dismisses and is `role="status"`, never `alert` — an alert
interrupts a screen reader mid-sentence to say something went *right*. `undo` is rendered
when given and is **not** used by the template library: undoing a delete needs a restore
endpoint, and offering an undo that cannot undo is worse than not offering one.

### `<ConfirmDialog>`
```ts
{ title: string; consequence: string; verb: string; destructive?: boolean;
  confirmDisabled?: boolean; onConfirm: () => void; onCancel: () => void }
```

`confirmDisabled` (T-033) exists because `32` requires that confirming a destructive action
whose consequence is **unknown** be impossible, not merely discouraged: the delete dialog
opens while `GET /units/:id/impact` is still in flight. While it is disabled the dialog
focuses Cancel instead — `focus()` on a disabled button is a no-op, and a modal that opens
with focus behind it traps nobody.
`consequence` is required and must state **real numbers**. Never "Are you sure?" — always
"Deleting Computer Science moves 64 people to School of Engineering."

This is a prop contract enforcing a copy rule, which is deliberate: the type system is the
only thing that reliably stops "Are you sure?" from reappearing.

## 6b. Billing and platform

Five components added 2026-08-23 with `49`, `70` and `71`. Four are customer-facing or
shared; `<GrowthChart>` and `<MessageComposer>` are internal-only.

### `<PlanPicker>`  ·  **BUILT 2026-08-24 (`T-088`)**
```ts
{ plans: readonly PlanOption[];
  current: Tier | null;                          // null = nothing chosen yet (sign-up)
  onSelect: (tier: Tier) => void;
  mode: 'signup' | 'join' | 'override';          // founder picking | customer | operator
  busyTier?: Tier | null;                        // the one being joined right now
  disabled?: boolean }
```
**One component, THREE worlds** — a founder choosing at sign-up (`30`, `DEC-048`), a customer
joining a plan in `49`, an operator overriding one in `70`. Same information, three verbs, and
`mode` is what changes the copy and the confirmation. Three implementations would drift within
a month; this is INV-008's argument applied to a third caller.

**`signup` is the mode that differs, and it differs in the CONTROL rather than the copy.** On
`/start` there is no organisation yet, so there is nothing to change and nothing to confirm —
the tier is a field on the registration the page is about to POST. Cards are therefore radios
and the page's own submit button commits them. In `join` and `override` the organisation
already exists and each card carries its own action, because the click **is** the write.

**`current: Tier | null` and `null` is a real state** — `DEC-048` pre-selects nothing at
sign-up. A pre-selected card is the product choosing and then attributing the choice to the
customer, which is how `D-012` looked from the inside for a month.

**`PlanOption` carries no price** — DEC-035 removed pricing from the product, so every tier
renders the same **Join** action. It also carries no `includes[]`: the entitlement map stays on
the server. `/start` has no session and could not fetch `GET /billing/plans` (it is behind
`billing.read`), and shipping `TIER_ENTITLEMENTS` to the browser would invite a second
implementation of the `402` decision — which INV-003's whole posture forbids. What the client
gets is the tier VOCABULARY (`packages/shared/src/tiers.ts`, `PLAN_OPTIONS`: name, what it
sells, what it adds); what the server keeps is the decision.

**Enterprise renders and cannot be pressed** (`selectable: false`). `16` §4 prices it
individually, so it is a sales conversation rather than a button — but hiding it would make an
operator setting it later look like a bug rather than a sale.

### `<OverLimitBanner>`
```ts
{ over: number; limit: number; noun: string; onUpgrade: () => void }
```
Persistent, rendered by `<AppShell>` so it appears on **every** console page rather than only
on billing — `16` §6 requires a customer over their seat count to see the exact number
everywhere, not to discover it when they next visit settings.

`noun` comes from `useLabels()`: a hotel is over on *properties*, not on "subjects" (INV-001).

### `<OrgRow>`
```ts
{ org: PlatformOrgSummary;
  onOpen: (id: string) => void;
  chips?: ('quiet' | 'overSeats')[] }
```
One organisation in `70`'s estate list. **`PlatformOrgSummary` carries counts only** — the
prop type is where INV-011 is enforced for this component, since a row that cannot receive
response content cannot render it.

### `<MessageComposer>`
```ts
{ recipients: { name: string; email: string }[];   // resolved SERVER-side
  onSend: (subject: string, body: string) => Promise<void>;
  sending?: boolean }
```
`70`'s contact-the-administrators action. **`recipients` is display-only and the send call
carries no address** — the server resolves who holds `org.update` and mails them. An operator
typing an address is an operator who can typo a customer's plan details to a stranger.

### `<GrowthChart>`
```ts
{ series: { period: string; byTier: Record<Tier, number> }[];
  granularity: 'month' | 'quarter' }
```
`71` only. Organisations over time, split by tier. **Renamed from `<RevenueChart>` on
2026-08-23 with DEC-035** — the shape is the same series-over-periods chart, with counts
instead of amounts and no currency prop, because there is no currency.

Uses the same chart primitives as `<StackedBar>` and `<BarRow>`; it is a third placement of
that machinery, not a second charting approach.

## 6c. Trust, accounts and diagnostics

Four components added 2026-08-23 with `56`, `57`, `58` and `72`. `<LogViewer>` is
internal-only; the other three are customer-facing.

### `<DecisionTrace>`
```ts
{ decision: Decision; compact?: boolean }
```
Renders a resolver `Decision` (`11` § The decision trace) as readable prose: what was asked,
what answered, and — when `compact` is false — the `considered` list with each grant's
`rejectedBecause`.

**Two placements, one implementation, and that is the whole reason it is an inventory entry.**
`42`'s simulator and `56`'s activity log are the same question asked at different times —
*would this be allowed* and *why was this allowed* — and a forked renderer would eventually
have them describe the same trace two different ways, which is precisely the credibility the
trace exists to buy (`53`).

`compact` is the row-level form used in the activity log's table; expanding a row swaps it for
the full one. **`considered` is absent from a production 403 body** (`11` §10) so the compact
form must render correctly without it, not merely tolerate it.

### `<InviteLink>`
```ts
{ url: string; expiresAt: string;
  onRegenerate?: (() => Promise<void>) | undefined; label: string }
```
A one-time credential shown once: the URL in a read-only field, a copy button that confirms in
place, the expiry in words, and an unmissable statement that it will not be shown again.

Used by `57` for account activation and reserved for `45`'s API keys, which have the identical
shape-and-shown-once problem. **No `onDismiss` that hides it silently** — the dialog closes
only through an explicit action, because a credential the administrator never copied is a
person who cannot sign in and a support call nobody can answer without regenerating.

`onRegenerate` is optional and absent where re-issuing is a separate audited capability
(`account.reset`); when absent the component shows no regenerate affordance rather than a
disabled one.

### `<ResponseCard>` — built at T-080
```ts
{ response: InboxResponse; read: boolean; archived: boolean;
  expanded: boolean; onToggleExpand: () => void;
  onToggleRead: () => void; onArchive: () => void; subjectWord: string;
  selected?: boolean; error?: string | undefined }
```
**Four props more than this was catalogued with, and each is the page refusing to own state
the card renders.** `expanded`/`onToggleExpand` because expanding is what marks a card read
(`58` § State) and only the page knows which one card is open; `selected` because `j`/`k`
move a cursor through the list; `error` because an optimistic mark that fails must say so
**on the card** and never in a toast (`58` § States). All three of the new booleans are
presentation — the component still holds no state and still fetches nothing.
One free-text response in the inbox (`58`), following `design_specs/design/08` §8.3: score
badge, the comment, the subject tag, and the read/unread state.

**The analysis tags that mockup draws — sentiment, emotion, intent, topic — are not props
here.** They need the Analyze layer, and a component with four props nothing can fill is a
component that invites a stub. They arrive with `43` or not at all.

`subjectWord` rather than a hardcoded noun (INV-001), passed in rather than read from
`useLabels()` inside, matching `<UnitTree>`'s `subjectWord` for the same reason: a presentation
component that reaches for a context is one that cannot be rendered in a test or a preview.

### `<LogViewer>`
```ts
{ files: LogFileMeta[]; selected: string; lines: LogLine[];
  filter: LogFilter; onSelect: (file: string) => void;
  onFilter: (f: LogFilter) => void; loading?: boolean }
```
`72` only, and internal like `<GrowthChart>`. A file picker, a level/status/path filter, and a
monospace pane of parsed JSON lines with the `requestId` clickable to filter to that one
request — which is `18` §6's workflow made into a screen instead of a `grep` you have to
remember.

**It renders parsed fields into columns, never a raw blob.** A viewer that prints whatever is
in the file would render a line that should never have been written as though it were fine;
one that maps known fields makes an unexpected key visible as an unexpected key.

## 7. Patterns

**Inline rename** — a real component since T-032: `<InlineName>` in `components/org/`.
Props: `{ value; onCommit; onCancel?; ariaLabel; autoFocus?; placeholder? }`, where
`onCancel` (T-033) fires on Escape or a blur with the field empty.
Name fields in the tree, role rows and subject cards look like plain text until hovered or
focused. `Enter` commits, `Esc` reverts, blur commits, and an emptied field reverts rather
than erroring — an empty name is a slip, not an instruction. **This is why the live demo is
fast**: renaming three roles must not open three dialogs. It is shared rather than repeated
because Esc-reverts is the part everyone gets subtly wrong, and it is invisible until
somebody uses it on stage.

**Live preview.** Wizard step 4 and settings render a scaled-down, `pointer-events: none`
mini-UI updating on keystroke. It is what turns "customizable" from a claim into something
visible.

**Derived, not entered.** Role level from row order. Completion time from question types.
Audience size from the org graph. "Sees…" from the level. Every one could have been a field;
making them derived is what keeps setup at ninety seconds.

**Scoped lists.** Every list of people, subjects or units is filtered by the API before
render. **Never filter in the component** (INV-003) — the API returns only what the caller
may see, and the UI trusts it.

**`<AccessNotice>` — say what the promise is, on the screen where it is made.** A one-line
notice above the submit button of every respondent form, generated from the campaign's
`anonymous` and `access` pair (DEC-037). Four combinations, **three sentences and one
deliberate silence**, and it is a *pattern* rather than an inventory entry because it is one
function returning one string, lives beside `39`'s `copy.ts`, and must not import anything
the respondent bundle does not already carry (`20` §8, `N-040`).

**"Four sentences" is what this line said until `T-070` built it, and the fourth is not
writable.** The silent pair is `!anonymous` on an open link: no source gives copy for it, and
both things the page could invent are wrong — a promise it cannot keep, or a warning about a
linkage the schema does not make. `copy.ts`'s `anonymityLine` had already reached the same
conclusion on the `anonymous` half alone; `access` did not change it. The silence is asserted
by a test rather than left as an absence, so an omission stays distinguishable from a
decision.

It is listed here because getting it wrong is a privacy failure rather than a copy failure:
an `organization` campaign checks who you are at the door, and a respondent who is not told
that has been misled about the one thing `52` promises them.

## 8. Ownership

| Track | Builds |
|---|---|
| **B — Console** | AppShell, Sidebar, TopBar, PageHeader, VocabularyChips, UnitTree, WordsEditor, RoleRow, PersonChip, PowersByPlace, PowersGrid, ResponsiveTable |
| **C — Collection** | QuestionCard, 6 editors, 6 inputs, Toggle, ShareSheet, ProgressRail, StatCard, BarRow, StackedBar, ScoreBadge, TrendChip, FileUpload |

`<ScoreBadge>` left lane C's *unbuilt* column at T-080 (`CONF-022`); `<TrendChip>` has not,
and its entry above still holds.
| **Shared** | EmptyState, Toast, ConfirmDialog, DecisionTrace, InviteLink — whoever needs one first, then announced |

Track B ships AppShell and PageHeader before starting the wizard, or track C is blocked or
builds a second shell.

## 9. Acceptance

- [~] Thirty-one components exist with the documented prop types — twenty-six through
      2026-08-23 morning, plus the `<AccessNotice>` pattern in §7 (`T-070`). `<DecisionTrace>`,
      `<InviteLink>`, `<ResponseCard>` and `<LogViewer>` are still unbuilt
- [ ] No page defines a component that belongs in this list
- [ ] `<UnitTree>` has exactly one implementation, used in three places
- [ ] `<WordsEditor>` has exactly one implementation, used by wizard step 4 and by `41`
- [x] `<QuestionInput>` is shared by the preview and the live respondent form (INV-008) —
      closed at T-039, and asserted by an import-graph walk (`pages/respond/bundle.test.ts`)
      rather than by reading the imports
- [ ] `<ConfirmDialog>` cannot be rendered without a `consequence` — it is a required prop
- [ ] `<TrendChip>` always renders an arrow
- [ ] `<DecisionTrace>` has exactly one implementation, used by `42` and `56`
- [ ] `<DecisionTrace compact>` renders correctly when `considered` is absent
- [ ] `<ResponseCard>` has no prop that requires the Analyze layer
- [ ] `<InviteLink>` cannot be dismissed without an explicit action
- [ ] `<ResponsiveTable>` collapses correctly for all four tables at 390px
- [ ] No component filters data for permission reasons
- [ ] Every component is keyboard operable with a visible focus ring

## 10. Out of scope

| Not building | Why |
|---|---|
| A generic `<Form>` abstraction | Four forms, all different. A generic one would fit none |
| A charting library | The three data components cover every visual in scope. Recharts for the P3 analysis dashboard only |
| Drag-and-drop beyond tree reparent and question reorder | Two uses, both specified. A third would be scope creep |
| Virtualised lists | Lists are scoped and paginated |
| A component that wraps a base class without adding behaviour | Indirection with no benefit (§1) |
