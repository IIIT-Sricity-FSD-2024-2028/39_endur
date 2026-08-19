# 38 — Campaigns and sharing

Phase: P2 · Milestone: **M0** · Design ref: `design_specs/design/06-PAGE-CAMPAIGNS-AND-SHARING.md`

## Purpose

A campaign is a form + subjects + an audience + a window. Creating one is three steps; the
third ends in **the share sheet**, which is the demo's decisive artifact.

`design_specs/design/09` §2.16 calls the share sheet the highest-risk component in the build.
**Write it on 22 Aug, not 26 Aug** (`02` §2).

## Route & access

`/app/campaigns` list · `/app/campaigns/new` create · `/app/campaigns/:id` detail + share ·
`/app/campaigns/:id/results` results (`40`) — console world.

## Capabilities

| Action | Capability |
|---|---|
| List / view | `campaign.read` |
| Create | `campaign.create` |
| Edit (draft only) | `campaign.update` |
| Launch | `campaign.launch` |
| Close | `campaign.close` |
| Delete (draft only) | `campaign.delete` |

Campaign lists and the subject picker are scope-filtered by the API (INV-003) — a head of
department creating a campaign sees only their own unit's subjects.

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| List | `GET /api/v1/campaigns?cursor&status` | → paginated `CampaignSummary[]` |
| Detail | `GET /api/v1/campaigns/:id` | → `CampaignDetail` |
| Create | `POST /api/v1/campaigns` | `CreateCampaignBody` (`14` §1) |
| Update | `PATCH /api/v1/campaigns/:id` | draft only; `409` otherwise |
| Audience preview | `GET /api/v1/campaigns/:id/audience` | → `{ estimatedCount, sample[] }` |
| Launch | `POST /api/v1/campaigns/:id/launch` | → `{ publicToken, url }`. **Idempotent** |
| Close | `POST /api/v1/campaigns/:id/close` | — |

`audience_rule` shape:

```ts
export const AudienceRule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('anyone') }),                                 // link/QR — the default
  z.object({ kind: z.literal('unit'), unitId: z.string().uuid(),
             includeSubtree: z.boolean().default(true) }),
  z.object({ kind: z.literal('role'), roleId: z.string().uuid() }),
]);
```

**Launch mints `public_token` and is irreversible.** It is idempotent by key (`13` §7) — a
double-click on stage must not create two links, because the QR already on screen would then
point at the wrong one.

<<<<<<< HEAD
`anonymous` is immutable once the campaign leaves draft, enforced by a database trigger
=======
Status is **derived on read** from `closed_at` / `public_token` / `starts_at` / `ends_at`
(`DEC-016`). There is no stored status column and nothing on a timer: a campaign is open
because the clock says so. `Cancel schedule` therefore clears `starts_at` rather than moving
a state machine backwards.

`anonymous` is immutable once the campaign leaves draft — which is exactly "a token has been
minted" — enforced by a database trigger
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
(`10` §4.3). Respondents were promised anonymity at submission time.

## State

Local. The three-step creation flow holds one draft object, committed on Launch — the same
pattern as the wizard (`31`), so the pattern is learned once.

The audience count is fetched on every rule change, debounced 300 ms.

## Components

`<ProgressRail>` · `<UnitTree>` in `mode="select"` · `<ResponsiveTable>` ·
**`<ShareSheet>`** · `<Toggle>` · `<ConfirmDialog>` · `<EmptyState>` · `<StatCard>`.

## Interactions — creation

**Step 1 · Form.** Pick a template; the campaign name auto-fills as
`{Template name} — {current month}`. Editable, and pre-filling removes a typing beat from the
live demo.

**Step 2 · Who.** Two genuinely different questions, and this is where the generic model does
real work.

*What is being reviewed* — the subject picker, scope-filtered.
*Who can respond* — the audience rule. **"Anyone with the link" is the default**, because it
is the demo path and respondents never log in (DEC-009).

The **live audience count** recomputes on every change. It is the visible proof that the org
graph is real and not decorative — a number that moves when you change a dropdown is worth
more than a paragraph claiming the hierarchy is wired up.

**Step 3 · When.** Open and close datetimes, anonymity toggle with the honest one-liner, and a
summary card restating everything in one sentence before the irreversible action.

The primary button uses the org's own word: `Launch {campaign.one}` — never "Submit" or
"Finish".

**Launching opens the share sheet immediately.** No intermediate success page. The QR should
be on screen within one second of the click.

## The share sheet — the demo moment

Non-negotiable requirements, all from `design_specs/design/06` §6.3:

1. **QR at 280px minimum, error-correction level M, pure dark on pure white.** Do not tint it,
   do not put a logo in the middle, do not round the modules. A stylised QR that fails on one
   evaluator's phone loses the demo outright.
2. **A 24px white quiet zone.** The single most common cause of scan failure.
3. **A short, readable URL.** A 6-character token, not a UUID. Someone at the back will type
   it instead of scanning.
4. **`Full` opens a full-screen presentation view** — QR at 60vh, centred on white. This is
   what goes on the projector. `Esc` exits.
5. **Copy link gives feedback in place** — the label swaps to `Copied` for 1.5s. No toast; the
   dialog is already the focus.

The QR renders locally on canvas. **No external image service** — it would fail exactly when
the network does.

The sheet is reachable forever from the campaign card's `Share`. It is never one-time-only.

**`PUBLIC_BASE_URL` must not be `localhost`** or the code does not scan from a phone
(OPEN-002, decide by 24 Aug).

## States

| State | Behaviour |
|---|---|
| Empty | `<EmptyState>` + `Create a {campaign}` |
| Loading | Skeleton cards |
| Error on launch | Inline above the button; the draft is preserved and no token is minted |
| 403 | Launch button absent without `campaign.launch`; the list still renders |
| Draft | Editable, no token, no reachable URL |
| Scheduled | Locked, countdown shown, `Cancel schedule` available |
| Open | Read-only except close; Share and Results available |
| Closed | Read-only; Results available; Share shows the closed state |

## Acceptance

- [ ] The audience count recomputes live and matches the org graph
- [ ] A draft has no `public_token` and no reachable `/r/` URL
- [ ] A double-clicked launch produces one token
- [ ] The share sheet appears within one second of launch
- [ ] The QR is ≥ 280px, untinted, with a quiet zone, and scans on **two different phones**
<<<<<<< HEAD
- [ ] The URL token is 6 characters and typeable aloud
=======
- [ ] The URL token is 8 characters from an unambiguous alphabet and typeable aloud (DEC-017)
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
- [ ] Presentation mode fills the screen and exits on `Esc`
- [ ] `anonymous` cannot change after launch — trigger test
- [ ] A campaign cannot be edited once open; the attempt returns 409
- [ ] The share sheet is reachable again from the campaign card
- [ ] `PUBLIC_BASE_URL` is verified non-localhost before the demo
- [ ] Every noun from `useLabels()`, including the launch button (INV-001)
- [ ] Works at 390px

## Out of scope

| Not building | Why |
|---|---|
| Email / SMS / WhatsApp delivery | P3. Link + QR proves the collection model |
| Recurring campaigns | Real value, P3. Each occurrence is a campaign; the scheduler is the work |
| Reminders to non-responders | Requires knowing who responded — impossible under anonymity for open links (`15` §3) |
| Per-subject links | One campaign, one link. Per-subject links multiply the QR problem by N |
| Editing a live campaign | Invalidates collected responses |
