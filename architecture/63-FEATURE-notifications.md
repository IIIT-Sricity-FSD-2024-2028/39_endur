# 49 — Notifications and multichannel delivery

> **PLACEHOLDER — reserved slot, not yet designed.** Nothing below is decided.

Phase: **P3 stretch** · Milestone: — · Status: **unwritten**
Source: `design_specs/SCOPE.md` §"Collect" · Conflict: `_MEMORY.md` CONF-006

---

## Why this is only a placeholder

Out of P1/P2 by `CONF-006`. `BUILD_PLAN_EVAL1.md` §4 lists email/SMS/WhatsApp delivery as
explicitly out, with link + QR as the whole collection story for now.

That is the right call and worth defending rather than apologising for: **link and QR prove
the collection model**, and channels are integration work, not design work. Adding a mail
provider demonstrates nothing the middleware chain does not already demonstrate.

## What it is meant to be

Feedback reaching people through the channels they already use — email, WhatsApp, SMS, QR
codes on posters, tablets at a mess counter — rather than a portal they must remember to
visit. Plus reminders, with channel choice and opt-out.

## The constraint that shapes the whole design

**Reminders to non-responders are impossible for anonymous open links** (`38` § Out of scope,
`52` §1). You cannot remind the people who have not responded without knowing who has, and
knowing that is precisely what the anonymity guarantee forbids.

The invitation model (`10` §4.4) is the way through: `invitations` records *that* a token was
used, `responses` records *what* was said, and nothing joins them. So a reminder can go to
unused invitations without ever learning what anyone answered.

That is the design, and it should be written down as the starting point when this is built —
it is a case where the privacy architecture chosen in P1 pays off directly.

## What it would need

- A channel abstraction with per-channel templates
- Provider integration and its failure and retry semantics — depends on `17`
- Recipient preferences and opt-out, per channel, per org
- Delivery status without leaking response status
- Rate limits and cost controls, since sending is the first thing in this product that costs
  real money per unit

## Explicitly not this

Not a marketing automation tool. Not a general notification centre. The scope is: get the
right form to the right person once, and remind them once if they have not used it.

## Write this when

- [ ] `17-BACKGROUND-JOBS.md` is written — delivery and retry need a real execution model
- [ ] There is a deployment with real users, since sending email from a demo build has no
      audience
- [ ] Only after the three graded phases
