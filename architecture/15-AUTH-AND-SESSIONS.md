# 15 — Auth and sessions

Phase: P1 · Milestone: M0 · Owns: `src/backend/auth/**`
Decisions: `_MEMORY.md` DEC-009, DEC-014 · Invariants: INV-006, INV-010

---

## 1. Three principals, one middleware

`authenticate` produces one of three principal kinds, and nothing downstream cares which
(`12` §4.7).

| Principal | Credential | Who | Phase |
|---|---|---|---|
| `user` | **Cookie session** | Staff of an organisation | P1 |
| `respondent` | Opaque campaign token in the URL | Anyone with a link or a QR code | P1 |
| `apiKey` | `X-API-Key` header | An integration | P3, Enterprise only |

The important asymmetry: **respondents are not users and never will be** (DEC-009). They have
no row in `users`, no password, no session, and no cookie that identifies them. A hotel guest
scanning a QR on a table card must never see a login screen, and a student must never wonder
whether the system knows which feedback was theirs.

---

## 2. Staff sessions

### The session

DEC-014. `express-session` with `connect-pg-simple`, so sessions live in the database we
already run rather than in a second piece of infrastructure.

| | |
|---|---|
| Cookie | `endur.sid` — `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/` |
| Lifetime | 7 days, **rolling** — active use extends it, idleness expires it |
| Contents | A session id and nothing else. No user data, no org, no capabilities |
| Store | `sessions` table; revocable server-side by deleting the row |

Two properties carried over from the JWT design because they were the valuable parts, and
neither depends on JWT:

**No capability claims anywhere.** Permissions are resolved per request from the grant tables
(`11`), never read from a credential — because a permission revoked at 10:00 must stop working
at 10:00, not whenever a token happens to expire.

**Nothing sensitive in the client.** The cookie is `httpOnly`, so no script can read it. This
is strictly better than the previous in-memory access token: it closes the same XSS
token-theft class *and* removes the silent-refresh dance on every page load.

### Session hygiene

- **Regenerate the session id on login.** Without this, an attacker who can set a cookie
  before login owns the session after it — session fixation. One line, and it is the single
  most commonly forgotten step in cookie auth.
- **Destroy server-side on logout**, not just clear the cookie. A cleared cookie on a
  still-valid session is not a logout.
- Regenerate on privilege change — specifically when a user's own assignments change.
- `Secure` is unconditional outside development; the demo tunnel is HTTPS (OPEN-002).
- **`endur.csrf` carries the same `maxAge` as this cookie.** The two must be present together
  to make a mutation, so they must expire together. When they did not, closing the browser
  dropped the CSRF cookie, kept the session, and left the caller signed in and unable to write
  anything — permanently (`T-047`, `_MEMORY.md` `N-050`). The mechanism is `12` §4.8; the
  lifetime is a session concern and belongs here.

### Why not JWT for staff

Considered and rejected (DEC-014). JWT would mean an in-memory access token plus a refresh
token plus a silent-refresh call on every boot — real frontend complexity — to solve a
cross-origin problem we do not have, since the SPA and API are same-origin. JWT is retained
where it earns its place: API keys for integrations (`45`).

The cost of this choice is that **CSRF becomes real**, and that cost is paid explicitly in
`12` §4.8 rather than waved away.

### Password handling

- **argon2id**, not bcrypt: memory-hard, and the current recommendation.
- Minimum 10 characters. No composition rules — length beats a mandated punctuation mark, and
  composition rules mostly produce `Password1!`.
- The hash is never selected into a query result. The Prisma model omits it from the default
  selection; it is fetched explicitly only by the login path.
- Login failures are **uniform**: wrong email and wrong password return the same message and
  take the same time. An enumerable login endpoint hands over the org's staff list.

### Rate limiting

`POST /auth/login` is 10 attempts per 15 minutes per `IP + email` (`12` §4.11). Per-email as
well as per-IP, because a campus NAT means per-IP alone would either lock out a building or
protect nobody.

### Session revocation

Because sessions are rows, revocation is a delete — immediate, with no window where an
already-issued credential still works. That is the concrete advantage over stateless tokens
and it is worth stating: an administrator disabling a user's account ends their session on the
next request, not up to fifteen minutes later.

---

## 3. Respondent tokens

The demo's decisive path, and the one an evaluator touches with their own phone.

### Campaign token

- Minted on `campaign.launch`, never before. A draft campaign has no reachable URL.
- 22-character base62 from `crypto.randomBytes` — ~131 bits. Not sequential, not derived from
  the campaign id, not guessable.
- URL: `{PUBLIC_BASE_URL}/r/{token}`. That string is what the QR encodes.
- Valid only while the campaign is `open` and within its window.

**Invalid, unlaunched, closed and expired tokens all return the same 404** (`13` §6). An
existence probe must not distinguish them.

### Anonymity, and how duplicate submission is still prevented

These pull against each other, and the resolution is a schema decision, not a policy
(`10` §4.4):

```
invitations   records THAT a token was used     (token, used_at)
responses     records WHAT was said             (no respondent column, ever)
nothing joins them
```

So the system can report *"312 of 400 invited people responded"* and remain unable to say
which response belongs to whom. The `responses` table has no column that could identify a
respondent — not a user id, not a hashed email, not an IP (INV-006).

For an open link with no per-person invitations, duplicate prevention is best-effort only: a
`localStorage` marker plus per-IP rate limiting. **This is stated honestly in the product
rather than overclaimed.** A shared link cannot be both fully anonymous and strictly
one-per-person; pretending otherwise would be a lie in the pitch, and "we know exactly which
guarantee we give" is a better viva answer than a false one.

### What a respondent may do

Exactly two things: read the form for their token, and submit to it once. There is no
respondent-facing anything else, and no respondent principal ever reaches the grant tables.

### The authenticated respondent — DEC-037, and how narrow it is

A campaign may be marked `access: 'organization'` (`38`), and then the token alone is not
enough: the caller must also present a **staff session for that organisation**.

This amends DEC-009 and does not overturn it, and the difference is worth being precise about,
because "respondents never authenticate" was load-bearing and still is for every `public`
campaign — which is the default, the demo path, and every seeded campaign today.

| | |
|---|---|
| What is **not** created | A respondent account. A respondent cookie. A fourth principal kind. A new `Principal` variant in `11` §2 |
| What is used instead | The `endur.sid` session the person already has as staff (§2). They are a `user` principal answering a form |
| What is checked | **Membership only** — is this session's `orgId` the campaign's `orgId`. No grant is resolved; no capability is required; holding more powers buys nothing |
| What is written | A `campaign_participants` row: *this member answered*. Never *what* |
| What is **not** written | Anything on `responses`. That table still has no column that could identify a respondent, and INV-006 is untouched because it is a property of the schema (`10` §4.4) |

**Membership is checked at the gate; identity is discarded at the door.** That sentence is the
whole design, and it is what lets an organisation say *"only our people can answer"* without
the product learning who said what.

The honest cost, stated here as well as in `10` §4.4 and on the form itself: **participation
stops being anonymous.** An administrator can see that Priya answered and Sam did not — exactly
what `invitations` has always allowed for invited campaigns. `<AccessNotice>` (`24` §7) tells
the respondent which of the two promises they are being given, because a respondent who
believes the wrong one has been misled about the only thing `52` promises them.

**The gate runs after token resolution, never before.** An invalid, unlaunched, closed or
expired token produces the same `404` it always did (`13` §6); only a *valid* token can reach
`401 SIGN_IN_REQUIRED`. So the existence oracle stays closed — the 401 discloses nothing the
working token in the caller's hand did not already disclose.

---

## 4. API keys — P3

Enterprise tier only (`01` §6, `16`).

- Format `endur_live_<8-char prefix><32 random chars>`, shown **once** at creation.
- Only `key_hash` (SHA-256) and `prefix` are stored (`10` §5). We cannot recover a key, only
  revoke it.
- Keys carry explicit `scopes`, a subset of the capability catalogue. Effective permission is
  `scopes ∩ org entitlements` — a key can never exceed what the organisation bought, and
  never exceed what was granted to it.
- `last_used_at` is updated asynchronously, so an unused key is visibly stale in the UI.
- Revocation is immediate — the key hash lookup is the check, and there is no token to expire.

Detailed in `45-FEATURE-public-api.md`.

---

## 5. Registration and org creation

`POST /auth/register` creates an organisation and its owner in one transaction:

1. Create `organizations` with the chosen industry preset's `labels`
2. Create the owner `user`
3. Seed nodes, edges and derived grants from the preset (`11` §8, `50`)
4. Create a `subscriptions` row on the trial tier
5. Audit the whole thing as one event

Either all of it happens or none of it does. A half-seeded org has no roles, which means
nobody can do anything, which looks exactly like a broken product.

Deliberately **not** in P1: email verification, password reset, SSO. Each is real work with
no demo value, and the graded surface this phase is the middleware chain. Password reset is
the first thing to add in P2 — it is the first support request any real deployment generates.

### Every other account is provisioned, not registered — DEC-038

`POST /auth/register` is the **only** path that creates an organisation, and it creates exactly
one account: the founder's. There is no second public way in. Everybody else gets an account
because somebody inside the organisation provisioned one for them
(`57-FEATURE-accounts-and-invites.md`):

```
POST /people/:id/account   ->  a one-time activation link, shown once, hashed at rest
GET  /auth/activate/:token ->  whose link is this, and for which organisation
POST /auth/activate/:token ->  set a password, activate, and land signed in
```

Three properties of that flow belong in this document rather than in `57`, because they are
session properties:

**Activation regenerates the session id**, exactly as login does. The fixation risk is
identical and the mitigation must be too — this is a route that hands out a session, and every
route that hands out a session gets the same treatment.

**An administrator never knows a working credential.** They choose nothing about the password;
they hand over a link. `34` has always said so and it survives DEC-038 unchanged — an
administrator who can set a dean's password can sign in as the dean, and every audit row from
that session would name the dean. The org chart would be intact and the audit log would be
fiction, which is precisely what `56` exists to prevent.

**Revocation is a delete.** `DELETE /people/:id/account` removes the account's `sessions` rows,
so access ends on the next request rather than whenever a credential happens to expire. That is
the concrete advantage §2 claims for cookie sessions, and this is the route that spends it.

---

## 6. Frontend session handling

Specified fully in `20-FRONTEND-ARCHITECTURE.md` §5; the contract:

- **No token handling at all.** The cookie is `httpOnly`; the client never sees a credential.
- On boot, one call: `GET /auth/me` — returns the session, the org, **the labels** (`22`), and
  the caller's capability set. If it 401s, route to `/login`.
- Every request sends `credentials: 'include'` and echoes the CSRF token (`12` §4.8).
- The capability set hides actions the caller cannot perform. **Usability only** — the API
  still enforces (INV-003). The UI never decides authorisation, and a capability set that is
  wrong causes a confusing button, not a security hole.

---

## 7. Threats and responses

| Threat | Response |
|---|---|
| Credential theft via XSS | `httpOnly` cookie — no script can read it. Nothing in `localStorage`, nothing in the store |
| **CSRF** | The real cost of cookie auth. Double-submit token on unsafe methods for cookie principals only, plus `SameSite=Lax`. Specified in `12` §4.8 |
| Session fixation | Session id regenerated on login |
| Credential stuffing | Per-IP+email rate limit, argon2id, uniform failure response |
| Account enumeration | Identical response and timing for unknown email and wrong password |
| Token guessing on `/r/:token` | 131 bits of entropy; uniform 404 for every failure mode |
| Stolen session cookie | Server-side revocation by deleting the row; immediate, no expiry window |
| Cross-tenant access via a forged `orgId` | `orgId` comes from the server-side session record only — never from a body or a client-supplied claim (INV-010) |
| Privilege escalation via self-granting | Allowed only if a rule permits it, audited loudly, and surfaced by the self-approval-loop warning (`33`) |

---

## 8. Acceptance

- [ ] Login with a wrong email and a wrong password are indistinguishable in body and timing
- [ ] The session cookie is `httpOnly`, `Secure` and `SameSite=Lax`, and carries only an id
- [ ] No credential is readable from JavaScript — verified in the browser console
- [ ] A revoked permission stops working on the **next request**
- [ ] The session id changes on login (fixation test)
- [ ] Logout destroys the server-side row, and replaying the old cookie fails
- [ ] A mutation without a CSRF token returns `403 CSRF_FAILED` (`12`)
- [ ] `password_hash` never appears in any API response — asserted by a response-shape test
- [ ] A draft campaign has no `public_token` and no reachable `/r/` URL
- [ ] Invalid, unlaunched, closed and expired tokens return byte-identical 404s
- [ ] `responses` cannot be joined to a person — verified by schema inspection, not by review
- [ ] Registration is atomic: a forced failure at step 3 leaves no organisation behind
- [ ] Two respondent submissions with the same idempotency key create one response
- [x] An `organization` campaign is unreachable without a session and unreachable with a
      session for another organisation — two assertions, and neither is satisfiable by the
      other (`T-069`)
- [x] A valid token on a restricted campaign returns `401 SIGN_IN_REQUIRED`; an **invalid**
      token on the same campaign returns the same `404` as any other bad token — the gate runs
      after resolution, and this is the test that proves the order. A **closed** restricted
      campaign 404s a stranger too, which is the same rule from the other side
- [x] An authenticated submission writes no identifying column on `responses` — the same
      schema assertion as above, run against the authenticated path. **It was `audit_log`,
      not `responses`, that nearly carried the name** (`DEC-045`, `D-022`): the promise is
      kept by two tables, so it can be broken by either
- [ ] Activation regenerates the session id (fixation test, on `/auth/activate` too)
- [ ] Activating an expired, used or unknown token returns identical responses
- [ ] Revoking an account ends its live sessions on the next request
- [ ] No route anywhere lets one user set another user's password — asserted by route
      enumeration (`12` §7), not by reading handlers

## 9. Out of scope

| Not building | Why |
|---|---|
| SSO / SAML / OIDC | Enterprise tier, P3. Real work, zero demo value |
| Email verification, password reset | P2. Auth surface stays small while middleware is the graded work |
| MFA | P3 at the earliest |
| Respondent accounts | Contradicts DEC-009 and the entire collection model |
| Session listing / device management | No demand, meaningful complexity |
