# 28 — Component testing patterns

> **PLACEHOLDER — reserved slot, not yet written.** Nothing below is decided.

Phase: P2 · Milestone: — · Status: **unwritten**

---

## Why this slot is reserved

`51-TESTING-STRATEGY.md` §5 already fixes the *policy*: test behaviour not rendering, no
snapshot tests, and six named component test targets. That policy is authoritative and this
slot does not reopen it.

What is missing is the *patterns* — the shared fixtures and helpers that stop six people
writing six different ways to mount a component with a session, an org, and a label set.

## What will go here

- `renderWithProviders()` — store, router, labels, session in one helper
- Org and label fixtures, including the **nonsense-label fixture** that makes INV-001 testable
  at component level rather than only by the manual walk (`22` §5)
- Fixture builders for questions, campaigns, grants and org trees
- How to assert INV-008 by component identity rather than by snapshot
- Testing drag interactions (`<UnitTree>`, question reorder) without brittleness
- Testing `<PowersGrid>` cell cycling

## Write this when

- [ ] Three or more component test files exist and the setup duplication is visible
- [ ] Before the `<PowersGrid>` tests, which need the most fixture support

Writing it earlier means inventing helpers for tests nobody has written yet, which is how test
infrastructure ends up fitting nothing.
