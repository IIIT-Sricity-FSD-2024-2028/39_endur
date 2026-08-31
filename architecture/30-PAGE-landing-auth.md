# 30 — Landing, sign in, create organization

Phase: P1 · Milestone: **M0** · Design ref: `design_specs/design/03-PAGE-AUTH-AND-SETUP-WIZARD.md` §3.1–3.3

## Purpose

The three public screens. Landing exists to explain the product to someone who arrived from
a template search; sign in gets staff into the console; create-organization is the entry to
the setup wizard, which is the demo's centrepiece. None of them is impressive on its own —
their job is to be fast and to never be the reason a demo stalls.

## Route & access

| Route | World | Access |
|---|---|---|
| `/` | Public | Anyone. Redirects to `/app` if a session exists |
| `/login` | Public | Anyone |
| `/start` | Public | Anyone |

Public shell: brand, two links, one button. No sidebar, no vocabulary chips — there is no org
yet, so there are no labels to show.

## Capabilities

None. These are the only console-adjacent screens with no capability check.

## Data contract

| Action | Endpoint | DTO in | DTO out |
|---|---|---|---|
| Sign in | `POST /api/v1/auth/login` | `LoginBody { email, password, orgId? }` | `{ ok: true }` + `Set-Cookie: endur.sid`, `endur.csrf` |
| Boot session | `GET /api/v1/auth/me` | — | `MeResponse { user, organization, labels, capabilities }` |
| Where to land | `GET /api/v1/home` | — | `HomeView`, read for `configured` only |
| Create org | `POST /api/v1/auth/register` | `RegisterBody { orgName, name, email, password, tier }` | `{ organization: { id, slug } }` + `Set-Cookie` |

**Amended 2026-08-19 (T-031), against what shipped.** Three corrections:

1. Neither `/login` nor `/register` returns the user and org. Both answer minimally and
   `/auth/me` is the single source for a session — a second, slightly different copy in the
   login response is how the two drift. One extra round trip buys one definition.
2. `GET /org/presets` is **not** called here and could not be: it sits behind
   `authenticate` + `requireCapability('org.read')`, and nobody on `/start` has a session.
   The industry picker moved to wizard step 1 — see § Create organization and `CONF-011`.
3. `GET /home` is read after sign-in for one boolean. See § Interactions.

`POST /register` is atomic — org, owner, preset seed, subscription, audit, one transaction
(`15` §5). A half-seeded org has no roles, so nobody can do anything, which looks exactly
like a broken product.

> **The word `subscription` in that sentence was aspirational until 2026-08-24 (`T-088`).**
> `register` wrote every other row in that list and not that one, so every organisation ever
> created had no `subscriptions` row, fell through `requireEntitlement`'s bronze backstop, and
> was silently on the lowest tier — `D-012`, and the reason two whole pages `402`'d for
> everybody. It is true now, and `tier` in the DTO above is what makes it true.

## State

Local component state for all three forms. `authSlice` is written only on success
(`23` §2). **No credential is handled by the client** — the server sets an `httpOnly` cookie
(DEC-014), so there is nothing for these pages to store.

After `/register` succeeds, redirect straight to `/app/setup` with the chosen industry
preselected — do not make the user pick it twice.

## Components

`<EmptyState>` is not used here. Forms are `.field` + `.input` + `.btn` from the base layer;
no wrapper components (`24` §1).

## Interactions

**Landing.** One hero, one sentence, one primary action to `/start`, one secondary to
`/login`. `[M0 · thin]` — this is **first on the cut-list** and a redirect to `/login` is an
acceptable shipped state (`02` §2).

Plus the vocabulary switcher from `design_specs/design/03` §3.1, which is the one thing here
that is not filler: four segments, and the noun row cross-fades to that industry's
vocabulary. It auto-advances every 3.5s until the first click and then stops for good — a
control that keeps moving after you have used it reads as a bug on a projector — and it does
not auto-advance at all under `prefers-reduced-motion` (WCAG 2.2.2).

The nouns come from `PRESET_VOCABULARIES` in `packages/shared`, not from JSX. There is no
organisation on `/`, so `useLabels()` has nothing to resolve; writing the words into the
component would break INV-001 and `audit:vocab` fails the build for it. In `shared` they are
what they actually are — advertising copy about the presets — and
`src/backend/test/vocabularies.test.ts` asserts they still match the presets they advertise.
See `CONF-011` and `DRIFT-007`.

**Which organization?** — `DEC-049`, and it is the narrowest question the product asks. If the
address and password open **more than one** organisation the server answers `409
ACCOUNT_AMBIGUOUS` naming them, and the card swaps its form for one button per organisation.
Pressing one re-posts the same credentials plus `orgId`; **nothing is retyped**, because the
password never left component state. `Back` returns to the filled-in form.

It is not an error and is never bannered — the credentials were right. It requires an activated
account in several organisations **and** the same password for them, so a person with one
account never sees it, a person using different passwords never sees it, and no seeded
organisation shares an address, so the demo never sees it.

**Sign in.** Email + password, one submit. On success: `GET /auth/me` hydrates `authSlice`
and `vocabularySlice`, then `GET /home` is read for `configured` and decides the target —
`/app`, or `/app/setup` when the org is not set up yet, because an unconfigured org's
console is empty and confusing. If `/home` fails, land on `/app` anyway: a sparse dashboard
beats a sign-in that appears to hang.

A pending deep link (`location.state.from`, set by `RequireSession`) is honoured **only**
when the org is configured. Sending someone back to a page that cannot render yet is worse
than losing their place.

**No demo affordance.** `design_specs/design/03` §3.2 specifies prefilled credentials for the
seeded orgs behind a build-time production check. It was built, and it was **removed on
2026-08-31** — `OPEN-006`(a). A control that only ever renders in the team's own build is a
second sign-in path to keep working for no user, and this page is now the form and nothing
else. The seeded organisations still exist and are still signed into by typing the address.
Do not reintroduce the prefill; §3.2 is superseded on this point.

**Create organization.** Org name, owner name, work email, password. **Four fields, no
industry picker** (`CONF-011`, amended 2026-08-19): asking here means asking blind, and the
wizard's step 1 — which shows each preset's role chain and vocabulary pair, and is the
demo's centrepiece — asks the same question better a moment later. `RegisterBody.industry`
defaults to `custom` and step 1 overwrites it, so the wire shape is unchanged.

**Then one more step: the plan.** Added 2026-08-24 by `DEC-048` and specified in `49`
§ Interactions — `<PlanPicker mode="signup">`, three cards, Bronze / Silver / Gold, and the
one pressed is the tier the organisation is on. Nothing is pre-selected, there is no skip,
and there is no trial. Enterprise is shown nowhere on this page: `16` §4 prices it
individually, so it is operator-assigned (`19` §4).

**Two steps, one POST**, and that is the load-bearing part. The tier is a field on
`RegisterBody`, so the organisation and its subscription are written in the same transaction
and an organisation cannot exist without a tier somebody chose. Asking on a second page after
the account already existed would recreate `D-012` exactly — a live organisation with no row,
silently bronze, for as long as it takes them to answer.

It asks about the tier and does not ask about the industry, which is only inconsistent from
the outside: **the wizard asks about industry later and nothing asks about the tier later.**
Each question is asked exactly once, in the place where it can be answered well.

Every error this POST can return names a field on step 1 — `409` the address, `422` a field —
so a failure returns to step 1 with the tier still selected. Left on the plan step, the person
would read *"that address is already registered"* beside three tier cards with no input in
sight.

The password helper states **ten** characters, from a single const mirroring the DTO.
`design_specs/design/03` §3.3 says eight; that is stale copy quoting a contract value, and
architecture owns contracts (`CONF-012`).

## States

| State | Behaviour |
|---|---|
| Empty | N/A |
| Loading | Submit disables with an inline spinner; the label does not change |
| Error — bad credentials | One line above the form: *"That email and password don't match."* Identical for unknown email and wrong password (`15` §2) |
| Error — rate limited | *"Too many attempts. Try again in a few minutes."* with the `Retry-After` value |
| Error — validation | Inline, per field, from the 422 `details.fields[]` (`14` §6) |
| Error — email taken | On `/start`, inline on the email field with a link to `/login` |
| 403 | N/A |

Errors appear where the problem is, never in a toast (`design_specs/design/10` §4).

## Acceptance

- [x] A signed-in user hitting `/` or `/login` is redirected to `/app` without a flash
- [x] Unknown email and wrong password produce identical bodies and comparable timing
- [x] Login is rate limited per IP **and** per email (`12` §4.11)
- [x] A failed registration leaves no organisation behind — forced-failure test
      (`src/backend/test/register-rollback.test.ts`; the failure is a real slug collision,
      not an injected one — `uniqueSlug()` runs outside the transaction, see `D-006`)
- [x] Registration lands on `/app/setup` — nothing to preselect, step 1 asks (`CONF-011`)
- [x] Signing in to an unconfigured org lands on `/app/setup`, not an empty console
- [x] Demo credentials cannot render in a production build
- [x] Password minimum 10 characters, enforced server-side and mirrored client-side
- [x] The vocabulary switcher reads every noun from shared preset data, and a renamed
      preset fails a test rather than shipping a landing page that promises the old word
- [x] Login sets an `httpOnly` session cookie and **regenerates the session id** (fixation)
- [x] No token appears in any response body, `localStorage`, or the store
- [ ] Works at 390px
- [x] Keyboard: tab order follows visual order, `Enter` submits, focus ring visible

## Out of scope

| Not building | Why |
|---|---|
| Password reset, email verification | P2. Auth surface stays small while middleware is graded (`15` §5) |
| Token / refresh handling | There is none — cookie sessions (DEC-014) |
| SSO | Enterprise, P3 |
| "Remember me" | The rolling session already does this (`15` §2) |
| Social login | No demand, and it complicates the tenancy model |
| A marketing site | Landing is thin and first on the cut-list |
