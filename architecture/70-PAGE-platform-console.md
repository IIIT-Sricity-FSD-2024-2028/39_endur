# 70 — Page: platform console (Endur admin)

Phase: **P2** · Milestone: — · Owns: `src/frontend/pages/platform/Console/**`
Related: `19-PLATFORM-OPERATORS.md` (the model, the guards, INV-011), `71` (analytics), `16` (tiers)
Design ref: none yet — this surface has no `design_specs` entry; see § Design note
Status: **BUILT 2026-08-26 (`T-066`)**. `T-059`'s backend door, the `/ops` route tree, the
estate list, one-org detail, plan override, suspend and messaging are all live.

---

## Purpose

The screen a person at Endur opens to answer *"is this customer OK?"*. It lists every
organisation on the platform, shows the health of each as **numbers**, lets an operator change
a plan when support requires it, and lets them contact an organisation's administrators.

It is the operations surface. `71` is the business surface. Keeping them apart is deliberate:
the questions *"why has this customer stopped collecting responses"* and *"what did we earn
last month"* are asked by different people at different times, and one screen answering both
would serve neither.

## Route & access

| | |
|---|---|
| Route | `/ops` · `/ops/orgs/:id` |
| World | **A fourth route tree**, alongside public, console and respond (`20` §2) |
| Guard | `RequirePlatformAuth` — a `platform` principal, or redirect to `/ops/login` |
| Reachable from the product | **No.** Nothing in `/app` links here. There is no menu item, and the console's `<TopBar>` does not know this exists |

**A fourth tree, not a branch of the console.** `20` §2's argument for three trees is that a
crash in one cannot take down another; the same argument applies here with more force, because
this tree has different auth, a different cookie and a different principal kind. Sharing
`ConsoleLayout` would mean one layout reading two session shapes, which is the privilege
confusion `19` §7 exists to prevent.

`/ops` is unguessable-adjacent rather than secret. Security comes from the guard, never from
the path — but there is also no reason to advertise it.

## Capabilities

Platform capabilities (`19` §4), never org capabilities. `requirePlatform()`, never
`requireCapability()`.

| Action | Capability | Role |
|---|---|---|
| See the estate list | `platform.org.read` | staff · owner |
| Open one organisation | `platform.org.read` | staff · owner |
| Change a plan | `platform.plan.override` | staff · owner |
| Suspend an organisation | `platform.org.suspend` | **owner only** |
| Message the administrators | `platform.message.send` | staff · owner |
| See the analytics tab | `platform.analytics.read` | **owner only** — the tab is absent, not disabled, for staff |
| Suspend / reinstate an organisation | `platform.org.suspend` | **owner only** — the section is **absent** for staff since `DEC-104`, on the same rule as the row above |
| See the Enterprise request queue | `platform.enterprise.read` | **owner only** (`DEC-100`) |
| Work a request | `platform.enterprise.update` | **owner only** — a separate verb, so the queue could later be shown to somebody who may not work it |

## Data contract

| Purpose | Endpoint | Returns |
|---|---|---|
| Estate list | `GET /platform/orgs?tier=&status=&q=&page=` | `Page<PlatformOrgSummary>` |
| One organisation | `GET /platform/orgs/:id` | `PlatformOrgDetail` |
| Estate totals | `GET /platform/stats` | `PlatformStats` |
| Change plan | `POST /platform/orgs/:id/plan` | `{ tier, effectiveFrom }` |
| Suspend | `POST /platform/orgs/:id/suspend` | `{ status }` |
| Message | `POST /platform/orgs/:id/message` | `{ sentTo: number }` |

```ts
type PlatformOrgSummary = {
  id: string; name: string; slug: string; industry: string;
  tier: Tier; subscriptionStatus: string;
  seats: number; seatLimit: number | null;
  activeCampaigns: number;
  responsesLast30d: number;            // a COUNT. never a response
  lastActivityAt: string | null;       // MAX(created_at). never a body
  createdAt: string;
};
```

> **Every field above is a number, a name, a date or an enum.** That is INV-011 expressed as a
> type: there is no field on this contract that could carry feedback content, so no amount of
> UI carelessness downstream can render any. Adding one is a decision, not a convenience.

`PlatformOrgDetail` adds the unit/role/person/subject counts, the plan history, and the
administrators' names and emails — the last so that "contact them" has somebody to contact.

## State

| What | Where |
|---|---|
| Filters, search term, page | URL query params — an operator sends a colleague a link to *"the six trialing orgs that have collected nothing"* |
| The estate list | Fetched per query. No store: this data is stale the moment it is read and caching it invites acting on an old plan |
| The operator and their role | Store — it decides whether the revenue tab exists at all |

## Components

From `24-COMPONENT-INVENTORY.md`. Three are new and are added there first.

| Component | New? | Use |
|---|---|---|
| `<PageHeader>` `<StatCard>` `<ResponsiveTable>` `<EmptyState>` `<ConfirmDialog>` `<Toast>` | existing | as everywhere |
| `<OrgRow>` | **new** | One organisation in the estate list: name, tier chip, seats, activity, last-seen |
| `<PlanPicker>` | **new** | Tier selection with what each includes. Shared with `49`, which is why it is a component and not a page fragment |
| `<MessageComposer>` | **new** | Subject, body, recipient preview, and the send confirmation |

## Interactions

### The estate list — the default view

Sorted by **last activity, ascending**. The organisation that has gone quiet is the one
support needs to see, and a list sorted by name puts it wherever the alphabet happens to put
it. A newest-first sort would answer *"who signed up"*, which is `71`'s question.

Filters: tier, subscription status, industry, and a name search. Each is a URL param.

Two derived flags render as chips because they are the two support-worthy states and neither
is a column of its own:

| Chip | Rule |
|---|---|
| **Quiet** | No response in 30 days, and the org has collected before. *Never* shown for an org that has never collected — that is onboarding, not churn, and conflating them wastes a support conversation |
| **Over seats** | `seats > seatLimit` (`16` §6). The org still collects; it just cannot add people |

### Opening one organisation

Metadata, counts, plan history, and the administrator list. **No results, no responses, no
comments, and no link that could reach any.** If an operator wants to know why a number looks
wrong, the answer is a conversation — `19` §5 states the trade and why it is the right one.

### Changing a plan

`<PlanPicker>` → a confirm dialog naming the organisation, the old tier and the new one → a
`platform_audit_log` row.

Two rules the dialog states in words, both inherited from `16` §7 rather than invented here:

- **A downgrade retains data.** Surfaces stop resolving; nothing is deleted. The dialog says
  so, because an operator hesitating over a downgrade needs to know it is reversible.
- **A downgrade never stops collection.** A running campaign keeps running. Respondents did
  not choose the plan and must not be punished for it (`16` §6).

### Suspending an organisation

Owner-only, and the most destructive action on this screen: it stops the customer's staff
signing in. It requires typing the organisation's name to confirm — the same pattern `32` uses
for deleting a unit, for the same reason: a destructive action should cost a deliberate
sentence, not a reflex click.

**Suspension does not close campaigns and does not stop the respondent surface.** A QR code on
a wall keeps working. Punishing the customer's respondents for the customer's billing problem
is the same mistake `16` §6 already rules out.

**REINSTATING IS NOT SUSPENDING, AND THE GUARD BELONGS TO ONE OF THEM — `D-043`, 30 Aug.
FIXED 2026-08-31 (`T-103`).**
Reported as *"Reinstate is not working"*, and it does not: `confirmSuspend()` opens with
`if (!id || suspendConfirmText !== org.name) return;`, the reinstate path uses a plain
`<ConfirmDialog>` **with no name field**, so the typed text is `''`, never equals the name, and
the function **returns silently** — no request, no error, no toast, and the dialog stays open
looking like it is thinking. One handler serves both verbs and inherited the destructive one's
guard.

The typed-name confirmation is for **suspension**, which cuts a customer's staff out of their
own product. Reinstating is the *undo* and takes nothing away; a plain confirm is the whole of
what it needs.

**And the silent return is its own defect.** The suspend dialog already disables its confirm
button on the same condition, so on that path the early return is unreachable — it is the
*only* behaviour on the path with no input to satisfy it. A guard that refuses without saying so
is exactly how this stayed invisible; the button's `disabled` state is the guard, and the early
return is a backstop that must never be the thing a user meets.

**Not to be confused with "suspending suspends every organisation"**, reported at the same time.
That was checked and **not reproduced** — `N-067` records what was checked, so nobody re-reads
the middleware first. The likeliest reading is this same bug: nothing could be brought back, so
suspensions accumulated.

### The Enterprise queue  ·  **BUILT 2026-08-31 (`DEC-100`, `T-100`)**

A customer asking for Enterprise from `/app/plan` (`49` § Asking for Enterprise) opens an
`enterprise_requests` row. **Owner only**, and it appears on `/ops` above the estate list —
`<EnterpriseQueue>`, open first, oldest first, the same sort the estate list uses and for the
same reason: the row that has waited longest is the one that needs attention.

**A work item, not a notification.** The reflex answer to *"send a notif on the owner admin
account"* is a bell, and a bell is wrong here: what has to survive is not *somebody was told*
but *somebody has to ring this customer back*, and a notice that clears on read loses exactly
that. `open` → `contacted` → `closed` are things a person asserts; **opening the page changes
nothing.**

**Not `63-FEATURE-notifications.md`.** That placeholder is outbound multichannel delivery —
email, SMS, WhatsApp — it is P3, and `CONF-006` put it out of P1/P2 because it needs a provider,
retry semantics and `17`. **Nothing here needs a channel.** A row in a table the owner already
visits is not that document's scope, and blocking a two-table feature on an unwritten P3 spec
would repeat the sequencing mistake `CONF-021` recorded.

Granting the tier is still `platform.plan.override` on the org's own page — the queue tracks the
conversation, it does not perform the sale.

### Messaging the administrators  ·  **FIXED 2026-08-31 (`DEC-101`, `T-101`)**

The feature the user asked for by name — *"communicates with organisation's admins"*.

Recipients are **the administrators of that organisation**, resolved server-side from who holds
`org.update`, and shown to the operator before sending. Never a free-text address field: an
operator typing an address is an operator who can typo a customer's private plan details to a
stranger.

Delivery is a **platform message record plus an email**, and the record is what makes it a
support tool rather than a mailto link — the next operator can see the conversation. Message
bodies are stored and are visible in `platform_audit_log`.

> **This is a one-way channel in P2.** Replies go to a support address and do not thread back
> into the product. A full ticketing system is a different product; see § Out of scope.

**IT NEVER REACHED THE CUSTOMER — `DEC-101`, 30 Aug.** As built, `messageAdministrators` writes
one `platform_audit_log` row and returns `{ sentTo: 3 }`. **`platform_audit_log` is the
operator's own table.** The customer's administrators have no route that reads it and no screen
that renders it, and there is no mail transport, so **the operator is shown "Sent to 3
administrators" while nothing has been sent to anybody.** A confirmation for an action that did
not happen is worse than an unbuilt feature.

The service's reasoning — that delivery in P2 *is* the record — is right, and incomplete: a
record is only a delivery if the recipient can reach it. The same transaction now writes one
`notifications` row per recipient, and those rows surface in the customer's own inbox
(`58` § From Endur). No channel, no provider, no `17` dependency — one table and a tab.

**Recipients are resolved once and captured on the rows**, not re-resolved at read time, for the
reason `payments` captures `payer_name`: who held `org.update` when the message was sent is the
fact, and a grant changing later must not silently move somebody's mail.

## States

| State | Behaviour |
|---|---|
| Empty | *"No organisations match those filters."* An estate with zero organisations shows the seeding hint, not an error |
| Loading | The previous list dims and stays; the operator's context is not thrown away for a spinner (`46`'s range picker set this precedent) |
| Error | Inline, with the `requestId` visible and copyable — this operator is the one person who can go straight to `error-*.log` (`18` §6) |
| 401 | Redirect to `/ops/login`. **Never** to `/login` — sending an operator to the customer sign-in page is the confusion `19` §7 is built to avoid |
| 403 | `staff` reaching an owner-only action sees the reason, not a blank. **Owner-only affordances are ABSENT for staff — the revenue tab, the analytics tab, the suspend section, and the Enterprise queue.** ~~suspend renders disabled with a tooltip~~ — superseded by `DEC-104` |

**`DEC-104` — the rule this table now follows.** *A capability a role can never hold is absent.
An action it holds but cannot use right now is disabled, with the reason.* Owner directive:
*"staff is shown a disabled suspend and reinstate, just don't show it for staff."*

It makes this document agree with itself. § Capabilities already says the analytics tab is
*absent, not disabled* for staff, and § Acceptance insists that absence is **from the DOM, not
hidden by CSS**. The suspend button was the one affordance on the surface that disagreed — and a
permanently-greyed control teaches a support operator to distrust every greyed control they
meet, including the ones that mean *not right now*.

**The whole `<section>` goes, not just the button.** A card headed *"Suspend this organisation"*
containing an explanation and nothing actionable is worse than the button was.

**The server does not change.** § Acceptance already asserts the 403 from middleware, and that
assertion is what makes hiding the control a presentation decision rather than the rule
(`INV-003`).

## Acceptance

- [x] An org `user` principal reaching `/ops` is redirected to `/ops/login`, never served
      (`RequirePlatformAuth`; the org auth cookie carries no `endur.ops` session, so `/me`
      401s and the ops slice goes `anonymous`)
- [x] `staff` sees no revenue tab — **absent from the DOM**, not hidden by CSS (`OpsLayout`
      renders `Analytics`/`Logs` only when `useOpsCan()` says so)
- [x] `staff` attempting `POST /platform/orgs/:id/suspend` gets 403 from middleware — already
      true in `requirePlatform('platform.org.suspend')` (`T-059`). ~~the client additionally
      renders the control disabled with a tooltip rather than hiding it~~ **— superseded by
      `DEC-104`; the assertion below replaces it**
- [x] **`staff` sees no suspend section at all** — the heading, the copy and the button are
      absent from the DOM, asserted the same way the revenue tab is (`DEC-104`).
      `OrgDetail.test.tsx`, new at `T-103`
- [x] **Reinstate sends the request** (`D-043`, fixed 31 Aug). The assertion is that `opsPost`
      was CALLED, not on anything the screen says afterwards — a silent early return produces
      no request, no error and no toast, which is indistinguishable from a slow network, and a
      test written against the visible outcome would have been just as blind as the operator
- [ ] **Suspending one organisation leaves every other untouched** — asserted across two orgs,
      because it was reported and disproved by reading rather than by a test (`N-067`)
- [x] **`POST /platform/orgs/:id/message` writes one `notifications` row per recipient**, in the
      same transaction as the audit row, and `sentTo` equals the number of rows written — never
      the number of people found (`DEC-101`). **The test reads the message back through the
      CUSTOMER'S own session**: asserting the return value, or the audit row, would have passed
      throughout the bug, because `{ sentTo: 3 }` was true about a row nobody could reach
- [x] No response, answer or comment text is present in any payload this page consumes —
      `PlatformOrgSummary`/`PlatformOrgDetail` carry no such field (`T-059`'s contract,
      unchanged by this task)
- [x] "Quiet" never renders for an organisation that has never collected a response
      (`orgChips()` in `OrgRow.tsx` guards on `lastActivityAt !== null`)
- [x] A plan change writes one `platform_audit_log` row and is visible in `/platform/audit`
      (`overridePlan()`, `T-059`, unchanged)
- [x] Suspending an organisation leaves its live campaign answerable from a phone (`DEC-073`,
      enforced in `tenantResolver`, unchanged by this task)
- [x] Message recipients are resolved server-side; the client cannot supply an address
      (`<MessageComposer>` has no recipient field; `OrgMessage` DTO has nowhere to put one)
- [x] The four route trees each have their own error boundary; a crash here leaves `/app` and
      `/r` working (`OpsBoundary`, `router/index.tsx`)
- [x] `npm run audit:vocab` passes with `pages/platform/` excluded, and the exclusion is
      justified in the script's comment (`19` §12) — `components/platform/` carries the same
      exclusion, for the same reason (see `scripts/audit-vocab.mjs`)

## Design note

**This surface has no `design_specs` entry, and that is a real gap rather than an oversight to
paper over.** `design_specs/` is authoritative for visual design (`CLAUDE.md`), and inventing
colour, type or spacing here would breach `DEC-012` and fail `audit:drift`.

Until a spec exists, this page uses **only** existing tokens and existing component anatomy —
`<PageHeader>`, `<StatCard>`, `<ResponsiveTable>`, `<AmbientBackground>`, the glass surfaces
`/app` already carries (`.glass`, `.glass-lit`, `.topbar`/`.nav-public` pattern). **Superseded
by `DEC-078`:** this page no longer aims to look plainer than the customer console —
the owner asked for the two to match. What still holds is the reuse constraint: nothing here
invents a new colour, font or spacing token; every surface this reaches for is one `/app`
already uses.

## Out of scope

| Not building | Why |
|---|---|
| Reading a customer's responses, results or comments | INV-011. It is the product's central promise; there is no version of this that is acceptable |
| Impersonation / "log in as" | `19` §14. The most useful support feature and the most dangerous one |
| A ticketing system, threads, or an inbox for replies | A different product. One-way messaging plus a support address covers the actual need at this size |
| Editing a customer's data — units, people, templates | If an operator can fix it, the customer's administrator can fix it, and then only one of them can be wrong |
| Revenue figures | `71`. Owner-only, and a different question |
| Cross-org search of content | Would require the content access INV-011 forbids |
