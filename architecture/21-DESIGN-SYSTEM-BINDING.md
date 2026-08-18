# 21 — Design system binding

Phase: P2 · Milestone: M0 · Owns: `src/frontend/design-system/**`
Design ref: `design_specs/design/01-DESIGN-SYSTEM.md` — **authoritative for all values**
Decisions: `_MEMORY.md` DEC-012

---

## 1. What this document is, and is not

`design_specs/design/01-DESIGN-SYSTEM.md` defines every colour, type size, radius, shadow,
duration and spacing value. **This document does not restate any of them** (DEC-012) — a
value written in two places drifts, and then nobody knows which is current.

This document specifies only **how those definitions become code**: which files exist, what
each is allowed to contain, and what makes a violation detectable.

`npm run audit:drift` scans `architecture/` for literal design values — hex colours, font
family names, spacing tokens — and must return nothing (DRIFT-003).

## 2. Three files, one direction of dependency

```
src/frontend/design-system/
  tokens.css      the :root block, copied verbatim from design_specs/design/01 §2 + §2b
  organic.css     the base component layer, from _ds/organic-*/styles.css, UNMODIFIED
  endur.css       Endur-only additions that sit on top
```

Imported in exactly that order in `main.tsx`. The order is the cascade and is not negotiable.

| File | May contain | May not contain |
|---|---|---|
| `tokens.css` | Custom-property declarations only | Any selector other than `:root` |
| `organic.css` | The vendored design-system component layer, unchanged | Any Endur edit whatsoever |
| `endur.css` | The status ramp, Endur component classes, the `.card` background override | New raw values that are not derived from tokens |

**`organic.css` is vendored, not authored.** Editing it means the next time the design system
is regenerated, the edit is lost or silently conflicts. Everything Endur needs to change goes
in `endur.css` as an override. There is exactly one known override — `.card` background,
because the base default is the chrome surface and Endur reserves white for content
(`design_specs/design/09` §1).

## 3. Tokens

`tokens.css` is a verbatim copy of the `:root` block in `design_specs/design/01` §2, plus the
status ramp from §2b. Copied, not re-derived — and when that file changes, this one is
re-copied wholesale rather than patched (`DRIFT-001`).

Three things about the token set that have architectural consequences:

**The canonical accent is the form-builder set, not the analysis dashboard's** (CONF-003,
resolved upstream). When porting anything from the analysis mockup, its `:root` block is
replaced, not merged.

**The status ramp is strictly semantic.** It exists because the base system is two-accent, and
the analysis mockup painted negative sentiment in the brand accent — which worked on the
original warm palette and does not on blue. Blue is the product; blue cannot also mean "a
student is unhappy" (CONF-004). Consequence for the API: charted response DTOs carry an
explicit `valence` field, so the client never infers good/bad from a number's sign
(`14` §8).

**No third accent for branding.** The status ramp is never used for navigation, decoration,
or identity.

## 4. Fonts

Both faces are **self-hosted** in `public/fonts` as woff2, with the Google Fonts URL kept only
as a development convenience. A venue network that blocks or slows `fonts.googleapis.com`
would otherwise drop the entire product to system-ui mid-presentation
(`design_specs/design/01` §2, risk carried in `02` §2).

Deadline: self-hosting done by **24 Aug**, not on demo day.

`@font-face` declarations live in `tokens.css` alongside the family custom properties, so the
declaration and its consumer cannot drift apart.

## 5. What components may and may not do

| Rule | Enforced by |
|---|---|
| No literal colour value in `src/frontend/**` outside `design-system/` | ESLint `no-restricted-syntax` (`03` §6) |
| No literal font family or size — use the type scale classes | Review + the same lint rule |
| No literal spacing px — use `--space-*` | Review |
| Icons are Lucide at the specified stroke weight, never emoji | `audit-drift` grep for emoji in JSX |
| Focus rings are never removed | Review; `outline: none` without a replacement is a bug |

The emoji rule is worth automating rather than trusting: the mockups use emoji placeholders,
they render differently on a projector machine, and they survive to demo day unless something
mechanical catches them (`design_specs/design/11` §6).

## 6. The two accent edges

`design_specs/design/01` §4 gives accent borders exactly two jobs: a top border on a form's
header card, and a left border on the focused question card. These are the only accent edges
in the product.

Recorded here because it is the kind of device that spreads — a developer adds a third
"just for this screen" and the language stops meaning anything. If a screen seems to need a
third, that is a design decision and belongs in `design_specs`, not in a component.

## 7. Motion

Four places motion earns its keep (`design_specs/design/01` §7): the wizard step change, the
question-card focus, the respondent submit, and a new response landing in results. Nothing
else moves.

The architectural consequence is the fourth one: **a newly arrived response must be visually
identifiable** when the results view refreshes. That requires the results query to return
`submittedAt` and the client to track what it has already seen — a data requirement, not a
CSS one, specified in `40-PAGE-results.md`.

`prefers-reduced-motion` is honoured globally by the block in `design_specs/design/01` §7.
Never re-implemented per component.

## 8. Accessibility floor

From `design_specs/design/01` §9, non-negotiable and cheap while building:

- Contrast: body ≥ 4.5:1, large text and chrome ≥ 3:1. The accent on the ground is ~3:1 —
  chrome only, never body copy.
- Everything keyboard reachable in visual order, with the accent focus ring visible.
- **Valence is never communicated by colour alone** — always paired with a number, a label,
  or an icon. This is why `<TrendChip>`'s arrow is mandatory rather than decorative.
- Rating scales are `radiogroup`s with the low and high anchors announced.
- Touch targets ≥ 44×44px. The rating dot is smaller than that visually; its hit area is not.
- `aria-live="polite"` on the results response count and on save confirmations.

## 9. Acceptance

- [ ] Three CSS files exist, imported in the documented order
- [ ] `tokens.css` contains only `:root` and `@font-face`
- [ ] `organic.css` is byte-identical to the vendored source
- [ ] `endur.css` contains exactly one override of a base class, documented inline
- [ ] Fonts render correctly with the network disabled
- [ ] `grep -rE '#[0-9a-fA-F]{6}' src/frontend --exclude-dir=design-system` returns nothing
- [ ] No emoji appears in any `.tsx` file
- [ ] Every interactive element shows a visible focus ring
- [ ] Every valence indicator carries a number, label, or icon alongside the colour
- [ ] `DRIFT-001` and `DRIFT-003` pass

## 10. Out of scope

| Not doing | Why |
|---|---|
| CSS-in-JS or Tailwind | The system is specified as CSS custom properties and classes; re-expressing it is work with no gain |
| A token build pipeline (Style Dictionary) | One target platform. A copy is simpler and auditable |
| Dark mode | Explicitly out (`design_specs/design/01` §10) |
| Theming per tenant | The vocabulary system is the customisation story. Per-tenant colour is a different product decision |
| Storybook | Real value, wrong phase — revisit if the inventory stabilises early in P2 |
