# 25 — Frontend error handling

> **PLACEHOLDER — reserved slot, not yet written.** Nothing below is decided.

Phase: P2 · Milestone: — · Status: **unwritten**

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
- Retry policy: which requests retry silently, which surface, which never retry
- Offline and network-failure handling — most acute in the respondent flow (`39`)
- The rule already fixed in `24` §6: **errors never use a toast**

## Write this when

- [ ] Two or more pages have implemented error states and the duplication is visible
- [ ] Before the builder's inline validation is wired, since that is the case the field-path
      mapping exists for

Until then, per-page `## States` sections are authoritative and this document does not
override them.
