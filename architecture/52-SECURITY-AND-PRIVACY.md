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
invitations             records THAT a token was used      (token, used_at)
campaign_participants   records THAT a member responded    (campaign_id, user_id)
responses               records WHAT was said              (no respondent column)
nothing joins them
```

So the system reports *"312 of 400 invited people responded"* and remains unable to say which
response is whose.

### Two promises, and saying which one is being made

`campaign_participants` arrives with DEC-037, the `organization` access mode (`38`), and it
makes a distinction that was previously invisible because only one side of it existed:

| Promise | Means | When it holds |
|---|---|---|
| **The answer is anonymous** | Nothing links what you wrote to who you are | Always. It is INV-006 and it is in the schema |
| **Your participation is private** | Nobody knows you took part at all | Only on an open link with no invitations |

An `organization` campaign keeps the first and **gives up the second** — an administrator sees
that Priya answered and Sam did not. That is exactly what `invitations` has always allowed for
invited campaigns; what is new is that it now applies to a mode people will choose casually
from a toggle, so **the respondent is told on the form** (`<AccessNotice>`, `24` §7) rather
than left to assume the stronger promise.

Naming the two separately is the point. A product that says "anonymous" and means the first
while the reader hears the second has misled them, and it will be found out at exactly the
wrong moment.

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

**Refusals are recorded too** (DEC-041) — denials of mutating capabilities, with the deciding
deny. *Somebody tried to launch a campaign in Engineering and was refused* is the half an
administrator actually wants from a log, and it is the half that was missing while a row meant
only *something happened*. Read-denials are deliberately excluded: a 403 on a `GET` is the
permission system working correctly, thousands of times a day, and logging all of them produces
a table nobody reads.

### The audit log must never become a path back to a respondent — DEC-040

A response submission writes an audit row, correctly: INV-007 covers every state change and a
submission is the most consequential one in the product. Until 2026-08-23 that row carried the
submitting **IP address**, because `db/tx.ts` wrote `ip` for every principal alike.
`responses.submitted_at` is written in the same transaction, so:

```
audit_log   response.submit · campaign X · 14:05:11 · 203.0.113.44
responses            (anon) · campaign X · 14:05:11
```

Sorting both by time and zipping them yields IP addresses against responses. §1 promises the
`responses` table has no column that could identify a respondent — and it still does not. The
link would have been built out of two tables that each keep the promise on their own.

**Nothing read `audit_log`, which is why it survived four security passes.** `56-PAGE-activity-
log.md` is the reader that would have made it live, and the column is fixed with that page
rather than after it. The rule is at the **writer** — `ip` is written only for a `user`
principal — because a fix at the reader protects one screen and a fix at the writer protects
every screen anybody builds later.

The general lesson is worth keeping: **a dormant leak is a leak.** The question to ask of any
new read surface is not *does this expose something* but *what does this make readable that
was only written*.

### It came back through a different door the same day — DEC-045

The fix above is keyed on the **principal**: `ip` for a `user` and nobody else. That was right
for exactly as long as a respondent could never *be* a user, and `DEC-037` made them one. An
`organization` campaign is answered by a signed-in member (`15` §3), so the same writer would
have put **the member's user id** on the `response.submit` row, beside a response committed in
the same transaction:

```
audit_log   response.submit · campaign X · 14:05:11 · priya · 203.0.113.44
responses            (anon) · campaign X · 14:05:11
```

A name is worse than an address. And it was **already reachable before `DEC-037`** (`D-022`):
the respondent chain has always resolved an optional session, so a staff member answering a
*public* link from their own signed-in browser — the demo presenter scanning their own QR —
already wrote that row. It had never fired, which was checked rather than assumed.

So the rule is re-keyed on **the action**: `response.submit` carries neither actor nor IP,
whoever is signed in. The principal was never the thing that mattered; *"this state change is
a respondent saying something"* is. It is a list at the writer — `ANONYMOUS_ACTIONS` in
`db/tx.ts` — rather than a flag passed at the call site, because a flag is a thing the next
respondent-facing handler forgets and a list is a thing they have to add to.

**The second lesson, and it is the more useful one:** a rule keyed on *who the caller is* has
to be re-examined every time the set of callers changes. This one was patched twice in three
hours because the first fix answered *which principal* when the question was *which action*.

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
- JSON body capped at 256 kb; binary uploads bypass it with a 2 MB streaming cap (`48`), and CSV import stays inside it at 150,000 characters (`12` §4.4).
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
| No MFA | P3 at the earliest — **except platform operators, where it is required from the start** (`19` §9) |
| Activation links are copied by hand, not emailed | No mailer exists (`17` is a placeholder). The link is a 7-day single-use credential travelling over whatever channel the administrator chooses, which may be a group chat. `57` states the trade; the seam is one function |
| `organization` campaigns make participation visible | Deliberate and disclosed on the form (§1). The alternative — a per-person invitation to 400 people — is what the mode exists to avoid |
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
- [ ] **A respondent submission writes an audit row whose `ip` is NULL** (DEC-040), and a staff
      mutation writes one whose `ip` is populated — the same test both ways, so the rule cannot
      be satisfied by never writing `ip` at all
- [ ] The activity log's DTO has no `ip` field (`56`)
- [x] `campaign_participants` cannot be joined to `responses` — schema inspection, as above.
      Asserted against `information_schema` on the **authenticated** submission path, which is
      where a column would ever get added: the member's id is in scope at the moment the
      response row is written, and it does not appear in it (`test/campaign-access.test.ts`)
- [ ] An `organization` submission writes no identifying column on `responses`
- [ ] Denied mutations appear in the audit log with the deciding deny; denied reads do not
- [ ] No log line contains a request body, a credential or a respondent identity — asserted
      against a fixture run, and now doubly load-bearing because `72` renders these files
