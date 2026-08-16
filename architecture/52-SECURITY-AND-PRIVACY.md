# 52 — Security and privacy

Phase: P1 onward · Owns no path; constrains all
Invariants: INV-004, INV-006, INV-007, INV-010

Endur asks people to say honest things about people with power over them. That is the whole
product, and it only works if the privacy promise is real. This document is the promise
written down.

---

## 1. The anonymity guarantee

> **An anonymous response cannot be traced to the person who submitted it — not by an
> administrator, not by a database query, not by us.**

This is a **schema property, not a policy** (INV-006). The `responses` table has no column
that could identify a respondent: not a user id, not a hashed email, not an IP, not a session
fingerprint. It cannot identify anyone because it has nothing to identify them with.

Duplicate submission is still prevented, via separation rather than identification
(`10` §4.4):

```
invitations   records THAT a token was used     (token, used_at)
responses     records WHAT was said             (no respondent column)
nothing joins them
```

So the system reports *"312 of 400 invited people responded"* and remains unable to say which
response is whose.

**What we do not claim.** For an open link with no per-person invitations, one-response-per-
person is best-effort only — a `localStorage` marker and per-IP rate limiting. A shared link
cannot be both fully anonymous and strictly one-per-person, and the product says so plainly
rather than overclaiming. Knowing exactly which guarantee we give is a better position than a
false one.

## 2. k-anonymity

Results below `K_ANON_THRESHOLD` (default 5) are **not returned by the API at all** — not
zeroed, not rounded, absent (`40`).

With three responses in a small department, an average plus one comment identifies the author,
and an administrator who wants to find a critic will find them. Suppression is the anonymity
promise being kept when it is inconvenient, which is the only time such a promise means
anything.

Applies to aggregates, comments, exports, and the analysis surface (`43`). The UI explains the
threshold rather than showing an error — *"Results appear once 5 people have responded. 3 so
far."*

## 3. Confidentiality has a limit, stated up front

From `design_specs/SCOPE.md`:

> Confidentiality cannot cover harm. Reports involving safety, harassment, or abuse must reach
> someone who can act — institutions have a legal duty of care they cannot contract out of.

**The rules are defined openly and shown to members before they participate**, so nobody is
misled about what "confidential" means. A privacy promise with an undisclosed exception is
worse than no promise, because it is relied upon.

Architecturally this belongs with Communities (P3 stretch). It is recorded here so that when
confidential communities are built, the escalation path is designed in from the start rather
than retrofitted after an incident.

## 4. Authorisation

Covered in `11` and `12`. The security-relevant properties:

- **Default deny.** No grant means no. There is no implicit permission anywhere.
- **Deny beats allow, unconditionally** (INV-004). No scope, level, group, or delegation
  overrides an explicit deny. This is what makes a hard block genuinely safe rather than merely
  default.
- **Authorisation is middleware, never handler logic** (INV-003), and a route missing its guard
  fails the build (`51` §3).
- **The API returns only what the caller may see.** The UI never filters for permission
  reasons.
- **Out-of-scope resources return 404, not 403** (`13` §5) — a 403 confirms the resource
  exists, which leaks structure to someone who cannot see it.
- **Permissions are resolved per request, never from a token claim** (`15` §2). A permission
  revoked at 10:00 stops working at 10:00.

## 5. Tenant isolation

Two layers, deliberately redundant (`10` §8, `16` §1):

1. `tenantResolver` injects `orgId` from the verified credential — **never from a request
   body** (INV-010) — and services use a tenant-bound client.
2. Postgres row-level security as a backstop. If the application forgets, the database
   refuses.

Layer 2 is a P1 exit criterion. It is the difference between "we filter carefully" and "it is
not possible".

## 6. Audit

Every state-changing request writes an audit row **in the same transaction as the mutation**
(INV-007), recording actor, action, target, request id, and **which grant decided it**.

Same-transaction is the requirement that matters: an audit log written separately can succeed
when the mutation rolled back, and a log that disagrees with reality is worse than none.

`decided_by` turns "access denied" from an assertion into evidence, and it is what the
simulator replays (`42`).

**Audit rows are never deleted.** Not on org downgrade, not on user deletion. They are the
record that something happened.

## 7. Secrets and data handling

- No secret in the repository. `.env.example` documents every variable with no real values.
- Config is parsed by a Zod schema at boot and **fails fast** on a missing required variable
  (`14` §5).
- Passwords: argon2id. Hashes never selected into a response — asserted by test (`15` §8).
- API keys: only `key_hash` and `prefix` stored. Unrecoverable, only revocable.
- **Bodies are never logged.** They contain feedback text and credentials (`12` §4.2).
- Stack traces never cross the boundary in production (`12` §4.15).

## 8. Input handling

- Every input validated by a shared Zod DTO before reaching a handler (`14`).
- Unknown keys stripped — which is what blocks `orgId` and `role` smuggling.
- Body size capped at 256 kb; uploads streamed with a separate 5 MB cap.
- Parameterised queries throughout. The single raw-SQL file uses parameter binding only,
  never string interpolation (`10` §6).
- React escapes by default; `dangerouslySetInnerHTML` appears nowhere. Feedback comments are
  untrusted user text rendered into an admin console, which is a stored-XSS vector if anyone
  ever reaches for rich text.

## 9. Rate limiting and abuse

Per `12` §4.11. The respondent submit limit is deliberately loose per IP, because a campus or
hotel NAT means a tight limit would block a building. Abuse protection there leans on
idempotency and the invitation token rather than on IP.

## 10. Known limitations — stated, not hidden

Being explicit about these is a stronger position than pretending they are handled.

| Limitation | Status |
|---|---|
| No email verification or password reset in P1 | P2 (`15` §5) |
| Open-link duplicate prevention is best-effort | Permanent property of anonymous open links (§1) |
| No MFA | P3 at the earliest |
| No encryption at rest beyond what the database provides | Deployment concern, not application |
| No penetration test | Out of scope for a course project |
| RLS lands after the application layer | P1 exit criterion, §5 |

## 11. Acceptance

- [ ] `responses` has no person-referencing column — verified by schema inspection (`51` §3)
- [ ] Below the k-anon threshold, no per-question data is present in the response body
- [ ] A forged body `orgId` has no effect on any endpoint
- [ ] RLS policies are active on every tenant table
- [ ] Every mutation writes an audit row with `decided_by`, in the same transaction
- [ ] Audit rows survive a user deletion and an org downgrade
- [ ] No response anywhere contains a password hash, an API key, or a stack trace
- [ ] Request bodies do not appear in logs
- [ ] `dangerouslySetInnerHTML` appears nowhere in the codebase
- [ ] Out-of-scope resources return 404, not 403
- [ ] The app refuses to boot without a required secret
