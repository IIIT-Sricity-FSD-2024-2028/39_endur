# 12 — The middleware stack

Phase: P1 · Milestone: M0 · Owns: `src/backend/middleware/**`, `src/backend/app.ts`
Decisions: `_MEMORY.md` DEC-001, DEC-011, DEC-014 · Invariants: INV-003, INV-007, INV-010

**This is the Phase-1 graded artifact.** Everything in it should be defensible as
*cross-cutting concern expressed once*, rather than logic that happened to be factored out.

---

## 1. The argument

A handler should do one thing: turn a validated request into a response. Five concerns are
not that thing, and every one of them is needed by nearly every route:

| Concern | If it lived in handlers |
|---|---|
| Tenancy | Every new endpoint is a chance to forget an `orgId` filter — a cross-tenant leak |
| Validation | Ad-hoc `if (!req.body.name)` checks, inconsistent error shapes |
| Authorisation | A missing check is invisible; a missing middleware is a visibly absent line |
| Audit | Written sometimes, forgotten under deadline, never in the same transaction |
| Error shape | Each handler invents its own, and stack traces leak |

There is also an **ordering** requirement between them that only exists once when it is a
chain: you cannot resolve a tenant before parsing the request, cannot check a capability
before knowing who is asking, cannot audit before the handler has decided what happened.
Expressed as a chain, that ordering is stated once. Expressed in handlers, it is re-derived
per endpoint and eventually got wrong.

---

## 2. The chain

```
┌─ global, app.use() in order ────────────────────────────────────────────┐
│  1  requestId          attach a correlation id                          │
│  2  requestLogger      structured start/finish log                      │
│  3  security           helmet, cors                                     │
│  4  bodyParser         json + urlencoded, with hard size limits         │
│  5  rateLimit          coarse global bucket                             │
└──────────────────────────────────────────────────────────────────────────┘
┌─ per-router ────────────────────────────────────────────────────────────┐
│  6  tenantResolver     org from host / session / API key → req.ctx.orgId │
│  7  authenticate       session | API key | respondent token → principal  │
│  8  csrfProtection     unsafe methods; issues the cookie on safe ones     │
└──────────────────────────────────────────────────────────────────────────┘
┌─ per-route ─────────────────────────────────────────────────────────────┐
│  9  validate(Dto)      zod over body/query/params → typed req.data       │
│ 10  requireCapability  the GRANT resolver         → req.ctx.decision     │
│ 10b requireNoEscalation you cannot hand out what you do not hold (INV-012)│
│ 10c requireMembership  respondent gate on organization-access campaigns  │
│ 11  requireEntitlement subscription tier gate                            │
│ 12  rateLimit(scoped)  tighter bucket for expensive or abusable routes   │
│ 13  idempotency        only where a double POST would be harmful         │
│ ── handler ──                                                            │
└──────────────────────────────────────────────────────────────────────────┘
┌─ terminal ──────────────────────────────────────────────────────────────┐
│ 14  auditWriter        runs inside the handler's transaction, not after  │
│ 15  notFound           unmatched route → typed error                     │
│ 16  errorFunnel        the single exit. typed error → envelope.          │
└──────────────────────────────────────────────────────────────────────────┘
```

A route reads as its own security policy:

```ts
router.post(
  '/campaigns/:id/launch',
  validate(LaunchCampaignDto),
  requireCapability('campaign.launch', { target: 'campaign', from: 'params.id' }),
  requireEntitlement('campaign.launch'),
  idempotent(),
  launchCampaign,
);
```

You can audit that route by reading it. That property is the whole point.

### The three boxes are three *kinds* of middleware, and the code says so

Express distinguishes application-level, router-level, error-handling, built-in and
third-party middleware. This chain uses all five, and the boxes above are not decoration:

| Box | Kind | Where it is written | Applies to |
|---|---|---|---|
| 1–5 | **application-level** (plus built-in `express.json`, and third-party `helmet`, `cors`, `express-rate-limit`) | `app.ts`, `app.use(...)` | every request, including `/healthz` and a URL that matches no route |
| 6–8 | **router-level** | each feature router, `router.use(tenantChain)` — `middleware/chains.ts` | that router's routes, and they **differ per router** |
| 9–13 | per-route | the route definition itself | one route |
| 16 | **error-handling** (four arguments) | `app.ts`, registered last | anything that calls `next(err)` |

**Links 6–8 were application-level in the code until 2026-08-23** while this diagram drew
them per-router — that gap was `D-017`, repaid by `T-064`. Three chains exist now, and the
differences are the argument for the move: the console requires a tenant and enforces CSRF,
auth makes the tenant optional and is the only router that honours `X-Org-Slug`, the
respondent surface brings its own CORS and no CSRF at all, and `/api/v1/files/:id` has the
shortest chain in the application because a logo renders on a phone with no session.

---

## 3. The request context

One object, built up by the chain, never mutated by handlers.

```ts
// src/backend/middleware/context.ts
declare global {
  namespace Express {
    interface Request {
      ctx: RequestContext;
      data: unknown;          // narrowed by validate(); see 14 §3
    }
  }
}

export type RequestContext = {
  requestId: string;
  startedAt: number;
  orgId?: string;                 // set by tenantResolver
  authzVersion?: number;          // set by tenantResolver — part of the grant cache key
  labels?: ResolvedLabels;        // set by tenantResolver — 22 §6, message builders read it
  principal?: Principal;          // set by authenticate
  decision?: Decision;            // set by requireCapability
  audit: AuditIntent[];           // appended by handlers, flushed by auditWriter
};
```

`ctx.decision` is deliberately carried forward: the audit row records **which grant decided
it** (INV-007), and the only component that knows that is the resolver.

---

## 4. Each link

### 1 · `requestId`

Reads `X-Request-Id` or mints a UUID. Echoes it on the response. Everything downstream —
logs, audit rows, error envelopes — carries it, so a user reporting "it failed" hands over
one string that finds the whole story.

### 2 · `requestLogger`

Structured JSON via pino. Logs method, path, status, duration, `orgId`, `principal.id`,
`requestId`. **Never logs the body** — bodies contain feedback text and credentials.

### 3 · `security`

`helmet()` with defaults. CORS allowlisted from config: the web origin, plus the tunnel
origin during the demo. `credentials: true`.

The respondent routes (`/r/*`, `/api/v1/public/*`) need a **wider** CORS policy than the
console — a QR code can be scanned from anywhere. They get their own policy rather than
loosening the global one.

### 4 · `bodyParser`

`express.json({ limit: '256kb' })` and `express.urlencoded({ limit: '256kb' })`. The limit is
deliberate: the largest legitimate JSON body is a form with ~20 questions, and an unbounded
parser is a free denial-of-service.

**Two things bypass it, and only two:**

| Bypass | Cap | Why |
|---|---|---|
| Binary upload (`48`) | `UPLOAD_MAX_MB`, default 2 MB, counted as the bytes arrive | `multipart/form-data` is never handed to the JSON parser. `middleware/upload.ts` is mounted **per route**, on the four upload routes and nowhere else, so the exception cannot spread by accident |

`imageUpload()` sits in **link 9's slot** — it *is* the validation for those routes, so it runs
before `requireCapability` exactly as `validate()` does. Parsing before authorising is also
what keeps the refusal clean: refusing mid-upload would reset the connection and the caller
would see a network error instead of a 403. On the size limit it unpipes and drains rather
than destroying the request, for the same reason `raw-body` does — a destroyed request cannot
carry the 413 back.

**CSV import does NOT bypass it, and an earlier revision of this section said it did.** The
import is a *string inside a JSON body* (`ImportPreviewBody`), not multipart, and no streaming
CSV parser was ever written. That sentence described code that did not exist, and its
"5 MB cap" was the third of three different numbers — `D-016`.

The resolution (`T-065`): **one number, and it sits below the parser's.** `CSV_MAX_CHARS` is
150,000 characters, which for any realistic CSV is well inside 256 kb, so an oversized import
fails `validate()` with a field error naming the CSV rather than failing the body parser with
`PAYLOAD_TOO_LARGE`. The parser stays as the outer backstop for a body that is malicious
rather than merely large.

### 5 · `rateLimit` (global)

Coarse, per IP, from `RATE_LIMIT_*` config. Skipped for `/health`.

### 6 · `tenantResolver` — INV-010

Resolves `orgId` in strict priority:

1. API key → its `org_id`
2. Session → the signed-in user's `orgId`
3. Respondent token → the campaign's `org_id`
4. Subdomain / `X-Org-Slug`, **only** on unauthenticated routes like login

> **`orgId` is never read from a request body or query parameter.** A body-supplied tenant is
> an attack, not an input.

It then attaches a **tenant-bound Prisma client** to the context. Services call
`ctx.db.subject.findMany()`, which injects `where: { orgId }`. A service physically cannot
construct a cross-tenant query without importing the raw client, which lint forbids.

It also puts **two tenant facts on `ctx` from one read**: `authzVersion`, which is part of
the grant cache key, and — since T-044 — `labels`, which is what 22 §6 has specified since
revision one. The label set rides along because that query was already happening; adding a
column to a read that runs anyway is the difference between doing it and deciding it costs a
query per request. `lib/vocabulary.ts` is where message builders pick it up, and it falls
back to the Custom preset on the tenantless routes rather than rendering `undefined`.

Failure → `401 UNRESOLVED_TENANT`.

### 7 · `authenticate`

Three principal kinds, one middleware, because the downstream chain should not care which
one it got (`15-AUTH-AND-SESSIONS.md`):

| Credential | Header / source | Principal |
|---|---|---|
| Staff session | `endur.sid` cookie (`httpOnly`) | `{ kind: 'user' }` |
| Integration | `X-API-Key: <key>` | `{ kind: 'apiKey', scopes }` |
| Respondent | `:token` in the path | `{ kind: 'respondent', campaignId }` |

Variants: `authenticate` (required, 401 on failure) and `authenticateOptional` (attaches if
present — for the landing page and template library preview).

### 8 · `csrfProtection`

New as of DEC-014. Staff auth is a cookie, so the browser attaches it automatically to any
request any page can trigger — which is exactly the condition CSRF exploits.

```ts
csrfProtection({ ignoreMethods: ['GET', 'HEAD', 'OPTIONS'] })
```

Scope it precisely, or it breaks the two surfaces that must stay open:

| Principal | Checked? | Why |
|---|---|---|
| `user` (cookie session) | **Yes**, on unsafe methods | The browser sends the cookie unbidden |
| `apiKey` (explicit header) | No | A header is never attached automatically |
| `respondent` (token in path) | No | No cookie, no ambient authority — and a QR scan from any origin must work |

Double-submit cookie: a non-`httpOnly` `endur.csrf` cookie the SPA reads and echoes in
`X-CSRF-Token`. Chosen over a synchroniser token because it needs no server-side state and no
token-fetch round trip on boot.

Failure → `403 CSRF_FAILED`, distinct from an authorisation `403` so the two are separable in
logs.

**The cookie's lifetime is the session cookie's, and the link re-issues it.** On a safe method
with a cookie principal, `csrfProtection` sets the cookie: a fresh token when there is none, and
the existing token again when there is, which slides the expiry in step with the rolling session
(`15` §2) without invalidating a mutation already in flight holding the old value.

Both halves are load-bearing, and `T-047` had to add them after the first walkthrough of the
running app found the failure they prevent (`_MEMORY.md` `N-050`). With no `maxAge`, `endur.csrf`
died when the browser closed while the session cookie lived seven days — so the caller came back
signed in, holding no token, and every mutation failed permanently. The re-issue is what makes
the error's own advice true: nothing else in the product issued the cookie outside login and
register, so "reload and try again" was previously impossible to act on.

Issuing on a GET is not a hole. Double-submit rests on an attacker being unable to **read** the
cookie cross-origin; a fresh random token they cannot see is worth nothing to them.

**This link exists because of an auth decision, not despite one.** Bearer tokens would have
made it unnecessary; cookies make it mandatory. That trade is the honest answer to why it is
in the chain.

### 9 · `validate(Dto)` — the DTO pipe

```ts
export const validate = <B, Q, P>(schema: DtoSchema<B, Q, P>): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!result.success) return next(new ValidationError(result.error));
    req.data = result.data;              // parsed, coerced, stripped of unknown keys
    next();
  };
```

Three properties that matter:

- **`req.data`, not `req.body`.** Handlers read the parsed value. Anything reading `req.body`
  directly is reading unvalidated input, and that is greppable.
- **Unknown keys are stripped**, not merely ignored — so a client cannot smuggle `orgId` or
  `role` into a create call.
- **The schema is the shared DTO** (`14-DTO-AND-VALIDATION.md`), the same object the React
  client infers its types from. One definition, both sides.

Failure → `422 VALIDATION_FAILED` with per-field errors, which is what the UI renders inline
(`design_specs/design/10` §4 "field level").

### 10 · `requireCapability` — the guard

The richest link, and the one that earns the phase.

```ts
type CapabilityOptions = {
  target?: 'org' | 'unit' | 'person' | 'subject' | 'campaign' | 'self';
  from?: string;             // 'params.id', 'data.body.unitId' — where the target id is
};

export const requireCapability =
  (capability: Capability, opts: CapabilityOptions = {}): RequestHandler =>
  async (req, _res, next) => {
    const target   = await resolveTarget(req, opts);
    const decision = await resolve(req.ctx.principal!, capability, target);
    req.ctx.decision = decision;                    // carried to auditWriter — INV-007
    if (!decision.allowed) return next(new ForbiddenError(decision));
    next();
  };
```

- The target id is read **from the validated request** (`req.data`), never from raw input —
  which is why `validate` must come first.
- The decision, not just the boolean, is stored on the context.
- 403 bodies carry `reason` and `decidedBy`. `considered` is included only outside production
  (`11` §5) — enough to be actionable, not enough to map an org's structure from outside.

**List endpoints are the subtle case.** `requireCapability('person.read')` answers *may you
read people at all*. It does not filter the list. The service then asks the resolver for the
principal's **scope set** — the unit ids their grants cover — and filters the query by it.
The API returns only what the caller may see, and the UI never filters for permission reasons
(INV-003). Out-of-scope rows are absent, not greyed.

### 10b · `requireNoEscalation` — the second half of the guard, added 2026-08-23

`requireCapability` answers *may this person act on this target*. It does **not** answer *may
this person create an actor more powerful than themselves*, and until DEC-039 nothing did —
a caller holding only `assignment.create` could assign the Owner role and hold the
organisation an hour later, with every check passing (`11` §5b).

```ts
requireNoEscalation({ person: 'params.id', role: 'data.body.roleId',
                      unit: 'data.body.unitId' })
```

**It is a middleware and not a service check, and that is not a stylistic choice.** INV-003
says authorisation is decided in middleware, never inside a handler — and *"may you hand this
power out"* is an authorisation decision. Putting it in `people/service.ts` would have made it
the one authorisation rule in the product you cannot see by reading the route, which is the
property §2 exists to protect.

It runs **after** `requireCapability`, never instead of it, and it can only refuse. Three
routes carry it: `POST /people/:id/assignments`, `POST /people/:id/account` (`57`) and the
powers-grid write (`33`). Refusal is `403 WOULD_ESCALATE` naming the capability, because a
bare 403 on a button the caller just used successfully one row above reads as a bug.

It is the same shape as `requireEntitlement` below — an extra reason to say no, composed onto
a route that already carries its capability — which is why it sits between them rather than
inside link 10.

### 10c · `requireMembership` — the respondent gate (DEC-037)

The public respondent routes have no capability check; access is the token (`39`). A campaign
whose `access` is `organization` (`38`) adds one question — *is this caller signed in to this
campaign's organisation* — and nothing else. No grant is resolved.

```ts
publicRouter.get('/campaigns/:token', validate(TokenDto), resolveCampaign,
                 requireMembership, renderForm);
```

**Order is the whole security property.** `resolveCampaign` runs first and 404s an invalid,
unlaunched, closed or expired token exactly as it always has (`13` §6), so `requireMembership`
is reachable **only with a valid token** — its `401 SIGN_IN_REQUIRED` therefore discloses
nothing the working token in the caller's hand did not already disclose. Gating before
resolution would have turned a restricted campaign into an existence oracle. Asserted by a
test that sends a bad token to a restricted campaign and compares the bytes with any other bad
token.

Built at `T-069`, and the ordering is enforced rather than merely written down: the gate reads
the campaign through `campaignOf(req)`, which **throws** if the resolver did not run. Swapping
the two lines produces a loud `500` on every request instead of a quiet gate deciding on a
campaign it never loaded — the failure mode a mis-ordered chain should have.

It also runs **before `idempotency`** on the submit route. A refused caller should not consume
a key, and somebody who is turned away, signs in, and retries with the same key must not be
replayed their own `401`.

**The CSRF exemption on this chain now rests on something else, and that is worth stating.**
`chains.ts` has always argued the respondent routes carry no ambient authority for a forged
request to borrow. DEC-037 gives the submit route some: a forged cross-site POST would burn a
member's one allowed submission with answers they did not write. What actually stops it is
`sameSite: 'lax'` on `endur.sid` — a cross-site POST carries no session, so the request arrives
as a stranger and this link refuses it. The protection is the **cookie's**, not the chain's, so
loosening that flag to `none` means mounting `csrfProtection` here in the same commit. Asserted
by a test, so the coupling cannot be broken silently.

### 11 · `requireEntitlement` — separate on purpose (DEC-011)

```ts
requireEntitlement('analysis.read')   // 402 PAYMENT_REQUIRED + { requiredTier: 'silver' }
```

Capability answers *may this person?* Entitlement answers *has this org paid for it?* They
are different questions with different remedies — 403 means ask your administrator, 402 means
upgrade — and conflating them would both make that distinction impossible and pollute the
grant table with billing concerns.

Entitlement **never gates permission correctness**. Access control is in every tier (`01` §6).

### 12 · `rateLimit` (scoped)

Tighter buckets where the global one is too loose:

| Route | Limit | Why |
|---|---|---|
| `POST /auth/login` | 10 / 15 min / IP+email | Credential stuffing |
| `POST /r/:token/submit` | 5 / min / IP | A shared campus IP means this cannot be tight |
| `POST /api/v1/*` (API key) | per-tier quota | Metering, `16` |
| `POST /simulator/run` | 30 / min | Several graph queries each |

### 13 · `idempotency`

Only on routes where a double POST is harmful: `campaign.launch`, `template.clone`,
`person.import`. Client sends `Idempotency-Key`; the first response is cached for 24 h and
replayed on a repeat. Everything else is naturally idempotent or harmless to repeat.

### 14 · `auditWriter` — INV-007

The subtle requirement: an audit row must be written **in the same transaction as the
mutation**. A post-response middleware writing its own transaction can succeed when the
mutation rolled back, or vice versa, and an audit log that disagrees with reality is worse
than none.

So the pattern is:

```ts
// handler
await ctx.tx(async (tx) => {
  const campaign = await tx.campaign.update({ ... });
  ctx.audit.push({ action: 'campaign.launch', targetType: 'campaign', targetId: campaign.id });
  return campaign;
});
// ctx.tx flushes ctx.audit inside the same transaction, stamping
// decidedBy from ctx.decision, requestId, actor, and ip.
```

`auditWriter` as a middleware is a **safety net**: after the response, it asserts that any
request which mutated state produced at least one audit row, and logs loudly if not. In
development that assertion throws — which is how a forgotten audit call gets caught on the
day it is written.

### 15 · `notFound`

Unmatched routes become a typed `NotFoundError` so they leave through the same funnel as
everything else. No default Express HTML error page ever reaches a client.

### 16 · `errorFunnel` — the single exit

```ts
export const errorFunnel: ErrorRequestHandler = (err, req, res, _next) => {
  const e = toAppError(err);                  // typed error, or 500 for anything unknown
  logger.error({ requestId: req.ctx?.requestId, err, status: e.status }, e.code);
  res.status(e.status).json({
    error: {
      code: e.code,
      message: e.message,                     // safe for a user to read
      details: e.details,                     // field errors, decidedBy — never a stack
      requestId: req.ctx?.requestId,
    },
  });
};
```

Rules: every error leaves here. No handler calls `res.status(500)`. Unknown errors become a
generic 500 with the `requestId` — the detail goes to the log, not the client. Stack traces
never cross the boundary in production.

The error envelope and the full code list are in `13-API-CONTRACT.md` §5.

---

## 5. Ordering constraints

These are the reason the chain is a chain. Each is worth being able to state out loud.

| Must come before | Because |
|---|---|
| `requestId` → everything | Correlation must exist even for a failure in the next link |
| `bodyParser` → `validate` | Nothing to validate otherwise |
| `tenantResolver` → `authenticate` | An API key resolves the tenant *and* the principal; the tenant-bound db client must exist before any lookup |
| `authenticate` → `csrfProtection` | The check depends on *which kind* of principal it got — cookie principals only |
| `csrfProtection` → any mutation | A forged request must die before it reaches a handler, not after |
| `authenticate` → `requireCapability` | Cannot ask "may they" before knowing who |
| `validate` → `requireCapability` | The target id must be read from **validated** input |
| `requireCapability` → `requireNoEscalation` | The escalation bound can only refuse. Running it first would answer *"you cannot hand that out"* to someone who was never allowed to hand anything out — a more specific refusal than the truth |
| `requireCapability` → `requireEntitlement` | 403 outranks 402: never tell someone to buy an upgrade for something they would not be allowed to use anyway |
| token resolution → `requireMembership` | Gating before resolving turns a restricted campaign into an existence oracle. An invalid token must 404 before `access` is ever consulted (`13` §6) |
| handler → `auditWriter` assertion | Only the handler knows what actually happened |
| everything → `errorFunnel` | Registered last, or Express will not route errors to it |

That last one is the classic Express mistake and worth calling out: an error middleware
registered before a route never sees that route's errors.

---

## 6. File layout

```
src/backend/middleware/
  context.ts          RequestContext type, ctx bootstrap
  requestId.ts
  requestLogger.ts
  security.ts         helmet + the two cors policies
  tenantResolver.ts   INV-010, tenant-bound prisma client. A FACTORY since T-064
  authenticate.ts     three principal kinds
  csrfProtection.ts   cookie-auth principals only
  chains.ts           links 6-8 composed per router: tenant | auth | respondent | asset
  upload.ts           multipart, images only. The one bypass of express.json (48)
  validate.ts         the DTO pipe
  requireCapability.ts
  requireEntitlement.ts
  rateLimit.ts        factory: global + scoped buckets
  idempotency.ts
  auditWriter.ts
  notFound.ts
  errorFunnel.ts
  index.ts            barrel — app.ts imports only from here
```

`app.ts` assembles the **application-level** chain and mounts routers. It should be readable
top to bottom in under a screen; if it is not, something belongs in a router. Since `T-064`
that is literally true of links 6–8: they belong in a router, and that is where they are.

---

## 7. Testing

Detailed in `51-TESTING-STRATEGY.md`. The chain-specific ones:

- **Ordering tests.** Deliberately mis-order two links and assert the failure is loud. This
  is the test that proves the ordering table in §5 is real and not a comment.
- **A route with no `requireCapability` is a test failure.** A test enumerates the router
  stack and asserts every non-public route has a capability guard attached. This is the
  single highest-value test in the codebase — it makes INV-003 mechanically enforced rather
  than a matter of discipline.
- **Error shape.** Every error type produces the envelope; no route can produce a body
  outside it.
- **Tenant isolation.** Two orgs seeded; every list endpoint called with org A's token
  returns zero of org B's rows, including when a forged `orgId` is supplied in the body.

---

## 8. Acceptance

- [ ] `app.ts` shows the global chain in the documented order
- [ ] Every route in `13-API-CONTRACT.md` has `validate` and, unless public,
      `requireCapability`
- [ ] The route-enumeration test passes (§7)
- [ ] A 403 body contains `reason` and `decidedBy`; in production it omits `considered`
- [ ] A 402 is returned for an entitlement failure and is distinguishable from a 403
- [ ] A cookie-session mutation without a valid CSRF token returns `403 CSRF_FAILED`
- [ ] An API-key request and a respondent submit both succeed with **no** CSRF token
- [ ] A validation failure returns 422 with per-field errors the UI can render inline
- [ ] Every mutation produces an audit row with `decidedBy` populated, in the same
      transaction — verified by forcing a rollback and asserting no audit row survives
- [ ] No response anywhere contains a stack trace
- [ ] Cross-tenant reads return empty, including with a forged body `orgId`
- [ ] `X-Request-Id` round-trips and appears in both the log line and the error envelope

## 9. Out of scope

| Not building | Why |
|---|---|
| A DI container | Express middleware composes by function. Adding a container re-invents the NestJS we chose against (DEC-001) |
| Distributed tracing (OpenTelemetry) | `requestId` correlation is enough at this size |
| A circuit breaker / retry layer | No outbound dependencies yet |
| Response caching middleware | Premature. Fix the query first |
| ~~CSRF tokens~~ | **No longer out of scope.** Auth moved to cookies (DEC-014), which is exactly the revisit condition this row used to name. Now specified in §4.8 |
