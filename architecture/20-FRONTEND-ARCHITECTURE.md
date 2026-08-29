# 20 — Frontend architecture

Phase: P2 · Milestone: **M0 (in full)** · Owns: `src/frontend/main.tsx`, `router/**`, `lib/api.ts`
Design ref: `design_specs/design/02-IA-AND-NAVIGATION.md`
Decisions: `_MEMORY.md` DEC-003, DEC-013, DEC-014, DEC-015

---

## 1. The four worlds

Endur has four distinct surfaces. They do not share a shell, and confusing them is the
fastest way to a muddled product.

| World | Who | Auth | Shell |
|---|---|---|---|
| **Public** | Anyone | None | Marketing nav — brand, two links, one button |
| **Console** | Staff | Cookie session | Sidebar + top bar |
| **Respond** | Anyone with a token link | **None, ever** | No chrome at all — just the form |
| **Ops** | Platform operators | **Separate** cookie, separate login (19 §4) | Operator chrome — never the tenant's |

The respondent world having no account and no navigation is both a simplification and the
right design: a hotel guest scanning a QR on a table card must never see a login screen
(DEC-009).

**Ops was the fourth world from `DEC-033` onward** and this section said three until
29 Aug. It is listed here rather than treated as a corner of the console because the
separation is the point: a different cookie, a different login, and an operator who reads
counts and never content (INV-011). A `/ops` page rendered inside `ConsoleLayout` would put
a tenant's sidebar around platform data, which is the exact confusion the split prevents.

**Architecturally this means four route trees with four layout components**, not one shell
with conditional rendering. A shell that renders differently for four audiences accumulates
conditionals until nobody can say what a respondent actually sees — which is a privacy risk,
not only a code-quality one.

`router/routes.test.tsx` guards this by counting the trees rather than asserting a literal,
so a fifth world cannot be added without its own boundary and its own layout — and cannot
break the test merely by existing.

## 2. Routes

Mirrors `design_specs/design/02` §2. `[M0]` must work by 26 Aug.

```
PUBLIC
  /                          Landing                          [M0 · thin]
  /login                     Sign in                          [M0]
  /start                     Create organization              [M0]
  /activate/:token           Accept an invitation             [P2]

CONSOLE  (/app, requires session)
  /app                       Organization home                [M0]
  /app/setup                 Setup wizard, 5 steps            [M0]
  /app/structure             Unit tree                        [M0]
  /app/roles                 Roles, levels & the powers grid  [P2 · built T-052]
  /app/people                People                           [P2]
  /app/people/:id            Person detail                    [P2]
  /app/subjects              Subjects                         [M0]
  /app/subjects/:id          Subject detail                   [P2]
  /app/templates             Template library                 [M0]
  /app/templates/:id         Template preview → clone         [M0]
  /app/forms/:id/build       Form builder                     [M0]
  /app/forms/:id/preview     Preview as respondent            [M0]
  /app/campaigns             Campaign list                    [M0]
  /app/campaigns/new         Create campaign, 3 steps         [M0]
  /app/campaigns/:id         Campaign detail + share + QR     [M0]
  /app/campaigns/:id/results Results                          [M0]
  /app/profile               My account                       [P2]
  /app/simulator             Permission simulator             [P2]
  /app/settings              Org profile, vocabulary, danger  [P2]
  /app/plan                  Plan & billing, `billing.read`   [P2]
  /app/logs                  Activity log                     [P2 · built T-076]
  /app/inbox                 Response inbox                   [P2 · built T-080]

  /app/analysis              Analysis dashboard               [P2 · built T-082]
  /app/reflect               Self-reflection & gap analysis   [P2 · built T-084]
  /app/communities           Communities                      [P3 · disabled]

RESPOND  (no auth, no shell)
  /r/:token                  Fill the form                    [M0]
  /r/:token/done             Thank you                        [M0]

OPS  (/ops, SEPARATE login, SEPARATE cookie — 19 §4, INV-011)
  /ops/login                 Operator sign in                 [P2]
  /ops                       Estate console                   [P2]
  /ops/orgs/:id              One tenant — counts, never content [P2]
  /ops/analytics             Tier mix, movement, quiet orgs   [P2]
  /ops/earnings              Revenue by tier                  [P2]
  /ops/logs                  Log files                        [P2]
```

**`/app/plan`, `/activate/:token`, `/ops/orgs/:id` and `/ops/earnings` were live and unmapped
until 29 Aug** — the same gap this section already records for `/app/logs`. All four are now
in `routes.test.tsx`, which is what stops the map and the router drifting again.

**`/app/logs` was missing from this map and `56` has owned it since 23 Aug** — the doc's
§ Route & access names the route, the `system` group, the position under Settings and the
`audit.read` gate. A route in a page doc and not in this list is the same class of gap that
`46` and `58` were: nobody notices until somebody asks why they cannot see it.

**Three items changed phase and one gained a tree, 24 Aug (`CONF-021`).** Inbox, Analysis and
Reflect are no longer `P3`: `58` was written as `P2`, and `43` and `44` were re-tagged
buildable by `CONF-019`. They keep `disabled` only until their pages land — that is `T-085`
and it is per-page, not one flip.

**`/ops` is a FOURTH tree and it is deliberately unreachable from the console.** No link
anywhere in `/app` points at it, no shared session, no shared cookie. An operator is a
different principal kind (`DEC-033`), not a bigger grant, and `INV-011` says the platform side
can read aggregates and never answers. `T-059` is what makes the door exist; `70`, `71` and
`72` are the three rooms behind it.

**P3 routes are listed so the sidebar can show them disabled with a "Soon" tag.** Rules from
`design_specs/design/02` §7: disabled items never navigate, always carry the tag, and hovering
shows one line of what the screen will do. **Do not build a stub page behind them** — a dead
link is worse than a disabled item.

**An item whose page the caller cannot use is ABSENT, not empty.** `navItems.ts` gives each
item a `needs` capability and hides it when the caller does not hold one —
`design_specs/design/02` §5's rule, and it is usability rather than enforcement: `13` and
INV-003 mean the API returns nothing either way.

**That rule was only half true until 24 Aug, and `D-027` was the gap — now repaid.** `needs`
named a bare capability and `authz/held.ts` discarded scope, so a capability counted as held
when *any* live allow existed. `person.read: self`, the **universal** grant every role
receives (`50` §1), therefore satisfied `People`'s gate for every account in the product, and
the page rendered exactly one row: the reader.

`T-086` (`DEC-050`) made `MeResponse.capabilities` a **map of capability → widest held
scope**, and `T-087` (`DEC-051`) spent it: `NavItem.minScope` says how far `needs` has to
reach before an item is worth showing. Two gates changed — People to `person.read` at
`own_unit`, Settings to `org.update` — and the seeded matrix was not touched. The rest of the
L3 row is `OPEN-010`, deferred by the owner. See `55` § Stage 8.

React Router v6, `createBrowserRouter`. Each world is a layout route with its own error
boundary, so a crash in the console cannot take down the respondent flow.

**A boundary must also handle the failure that route-level code splitting creates.** Every
page here is lazy, so the browser fetches a route's chunk at **click time** — long after the
document loaded. If the module graph moved underneath the tab in the meantime, the running
app keeps working and the *next* lazy route is what dies. `DEC-054` is the rule: that class of
error says **the app updated**, and its only remedy is a **full document load**, never a
client-side `<Link>` — a router link re-renders inside the same dead graph and fails the same
way. `ConsoleBoundary` has always done this; `PublicBoundary` had not, and `/login` is the
most-navigated lazy route in the product. **Built 2026-08-24, `T-089`**, repaying `D-029`.

## 3. Layout

```
src/frontend/
  main.tsx
  router/
    index.tsx            createBrowserRouter, the three trees
    guards.tsx           <RequireSession>, <RequireCapability>
  design-system/         tokens.css organic.css endur.css        (21)
  components/
    layout/   AppShell Sidebar TopBar PageHeader VocabularyChips
    data/     StatCard BarRow StackedBar ScoreBadge TrendChip ResponsiveTable
    org/      UnitTree RoleRow PersonChip PowersGrid
    form/     QuestionCard QuestionEditor/* QuestionInput/* Toggle
    feedback/ EmptyState Toast ConfirmDialog ShareSheet ProgressRail
  pages/
    public/   Landing Login Start
    console/  Home Setup Structure Roles People Subjects Templates
              Builder Campaigns CampaignNew CampaignDetail Results
              Profile Simulator Settings
    respond/  Fill Done States
  store/                 thin in P1-P2                            (23)
  lib/
    api.ts               typed fetch wrapper
    labels.ts            useLabels()                              (22)
    capabilities.ts      useCan()
    format.ts
```

Page folders, not page files. A page is `Campaigns/index.tsx` plus its local pieces, so
components used by exactly one page do not pollute the shared inventory.

## 4. Data layer — P1/P2

**No RTK Query yet** (DEC-008). Server data is fetched with a typed wrapper over `fetch`,
and pages own their loading state.

```ts
// src/frontend/lib/api.ts
export async function apiGet<T>(path: string, init?: RequestInit): Promise<T>;
export async function apiPost<TIn, TOut>(path: string, body: TIn): Promise<TOut>;
```

The wrapper handles: base URL, `credentials: 'include'` so the session cookie rides along,
the `X-CSRF-Token` header on unsafe methods (`12` §4.8), `X-Request-Id`, JSON
encode/decode, and turning an error envelope into a typed `ApiError` carrying `code`,
`message`, `details` and `requestId`.

There is **no token to manage and no refresh dance** (DEC-014) — a 401 simply means the
session is gone, so route to `/login`.

Types come from `@endur/shared` (DEC-003) — never re-declared locally. A DTO change breaks the
client at compile time, which is the entire reason for the shared package.

Fetching lives in a small per-page hook (`useCampaigns()`, `useTemplate(id)`) so that P3's
migration to RTK Query changes those hooks' internals and nothing else. **This is the seam
that makes P3 additive rather than a rewrite** (`23`).

Deliberately not adding React Query as an interim step: it would be replaced in six weeks by
the thing that is actually being graded.

## 5. Session

`authSlice` holds `{ status, user, org, capabilities }`. **There is no credential in the
client at all** — the session is an `httpOnly` cookie the browser manages (`15` §2), so there
is nothing to store, nothing to leak to devtools, and nothing to persist by accident.

Boot sequence: `GET /auth/me` → hydrate `authSlice` and `vocabularySlice` → render. One call.
Until it resolves, the console renders a full-page loading state rather than flashing a login
screen at an already-signed-in user.

The CSRF token is a readable cookie (`endur.csrf`), read on demand by `lib/api.ts`. It is not
a secret — it only has to be unguessable by another origin — so it does not belong in the
store either.

## 6. Capability-aware UI

```tsx
const can = useCan();
{can('campaign.launch') && <Button primary>Launch</Button>}
```

Backed by the capability set from `/auth/me` (`13` §3).

**`can()` takes a minimum scope** (`DEC-050`, `T-086`). It defaults to `self`, so the call
above means exactly what it always meant — held somewhere, at any width:

```tsx
can('person.read')              // held at all — TRUE FOR EVERY ACCOUNT, see below
can('person.read', 'own_unit')  // reaches past themselves
```

The default is the common case: most gates guard a button on a page the caller already
reached, where "holds it somewhere" is the right question. The wider form exists for gates
that decide whether a **whole page** is worth offering, where it is the only right question:
`person.read: self` is seeded to every role so `/app/profile` opens (`50` §1), so the bare
verb showed everybody a People page listing one person — themselves (`D-027`).

What it cannot answer is anything about a **specific** thing. The map carries the widest
scope of any live allow and nothing about which units; `can(x, 'own_unit')` means "somewhere",
not "here". A question about a particular row is the server's to answer.

> **This is usability, never enforcement** (INV-003). The API returns only what the caller may
> see and rejects what they may not do. A wrong capability set causes a confusing button, not
> a security hole.

The corollary from `design_specs/design/02` §5: **out-of-scope data is absent, not greyed
out.** No "you don't have permission" ghosts in lists. The single exception is a
directly-navigated URL, which gets a full-page 403 state.

## 7. Responsive

Breakpoints and layout widths are in `design_specs/design/01` §8. Architectural consequences:

- **`<ResponsiveTable>` is built once**, taking a column config. There are four tables in the
  app; implementing the table→card collapse four times is exactly where the mobile experience
  rots (`design_specs/design/09` §3.1).
- **The respondent flow is authored phone-first**, desktop second. On demo day every
  respondent is on a phone.
- The sidebar becomes a drawer below 640px; the org switcher stays in the top bar because it
  is the second most important control in the demo.

## 8. Performance

Modest and specific — this is an admin tool, not a landing page.

- Route-level code splitting per world. The respondent bundle must not include the console:
  it is loaded on a phone, on a venue network, by someone with no patience.

  **Splitting the pages is not enough, and T-039 found that out by measuring rather than by
  reading.** `router/index.tsx` imports `router/layouts.tsx` statically — it must, the three
  layouts are route elements — and `layouts.tsx` imported `<AppShell>` statically, so the
  sidebar, the top bar and `<Icon>`'s whole glyph set sat in the entry chunk that every route
  downloads. `<AppShell>` is lazy now. `src/frontend/pages/respond/bundle.test.ts` walks the
  static import graph out of both respondent pages *and* out of `main.tsx` and fails on
  console code, on the store, or on a new dependency; the second half is the one that caught
  this. `N-040` carries the measurements.

  **Still true and not fixed there:** `main.tsx` wraps all three worlds in one `<Provider>`,
  so the store and its dependencies are in the entry chunk a respondent downloads. Moving the
  provider into the console layout is a decision for this doc and `23` §2, not for a page
  task.
- Self-hosted fonts in `public/fonts` (`design_specs/design/01` §2). A venue that blocks
  `fonts.googleapis.com` would otherwise drop the whole product to system-ui mid-demo.
- The QR canvas renders locally. No external image service — it would fail exactly when the
  network does.
- No virtualisation. Lists are scoped and paginated; a department has tens of people.

## 9. Acceptance

- [ ] Three route trees with three layouts and three error boundaries
- [ ] The respondent bundle contains no console code — verified by bundle analysis
- [ ] A signed-in user reloading `/app/campaigns` never sees a login flash
- [ ] A 401 routes cleanly to `/login`; there is no token or refresh logic anywhere
- [ ] No credential is readable from JavaScript
- [ ] P3 routes render disabled with a "Soon" tag and no stub page behind them
- [ ] Every page's server data flows through a `use*` hook, not a bare `fetch` in a component
- [ ] No API response type is declared in `src/frontend` — all come from `@endur/shared`
- [ ] Fonts load from `public/fonts` with the network offline
- [ ] The app is usable end to end at 390px

## 10. Out of scope

| Not doing | Why |
|---|---|
| SSR / Next.js | An authed admin tool. SSR buys nothing and complicates the token model |
| A component library | `design_specs` specifies its own system; a library would fight it and hide the design work being graded |
| React Query as an interim | Replaced by the graded thing in six weeks (`23`) |
| i18n | The vocabulary system is per-org terminology, which is a different problem. Real i18n is post-P3 |
| Dark mode | Explicitly out (`design_specs/design/01` §10) |
| Offline support | P3 at the earliest, and only for the respondent flow |
