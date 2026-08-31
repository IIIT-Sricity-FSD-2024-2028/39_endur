# 61 — Announcements

> **BUILT 2026-08-30 (`T-094`) — the narrow half.** One-way, in-product notices with an
> `AudienceRule` and a read receipt per recipient. The **self-maintaining groups** this slot
> was originally reserved for are still unwritten and still `60`'s, still P3.

Phase: **P2** · Milestone: M0 · Status: **built, narrow**
Source: `design_specs/SCOPE.md` §"Communicate" · Conflict: `_MEMORY.md` CONF-006
Contract: `13` § Announcements · Capabilities: `11` §3 § Announcements · Seed: `50` §1

---

## What shipped, and why this much

The placeholder that used to sit here described a P3 stretch: broadcasts to groups that
**maintain themselves** because Endur knows who belongs to them. That is still the ambition
and it is still unbuilt.

What `T-094` built is the half that needed **no new idea at all**, because the org graph
already answers "who is in Housekeeping" and campaigns already ask it:

| | |
|---|---|
| Audience | `AudienceRule` — `anyone` \| `unit` \| `role`, the campaign's own |
| Resolver | `features/campaigns/audience.ts` — `audienceUsers()`, one implementation |
| Delivery | **in-product only.** No mail, no push. The composer says so on screen |
| Receipts | one row per resolved recipient, written **at publish time** |
| Tier | `announcement.read` Bronze; `create` / `publish` / `delete` **Silver** |

The self-maintaining group was never the blocker. A rule over the org graph *is* a
self-maintaining group — "everyone in Housekeeping" is resolved on the day it is asked, and a
person who moves department is in the next answer without anybody maintaining a list. What
`60` adds is a group that is **named and reusable**, and that is a different feature.

## The receipts are the feature

*"12 of 40 have read this"* is the whole reason this is worth building rather than a card on
Home saying "Notice: ...". The sentence is only true because the denominator is taken when the
notice is **sent**:

- `announcement_receipts` is written in the **same transaction** that stamps `published_at`,
  one row per resolved recipient, `read_at` NULL.
- A row created lazily on first read can count readers and can never supply the 40.
- Publishing is therefore **irreversible** in the same sense a launch is, and the body goes
  read-only afterwards — editing published words while the receipts still say people read them
  would make the receipts lie. `PATCH` on a published row is **409**.
- Publish is **idempotent by state** as well as by key. A second publish returns the first
  result rather than resolving the audience again against an org graph that has since changed.

## `anyone` means something different here

On a campaign, `anyone` means *"whoever holds the link"* and has **no denominator at all** —
`countAudience()` returns null, and `40` explains at length why inventing a number there
produced response rates of 4675%.

An announcement has no link and is never read by a stranger, so its widest audience is **every
account in the organisation**. Same rule, two surfaces, and the difference is stated in
`audienceUsers()` rather than inherited by accident.

People with **no sign-in**, and disabled accounts, are skipped. A receipt is a row against a
`users` id, and somebody who cannot open the product cannot read the notice — counting them
would make the denominator dishonest in the one direction that matters.

## Two verbs, not one

`announcement.create` and `announcement.publish` are separate capabilities, and the seeded
matrix makes the gap real: **L1 and L2 draft, L1 alone sends** (`50` §1). Drafting is not
broadcasting, and an organisation should be able to let a coordinator write a notice without
letting them reach everybody with it. A single `announcement.manage` verb would have made that
unsayable — the same argument `account.revoke` makes against being folded into
`account.create` (`57`).

`announcement.read` is seeded to **every level, L4 included**. Being sent something is not a
permission anybody should have to be given.

## Privacy — why identified receipts are fine here

`announcement_receipts` names a `users` row on purpose. INV-006 is a promise about
**`responses`**, and nothing in this feature touches that table: there is no `campaignId`, no
`responseId`, and no column that could be joined to one. These are staff reading a notice, not
respondents answering a question, and the two are different privacy contracts — the same
distinction `DEC-090` draws for bookings.

## Route & access

Eight routes under `/api/v1/announcements`, specified in `13` § Announcements. Two rules that
are not obvious from the table:

- **A notice addressed to somebody else 404s, never 403s** (`13` §5). A 403 would answer
  *"was one sent?"*, which is the question the id space must not be able to answer.
- **`POST /preview` is gated on `announcement.create`, not `read`.** It answers "how many
  people would this reach" for an arbitrary rule, which is a composer's question and a fact
  about the org graph.

## Screens

`/app/announcements` (list: drafts, published, read counts, publish and delete),
`<Composer>` (title, body, audience, live server-side recipient count), and
`<AnnouncementBanner>` on `/app` Home — where the feature is visible **without navigating to
it**, which is what makes it demo in fifteen seconds. All three are catalogued in `24`.

There is **no recipient field** and there must not be one. The moment a client can name
recipients, "everyone in Housekeeping" becomes a snapshot somebody maintains by hand and the
org graph stops being the answer.

## What is still not built

- **Named, reusable groups** (`60`) — a group defined as a query, addressable by name. The
  rule-per-announcement above is the same mechanism without the noun.
- **Delivery channels** (`63`) — email, push. There is no mail transport in this product and
  the composer admits it rather than implying one.
- Both stay **P3**, and `CONF-006` still stands: `SCOPE.md`'s communicate layer is broader
  than the three graded phases have room for. What changed on 2026-08-30 is that the cheapest
  quarter of it turned out to cost two tables and no new concepts.
