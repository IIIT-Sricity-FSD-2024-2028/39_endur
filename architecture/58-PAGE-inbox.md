# 58 — Response inbox

Phase: **P2** (pulled forward from P3 — see § Why this is P2) · Milestone: —
Design ref: `design_specs/design/08-PAGE-RESULTS-AND-ANALYSIS.md` §8.3
Related: `40` (results, and the gate this page reads through), `43` (the tags it does *not*
render), `52` §2 (k-anonymity)
Invariants: **INV-006**, INV-007
Status: **BUILT 2026-08-25** — `T-079` (backend, `inbox_state` + five routes) and `T-080`
(page, `<ResponseCard>`, `<ScoreBadge>`). Promoted on 24 Aug by `CONF-021`; it never had a
blocker, having been written on 23 Aug and then sequenced behind M0.
Decisions taken while building: `DEC-058` (the inbox owns one table and reads everything
else through `40`'s service), `DEC-059` (`questionId` and `scoreMax` on the DTO),
`DEC-060` (reading is not triaging), `CONF-022` (`<ScoreBadge>` built, colourless).
Found while building: `N-061` / `D-032` — response scope is decided at the **campaign**, not
the subject. Pre-existing in `40`; this page is where it becomes visible

## Purpose

**Every free-text comment as a reviewable stream, with a read/unread/archived mechanic.**

`40` answers *what do the numbers say*. This answers *what did people actually write*, one
comment at a time, in a queue you can work through and mark off. Averages hide the sentence
that mattered; a rating of 3.8 is not a complaint about the projector in Room 4.

It is the only screen in the product with a **triage** shape rather than a reporting shape,
and that is its whole reason to exist: an administrator opening it twice a week wants to know
which comments are new since last time, not to re-read four hundred.

## Why this is P2 when `43` is P3

`design_specs/design/08` §8.3 draws this screen with sentiment, emotion, intent and topic tags
on every card — all four of which need the Analyze layer, which is why it was marked
`[ROADMAP]` alongside `43`. The same section then says, in its own words:

> *"The read/unread/archived mechanic, however, would work today on raw comments — a plain
> comment inbox with those three tabs is a cheap and genuinely useful addition. It is the only
> roadmap screen worth considering pulling forward."*

**That is what this document specifies: the mechanic, on raw comments, with no tags.** The
tags arrive with `43` and are additive — a card gains four chips and loses nothing. Building
the queue now costs one table and three routes; waiting for the engine would leave a sidebar
item disabled for a feature that does not depend on it.

`43` stays P3. `43`'s tags do not appear here until `43` exists, and `<ResponseCard>` has no
prop for them (`24` §6c), so nobody can stub them in.

## Route & access

`/app/inbox` — console world. Sidebar, `understand` group, hidden without `response.read`.

## Capabilities

| Action | Capability | Scope |
|---|---|---|
| Read the queue | `response.read` | `own_unit` · `subtree` · `all` |
| Mark read / unread / archived | **none beyond the above** | per caller |

**AMENDED 2026-08-31 — `DEC-101`. The From Endur tab is not gated on `response.read` either,
and nothing new joins `11` §3.** `response.read` scopes which *units'* responses a
caller may see, and it has nothing to say about a message Endur addressed to a named
administrator — gating on it would mean an administrator with no response scope cannot read
their own mail. **The row names a `user_id`; the row is that user's.** A caller sees exactly the
rows that name them: no org-wide list, and no unread count for anybody else. That is this
section's own argument carried one step further, and it is why no notification module joins the
catalogue either.

**No inbox module is added to the capability catalogue** (`11` §3), deliberately. Read state is **the reader's**, not the
organisation's: one row per `(user, response)` (`10` §5), so two administrators triaging the
same campaign never mark each other's queue. A capability would imply a shared queue somebody
can be excluded from, and there is no such thing here.

## The k-anonymity gate — this must not be a second path

`38` § "Not built" already refused a per-subject breakdown on the campaign page for exactly
this reason, in these words: *"a second ungated path to them is what INV-007 exists to
prevent"*. This page is a far more tempting version of the same mistake — it is a list of
individual comments, which is precisely what the gate exists to withhold.

**So the inbox reads through the same service as `40`, not through its own query.**
`features/results/service.ts` owns the gate; `features/inbox/` composes it and adds ordering,
paging and the per-caller state. Concretely:

- A campaign below the k-anonymity threshold contributes **no rows at all** to the inbox. Not
  greyed, not counted, not shown as *"3 hidden"* — absent, exactly as on `40` (`52` §2).
- Scope filtering is `40`'s, over the campaign's subjects (INV-003).
- A comment carries **no respondent attribute**, because `responses` has no column that could
  supply one (INV-006). The card shows the text, the subject, the rating on the same response,
  and the date. There is nothing else to show and there never will be.

**The suppression is not undone by aggregation across campaigns.** Two campaigns each below
threshold do not become readable by being listed together — the gate is applied per campaign
before the merge, which is the mistake a naive `UNION` would make and the one the shared
service prevents by construction.

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| Queue | `GET /api/v1/inbox?state&campaignId&subjectId&cursor&limit` | → paginated `InboxResponse[]` |
| Mark read | `POST /api/v1/inbox/:responseId/read` | → `204` |
| Mark unread | `POST /api/v1/inbox/:responseId/unread` | → `204` |
| Archive | `POST /api/v1/inbox/:responseId/archive` | → `204` |
| Unarchive | `POST /api/v1/inbox/:responseId/unarchive` | → `204` |

```ts
export type InboxResponse = {
  id: string;
  at: string;
  campaign: { id: string; name: string };
  subject:  { id: string; name: string } | null;
  comment:  string;                       // the free-text answer
  questionText: string;                   // which question drew it
  score: number | null;                   // the rating on the SAME response, if any
  read: boolean;
  archived: boolean;
};

export const InboxQuery = z.object({
  state: z.enum(['all', 'unread', 'read', 'archived']).default('unread'),
  campaignId: z.string().uuid().optional(),
  subjectId:  z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(50),
});
```

`state` defaults to **`unread`**, not `all`. The queue's purpose is what is new; opening on
everything makes it a second results page.

`score` is the rating from the *same* response, which is what makes a card mean something —
*"3/5 · the projector in Room 4 has never worked"* is one person's whole opinion. It is read
from the response the comment came from, never averaged and never inferred.

**Archiving does not delete.** `archived_at` is a timestamp on the caller's row; the response
is untouched. Nothing in this product deletes a response — a feedback tool where an
administrator can make a comment disappear is a feedback tool nobody should trust (`52` §6).

## State

Local, with a `useInbox()` hook. `state`, filters and cursor live in the URL query string, so a
filtered queue is linkable.

Marking read is **optimistic**: the card updates immediately and reverts with an inline error
if the request fails. It is a low-stakes toggle on the caller's own row, and a spinner on every
card in a list of four hundred is worse than an occasional revert.

**Read is not marked on scroll.** It is marked when the card is expanded or explicitly ticked.
Auto-marking on scroll means a fast scroll silently empties the queue, and the queue is the
whole feature.

## Components

`<PageHeader>` · **`<ResponseCard>`** (new, `24` §6c) · `<ScoreBadge>` · `<EmptyState>` ·
`<Toast>`.

Tabs are page-local — four text buttons with an underline (`design_specs/design/08` §8.3), one
`<nav role="tablist">`, and not an inventory entry: a control used by one page is not a
component (`39` sets that precedent for its progress bar).

**`<ScoreBadge>` is currently "not built, and not stubbed"** (`24` §3). This page needs it, so
building it is part of this task rather than a prerequisite someone discovers halfway through.

## Interactions

**Four tabs:** All · Unread · Read · Archived. The active one carries a 2px accent underline.
Unread shows a count; the others do not — a badge on *Read* is a number nobody acts on.

**A card** shows the score badge, the comment, the subject tag, and the read state. Clicking it
expands to the question that drew the comment and the campaign it came from, and marks it read.

**Archive is a single click with no confirmation.** It is reversible from the Archived tab and
it affects only the caller — `<ConfirmDialog>` requires a `consequence` prop (`24` §6) and this
action does not have one worth writing.

**Filters:** by campaign and by subject, both scope-filtered by the API.

### From Endur — a fifth tab  ·  **BUILT 2026-08-31 (`DEC-101`, `T-101`)**

Owner report: *"if the owner is sending a message to client the inbox is not updating for it,
currently inbox is calibrated for feedback only."* **Both halves are correct, and the first half
is worse than it sounds** — `70` § Messaging the administrators has the diagnosis: the message
was written to the *operator's* audit table and reached nobody, while the operator was told it
had reached three people.

The tab renders `<MessageCard>` over `GET /inbox/messages`, and it carries an unread count for
the same reason *Unread* does.

**Here rather than anywhere else, because this is where the owner looked.** `58` already built
read/unread over a stream; a second stream is a **placement, not a second implementation**
(`INV-009`), which is the same argument `<PlanPicker>` makes about its three modes.

**A tab, not a merge into the comment queue.** A comment from a respondent and a message from
your vendor are triaged for different reasons, and one list would interleave them — the *All*
tab stays comments-only, and its count does not move when Endur writes.

**No archive verb on this tab.** `58` archives a comment because a queue of four hundred needs a
floor; a customer who has had three messages from their vendor does not.

**Not gated on `response.read`** — see § Capabilities.

**Built note, and it is where this tab is deliberately *less* than the queue beside it.** No
optimistic revert, no per-card failure map, no cursor, and no `j`/`k`. `useInbox` carries all of
that because it is four hundred comments somebody works through at speed; this is a handful of
rows a year, and the machinery that makes the comment queue feel fast would be machinery
guarding against a problem this stream does not have. What is shared is the **mechanic a reader
sees** — a tab, an unread count, click to read — which is what `INV-009` is about. The filters
and the keyboard legend go with the comment queue and are absent on this tab: a campaign
selector above a message from your vendor is a control that cannot act on what is under it.

**A mark can be undone.** `POST /inbox/messages/:id/unread` exists alongside `/read`, because a
read mark that cannot be reversed makes the first click a decision, and *"I will deal with this
later"* is a real thing to say about a message from the company you buy from.

**Keyboard:** `j`/`k` move, `e` archives, `u` toggles unread. This is a queue, and a queue
worked with a mouse is a queue nobody works through. Documented on the page rather than hidden,
and every one of them is also reachable as a button (`26`).

## States

| State | Behaviour |
|---|---|
| Empty (no comments anywhere) | `<EmptyState>`: *"No written feedback yet"* + a link to campaigns |
| Empty (Unread, but others exist) | *"You're up to date"* — a genuinely different message, and the one people see most |
| Empty after filter | Clear-filters action (`34` states the reason) |
| All campaigns below k-anon | **Identical to the empty state.** No *"3 hidden"*, no count, no hint that anything exists (`52` §2) |
| Loading | Skeleton cards |
| Error | Inline above the list; the last good page stays |
| 403 | Sidebar item absent; direct navigation gets a full-page 403 |
| Optimistic failure | The card reverts and an inline error appears on it — never a toast for a per-card failure |

## Acceptance

- [x] The queue reads through the results service; a campaign below the k-anonymity threshold
      contributes **no rows** — asserted by dropping a campaign under threshold and observing
      the count fall to zero rather than to a suppressed placeholder
- [x] Two below-threshold campaigns do not become readable when listed together — asserted
      directly, with `2 × (k−1) ≥ k` checked in the test so the arithmetic cannot go stale
- [x] Scope filtering matches `40`'s for the same caller — asserted by comparing the two
      through both endpoints. They share one predicate (`canSee`), so the test is a
      regression guard on anybody re-implementing it. **See `N-061`:** they match, and what
      they both do is campaign-level rather than subject-level
- [x] `InboxResponse` carries no respondent attribute, asserted against the DTO — as an
      **allowlist** of keys, so a new field fails the test rather than sliding past it
- [x] Read state is per user: two callers marking the same response do not affect each other
- [x] Archiving does not modify or delete the response — asserted by comparing the row and
      the answer count either side of an archive
- [x] `state` defaults to `unread`
- [x] Marking read is optimistic and reverts visibly on failure, **on the card**
- [x] Read is not marked by scrolling
- [x] `j`/`k`/`e`/`u` work, and every one has a visible button equivalent — plus one the
      spec did not ask for: they never fire while a field has focus
- [x] `<ResponseCard>` has no prop that requires the Analyze layer, asserted by rendering the
      page and grepping its output for all four tag names
- [x] Every noun from `useLabels()` (INV-001) — `audit:vocab` caught one on the first run
      (*"Go to campaigns"* in the empty state) and it is routed now

Not asserted by an automated test, and said plainly rather than ticked:

- [ ] **Cards collapse correctly at 390px.** The CSS is written (`@media (max-width: 640px)`,
      actions drop below the comment) and jsdom cannot check a layout. Wants an eye on a
      phone before M0

Two behaviours worth recording that the acceptance list did not ask for:

- **The write routes are gated too** (`DEC-058`). `POST /inbox/:id/read` on a guessed uuid
  would otherwise answer 204 for a real response and 404 for a fake one, in a campaign the
  caller cannot read — an oracle. Same 404 for all three refusal reasons.
- **Reading is not triaging** (`DEC-060`). Opening a card marks it read but does not evict it
  from Unread; the tick, the archive and `u`/`e` do. The first version evicted on every mark
  and the detail vanished in the frame it appeared.

## Out of scope

| Not building | Why |
|---|---|
| Sentiment, emotion, intent and topic tags | `43`, and `OPEN-003` decides the engine. Additive when they arrive; no stub before then |
| Replying to a respondent | **Impossible under anonymity** for an open link, and a bad idea where it is possible. `44`'s check-in is the conversation surface, and it is between a person and their supervisor |
| Assigning a comment to a colleague | A shared triage queue with ownership is a helpdesk. Read state is per-caller precisely to avoid becoming one |
| Deleting or hiding a comment | `52` §6. An administrator who can make feedback disappear makes all of it worthless |
| Bulk archive-all | One click that clears the queue is one click that loses the queue. `e` on a card is fast enough |
| Full-text search | The filters cover campaign and subject. Search over free text is an index and a P3 conversation, and `43`'s themes are the better answer to the question behind it |
| Rating-only responses | This is the *comment* inbox. A response with no free text has nothing to read; it is already counted on `40` |
