# 15 — Auth and sessions

Phase: P1 · Milestone: M0 · Owns: `apps/api/src/auth/**`
Decisions: `_MEMORY.md` DEC-009 · Invariants: INV-006, INV-010

---

## 1. Three principals, one middleware

`authenticate` produces one of three principal kinds, and nothing downstream cares which
(`12` §4.7).

| Principal | Credential | Who | Phase |
|---|---|---|---|
| `user` | JWT bearer token | Staff of an organisation | P1 |
| `respondent` | Opaque campaign token in the URL | Anyone with a link or a QR code | P1 |
| `apiKey` | `X-API-Key` header | An integration | P3, Enterprise only |

The important asymmetry: **respondents are not users and never will be** (DEC-009). They have
no row in `users`, no password, no session, and no cookie that identifies them. A hotel guest
scanning a QR on a table card must never see a login screen, and a student must never wonder
whether the system knows which feedback was theirs.

---

## 2. Staff sessions

### Tokens

| Token | TTL | Storage | Contents |
|---|---|---|---|
| Access | 15 min | Memory in the React app (never `localStorage`) | `sub`, `orgId`, `jti`, `iat`, `exp` |
| Refresh | 7 days | `httpOnly` `Secure` `SameSite=Lax` cookie, path-scoped to `/api/v1/auth/refresh` | Opaque, hashed in the database |

Access tokens are deliberately short-lived and carry **no capability claims**. Permissions
are resolved per request from the grant tables (`11`), never read from a token — because a
permission revoked at 10:00 must stop working at 10:00, not fifteen minutes later.

The access token in memory means a page refresh needs a silent refresh call. That is a small
amount of frontend work in exchange for closing the whole class of XSS token-theft bugs that
`localStorage` opens.

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

### Refresh rotation

Each refresh issues a new refresh token and invalidates the old one. A reused old token means
theft: the whole family is revoked and the event is audited. This is cheap and it is the only
mechanism that detects a stolen refresh token at all.

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

---

## 6. Frontend session handling

Specified fully in `20-FRONTEND-ARCHITECTURE.md` §5; the contract:

- Access token in a module-scoped variable, in `authSlice` (`23`).
- On boot, `/auth/refresh` then `/auth/me` — which returns the session, the org, **the
  labels** (`22`), and the caller's capability set.
- A 401 triggers one silent refresh; a second 401 ends the session and routes to `/login`.
- The capability set hides actions the caller cannot perform. **Usability only** — the API
  still enforces (INV-003). The UI never decides authorisation, and a capability set that is
  wrong causes a confusing button, not a security hole.

---

## 7. Threats and responses

| Threat | Response |
|---|---|
| Token theft via XSS | Access token in memory, refresh in `httpOnly` cookie. No token in `localStorage` |
| CSRF | Bearer header auth, not cookie auth, for everything except the refresh endpoint — which is `SameSite=Lax` and path-scoped. **Revisit the whole section if auth ever moves to cookies** (`12` §9) |
| Credential stuffing | Per-IP+email rate limit, argon2id, uniform failure response |
| Account enumeration | Identical response and timing for unknown email and wrong password |
| Token guessing on `/r/:token` | 131 bits of entropy; uniform 404 for every failure mode |
| Stolen refresh token | Rotation with reuse detection; family revocation, audited |
| Cross-tenant access via a forged JWT `orgId` | Signature verified, and `orgId` is taken from the verified claim only — never from a body (INV-010) |
| Privilege escalation via self-granting | Allowed only if a rule permits it, audited loudly, and surfaced by the self-approval-loop warning (`33`) |

---

## 8. Acceptance

- [ ] Login with a wrong email and a wrong password are indistinguishable in body and timing
- [ ] An access token contains no capability claims
- [ ] A revoked permission stops working on the **next request**, not after token expiry
- [ ] Reusing a rotated refresh token revokes the family and writes an audit row
- [ ] `password_hash` never appears in any API response — asserted by a response-shape test
- [ ] A draft campaign has no `public_token` and no reachable `/r/` URL
- [ ] Invalid, unlaunched, closed and expired tokens return byte-identical 404s
- [ ] `responses` cannot be joined to a person — verified by schema inspection, not by review
- [ ] Registration is atomic: a forced failure at step 3 leaves no organisation behind
- [ ] Two respondent submissions with the same idempotency key create one response

## 9. Out of scope

| Not building | Why |
|---|---|
| SSO / SAML / OIDC | Enterprise tier, P3. Real work, zero demo value |
| Email verification, password reset | P2. Auth surface stays small while middleware is the graded work |
| MFA | P3 at the earliest |
| Respondent accounts | Contradicts DEC-009 and the entire collection model |
| Session listing / device management | No demand, meaningful complexity |
