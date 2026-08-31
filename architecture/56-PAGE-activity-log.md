# 56 — Activity log

Phase: P2 · Milestone: — · Design ref: `design_specs/design/04` §4 (console anatomy),
`design_specs/design/09` §3.1 (`<ResponsiveTable>`)
Related: `11` §5b, `52` §6, `18` §9, `42` (the same trace, asked forward), `72` (the *other* log)
Decisions: `_MEMORY.md` DEC-040, DEC-041 · Invariants: **INV-006**, INV-007
Status: **BUILT 2026-08-25 — `T-075` (read surface) and `T-076` (page).**
This is the **organisation's** log — an administrator seeing their own org. Endur's own log
files are `72`, a different principal and a different store (`INV-011`). `T-074` already
landed the `audit_log.ip` fix that had to come before any page could render the column

## Purpose

**The organisation's own record of what happened inside it, and which rule allowed it.**

`audit_log` has been written on every state change since `T-013` and has never once been read.
That is a whole invariant's worth of evidence — INV-007, the transaction-bound audit row
carrying `decided_by` — sitting in a table with no reader. This page is the reader.

It answers three questions an administrator actually asks:

| Question | What the row shows |
|---|---|
| *Who changed this?* | actor, action, target, time |
| *How were they allowed to?* | `decided_by` — the grant, its subject, its scope, its anchor unit |
| *Who has been trying things they cannot do?* | the `denied` rows (DEC-041) |

The second is the one no other product in this category answers, and it is the same trace the
simulator renders (`42`). The simulator asks *would this be allowed*; this page asks *why was
that allowed*. **One `<DecisionTrace>` component, both tenses** (`24` §6c) — a forked renderer
would eventually describe the same trace two different ways, which is exactly the credibility
the trace exists to buy (`53`).

## Route & access — BUILT

`/app/logs` — console world. Sidebar item under **Settings**, in the `system` group, hidden
without `audit.read`.

**Wrapped in `<RequireCapability capability="audit.read">`, unlike `/app/analysis` and
`/app/reflect`.** Those two are unwrapped because each has a **402** as well as a 403 and a
route guard knows nothing about entitlements. There is no 402 here — the log is not a tier
feature — so the guard can say everything there is to say, and § States asks for a full-page
403 on direct navigation. The page renders its own 403 as well: a caller can hold `audit.read`
in the `/auth/me` map and still be refused by the API, and the client never decides that
(INV-003).

`log` joined the icon vocabulary here rather than reusing `settings`. Two items sitting
together in the same group under one glyph is how a sidebar starts looking like a mistake
(`24` §1, rule 2).

## Capabilities

| Action | Capability | Scope |
|---|---|---|
| Read the log | `audit.read` | `own_unit` · `subtree` · `all` |

Already in `11` §3 since the first revision; this page is its first use.

**The list is scope-filtered by the API** (INV-003). A head of department sees actions on
targets inside their subtree and nothing else — not greyed, absent — and `meta.total` counts
what the caller may see (`13` §4). That filtering happens over the *target*, which means a row
is visible when the thing acted upon is in scope, not when the actor is: an owner acting on
your department is your business.

## Data contract — BUILT

| Action | Endpoint | DTO |
|---|---|---|
| List | `GET /api/v1/audit?actorId&action&targetType&outcome&from&to&cursor&limit` | → paginated `AuditEntry[]` |

**One route, and there will never be a second.** No write route, because the log is evidence
and a customer-facing edit on it is the feature that makes it worthless (`52` §6). No export
route — see § Out of scope.

`audit_log.outcome` did not exist in the database until `T-075`. `10` §5 has carried the
column since 2026-08-23 and the table had not, because nothing had ever read `audit_log` and a
column no writer sets is a column no reader can trust. It landed with its reader,
`DEFAULT 'allowed'` — every row written before today described something that happened, which
is exactly what `allowed` means. Backfilling it any other way would be inventing history.

```ts
export type AuditEntry = {
  id: string;
  at: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;  // null = not a user
  action: Capability;
  target: { type: string; id: string | null; name: string | null } | null;
  outcome: 'allowed' | 'denied';
  decidedBy: DecidedBy | null;   // ONE type, shared with the 403 body — errors.ts
  requestId: string | null;
};
```

**`ip` is not in that type and must never be added.** It exists on the row for staff forensics
(`10` §5) and is deliberately not part of the read surface: an administrator does not need a
colleague's home IP address to understand who renamed a unit, and a field that is on screen is
a field that ends up in a screenshot. If a genuine forensic need appears, it is a separate
capability and a separate view, not a column here.

**`actor` is `null` for a respondent submission**, and that is the whole of what such a row
says — the action, the campaign, the time. See § Anonymity below; it is the most important
section in this document.

`action` is a capability string and is rendered through the same `describe()` the powers grid
uses (`33`, `D-008`) — never a second English mapping, or the two eventually disagree about
what `campaign.launch` is called.

## State

Local. Filters and cursor live in the **URL query string**, so a filtered log is linkable —
*"here is the row I mean"* pasted into a chat is the whole reason anyone opens this page with
somebody else.

No polling and no live tail. This is a record, not a monitor; `72` is the monitor.

## Components

`<PageHeader>` · `<ResponsiveTable>` · **`<DecisionTrace>`** (built here, `24` §6c) ·
`<EmptyState>` · `<Toggle>`.

`<PersonChip>` is **not used and was never built anywhere**; the actor cell renders the name.
Building a chip for one caller is `24` §1's indirection-without-benefit, and it is listed under
§ What is not built rather than quietly dropped.

**The row expands inside its own cell**, not into a second `<tr>`. `<ResponsiveTable>` renders
one DOM in both shapes and a spanning row would need a second (`24` §3); the compact trace is
already in the *Why* column, so swapping it for the full one is what `24` §6c describes
happening anyway. The control is a `<button aria-expanded>`, never a row click — a `<tr>` is
not focusable, which is the same reason `<ThemeTable>` opens from a button (`T-082`).

## Scope — filtered over the target, in SQL

`audit.read` is seeded **`all` at L1 and nowhere else** (`50` §1), so the seeded caller always
sees everything. The filter exists anyway, because an organisation can write the grant
narrower and § Capabilities promises it works.

Four target types live in a unit — `unit`, `subject`, `person`/`user`, `campaign` — and a
campaign's unit is its **subjects' units**, exactly the predicate `40` and `58` already use.
Everything else is **org-level**: a role, a template, the organisation itself. An org-level
target is one a unit-scoped grant deliberately cannot reach (`11` §4, and `buildTarget()`
reaches the same answer on the write side), so only `all` sees those rows and the default
stays deny.

The filter is three id lookups and one `OR`, run **before** the page query rather than per
row, so `meta.total` is a real count of what the caller may see rather than a count of what
exists with rows dropped afterwards (`13` §4).

## Anonymity — the section to read before writing any code

**Rendering `audit_log` to an org administrator is what makes a dormant respondent leak live,
and the leak was real.** `10` §5 now carries the fix; this is the reasoning, because it is this
page that must not undo it.

Every response submission writes an audit row — correctly, INV-007 covers every state change
and a submission is the most consequential one in the product. Until 2026-08-23 that row
carried the submitting **IP address**, written by `db/tx.ts` for every principal alike.
`responses.submitted_at` is written in the same transaction. So:

```
audit_log   response.submit · campaign X · 14:05:11 · 203.0.113.44
responses            (anon) · campaign X · 14:05:11
```

Sort both by time, zip them, and you have IP addresses against responses. INV-006 says an
anonymous response has no retrievable link to a respondent; this page would have built one out
of two tables that individually keep the promise.

**Three rules follow, and all three are testable:**

1. **`audit_log.ip` is NULL for non-user principals** (DEC-040). Fixed at the writer, in
   `db/tx.ts`, not filtered at this reader — a filter protects one screen, the writer protects
   every future one.
2. **This page never renders `ip`**, for any principal. Belt and braces on top of rule 1.
3. **A `response.submit` row shows the campaign and the time and nothing else.** No actor, no
   subject, no answer, no count that changes with it. It is present because INV-007 says every
   state change is recorded, and it is deliberately the least informative row in the table.

The honest thing to say in a viva: the audit log is a **permission** record, not a
**submission** record, and the one row it holds about submissions tells you a submission
happened. That is INV-006 surviving contact with a feature that wanted to break it.

## Interactions

**The table.** Time, actor, action, target, outcome. Newest first. Below 640px it collapses to
stacked cards with the action as the title (`24` §3).

**A row expands** to `<DecisionTrace>`: *"Allowed by the **Dean** role, scope `subtree`,
anchored at **School of Engineering**"*. That is INV-005 stated in the past tense about a real
event, and it is the cheapest demonstration of the whole permission model in the product —
cheaper than the simulator, because the data is real.

**Denied rows are visually distinct and filterable on their own.** The word is *Refused* and
the tint only confirms it — never colour alone (`21` §8). *Show refusals only* is a
toggle, not a buried dropdown, because it is the one view that turns this page from a business
record into a security screen: three refusals of `grant.update` by the same person in a minute
is a conversation to have today.

**Filters:** actor, action, target type, outcome, date range. All in the URL.

**No export in P2.** `response.export` and `results.export` are capabilities with an
entitlement behind them (`16` §3); an audit export is a third thing and nobody has asked for
it. When it exists it is `audit.read` plus a format, and it is one endpoint.

## States

| State | Behaviour |
|---|---|
| Empty | `<EmptyState>`: *"Nothing has been recorded yet"* — only reachable on a brand-new org, since registration itself writes a row |
| Empty after filter | Different copy and a Clear filters action (`34` states the reason) |
| Loading | Skeleton rows |
| Error | Inline above the table; the last good page stays |
| 403 | Full-page 403 on direct navigation; the sidebar item is absent without `audit.read` |
| A row whose target has since been deleted | Renders the id and *"(deleted)"*. **Never hidden** — a record that quietly drops the rows whose subjects are gone is a record that can be edited by deleting things |

## Which refusals get written — DEC-041, narrowed at the writer

DEC-041 scopes the rule to *"denials of mutating capabilities only"*. `requireCapability()`
applies **two conditions**, and they catch different mistakes:

1. **the METHOD** — nothing is written for a `GET`. That is this document's own wording: a
   403 on a GET is the permission system working as designed, thousands of times a day.
2. **the CAPABILITY** — nothing is written for a `*.read`. Belt to that brace, because a read
   is occasionally shaped like a write. `POST /authz/simulate` asks a question and changes
   nothing, and a simulator run somebody may not perform is not a security event.

**A 404 is recorded too.** From the caller's side it is indistinguishable from a 403 by design
(`13` §5), but from the organisation's side it is the more interesting of the two: somebody
reached for a resource so far outside their scope that we would not confirm it exists.

The row is written by `writeDenial()` in **`db/tx.ts`**, beside `flushAudit()` and not in the
middleware, for one reason: `ip` and `actor` are decided by DEC-040 and DEC-045 there and
nowhere else, and a second writer would be a second place those rules have to be remembered.
It is **not in a transaction** — INV-007 binds a row to the mutation it describes, and a
refusal describes a mutation that never happened. And it **can never replace the 403**: a log
that turns a refusal into a 500 makes the product less safe than not having one.

## Acceptance

- [x] The list is scope-filtered by the API; `meta.total` reflects the caller's scope —
      `T-075`, asserted with a section head granted `audit.read: own_unit`
- [x] **A `response.submit` row carries no actor, no IP and nothing that identifies a
      respondent** — `T-075`, asserted on the rendered row AND on the stored column
- [x] `AuditEntry` has no `ip` field, asserted against the DTO — and against every row of a
      real response body, which is the assertion that would survive somebody adding one
- [x] Denied attempts appear, are filterable alone, and carry the deciding deny (DEC-041)
- [x] A refused **read** writes nothing — the other half of DEC-041, and the half that keeps
      the table readable
- [~] Expanding a row renders the same `<DecisionTrace>` the simulator renders — one
      component exists and `56` uses it. `42` is `T-054` and unbuilt, so the import test has
      only one importer to find; `T-054` **extends, never forks** (INV-009)
- [x] A row whose target was deleted still renders — the id and *"(deleted)"*
- [x] Filters and cursor round-trip through the URL
- [x] Action names come from the shared `describeCapability()`, not from a second mapping
- [x] Table collapses to cards at 390px — `<ResponsiveTable>`, unmodified
- [x] Every noun from `useLabels()` (INV-001) — the trace says *"that ward and everything
      under it"*, never `own_unit`

## What is not built

| Not built | Why, and what would have to happen |
|---|---|
| **Filter by actor** | `actorId` is in the query schema and the service honours it; the page offers no picker. A people picker on this page is `34`'s component and lifting it is a task, not a line — and the URL already accepts the parameter, so a link with one in it works today |
| **`<PersonChip>`** | § Components names it and it has never been built anywhere. The actor cell renders the name. Building a chip for one caller is `24` §1's indirection-without-benefit |
| **Expanding to the `considered` list** | The component renders it; **no audit row carries one**. `decided_by` stores the deciding grant, which is what `10` §5 specifies. The rejected candidates are a resolver-time artefact and storing them would multiply the row size of the one table that is kept forever |

## Out of scope

| Not building | Why |
|---|---|
| **The application log files** | `app-*.log` and `error-*.log` are Endur's operational diagnostics across every tenant. They are read at `/ops/logs` by a platform operator (`72`). Filtering a shared file by `orgId` and serving it to a customer is one bug away from serving somebody else's — and `18` §9's distinction is load-bearing: one is evidence, the other is diagnostics |
| Live tail | This is a record. `72` is the monitor |
| Retention or deletion controls | The audit log is evidence. A customer-facing delete button on it is the feature that makes it worthless (`52` §6) |
| Alerting on denials | Genuinely useful and it needs `63` (notifications), which is P3 stretch |
| Audit export | See above. One endpoint when someone asks |
| Reading another org's rows | Not out of scope so much as impossible — `orgId` comes from `tenantResolver` (INV-010) |
