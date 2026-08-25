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
| POST | `/register` | — | Creates org + owner + **subscription at the chosen tier** (`DEC-048`). Rate limited hard |
| POST | `/login` | — | `LoginBody { email, password, orgId? }`. Sets the `endur.sid` session cookie. Regenerates the session id. `orgId` is sent **only** to answer a `409 ACCOUNT_AMBIGUOUS` (`DEC-049`) |
| POST | `/logout` | — | Destroys the server-side session row, clears the cookie |
| GET | `/me` | — | Session, org, labels, **and the caller's capability set**. The only boot call |
| GET | `/csrf` | — | Issues the `endur.csrf` double-submit cookie (`12` §4.8) |

`GET /me` returning the capability set is what lets the UI hide actions the caller cannot
perform. It is a *usability* affordance only — the API still enforces (INV-003).

**The set is a map of capability → scope, not a list of verbs** (`DEC-050`, `T-086`):

```jsonc
"capabilities": {
  "campaign.read": "subtree",
  "person.read":   "self",     // held by EVERY account — the reason this is not a list
  "subject.read":  "own_unit"
}
```

Each value is the **widest scope any live allow reaches**, so the claim is existential —
*"there is somewhere this reaches at least this far"* — and never *"everything inside that
scope is permitted"*. Absent means not held anywhere. Keys are sorted; a capability denied
**org-wide** is absent, and a deny at a narrower scope neither removes the key nor narrows
its value, because the server refuses that particular target with its decision trace and
that is where the decision belongs.

The verb alone could not carry the one question the sidebar asks. `person.read: self` is
seeded to every role so that `/app/profile` opens (`50` §1), so a gate on the bare verb was
true for every account in the product and showed everybody a People page listing exactly one
person — themselves (`D-027`). The scope is what tells a respondent-level account apart from
a head of department.

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
| POST | `/:id/assignments` | `assignment.create` — **also bounded by INV-012** (`11` §5b) |
| DELETE | `/:id/assignments/:edgeId` | `assignment.delete` |
| POST | `/import` | `person.import` — CSV, idempotent. **Also bounded by INV-012**: it creates positions, so it carries the same guard as `/:id/assignments` (`11` §5b) |
| POST | `/import/preview` | `person.import` — column mapper, first 5 rows |
| POST | `/:id/account` | `account.create` — provision a sign-in. Returns a one-time activation link. **Bounded by INV-012** |
| POST | `/:id/account/reset` | `account.reset` — re-issue activation; invalidates any outstanding link |
| DELETE | `/:id/account` | `account.revoke` — disables the account and ends its sessions. The person survives |

Specified in `57-FEATURE-accounts-and-invites.md`. Activation itself is **unauthenticated** and
lives under `/auth`, not here — the person activating has no session yet, by definition.

### Accounts — `/api/v1/people/:id/account` · and the unauthenticated half

| Method | Path | C |
|---|---|---|
| GET | `/auth/activate/:token` | — · is this link live, and whose name is on it |
| POST | `/auth/activate/:token` | — · set a password, activate, sign in. Rate limited per token and per IP |

`GET` before `POST` so the activation screen can greet the person by name and say which
organisation they are joining before asking for a password — a bare password box reached from
a pasted link is indistinguishable from a phishing page.

### Inbox — `/api/v1/inbox`

Free-text responses as a triage queue (`58`). **Reads through the same k-anonymity-gated
service as `40`** — never a second path to response content.

| Method | Path | C |
|---|---|---|
| GET | `/` | `response.read` — `?state=all\|unread\|read\|archived&campaignId&subjectId&cursor` |
| POST | `/:responseId/read` · `/:responseId/unread` | `response.read` — **per-caller** state, not org state |
| POST | `/:responseId/archive` · `/:responseId/unarchive` | `response.read` — also per-caller |

Marking your own inbox needs no capability beyond seeing it, which is why there is no
`inbox.*` module in `11` §3: the state is yours, one row per `(user, response)`, and two
administrators triaging the same campaign never overwrite each other.

### Subjects — `/api/v1/subjects`

| Method | Path | C |
|---|---|---|
| GET | `/` | `subject.read` |
| GET | `/:id` | `subject.read` — `SubjectDetail` |
| POST | `/` | `subject.create` |
| PATCH | `/:id` | `subject.update` |
| POST | `/:id/archive` | `subject.archive` |

`SubjectDetail` is the summary **plus `cycles[]`** — every campaign this subject appeared in,
oldest first, with the responses that came back *about this subject* in each. It carries no
scores: aggregate numbers live behind the results endpoints, where the k-anonymity gate is
(INV-007), and a second path to them here would have no gate in front of it.

### Home — `/api/v1/home`

| Method | Path | C |
|---|---|---|
| GET | `/?window=` | `org.read` — the whole dashboard in one call (`46`) |

Deliberately one endpoint rather than six. A dashboard that fires six requests is six chances
to be slow, and it is the first screen after login. That includes the share URL on each
active campaign (`46`), so opening the QR from here costs a click and not a round trip.

`window` is `today | 7d | 30d | all` and defaults to `30d` (`DEC-031`). It is the only query
parameter in this surface that **tolerates** a bad value instead of returning a 400: a range
is a display preference, nothing is written or authorised from it, and a stale bookmark must
not break the first screen after sign-in.

**`PersonSummary.positions` carries `unitId`, `roleLevel` and `validTo` since `T-051`**, each
for a named reader: the unit id because `powersByPlace` used to re-find the unit by NAME and
two units may share one (`34` § Acceptance); the level because `47` and `24`'s `<PersonChip>`
both render a position with it; the expiry because "they have this" and "they have this until
March" are different facts. `unitId` is nullable, matching the column.

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
administrator on `/people/:id`, with an audit trail. `UpdateProfileBody` has no such key, so
`validate()` strips one rather than the handler ignoring it — the same shape `PATCH
/people/:id` uses for `status` (`DEC-046`).

**`POST /password` carries no capability, and that is specified rather than omitted** (`47` §
Capabilities). Holding the session is the authorisation and no capability could stand in for
it: the nearest candidate, `person.update: self`, is seeded to every role (`50` §1), so a gate
on it would refuse nobody while implying an organisation could take the right away by editing
a role. The route also takes **no id**, which is what guarantees the only password it can
reach is the caller's own — `57` § *"Why an administrator still cannot set a password"* is the
same rule from the other side. It is therefore the one authenticated route on the
route-enumeration allowlist (`12` §7), with that argument written beside it.

**Since `T-051` `ProfileView` reuses `/people/:id`'s types** — `Position` and `PowersAtPlace`
from `dto/person.ts` — rather than declaring narrower lookalikes. `47` § Data contract has the
reasoning; the short version is that two shapes would fork the one component that renders
them, which is `N-005`'s rule breaking one layer above where it was written.

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

`TemplateSummary` carries three DERIVED counts and stores none of them: `questionCount`,
`estimatedSeconds`, and — added by **T-035** — `campaignCount`, how many campaigns use the
template. The third is what lets the library card say *"Used in 2 campaigns"* rather than
*"Never used"* (`design_specs/design/05` §5.1) and, more usefully, what lets the delete
dialog state a real consequence before the button is pressed instead of discovering the
`409` afterwards. `DELETE /:id` still refuses an in-use template — the count informs the
reader, it does not replace the check.

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
| GET | `/audit` | `audit.read` — the organisation's activity log (`56`). `?actorId&action&targetType&outcome&from&to&cursor`. Returns **allows and denies** (DEC-041) |

### Public respondent — `/api/v1/public`

No auth, no capability. The only routes a stranger's phone touches.

| Method | Path | Notes |
|---|---|---|
| GET | `/campaigns/:token` | The form to render. **No org internals** — see §6 |
| POST | `/campaigns/:token/responses` | Submit. Rate limited, idempotent per token |

**One exception to "no auth", added by DEC-037.** A campaign whose `access` is `organization`
answers both routes with **`401 SIGN_IN_REQUIRED`** to a caller with no staff session for that
organisation, and **`403 NOT_A_MEMBER`** to one signed in elsewhere. The body carries the
organisation's display name and nothing else, so the sign-in prompt can say *which* one.

That 401 is reachable **only with a valid token**, so it discloses nothing the token did not
already disclose — §6's rule that invalid, unlaunched, closed and expired tokens are
indistinguishable is unchanged, because all four still 404 before `access` is ever consulted.
Order matters here and is asserted: **resolve the token first, gate second.**

### Billing — `/api/v1/billing` · the organisation's own plan

Tenant routes, session auth, org capabilities. Specified in `49-PAGE-plan-and-billing.md`.

| Method | Path | C | Notes |
|---|---|---|---|
| GET | `/billing` | `billing.read` | Current tier, status, period, price |
| GET | `/billing/usage` | `billing.read` | `billable_seats` with its breakdown (`16` §5) |
| GET | `/billing/plans` | `billing.read` | The four tiers and what each unlocks. **No prices** — DEC-035 |
| POST | `/billing/tier` | `billing.update` | **Joins a tier.** Writes `subscriptions.tier` and applies immediately — DEC-035 |

### Endur's own platform — `/api/v1/platform`

**A fourth surface, and the only deliberately cross-tenant one.** No org capability applies
here and no `tenantResolver` runs; the guard is `requirePlatform()` against the separate
catalogue in `19` §4. Full specification in `19-PLATFORM-OPERATORS.md` §11; the table is
restated there rather than here because that document owns the surface.

| Method | Path | C |
|---|---|---|
| POST | `/platform/auth/login` · `/platform/auth/logout` | — · MFA, hard rate limit |
| GET | `/platform/me` | — |
| GET | `/platform/orgs` · `/platform/orgs/:id` | `platform.org.read` |
| POST | `/platform/orgs/:id/plan` | `platform.plan.override` |
| POST | `/platform/orgs/:id/suspend` | `platform.org.suspend` |
| POST | `/platform/orgs/:id/message` | `platform.message.send` |
| GET | `/platform/stats` | `platform.usage.read` |
| GET | `/platform/analytics` | `platform.analytics.read` — **owner only** |
| GET | `/platform/audit` | `platform.audit.read` |
| GET/POST/PATCH | `/platform/operators` | `platform.operator.manage` |

**INV-011 constrains every payload above:** counts, names, dates and enums only. No route on
this prefix may return a response body, an answer, a comment or a respondent identity.

### Uploads — multipart, the one exception to §1's "JSON only"

Specified in `48-FEATURE-file-upload.md`. These routes bypass the JSON body parser and its
256 kb limit (`12` §4.4) with a streaming multipart parser and their own cap.

| Method | Path | C |
|---|---|---|
| POST/DELETE | `/org/logo` | `org.update` |
| POST/DELETE | `/profile/avatar` | `person.update` · `self` |
| POST/DELETE | `/people/:id/avatar` | `person.update` · `subtree` |
| GET | `/files/:id` | — · low-sensitivity, unguessable ids, cached hard |

### Analysis — `43`, BUILT `T-081`

| Method | Path | Capability |
|---|---|---|
| GET | `/analysis?from&to&campaignId&unitId&subjectId` | `analysis.read` · **Silver** |
| GET | `/analysis/themes/:id` | `analysis.read` **and `response.read`** · **Silver** |

Both carry `requireEntitlement('analysis.read')` **after** `requireCapability`, so a 403
always beats a 402 (DEC-011). The theme route's second capability is not decoration: it
returns verbatim comments, and `40` puts those behind `response.read` on purpose. `43`
§ "The drill-through needs a second capability" has the argument.

`:id` is **derived from the theme**, not stored — the stemmed key term, so `valet parking` is
`valet-parking`. The route recomputes the corpus and filters to it, which is why the engine's
determinism is load-bearing rather than a nicety.

### Improve loop — `44`, BUILT `T-083`

| Method | Path | Capability |
|---|---|---|
| GET | `/reflect` | `reflection.read` · **Gold** |
| GET | `/reflect/:campaignId` | `reflection.read` · Gold — the form, on the campaign's own questions |
| POST | `/reflect/:campaignId` | `reflection.create` · Gold — **write-once**, 409 on a second |
| GET | `/reflect/:campaignId/gap` | `reflection.read` · Gold — **404 until the reflection exists** |
| POST | `/reflect/:campaignId/plan` | `actionplan.create` · Gold |
| POST | `/reflect/plans/:id/finalise` | `actionplan.create` · Gold — irreversible |
| POST | `/checkins` · PATCH `/checkins/:id` | `checkin.create` · Gold |

**The 404 on the gap is the ordering constraint, not a missing resource.** `44` § Purpose:
the reviewee records their own assessment before seeing anybody else's, *"enforced in the
API, not in the UI"*. There is deliberately **no route and no DTO** that returns a reviewee's
received scores on their own, so a client that ignores the lock has nothing to ask for.

`/reflect/*` is `self` in the only sense that matters: the caller's own linked subject, not a
scope string. `/checkins` is the supervisor's side and its reach is `visibleUnits()` — one
implementation of scope, shared (INV-003). Everything outside the caller's reach answers 404
rather than 403 (`13` §5).

`/plans` is **not** a top-level prefix. Finalising lives at `/reflect/plans/:id/finalise`
because a plan has no meaning outside the cycle it belongs to, and a second root would have
implied it does.

### Reserved — P3

Prefixes reserved here; the routes under them are specified in their own docs rather than
restated, so there is one authority per surface:

| Prefix | Capability | Specified in |
|---|---|---|
| `/api/v1/keys`, `/api/v1/webhooks` | `apikey.*` | `45-FEATURE-public-api.md` |

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
| 401 | `SIGN_IN_REQUIRED` | An `organization`-access campaign, reached without a session (DEC-037). Distinct from `UNAUTHENTICATED` because the respond world must offer a sign-in link rather than route to the console's login |
| 402 | `PAYMENT_REQUIRED` | Entitlement. `details.requiredTier` |
| 403 | `FORBIDDEN` | Capability. `details.decidedBy` |
| 403 | `NOT_A_MEMBER` | Signed in, but to a different organisation than the campaign's (DEC-037) |
| 409 | `ACCOUNT_AMBIGUOUS` | The email and password are correct **for more than one organisation** (`DEC-049`). `users` is unique on `(org_id, email)`, so one address can hold an activated account in several. The only 409 that is not a failure: the caller has authenticated and is being asked one more question. `details.organizations` carries `{ id, name }` for each — safe to disclose because it reaches only somebody who has just proved the password for every one of them. The client re-posts `/auth/login` with `orgId` |
| 403 | `WOULD_ESCALATE` | The request would create a position or account holding a power the caller does not hold at that unit (INV-012, `11` §5b). `details.capability` names which one |
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
- Being refused because the request would **hand out a power you do not hold** → `403
  WOULD_ESCALATE`, naming the capability. The caller can see they hold `assignment.create`, so
  a bare refusal reads to them as a bug; the answer they need is *which* power (`11` §5b).

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

**The key row is committed BEFORE the response is sent.** It was written fire-and-forget
afterwards until 21 Aug, which left a window: a retry arriving between the response going out
and the insert landing missed the read, ran the handler again, and created the second response
the mechanism exists to prevent. It cost one indexed insert of latency to close, and it was
only ever visible as an intermittent test failure (`_MEMORY.md` `N-055`).

A narrower window remains and is recorded as `D-011`: two requests that arrive genuinely
concurrently — the real flaky-network case, where the client never received the first response
— can both miss the read. The unique index still picks one winner, so at most one key row
exists, but both handlers ran. Closing it needs the key RESERVED before the handler rather than
written after it, which introduces an in-flight case that has to answer something.

---

## 8. Acceptance

- [ ] Every route above exists with the documented status codes
- [ ] Every non-public route has `validate` + `requireCapability` (`12` §7 enumeration test)
- [ ] Out-of-scope reads return 404, not 403 — tested both ways
- [ ] `GET /public/campaigns/:token` response contains no org internals, asserted by an
      explicit key allowlist test
- [ ] Invalid, closed and expired tokens are indistinguishable in the response
- [ ] A repeated `POST /campaigns/:id/launch` with the same key returns the first response
- [ ] The key row is readable the instant the caller has the response, not a beat later
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
