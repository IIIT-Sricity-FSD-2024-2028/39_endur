# 70 — Page: platform console (Endur admin)

Phase: **P2** · Milestone: — · Owns: `src/frontend/pages/platform/Console/**`
Related: `19-PLATFORM-OPERATORS.md` (the model, the guards, INV-011), `71` (analytics), `16` (tiers)
Design ref: none yet — this surface has no `design_specs` entry; see § Design note

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

### Messaging the administrators

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

## States

| State | Behaviour |
|---|---|
| Empty | *"No organisations match those filters."* An estate with zero organisations shows the seeding hint, not an error |
| Loading | The previous list dims and stays; the operator's context is not thrown away for a spinner (`46`'s range picker set this precedent) |
| Error | Inline, with the `requestId` visible and copyable — this operator is the one person who can go straight to `error-*.log` (`18` §6) |
| 401 | Redirect to `/ops/login`. **Never** to `/login` — sending an operator to the customer sign-in page is the confusion `19` §7 is built to avoid |
| 403 | `staff` reaching an owner-only action sees the reason, not a blank. The revenue tab is absent for them; suspend renders disabled with a tooltip |

## Acceptance

- [ ] An org `user` principal reaching `/ops` is redirected to `/ops/login`, never served
- [ ] `staff` sees no revenue tab — **absent from the DOM**, not hidden by CSS
- [ ] `staff` attempting `POST /platform/orgs/:id/suspend` gets 403 from middleware
- [ ] No response, answer or comment text is present in any payload this page consumes,
      asserted field by field against `PlatformOrgSummary` and `PlatformOrgDetail`
- [ ] "Quiet" never renders for an organisation that has never collected a response
- [ ] A plan change writes one `platform_audit_log` row and is visible in `/platform/audit`
- [ ] Suspending an organisation leaves its live campaign answerable from a phone
- [ ] Message recipients are resolved server-side; the client cannot supply an address
- [ ] The four route trees each have their own error boundary; a crash here leaves `/app` and
      `/r` working
- [ ] `npm run audit:vocab` passes with `pages/platform/` excluded, and the exclusion is
      justified in the script's comment (`19` §12)

## Design note

**This surface has no `design_specs` entry, and that is a real gap rather than an oversight to
paper over.** `design_specs/` is authoritative for visual design (`CLAUDE.md`), and inventing
colour, type or spacing here would breach `DEC-012` and fail `audit:drift`.

Until a spec exists, this page uses **only** existing tokens and existing component anatomy —
`<PageHeader>`, `<StatCard>`, `<ResponsiveTable>`, the base `organic.css` classes. It should
look plainer than the customer console, and that is appropriate: it is an internal tool, and
the personality of the product belongs on the customer's side of it.

## Out of scope

| Not building | Why |
|---|---|
| Reading a customer's responses, results or comments | INV-011. It is the product's central promise; there is no version of this that is acceptable |
| Impersonation / "log in as" | `19` §14. The most useful support feature and the most dangerous one |
| A ticketing system, threads, or an inbox for replies | A different product. One-way messaging plus a support address covers the actual need at this size |
| Editing a customer's data — units, people, templates | If an operator can fix it, the customer's administrator can fix it, and then only one of them can be wrong |
| Revenue figures | `71`. Owner-only, and a different question |
| Cross-org search of content | Would require the content access INV-011 forbids |
