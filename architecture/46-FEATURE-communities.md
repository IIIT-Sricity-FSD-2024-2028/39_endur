# 46 — Communities

> **PLACEHOLDER — reserved slot, not yet designed.** Nothing below is decided.

Phase: **P3 stretch** · Milestone: — · Status: **unwritten**
Source: `design_specs/SCOPE.md` §"Communities" · Conflict: `_MEMORY.md` CONF-006

---

## Why this is only a placeholder

`design_specs/design/11` §7 is explicit that designing this now would be work thrown away —
the product will know more by the time it is built. `CONF-006` resolves it out of P1/P2
entirely. Its whole current design is a disabled sidebar item with a "Soon" tag and **no page
behind it** (`20` §2).

This slot exists so the intent is recorded and so nobody re-derives it from scratch later.

## What it is meant to be

Spaces where people raise issues, discuss them, and organise a response — a mess committee, a
hostel group, a departmental forum. Each is run by **an elected representative**, elected using
Endur's own voting feature (`48`). Members raise complaints; the representative escalates on
the group's behalf rather than leaving individuals to complain alone.

## Why the schema already anticipates it

A community is a `nodes` row of kind `group`, plus `member` edges, plus its own `grants`
(`10` §2). That is exactly the mechanism that already lets a student on a committee book a
hall without inventing a role. **No new primitives are needed** — which is a genuine
validation of the three-table model and worth saying so in a viva.

## The hard part — confidentiality

A confidential community is visible only to its members and their elected representatives, not
to higher authorities. That is the difference between a student saying nothing because
complaining feels risky, and a problem being raised, discussed and escalated properly.

**And it has a limit that must be designed in from the start, not retrofitted** (`52` §3):

> Confidentiality cannot cover harm. Reports involving safety, harassment, or abuse must reach
> someone who can act — institutions have a legal duty of care they cannot contract out of.
> The rules are defined openly and shown to members up front, so nobody is misled about what
> "confidential" means.

Designing the escalation path *after* an incident is the failure mode. This is the single
most important open question in the feature.

## Explicitly not this

Not a replacement for WhatsApp. Endur handles official communication, not casual conversation
(`01` §10). A community scoped to an issue is a feature; an unscoped chat surface is a
different product.

## Write this when

- [ ] P1 and P2 are complete and the improve loop (`44`) is shipped
- [ ] The confidentiality escalation policy has been decided with someone who understands the
      institution's duty of care — this is not a purely technical decision
