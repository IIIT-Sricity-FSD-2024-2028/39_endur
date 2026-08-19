# 13 — API contract

Phase: P1 · Milestone: M0 · Owns: `src/backend/routes/**` (router wiring)
Related: `12-MIDDLEWARE-STACK.md`, `14-DTO-AND-VALIDATION.md`, `11-PERMISSION-ENGINE.md`

---

## 1. Conventions

- Base path `/api/v1`. The version is in the path, not a header — it is visible in a QR code,
  a log line and a curl command, which is worth more than header purity.
- JSON only. `Content-Type: application/json` on every request with a body.
- Resource paths are plural nouns; verbs only for genuine state transitions
  (`/campaigns/:id/launch`).
- Timestamps are ISO-8601 UTC. Ids are UUIDv4.
- Unknown request keys are **stripped**, not rejected — forward compatibility for clients,
  and it is what stops `orgId` smuggling (`12` §4.8).

## 2. Three surfaces

| Surface | Prefix | Auth | Notes |
|---|---|---|---|
| **Console** | `/api/v1/*` | Staff session cookie | The bulk of the API |
| **Public respondent** | `/api/v1/public/*` | Campaign token in the path | No account, wider CORS |
| **Integration** | `/api/v1/*` with `X-API-Key` | API key | Enterprise tier only (`16`) |

The integration surface is deliberately **the same routes** as the console, gated by key
scopes rather than a parallel API. A second API surface is a second thing to keep correct.

## 3. Endpoints

`C` = capability required. Public routes have none. Every non-public route also carries
`validate(Dto)` (`12` §4.8).

### Auth — `/api/v1/auth`

| Method | Path | C | Notes |
|---|---|---|---|
| POST | `/register` | — | Creates org + owner. Rate limited hard |
| POST | `/login` | — | Sets the `endur.sid` session cookie. Regenerates the session id |
| POST | `/logout` | — | Destroys the server-side session row, clears the cookie |
| GET | `/me` | — | Session, org, labels, **and the caller's capability set**. The only boot call |
| GET | `/csrf` | — | Issues the `endur.csrf` double-submit cookie (`12` §4.8) |

`GET /me` returning the capability set is what lets the UI hide actions the caller cannot
perform. It is a *usability* affordance only — the API still enforces (INV-003).

### Organisation — `/api/v1/org`

| Method | Path | C |
|---|---|---|
| GET | `/` | `org.read` |
| PATCH | `/` | `org.update` |
| PATCH | `/labels` | `org.update` |
| GET | `/presets` | — |
| POST | `/setup` | `org.update` |

`POST /setup` is the wizard's single commit: industry, roles, units and labels arrive
together and are written in one transaction. A five-step wizard that writes five times leaves
half-built organisations behind when someone closes the tab.

### Structure — `/api/v1/units`

| Method | Path | C |
|---|---|---|
| GET | `/` | `unit.read` — returns the tree, scope-filtered |
| POST | `/` | `unit.create` |
| PATCH | `/:id` | `unit.update` |
| POST | `/:id/reparent` | `unit.reparent` — cycle-checked |
| DELETE | `/:id` | `unit.delete` — body states the real impact |
| GET | `/:id/impact` | `unit.read` — "12 people gain X, 3 lose Y" before a save |

### Roles and powers — `/api/v1/roles`, `/api/v1/grants`

| Method | Path | C |
|---|---|---|
| GET | `/roles` | `role.read` |
| POST | `/roles` | `role.create` |
| PATCH | `/roles/:id` | `role.update` |
| POST | `/roles/reorder` | `role.update` — levels are derived from order |
| DELETE | `/roles/:id` | `role.delete` |
| GET | `/grants` | `grant.read` — the powers grid, as a matrix |
| PUT | `/grants` | `grant.update` — **bulk**, the whole grid, one transaction |
| GET | `/grants/warnings` | `grant.read` — orphan / duplicate / self-approval loop |

`PUT /grants` is bulk by design. The grid is edited by clicking many cells; sending one
request per cell would make undo incoherent and the warnings recomputed dozens of times.

### People — `/api/v1/people`

| Method | Path | C |
|---|---|---|
| GET | `/` | `person.read` — scope-filtered list |
| GET | `/:id` | `person.read` |
| POST | `/` | `person.create` |
| PATCH | `/:id` | `person.update` |
| DELETE | `/:id` | `person.delete` |
| POST | `/:id/assignments` | `assignment.create` |
| DELETE | `/:id/assignments/:edgeId` | `assignment.delete` |
| POST | `/import` | `person.import` — CSV, idempotent |
| POST | `/import/preview` | `person.import` — column mapper, first 5 rows |

### Subjects — `/api/v1/subjects`

| Method | Path | C |
|---|---|---|
| GET | `/` | `subject.read` |
| POST | `/` | `subject.create` |
| PATCH | `/:id` | `subject.update` |
| POST | `/:id/archive` | `subject.archive` |

### Home — `/api/v1/home`

| Method | Path | C |
|---|---|---|
| GET | `/` | `org.read` — the whole dashboard in one call (`46`) |

Deliberately one endpoint rather than six. A dashboard that fires six requests is six chances
to be slow, and it is the first screen after login.

### Profile — `/api/v1/profile`

The caller's own account (`47`). Everything here resolves under `self` scope (`11` §4).

| Method | Path | C |
|---|---|---|
| GET | `/` | `person.read` · `self` — identity, positions, powers by place |
| PATCH | `/` | `person.update` · `self` — name only |
| POST | `/password` | — session identity **is** the authorisation; requires the current password |
| POST | `/avatar` | `person.update` · `self` — multipart (`48`) |
| DELETE | `/avatar` | `person.update` · `self` |

**Email is not editable here.** Changing it is an identity change and belongs to an
administrator on `/people/:id`, with an audit trail.

### Uploads

Binary uploads (`48`). These are the **only** routes that bypass the JSON body parser and its
size limit (`12` §4.4); they stream with their own cap.

| Method | Path | C |
|---|---|---|
| POST · DELETE | `/api/v1/org/logo` | `org.update` |
| POST · DELETE | `/api/v1/profile/avatar` | `person.update` · `self` |
| POST · DELETE | `/api/v1/people/:id/avatar` | `person.update` · `subtree` |
| GET | `/api/v1/files/:id` | — serving. Logos and avatars only; ids are random, not enumerable |

### Templates and forms — `/api/v1/templates`

| Method | Path | C |
|---|---|---|
| GET | `/library` | `template.read` — `orgId IS NULL` templates (DEC-018) |
| GET | `/` | `template.read` — the org's own |
| GET | `/:id` | `template.read` |
| POST | `/` | `template.create` |
| POST | `/:id/clone` | `template.clone` |
| PATCH | `/:id` | `template.update` |
| PUT | `/:id/questions` | `template.update` — **bulk**, the whole question set |
| DELETE | `/:id` | `template.delete` |

`PUT /:id/questions` is bulk for the same reason as grants: the builder autosaves a document,
not a stream of field edits, and reordering is one operation on the array.

### Campaigns — `/api/v1/campaigns`

| Method | Path | C |
|---|---|---|
| GET | `/` | `campaign.read` |
| GET | `/:id` | `campaign.read` |
| POST | `/` | `campaign.create` |
| PATCH | `/:id` | `campaign.update` — only while `draft` |
| POST | `/:id/launch` | `campaign.launch` — mints `public_token`. Idempotent |
| POST | `/:id/close` | `campaign.close` |
| GET | `/:id/audience` | `campaign.read` — resolved size + preview |
| GET | `/:id/results` | `results.read` — aggregates, k-anon gated |
| GET | `/:id/responses` | `response.read` — individual, k-anon gated |
| GET | `/:id/export` | `results.export` — CSV |

### Trust — `/api/v1/authz`, `/api/v1/audit`

| Method | Path | C |
|---|---|---|
| POST | `/authz/simulate` | `simulator.run` — full `Decision` incl. `considered` |
| GET | `/authz/capabilities` | `org.read` — the catalogue, for the grid (DEC-018) |
| GET | `/audit` | `audit.read` |

### Public respondent — `/api/v1/public`

No auth, no capability. The only routes a stranger's phone touches.

| Method | Path | Notes |
|---|---|---|
| GET | `/campaigns/:token` | The form to render. **No org internals** — see §6 |
| POST | `/campaigns/:token/responses` | Submit. Rate limited, idempotent per token |

### Platform — P3

Prefixes reserved here; the routes under them are specified in their own docs rather than
restated, so there is one authority per surface:

| Prefix | Capability | Specified in |
|---|---|---|
| `/api/v1/keys`, `/api/v1/webhooks` | `apikey.*` | `45-FEATURE-public-api.md` |
| `/api/v1/billing`, `/api/v1/billing/usage` | `billing.*` | `16` §8 |
| `/api/v1/analysis`, `/api/v1/analysis/themes/:id` | `analysis.read` | `43` |
| `/api/v1/reflect`, `/api/v1/plans`, `/api/v1/checkins` | `reflection.*` `actionplan.*` `checkin.*` | `44` |

**A P3 route must still be listed in its own doc before it is built.** This table exists so
that a route cannot appear in the codebase without appearing in some contract doc.

### Unauthenticated utility

`GET /health` — liveness, no tenant, no auth, excluded from rate limiting and logging.

---

## 4. Lists

Cursor pagination. Offset pagination on a growing table returns duplicates and skips rows
under concurrent writes, and responses arrive concurrently by definition.

```
GET /api/v1/people?cursor=<opaque>&limit=50&q=ram&unitId=<uuid>&roleId=<uuid>
```

```json
{
  "data": [ ... ],
  "page": { "nextCursor": "eyJpZCI6…", "hasMore": true },
  "meta": { "total": 214 }
}
```

`limit` max 100, default 50. `meta.total` is scope-filtered — it counts what the caller may
see, not what exists (INV-003).

---

## 5. Errors

One envelope, produced only by `errorFunnel` (`12` §4.15).

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You cannot launch campaigns in this department.",
    "details": { "decidedBy": { "via": "role", "subjectName": "Faculty", "scope": "self" } },
    "requestId": "01J8…"
  }
}
```

| Status | Code | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed beyond schema failure |
| 401 | `UNAUTHENTICATED` | Missing or invalid credential |
| 401 | `UNRESOLVED_TENANT` | No org could be determined |
| 402 | `PAYMENT_REQUIRED` | Entitlement. `details.requiredTier` |
| 403 | `FORBIDDEN` | Capability. `details.decidedBy` |
| 403 | `CSRF_FAILED` | Missing or invalid CSRF token on a cookie-authenticated mutation (`12` §4.8). Distinct from `FORBIDDEN` so the two are separable in logs |
| 404 | `NOT_FOUND` | Absent, **or out of scope** — see below |
| 409 | `CONFLICT` | State transition invalid (closed campaign, cycle, duplicate) |
| 413 | `PAYLOAD_TOO_LARGE` | Body limit |
| 422 | `VALIDATION_FAILED` | `details.fields[]` |
| 429 | `RATE_LIMITED` | `Retry-After` set |
| 500 | `INTERNAL` | `requestId` only. Never a stack |

**404 versus 403, decided deliberately:**

- Asking for a resource that exists but is **out of the caller's scope** → `404`. Returning
  403 would confirm the resource exists, which leaks org structure to someone who cannot see
  it.
- Being denied a **capability on a resource you can see** → `403` with the decision trace,
  because that is actionable: it tells you whom to ask.

Validation detail shape, rendered inline by the UI (`design_specs/design/10` §4):

```json
{ "code": "VALIDATION_FAILED",
  "details": { "fields": [ { "path": "body.questions.0.text",
                             "message": "Question text is required" } ] } }
```

---

## 6. What public endpoints must not leak

`GET /public/campaigns/:token` is reachable by anyone with a link. It returns **only** what
is needed to render the form:

```
included    campaign name, subject name, questions (text, kind, config, required, order),
            estimated completion seconds, anonymity notice, org display name + labels
excluded    unit tree, role names, people, other campaigns, other subjects,
            response counts, results, any id that is not needed to submit
```

An invalid, unlaunched, closed or expired token returns the same `404` — an existence probe
must not distinguish "wrong token" from "closed campaign".

---

## 7. Idempotency

`Idempotency-Key` honoured on `campaign.launch`, `template.clone`, `person.import`, and
respondent submit (keyed on the invitation token). First response cached 24 h and replayed.

Respondent submit matters most: a phone on a flaky venue network retries, and a duplicate
response would corrupt the demo's numbers in front of the evaluator.

---

## 8. Acceptance

- [ ] Every route above exists with the documented status codes
- [ ] Every non-public route has `validate` + `requireCapability` (`12` §7 enumeration test)
- [ ] Out-of-scope reads return 404, not 403 — tested both ways
- [ ] `GET /public/campaigns/:token` response contains no org internals, asserted by an
      explicit key allowlist test
- [ ] Invalid, closed and expired tokens are indistinguishable in the response
- [ ] A repeated `POST /campaigns/:id/launch` with the same key returns the first response
- [ ] Cursor pagination is stable while rows are inserted concurrently
- [ ] `meta.total` is scope-filtered

## 9. Out of scope

| Not building | Why |
|---|---|
| GraphQL | Shared Zod DTOs already give typed contracts; a legible middleware chain is the P1 deliverable |
| Webhooks | P3, with the public API (`45`) |
| Bulk endpoints beyond grants / questions / import | Each one is a new consistency question. Add only when a UI genuinely needs it |
| API versioning beyond `/v1` | No consumers yet. Versioning discipline starts when the first external key is issued |
| Server-sent events for live results | The demo refreshes. Polling is honest and cannot break on stage |
