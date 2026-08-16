# 12 — The middleware stack

Phase: P1 · Milestone: M0 · Owns: `apps/api/src/middleware/**`, `apps/api/src/app.ts`
Decisions: `_MEMORY.md` DEC-001, DEC-011 · Invariants: INV-003, INV-007, INV-010

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
│  6  tenantResolver     org from host / JWT / API key  → req.ctx.orgId    │
│  7  authenticate       JWT | API key | respondent token → req.ctx.principal │
└──────────────────────────────────────────────────────────────────────────┘
┌─ per-route ─────────────────────────────────────────────────────────────┐
│  8  validate(Dto)      zod over body/query/params → typed req.data       │
│  9  requireCapability  the GRANT resolver         → req.ctx.decision     │
│ 10  requireEntitlement subscription tier gate                            │
│ 11  rateLimit(scoped)  tighter bucket for expensive or abusable routes   │
│ 12  idempotency        only where a double POST would be harmful         │
│ ── handler ──                                                            │
└──────────────────────────────────────────────────────────────────────────┘
┌─ terminal ──────────────────────────────────────────────────────────────┐
│ 13  auditWriter        runs inside the handler's transaction, not after  │
│ 14  notFound           unmatched route → typed error                     │
│ 15  errorFunnel        the single exit. typed error → envelope.          │
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

---

## 3. The request context

One object, built up by the chain, never mutated by handlers.

```ts
// apps/api/src/middleware/context.ts
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

`express.json({ limit: '256kb' })`. The limit is deliberate: the largest legitimate body is a
form with ~20 questions, and an unbounded parser is a free denial-of-service. CSV import
uploads bypass this with a streaming parser and its own 5 MB cap.

### 5 · `rateLimit` (global)

Coarse, per IP, from `RATE_LIMIT_*` config. Skipped for `/health`.

### 6 · `tenantResolver` — INV-010

Resolves `orgId` in strict priority:

1. API key → its `org_id`
2. JWT claim → `orgId`
3. Respondent token → the campaign's `org_id`
4. Subdomain / `X-Org-Slug`, **only** on unauthenticated routes like login

> **`orgId` is never read from a request body or query parameter.** A body-supplied tenant is
> an attack, not an input.

It then attaches a **tenant-bound Prisma client** to the context. Services call
`ctx.db.subject.findMany()`, which injects `where: { orgId }`. A service physically cannot
construct a cross-tenant query without importing the raw client, which lint forbids.

Failure → `401 UNRESOLVED_TENANT`.

### 7 · `authenticate`

Three principal kinds, one middleware, because the downstream chain should not care which
one it got (`15-AUTH-AND-SESSIONS.md`):

| Credential | Header / source | Principal |
|---|---|---|
| Staff session | `Authorization: Bearer <jwt>` | `{ kind: 'user' }` |
| Integration | `X-API-Key: <key>` | `{ kind: 'apiKey', scopes }` |
| Respondent | `:token` in the path | `{ kind: 'respondent', campaignId }` |

Variants: `authenticate` (required, 401 on failure) and `authenticateOptional` (attaches if
present — for the landing page and template library preview).

### 8 · `validate(Dto)` — the DTO pipe

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

### 9 · `requireCapability` — the guard

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

### 10 · `requireEntitlement` — separate on purpose (DEC-011)

```ts
requireEntitlement('analysis.read')   // 402 PAYMENT_REQUIRED + { requiredTier: 'silver' }
```

Capability answers *may this person?* Entitlement answers *has this org paid for it?* They
are different questions with different remedies — 403 means ask your administrator, 402 means
upgrade — and conflating them would both make that distinction impossible and pollute the
grant table with billing concerns.

Entitlement **never gates permission correctness**. Access control is in every tier (`01` §6).

### 11 · `rateLimit` (scoped)

Tighter buckets where the global one is too loose:

| Route | Limit | Why |
|---|---|---|
| `POST /auth/login` | 10 / 15 min / IP+email | Credential stuffing |
| `POST /r/:token/submit` | 5 / min / IP | A shared campus IP means this cannot be tight |
| `POST /api/v1/*` (API key) | per-tier quota | Metering, `16` |
| `POST /simulator/run` | 30 / min | Several graph queries each |

### 12 · `idempotency`

Only on routes where a double POST is harmful: `campaign.launch`, `template.clone`,
`person.import`. Client sends `Idempotency-Key`; the first response is cached for 24 h and
replayed on a repeat. Everything else is naturally idempotent or harmless to repeat.

### 13 · `auditWriter` — INV-007

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

### 14 · `notFound`

Unmatched routes become a typed `NotFoundError` so they leave through the same funnel as
everything else. No default Express HTML error page ever reaches a client.

### 15 · `errorFunnel` — the single exit

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
| `authenticate` → `requireCapability` | Cannot ask "may they" before knowing who |
| `validate` → `requireCapability` | The target id must be read from **validated** input |
| `requireCapability` → `requireEntitlement` | 403 outranks 402: never tell someone to buy an upgrade for something they would not be allowed to use anyway |
| handler → `auditWriter` assertion | Only the handler knows what actually happened |
| everything → `errorFunnel` | Registered last, or Express will not route errors to it |

That last one is the classic Express mistake and worth calling out: an error middleware
registered before a route never sees that route's errors.

---

## 6. File layout

```
apps/api/src/middleware/
  context.ts          RequestContext type, ctx bootstrap
  requestId.ts
  requestLogger.ts
  security.ts         helmet + the two cors policies
  tenantResolver.ts   INV-010, tenant-bound prisma client
  authenticate.ts     three principal kinds
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

`app.ts` assembles the chain and mounts routers. It should be readable top to bottom in under
a screen; if it is not, something belongs in a router.

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
| CSRF tokens | Bearer tokens in a header, not cookie auth — CSRF does not apply. **Revisit immediately if auth ever moves to cookies** |
