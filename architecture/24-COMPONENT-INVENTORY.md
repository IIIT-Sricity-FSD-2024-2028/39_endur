# 24 — Component inventory

Phase: P2 · Milestone: M0 · Owns: `src/frontend/components/**`
Design ref: `design_specs/design/09-COMPONENTS-AND-PATTERNS.md` — **authoritative for anatomy**

Twenty-one components. **A page doc may not invent a component** — if a screen needs something
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
                 disabled?: boolean; soonHint?: string };
```
P3 items render disabled with a "Soon" tag and a hover hint. **They never navigate and have
no page behind them** (`20` §2).

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

### `<BarRow>` — the workhorse
```ts
{ label: string; value: number; total: number;
  tone?: 'accent' | 'good' | 'neutral' | 'bad' }
```
Used in stat breakdowns, results distributions, per-subject shares, theme scores. Default
tone is `accent` — single colour. **Valence tones only when the meaning is genuinely
valenced**; do not rainbow a single question's options.

### `<StackedBar>`
```ts
{ good: number; neutral: number; bad: number; showLegend?: boolean }
```
Always paired with a legend or numbers — never colour alone (`21` §8).

### `<ScoreBadge>`
```ts
{ score: number; max?: number }   // threshold colours from design_specs/design/01 §2b
```

### `<TrendChip>`
```ts
{ delta: number; suffix?: string }
```
**The arrow is mandatory**, not decorative — it is the non-colour cue that keeps trend
readable for colour-blind users and in print.

### `<ResponsiveTable>`
```ts
{ columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string;
  onRowClick?: (r: T) => void; empty: ReactNode }
type Column<T> = { key: string; header: string; render: (r: T) => ReactNode;
                   primary?: boolean; hideBelow?: 'sm' | 'md' };
```
Collapses to stacked cards below 640px; the `primary` column becomes the card title. **Build
it once** — there are four tables in the app, and doing the collapse four times is exactly
where the mobile experience rots (`design_specs/design/09` §3.1).

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
  onRename: (name: string) => void; onDelete: (() => void) | undefined;
  onMove?: (direction: -1 | 1) => void }

export function seesText(level: number, total: number): string
```
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

### `<PowersGrid>`
```ts
{ capabilities: CapabilityMeta[]; roles: Role[]; grants: GrantCell[];
  onChange: (next: GrantCell[]) => void; warnings: GrantWarning[] }
type GrantCell = { roleId: string; capability: string;
                   scope: GrantScope | null; effect: GrantEffect; params?: Params };
```
The most complex component in the product. Full interaction spec in
`33-PAGE-roles-and-powers-grid.md`. Colour intensity tracks scope width, so an over-granted
role is a visibly dark column and an orphan capability is a visibly empty row — mistakes are
*visible* rather than discoverable.

## 5. Form engine

### `<QuestionCard>`
```ts
{ question: Question; expanded: boolean; onExpand: () => void;
  onChange: (q: Question) => void; onDuplicate: () => void; onDelete: () => void }
```
Exactly one is expanded at a time, controlled at the parent's level.

### `<QuestionEditor>` × 6
```ts
{ question: Question; onChange: (q: Question) => void }
```
`RatingEditor` `SingleChoiceEditor` `MultiChoiceEditor` `TextEditor` `YesNoEditor`
`NpsEditor`. Same file structure so two people can build three each without collision.

`YesNoEditor` has nothing to configure and renders "No settings for this type." rather than an
empty body.

### `<QuestionInput>` × 6
```ts
{ question: Question; value?: AnswerValue; onChange: (v: AnswerValue) => void;
  error?: string; readOnly?: boolean }
```
**These are the components the builder preview also uses.** One implementation, parameterised
by `readOnly`, never two (INV-008). Two implementations means the preview eventually lies
about what respondents see, and the first time you find out is on stage.

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
{ url: string; campaignName: string; onClose: () => void }
```
QR canvas, short URL, three actions, presentation mode.

**Highest-risk component in the build. Write it on 22 Aug, not 26 Aug** (`_MEMORY.md` N-004).
The QR renders locally on canvas — no external image service, which would fail exactly when
the network does. `url` comes from `PUBLIC_BASE_URL`; if it says `localhost` the code does not
scan from a phone (OPEN-002).

### `<FileUpload>`
```ts
{ current: string | null;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  shape: 'circle' | 'square';        // avatar | logo
  maxBytes?: number; disabled?: boolean }
```
Org logo and user avatar. Full spec, including the validation rules that make an upload
endpoint safe, in `48-FEATURE-file-upload.md`.

A real `<input type="file">` underneath — the drop zone is an enhancement, never the only
path, or the control is unusable by keyboard.

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

## 8. Ownership

| Track | Builds |
|---|---|
| **B — Console** | AppShell, Sidebar, TopBar, PageHeader, VocabularyChips, UnitTree, RoleRow, PersonChip, PowersGrid, ResponsiveTable |
| **C — Collection** | QuestionCard, 6 editors, 6 inputs, Toggle, ShareSheet, ProgressRail, StatCard, BarRow, StackedBar, ScoreBadge, TrendChip, FileUpload |
| **Shared** | EmptyState, Toast, ConfirmDialog — whoever needs one first, then announced |

Track B ships AppShell and PageHeader before starting the wizard, or track C is blocked or
builds a second shell.

## 9. Acceptance

- [ ] Twenty-one components exist with the documented prop types
- [ ] No page defines a component that belongs in this list
- [ ] `<UnitTree>` has exactly one implementation, used in three places
- [ ] `<QuestionInput>` is shared by the preview and the live respondent form (INV-008)
- [ ] `<ConfirmDialog>` cannot be rendered without a `consequence` — it is a required prop
- [ ] `<TrendChip>` always renders an arrow
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
