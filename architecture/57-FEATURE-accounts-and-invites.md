# 57 — Accounts and invites

Phase: P2 · Milestone: — · Related: `34` (people), `15` §2 §5 (sessions, registration),
`11` §5b (the escalation bound), `33` (the powers grid)
Decisions: `_MEMORY.md` DEC-038, DEC-039 · Invariants: INV-005, **INV-012**
Owns: `src/backend/features/accounts/**`, `src/backend/auth/inviteToken.ts`,
`src/frontend/pages/public/Activate.tsx`

## Purpose

**An organisation provisions its own sign-ins.** A university administrator creates the
account a dean signs in with; the dean creates the accounts their heads of department sign in
with. Today the only account that has ever existed is the founder's, minted by
`POST /auth/register` — every other person in the graph is a `person` node with no way to log
in, which makes every screen in the console a screen exactly one human can open.

This is the missing half of `34`. `34` builds the org chart; this makes the people in it able
to arrive.

The distinction that runs through the whole document:

| | |
|---|---|
| A **person** | A node in the graph. Can hold positions, be a reviewee, appear in a list. Cannot sign in |
| An **account** | A `users` row with a password. Can sign in. Has whatever powers their positions give them, and no others |

Creating a person grants nothing (`34`, `14` §8). Creating an account grants nothing *either* —
it hands over the key to powers the positions already conferred. **The powers and the key are
separate acts, separately audited**, and that separation is what lets an administrator revoke
someone's access this morning without dismantling the org chart they are still in.

## Route & access

No page of its own. Three placements:

| Where | What | Doc |
|---|---|---|
| `/app/people` row action | **Invite** on anyone with no account | `34` |
| `/app/people/:id` | Account panel: status, last sign-in, re-issue, revoke | `34`, `47` |
| `/activate/:token` | **Public world.** The person sets their own password and lands signed in | here |

`/activate/:token` is in the **public** route tree beside `/login` and `/start`, not the
console — the person following it has no session, by definition, and `<ConsoleLayout>` would
bounce them to `/login` before the page ever rendered.

## Capabilities

| Action | Capability | Scope |
|---|---|---|
| Provision an account | `account.create` | The **person's** — same targeting as `person.update` |
| Re-issue activation | `account.reset` | same |
| Revoke an account | `account.revoke` | same |
| Activate | **none** | The token is the credential |

Added to `11` §3 as a new **Accounts** module. Three verbs rather than one, because they carry
genuinely different risk: creating is routine, re-issuing is the support path, and revoking
ends somebody's access mid-day and is the one an administrator should be able to withhold from
a coordinator while granting the other two.

**Every one of them is additionally bounded by INV-012** (`11` §5b). Holding `account.create`
is not permission to create an account more powerful than your own.

`account.reset` carries the bound too, which the table in `11` §5b names only for
`account.create`. Re-issuing mints an equally working link for the same account, so a bound
on one and not the other is a bound with a second door — the same reasoning that put it on
`POST /people/import` when it was written for `/:id/assignments` alone. **Both minting routes
carry it; `DELETE` does not, because revocation only ever removes access.**

Seeded scopes are in `50` §1: `account.create` and `account.reset` reach L2, `account.revoke`
stops at L1. That row exists *because* there are three verbs rather than one.

## The escalation bound, in this document's terms

`11` §5b specifies the rule; this is what it means at this desk.

A head of department holds `account.create` scoped to their subtree. They can give a sign-in
to anybody in their department. They **cannot** give a sign-in to a person whose positions
resolve to something the head does not hold — so if the founder has left a `Registrar` role
with `grant.update` at the root, a head of department cannot mint the Registrar's account and
then ask them for a favour.

Two consequences worth stating before somebody hits them and files a bug:

**Provisioning is checked against the person's positions at the time of provisioning.** If
somebody is later assigned a more powerful position, the bound is enforced *there*, by the
same rule on `assignment.create` — which is why both routes carry it and neither is enough
alone.

**A person with no positions can always be given an account.** They resolve to nothing, the
subset check is trivially satisfied, and what they can do after signing in is exactly
`person.read:self` and `person.update:self` — their own profile (`47`) and nothing else. That
is the correct answer and it is the common one: invite first, assign afterwards.

## Data contract

| Action | Endpoint | Body → Response |
|---|---|---|
| Provision | `POST /api/v1/people/:id/account` | `{ }` → `AccountInvite { url, expiresAt, personName }` |
| Re-issue | `POST /api/v1/people/:id/account/reset` | `{ }` → `AccountInvite` |
| Revoke | `DELETE /api/v1/people/:id/account` | — → `204` |
| Inspect a link | `GET /api/v1/auth/activate/:token` | → `{ personName, orgName, orgLogoUrl, expiresAt }` |
| Activate | `POST /api/v1/auth/activate/:token` | `ActivateAccountBody { password }` → the same payload as login |

```ts
// packages/shared/src/dto/account.ts
export const ActivateAccountBody = z.object({
  password: z.string().min(10, 'Use at least 10 characters.'),
});

export type AccountInvite = {
  url: string;          // PUBLIC_BASE_URL + /activate/<token>. SHOWN ONCE.
  expiresAt: string;
  personName: string;
};

export type AccountStatus =
  | { state: 'none' }
  | { state: 'invited'; expiresAt: string; invitedAt: string }
  | { state: 'active'; lastLoginAt: string | null }
  | { state: 'disabled'; disabledAt: string | null };
```

`disabledAt` is `| null` rather than `string`, and `users.disabled_at` is a new column
(`10` §2). The date had to come from somewhere: the only other place it exists is the
`account.revoke` audit row, which would mean one audit query per person in a list of two
hundred to render one line. `null` covers a row disabled by hand, which is the one path that
does not write the column — inventing `created_at` there would be a fabrication on the screen
that exists to say when access ended.

**`AccountStatus` rides on `PersonSummary`, not only on `PersonDetail`.** § States below puts
`Invite` on a LIST ROW and `Pending` on another, and `users.status` cannot tell those apart —
a person awaiting activation and a person nobody has invited are both `invited` with a null
hash. The difference is whether an unaccepted invite exists, so the server answers it rather
than leaving the row to guess.

**The four states are tested in a fixed order** (`features/accounts/status.ts`), because the
order is a product decision rather than a mapping detail:

1. **a password beats everything.** `account.reset` on an *active* account mints a live invite
   while the old password still works — it is not replaced until activation. Reporting
   `invited` there would tell an administrator a colleague cannot sign in when they can.
2. **a live invite beats `disabled`.** Re-issuing on a revoked account is how re-enabling
   works; between the two the truthful state is "waiting for them". Both mean the same thing
   about access — the hash is null — so nothing is hidden by preferring the one that says what
   happens next.
3. `disabled` is what is left when somebody was revoked and nobody re-invited them.
4. `none` is the ordinary case for most of the graph.

An **expired** live invite still reports `invited`, carrying its past `expiresAt`. There is no
fifth state and there does not need to be: the date is in the payload, and a server-side
`expired` would have to be recomputed on every render anyway to stay true.

`AccountStatus` is a discriminated union rather than the `users.status` string plus three
nullable dates, for the reason `14` §4 gives about `AnswerValue`: the four states have
genuinely different fields, and a shape that admits `{ state: 'none', lastLoginAt: '…' }` is a
shape the UI has to defend against.

**`GET` before `POST`.** The activation screen greets the person by name and names the
organisation before asking for a password. A bare password box reached from a pasted link is
indistinguishable from a phishing page, and we are asking people to trust a link that arrived
over WhatsApp.

## The token

Same construction as the campaign token (`15` §3) and for the same reasons:

- 32 bytes from `crypto.randomBytes`, base62 — not sequential, not derived from the user id.
- **Only `sha256(token)` is stored.** We cannot recover a link, only mint a new one. This is
  the `api_keys` treatment (`10` §5) and it is what makes "shown once" true rather than
  decorative.
- Expires in **7 days**. Long enough to survive a weekend, short enough that a link left in a
  group chat stops working.
- **One live invite per person**, enforced by a partial unique index (`10` §5) rather than by
  a service-layer `deleteMany`. Re-issuing invalidates the previous link *in the same
  statement that creates the new one*, so there is no window where two links work.
- Consumed exactly once, by a **conditional update** rather than by `SELECT … FOR UPDATE`.
  `UPDATE account_invites SET accepted_at = now() WHERE id = … AND accepted_at IS NULL AND
  expires_at > now()` is one statement: the loser of a race blocks on the row, re-evaluates
  the predicate against the committed version, matches nothing, and gets the dead end.
  Exactly one activation, same guarantee, and no raw SQL — so no exception to `DEC-007`,
  which confines `$queryRaw` to `db/graph.ts`. **Amended at `T-072`**; the two-statement
  version this line used to specify would have worked equally well and cost a `DEC`.

Rate limited per token **and** per IP (`12` §4.12 — the scoped bucket; §4.11 is
`requireEntitlement`), because a token is a credential and an unlimited activation endpoint
is an unlimited password-set endpoint.

## No email, and why the link is copied by hand

**There is no mailer in this application and this document does not add one.** The
administrator gets the link on screen, copies it, and sends it however they already talk to
that person.

That is not a shortcut dressed as a decision — an SMTP dependency needs credentials, a domain,
a deliverability story and a queue with retries (`17` is still a placeholder), and it would add
all of that to demonstrate a beat that a copy button demonstrates in one second. When email
arrives it changes **one function**: the link goes to an address instead of to the clipboard.
Everything else here — the token, the hash, the expiry, the single-use rule, the escalation
bound — is unchanged by it, which is the test of whether the seam is in the right place.

Recorded as a limitation in `52` §10 rather than left implied.

## Why an administrator still cannot set a password

`34` § Out of scope has always said *"invite links only — an admin who sets passwords can
impersonate"*. **That rule survives this document intact**, and it is worth being explicit
that it was re-examined rather than inherited.

The ask was *"let the organisation make accounts"*, and it is fully met: the administrator
creates the account, chooses nothing about the password, and hands over a link. What they
never get is a moment where they know a credential that works — because an administrator who
sets a dean's password can sign in as the dean, and every audit row from that session names
the dean. The org chart would be intact and the audit log would be a fiction.

The cost is one extra step for the person joining. The alternative costs the audit log its
meaning, and the audit log is `56`'s entire subject.

## Revocation

`DELETE /people/:id/account` does **four** things, and the fourth was missing from this
paragraph until `T-072` built it:

| | |
|---|---|
| `users.status = 'disabled'` | no new sign-in |
| `password_hash = NULL` | there is no old password to restore, which is why re-enabling is a fresh invite rather than an "un-disable" |
| the target's rows deleted from `sessions` | immediate. `authenticate` never reads `users.status`, so a live session would otherwise outlive the revocation until it expired on its own |
| **any unaccepted `account_invites` row deleted** | an outstanding invite **is** an issued credential. Leaving one alive would let the revoked person set a password and walk straight back in |

Because sessions are rows (`15` §2), the third is immediate — there is no window in which an
already-issued credential still works, which is the concrete advantage `15` claims for cookie
sessions and this is the route that spends it. The fourth exists for exactly the same reason,
one layer up: "no window" has to mean *every* credential, not only the ones already redeemed.

**Nobody may revoke their own sign-in** — `409`, with *"Sign out instead."* There is no
password reset in this product and no mailer behind one (see Out of scope), so an owner who
revokes themselves has locked the organisation permanently rather than until somebody helps.
Same guard, same reasoning, as `33`'s lockout check on the powers grid.

**`account.create` refuses an account that already signs in** — `409`, pointing at re-issue.
Without it a coordinator holding only `account.create` could mint a working link for somebody
else's live account, which is the distinction between the two capabilities collapsing.

**And there is now exactly one way in.** `PATCH /people/:id` used to accept
`status: 'disabled'` — a *fake* revoke behind `person.update` that left live sessions and the
password hash intact. Removed at `T-072`; see `DEC-046`.

What revocation does **not** do: remove the person, their positions, their authored templates
or their audit rows. Someone who has left an organisation is still the person who launched
that campaign in March, and a product that erases them to tidy up has destroyed its own
evidence (`10` §9).

Re-enabling is `account.reset` — a fresh invite. There is no "un-disable" that restores an old
password, because there is no old password to restore.

## State

Local, inside `34`'s person detail. No store: the account panel is one object fetched with the
person and refetched after each of the three actions.

`<InviteLink>`'s URL lives in component state and **is never written anywhere else** — not
`localStorage`, not the store, not a query param. It is a live credential for seven days.

## Components

`<InviteLink>` (new, `24` §6c) · `<ConfirmDialog>` · `<Toast>` · `<PersonChip>` ·
`<EmptyState>`.

The activation page is composed from the auth-world primitives `30` already built and adds
nothing to the inventory: it is one field, one button and one heading.

## Interactions

**Provisioning.** A row in `/app/people` with no account shows `Invite`. Pressing it opens
`<InviteLink>` immediately — no intermediate form, because there is nothing to ask. The
administrator copies the link and closes the dialog.

**Copy confirms in place**, the same as `<ShareSheet>`'s copy action (`38` §6.3): the label
swaps to `Copied` for 1.5 s. No toast — the dialog is already the focus.

**The dialog cannot be dismissed by accident.** No backdrop click, no `Esc`-to-close on this
one, against the house rule for dialogs — because closing it discards a credential that cannot
be recovered, only replaced. `Close` is a deliberate button press, and it warns that the link
will not be shown again.

**Activation.** The person opens the link and sees the organisation's name, its logo (`48`),
their own name, and one password field with the rule stated up front rather than after a
failed attempt. On success they are **signed in already** — session regenerated (`15` §2), no
second trip through `/login`. Landing on a login form after setting a password is the most
pointless screen in software.

**Expired or already used** → one screen, one sentence, and *"ask whoever invited you for a
new link"*. It does not say which of the two happened, and it does not offer a self-serve
resend: both would answer questions for someone holding a token they should not have.

## States

| State | Behaviour |
|---|---|
| No account | `Invite` action on the row and in the detail panel |
| Invited | A `Pending` tag with the expiry in words — *"expires in 5 days"*, not a timestamp. Actions: re-issue, revoke |
| Active | Last sign-in, or *"has not signed in yet"*. Action: revoke |
| Disabled | Greyed with the date. Action: re-issue, which re-enables |
| 403 (capability) | The action is absent, not disabled (`design_specs/design/02` §5) |
| **403 `WOULD_ESCALATE`** | The action is **present and fails loudly**, naming the capability — see below |
| Activation: valid | Name, org, password field |
| Activation: expired / used / unknown | One indistinguishable dead-end screen |

**`WOULD_ESCALATE` is the one refusal this product shows as an error rather than hiding.**
Everywhere else, an action the caller cannot perform is simply absent — but here the caller
*can* perform the action, on most people; what they cannot do is perform it on this one. An
absent button would read as a rendering bug to somebody who just used the same button one row
above. So the button stays, and the message names the power: *"Priya's Registrar position
includes `grant.update` on the whole organisation, which you do not hold. Ask an owner."*

## Acceptance

- [x] `account.create` on a person with no positions succeeds for any holder of the capability
- [x] A caller holding `account.create` cannot provision an account for someone whose positions
      resolve to a capability the caller lacks at that unit — `403 WOULD_ESCALATE`, naming it
- [x] The same bound refuses through `POST /people/:id/assignments`, so the two routes cannot
      be composed into an escalation the single-route test would miss
- [x] The activation link is returned **once**; a second `GET` of the provisioning route does
      not return it, and the token is not recoverable from the database
- [x] Only `sha256(token)` is stored — asserted by searching the row for the plaintext
- [x] Re-issuing invalidates the previous link, with no window where both work
- [x] Two concurrent activations of one token yield one `200` and **one uniform dead end** —
      not the `410` this line used to say. **The two lines contradicted each other**: a `410`
      distinguishes "this link was real and somebody used it" from "no such link", which is
      the very thing the line below forbids, and it is a fact about an account the asker does
      not own. The concurrency property is unchanged and still asserted; only the status code
      is. Same argument as CONF-015's uniform 404 for campaign tokens.
- [x] An expired token, a used token and an unknown token return identical responses
- [x] Activation regenerates the session id (`15` §2) — the fixation test, on this route too
- [x] Revocation ends live sessions on the next request, asserted with a signed-in agent
- [x] Revocation leaves the person, their positions and their audit rows intact
- [x] All three actions write an audit row naming the target person (INV-007)
- [x] An administrator cannot set a password on any route — asserted by the route enumeration,
      not by reading the handlers
- [x] Activation is rate limited per token and per IP
- [x] Every noun on the activation screen comes from the **inviting org's** labels (INV-001) —
      **vacuously, and worth saying so.** The screen is a heading, one password field and one
      button; there is no domain noun on it to resolve. `ActivationPreview` carries the
      organisation's *name*, not its vocabulary, and a test asserts the payload's four keys so
      a fifth cannot arrive unnoticed.
- [x] Activation writes an audit row with **no actor and no IP** (INV-007). The request
      arrived with no principal — it could not have arrived with one — so the row records
      what the chain decided, and `target_id` is what says who activated. The address stays
      recoverable through `request_id` in the request log.
- [x] The activation is filed under the **invite's** organisation even when a stranger from
      another tenant is signed in on that browser. `tenantResolver` resolves the activation
      token ahead of the session — the one strategy that outranks one — because the request
      is *about* the invited account, not about whoever happens to be signed in.

## Out of scope

| Not building | Why |
|---|---|
| Sending email | No mailer exists (`17` is a placeholder). The seam is one function; see above |
| Password reset for an existing account | Adjacent and different: it is self-serve and needs email to be safe. `15` §5 already names it as the first thing to add in P2 |
| SSO / Google sign-in | Real value for a university, and a whole document. Nothing here blocks it |
| Bulk invite from the CSV import | `34`'s import creates *people*. Inviting 400 of them at once means 400 links nobody can distribute by hand — it waits for email, and then it is one loop |
| An admin-set temporary password | The impersonation problem, above. This is the rule the document was written around |
| Self-serve signup into an existing org | There is no path in except an invite. An open door into a tenant is `19`'s "self-serve operator signup" mistake at a smaller scale |
| Account-level permissions | An account is a key, not a power. Powers come from positions, always (INV-005) |
