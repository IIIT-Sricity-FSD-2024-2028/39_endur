# 48 — Voting and elections

> **PLACEHOLDER — reserved slot, not yet designed.** Nothing below is decided.

Phase: **P3 stretch** · Milestone: — · Status: **unwritten**
Source: `design_specs/SCOPE.md` §"Collect" · Conflict: `_MEMORY.md` CONF-006

---

## Why this is only a placeholder

Out of P1/P2 by `CONF-006`. It is also the feature most likely to be **cheaper than it looks**,
which is why the slot is worth reserving with a note rather than left blank.

## What it is meant to be

Formal elections and committee decisions. Its first internal consumer is `46` — a community's
elected representative is elected using this.

## Why it may be nearly free

`DEC-010` already establishes that **a poll is a one-question template**, and the form engine
plus the campaign audience model already provides: an eligible audience derived from the org
graph, a time window, one response per person, and anonymity.

An election is a single-choice question over a candidate list, with the audience rule doing
the eligibility work. Most of it may fall out of the existing engine — which would be a strong
demonstration of the generality claim rather than a new subsystem.

## What genuinely differs from a poll

These are the parts that are **not** free, and the reason this cannot simply be declared done:

| Requirement | Why a campaign does not already give it |
|---|---|
| Verifiable one-person-one-vote | `52` §1 is explicit that open-link duplicate prevention is best-effort. An election needs the per-person invitation path, not the open link |
| Results sealed until close | Results are readable while a campaign is open. An election must not leak a running tally |
| A declared, auditable outcome | A winner is a record, not a chart |
| Ties and thresholds | Quorum, majority rules — genuine policy, not presentation |
| Candidate nomination | A step before voting that has no analogue in a campaign |

The tension worth flagging early: **verifiability and anonymity pull against each other**, and
`52` §1 already documents where we land on that trade-off for feedback. An election may need a
different answer, and choosing it is a design decision, not an implementation detail.

## Write this when

- [ ] Communities (`46`) are being built and need elected representatives
- [ ] After confirming how much genuinely falls out of the campaign model — that investigation
      should come first and may shrink this document to a page
