# 45 — Public API and integrations

Phase: **P3** · Milestone: — · Related: `15-AUTH-AND-SESSIONS.md` §4, `16` §2

**Do not build before P3.** Enterprise tier only. Specified now because the revenue model
names API access as a tier boundary (`01` §6), and a boundary that was never designed for
tends to be unenforceable when it arrives.

## Purpose

Let customers pull their own data and push structure in. For accreditation reporting —
Endur's stated entry point into universities — an institution needs the numbers inside its own
reporting system, not only in our dashboard.

## Design principle

> **The public API is the same routes as the console, gated by key scopes** (`13` §2).

Not a parallel surface. A second API is a second thing to keep correct, a second place to
forget a capability check, and a second permission model to reason about. The middleware chain
already handles three principal kinds; an API key is the third, and everything downstream is
unchanged.

This is the payoff for building authentication as a middleware that produces a `Principal`
rather than as "the JWT check".

## Route & access

No new routes for data. The integration surface is `/api/v1/*` — the console's own routes —
authenticated with `X-API-Key` instead of a bearer token (`13` §2).

Key management is a console surface at `/app/settings#api`, Enterprise tier only.

## Capabilities

| Action | Capability | Entitlement |
|---|---|---|
| List keys | `apikey.read` | **Enterprise** |
| Create a key | `apikey.create` | Enterprise |
| Revoke a key | `apikey.revoke` | Enterprise |
| Anything via a key | whatever the key's `scopes` allow | Enterprise |

A key's effective permission is `scopes ∩ org entitlements`. It can never exceed what the
organisation bought, nor what was granted to it.

## Authentication

Per `15` §4:

- `endur_live_<8-char prefix><32 random>`, shown **once**
- Only `key_hash` and `prefix` stored — unrecoverable, only revocable
- Explicit `scopes`, a subset of the capability catalogue
- Effective permission is `scopes ∩ org entitlements` — a key can never exceed what the
  organisation bought, nor what was granted to it
- Revocation is immediate; there is no token to expire

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| List keys | `GET /api/v1/keys` | → `ApiKeySummary[]` — prefix, scopes, `lastUsedAt`. **Never the key** |
| Create | `POST /api/v1/keys` | `CreateKeyBody { name, scopes[] }` → `{ key, ...summary }` — `key` present **once** |
| Revoke | `DELETE /api/v1/keys/:id` | — |
| Webhooks | `GET/POST/DELETE /api/v1/webhooks` | `WebhookBody { url, events[], secret }` |

`scopes` is validated against the capability catalogue (`11` §3), so a key cannot be issued
for a capability that does not exist.

Creation returns the key exactly once, with copy that says so plainly.

## State

P3 console state, following whatever `23` settles on. The key-creation dialog holds the
returned key in local state only and never writes it anywhere persistent — including the
store, which devtools can read.

## Components

Existing: `<PageHeader>` · `<ResponsiveTable>` · `<ConfirmDialog>` · `<Toast>` ·
`<EmptyState>`. No new components — key management is a table and a dialog.

Every key operation is audited. A created key is a new principal in the tenant, which is
exactly the kind of event an audit log exists for.

## Rate limits and metering

Per-key token bucket, quota by tier (`12` §4.11). Response headers on every call:

```
X-RateLimit-Limit / -Remaining / -Reset
```

429 carries `Retry-After`. Usage per key is visible in settings, because a quota that is only
discoverable by hitting it is a support ticket.

## Webhooks

| Event | Fires on |
|---|---|
| `campaign.launched` | Token minted |
| `campaign.closed` | Manual or scheduled close |
| `response.submitted` | Each submission — **never carries respondent identity** (INV-006) |
| `results.threshold_reached` | k-anonymity threshold crossed, so results became available |

Delivery: HMAC-SHA256 signature over the raw body in `X-Endur-Signature`, timestamped to
prevent replay. Retries with exponential backoff for 24 hours, then the endpoint is disabled
and the customer is notified.

`response.submitted` is the one to get right. It must carry the campaign, the subject and the
timestamp, and **nothing that could identify a respondent** — a webhook that leaks identity
would break the anonymity promise at the one point nobody is looking.

## Documentation

OpenAPI generated from the shared Zod DTOs (`14` §10 — deferred to exactly this phase, which
is when it earns its keep). One generation step, and the docs cannot drift from the
validation, because they are the same objects.

## Import direction

Reading is the common case; writing matters for org sync. An institution's SIS is the source
of truth for people and units, and re-typing them into Endur is how the data goes stale.

`POST /api/v1/people/import` already exists and is idempotent (`13` §7). The API surface for
sync is that endpoint plus `units` — no new concepts, which is the point of the same-routes
principle.

## States and failure modes

| Situation | Response |
|---|---|
| Revoked key | `401 UNAUTHENTICATED` |
| Scope not granted | `403 FORBIDDEN` with `decidedBy` |
| Below Enterprise | `402 PAYMENT_REQUIRED` with `requiredTier` |
| Over quota | `429` with `Retry-After` |
| Webhook endpoint failing | Retry 24 h, then disable and notify |

## Acceptance — P3

- [ ] The public API uses the same routes and the same middleware chain as the console
- [ ] A key's effective permission is `scopes ∩ entitlements`, never more
- [ ] A key is displayed exactly once and is unrecoverable afterwards
- [ ] Revocation takes effect on the next request
- [ ] `response.submitted` webhooks carry no respondent-identifying field — payload
      allowlist test
- [ ] Webhook signatures verify and replays are rejected
- [ ] Rate-limit headers appear on every API-key response
- [ ] OpenAPI is generated from the shared DTOs, not hand-written
- [ ] Every key operation is audited
- [ ] Below Enterprise, key endpoints return 402 rather than 403 or 404

## Out of scope

| Not building | Why |
|---|---|
| GraphQL | Same reason as `13` §9 |
| SDK packages | Generate from OpenAPI if anyone asks |
| OAuth for third-party apps | No third-party ecosystem exists |
| Real-time streaming | Webhooks cover the real need |
| A public developer portal | Docs page first; a portal is a product |
