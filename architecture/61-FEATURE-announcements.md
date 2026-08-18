# 47 — Announcements and self-maintaining groups

> **PLACEHOLDER — reserved slot, not yet designed.** Nothing below is decided.

Phase: **P3 stretch** · Milestone: — · Status: **unwritten**
Source: `design_specs/SCOPE.md` §"Communicate" · Conflict: `_MEMORY.md` CONF-006

---

## Why this is only a placeholder

Out of P1/P2 by `CONF-006`. Currently a disabled sidebar item with no page behind it.

## What it is meant to be

Announcements and live updates sent to exactly the right people, through groups that
**maintain themselves** because Endur knows who belongs to them.

"All third-year computer science students" stays correct automatically. A WhatsApp group goes
stale the moment someone graduates and nobody removes them. That contrast is the entire
argument for the feature, and it is worth stating in exactly those terms.

Who may broadcast to whom is governed by the hierarchy, not by who happens to have everyone's
phone number: a class representative to their cohort, a head of department to their staff, a
dean to the whole institution.

## Why it matters to the rest of the product

This is the **engagement** half of the product thesis (`01` §5). Response rates are ~30%
because people forget the portal exists. A platform worth opening daily — for announcements,
community activity and polls — is what lifts the response rate for feedback.

So this feature's real purpose is not communication for its own sake; it is what makes layer 3
work. That relationship should shape its design when it is written.

## What it would need

- A group definition that is a **query over the org graph**, not a stored member list — that
  is what "self-maintaining" means, and it is the whole feature
- Broadcast permission derived from the hierarchy, expressed as capabilities in `11` §3
- Read state per recipient, without breaking anonymity guarantees elsewhere
- Delivery channels, which are `63`'s problem, not this one's

## Write this when

- [ ] After communities (`60`), since a community is the most natural audience for a broadcast
- [ ] Only if P3 has room after Redux, analysis and the improve loop — it is a **stretch**,
      and the three graded phases come first
