# 26 — Accessibility implementation

> **PLACEHOLDER — reserved slot, not yet written.** Nothing below is decided.

Phase: P2 · Milestone: — · Status: **unwritten**

---

## Why this slot is reserved

The **floor is already set and is binding**: `design_specs/design/01` §9, restated as
consequences in `21` §8. Contrast ratios, keyboard reachability, valence never by colour
alone, 44px touch targets, real labels, `aria-live` on the results counter, and the
respondent form completable by keyboard alone.

Those are requirements, and they appear in the `## Acceptance` list of every page doc. What is
not written is the *implementation* guidance for the handful of components where getting it
right is genuinely non-obvious.

## What will go here

- `<UnitTree>` as an accessible tree: roles, `aria-expanded`, arrow-key navigation, and how
  drag-to-reparent gets a keyboard equivalent
- `<PowersGrid>` as an accessible grid — a 2D matrix with cell-cycling on click is the hardest
  component in the product to make keyboard-operable
- Rating and NPS scales as `radiogroup`s with anchors announced (`39`)
- Focus management: dialogs, the wizard's step transitions, the share sheet, and returning
  focus on close
- Announcing async results without spamming a screen reader
- Testing approach — axe in CI, plus a manual pass

## Write this when

- [ ] `<UnitTree>` and `<PowersGrid>` exist, since they are the two that need real thought
- [ ] Before the P2 → P3 gate, which already requires the page-level accessibility criteria to
      pass

Until then the floor in `design_specs/design/01` §9 is authoritative and non-negotiable — this
document adds *how*, never *whether*.
