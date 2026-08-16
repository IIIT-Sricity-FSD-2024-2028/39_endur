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
| Sign in | `POST /api/v1/auth/login` | `LoginBody { email, password }` | `{ accessToken, user, org }` |
| Boot session | `POST /api/v1/auth/refresh` → `GET /api/v1/auth/me` | — | `MeResponse { user, org, labels, capabilities }` |
| Create org | `POST /api/v1/auth/register` | `RegisterBody { orgName, industry, name, email, password }` | `{ accessToken, user, org }` |
| Preset list | `GET /api/v1/org/presets` | — | `Preset[]` |

`POST /register` is atomic — org, owner, preset seed, subscription, audit, one transaction
(`15` §5). A half-seeded org has no roles, so nobody can do anything, which looks exactly
like a broken product.

## State

Local component state for all three forms. `authSlice` is written only on success
(`23` §2). The access token goes to the module variable in `lib/api.ts`, never the store.

After `/register` succeeds, redirect straight to `/app/setup` with the chosen industry
preselected — do not make the user pick it twice.

## Components

`<EmptyState>` is not used here. Forms are `.field` + `.input` + `.btn` from the base layer;
no wrapper components (`24` §1).

## Interactions

**Landing.** One hero, one sentence, one primary action to `/start`, one secondary to
`/login`. `[M0 · thin]` — this is **first on the cut-list** and a redirect to `/login` is an
acceptable shipped state (`02` §2).

**Sign in.** Email + password, one submit. On success: hydrate `authSlice` and
`vocabularySlice`, then route to `/app` — or to `/app/setup` if the org has no roles yet,
because an unconfigured org's console is empty and confusing.

A **demo affordance** is specified in `design_specs/design/03` §3.2: prefilled credentials for
the seeded orgs, visible only when `NODE_ENV !== 'production'`. It removes a typing beat on
stage. It must be impossible to render in production — a build-time check, not a runtime flag.

**Create organization.** Org name, industry picker, owner name, email, password. The industry
picker is the same card grid as wizard step 1, so the pattern is learned once.

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

- [ ] A signed-in user hitting `/` or `/login` is redirected to `/app` without a flash
- [ ] Unknown email and wrong password produce identical bodies and comparable timing
- [ ] Login is rate limited per IP **and** per email (`12` §4.11)
- [ ] A failed registration leaves no organisation behind — forced-failure test
- [ ] Registration lands on `/app/setup` with the industry preselected
- [ ] Signing in to an unconfigured org lands on `/app/setup`, not an empty console
- [ ] Demo credentials cannot render in a production build
- [ ] Password minimum 10 characters, enforced server-side and mirrored client-side
- [ ] Works at 390px
- [ ] Keyboard: tab order follows visual order, `Enter` submits, focus ring visible

## Out of scope

| Not building | Why |
|---|---|
| Password reset, email verification | P2. Auth surface stays small while middleware is graded (`15` §5) |
| SSO | Enterprise, P3 |
| "Remember me" | The refresh token already does this |
| Social login | No demand, and it complicates the tenancy model |
| A marketing site | Landing is thin and first on the cut-list |
