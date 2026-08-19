# 27 — Frontend performance

> **PLACEHOLDER — reserved slot, not yet written.** Nothing below is decided.

Phase: P2 · Milestone: — · Status: **unwritten**

---

## Why this slot is reserved

`20` §8 already fixes the four things that actually matter here, and they are deliberately
modest because this is an admin tool, not a landing page:

- Route-level code splitting per world — **the respondent bundle must not include the console**
- Self-hosted fonts (`21` §4)
- The QR canvas renders locally, never via an external service
- No virtualisation: lists are scoped and paginated

Anything beyond that is currently speculation. This slot exists so that when a real
performance problem appears, the investigation lands somewhere instead of becoming scattered
micro-optimisations.

## What will go here

- Bundle budgets per world, and how they are enforced in CI
- The respondent-flow budget specifically — it loads on a phone, on a venue network, for
  someone with no patience, and it is the one surface where this is a product requirement
  rather than a nicety
- Measured render costs for `<PowersGrid>` and `<UnitTree>`, the two components large enough
  to matter
- Caching and revalidation, which is mostly a P3 question once `23` is settled
- What was measured, and what turned out not to matter

## Write this when

- [ ] Something is measurably slow. **Not before** — premature optimisation here would trade
      real P2 delivery time for imagined gains
- [ ] The respondent bundle is measured on a throttled connection, which should happen before
      26 Aug regardless of whether this document exists
