# 10 — Data model

Phase: P1 · Milestone: M0 · Owns: `src/backend/database/**`, `src/backend/db/**`
Decisions: `_MEMORY.md` DEC-002, DEC-006, DEC-007 · Invariants: INV-002, INV-005, INV-006, INV-010

---

## 1. The shape of the model

Two halves, deliberately different in character.

| Half | Tables | Character |
|---|---|---|
| **The org graph** | `nodes`, `edges`, `grants` | Three generic primitives. Never grows. A new organisation type is data, never a migration. |
| **The feedback domain** | `subjects`, `templates`, `questions`, `campaigns`, `responses`, `answers` | Ordinary relational tables. Concrete because the shapes genuinely are concrete. |

The generality lives entirely in the first half. Resisting the urge to make the second half
generic too is what keeps the thing buildable — `customization.md` §13 names this trap
directly ("a feature per organisation type" is the failure, but so is abstracting what is
not varying).

Everything is scoped by `org_id` (INV-010).

---

## 2. The org graph

### 2.1 `nodes`

```sql
CREATE TYPE node_kind AS ENUM ('role', 'unit', 'group', 'person', 'position');

CREATE TABLE nodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind        node_kind NOT NULL,
  name        TEXT NOT NULL,

  level       INT,          -- roles only. 1 = highest. ordering only, nothing else.
  role_id     UUID REFERENCES nodes(id) ON DELETE CASCADE,  -- positions only
  unit_id     UUID REFERENCES nodes(id) ON DELETE CASCADE,  -- positions only
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,  -- person nodes only

  is_temporary BOOLEAN NOT NULL DEFAULT false,  -- units: children get end dates
  ends_at      TIMESTAMPTZ,
  derived      BOOLEAN NOT NULL DEFAULT false,  -- generated from a placement rule
  meta         JSONB NOT NULL DEFAULT '{}',

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT node_level_only_on_role
    CHECK ((kind = 'role') = (level IS NOT NULL)),
  CONSTRAINT node_position_refs
    CHECK ((kind = 'position') = (role_id IS NOT NULL AND unit_id IS NOT NULL))
);
```

**`position` is a deliberate addition to `customization.md` §3's four kinds.** That document
says an assignment is "an EDGE from a person node to a role-at-unit node" but never names
the role-at-unit thing. Naming it is worth it: it is what the `→ creates 7 positions`
counter counts (`customization.md` §9 screen 3), it is what a grant is usually attached to,
and it is what makes INV-005 expressible — *powers are scoped to the unit of the assignment*
— because the unit is a column on the position, not a lookup through the person.

**One position, many people — and counting the rows is not counting people (`DEC-082`).**
The slot is shared: `createAssignment` FINDS a `(role, unit)` position before it creates
one, because two "Tutor at Team A1" nodes would mean two places to attach a position-level
grant and only one of them would ever be checked. It follows that
`count(nodes WHERE kind='position' AND unit_id = X)` answers *how many distinct roles are
present in X*, and never *how many people are in X*. Every people-count in the product read
it as the second for three revisions. The people question is
`count(DISTINCT edges.parent_id WHERE type='member')` over those positions, with lapsed
edges excluded the way `authz/collect.ts` excludes them.

`derived` matters more than it looks. One placement rule — "a Supervisor exists in every
Department" — generates seven positions and seven edges. They render greyed out, and they
regenerate when the unit tree changes. Roughly ten declared answers produce two hundred
stored rows, and that ratio is why setup takes minutes rather than days.

### 2.2 `edges`

```sql
CREATE TYPE edge_type AS ENUM ('reports', 'contains', 'member', 'delegates');

CREATE TABLE edges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  dimension   TEXT NOT NULL DEFAULT 'primary',   -- 'academic', 'reporting', 'project', …
  type        edge_type NOT NULL,
  parent_id   UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  child_id    UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,

  is_primary  BOOLEAN NOT NULL DEFAULT false,    -- for a person's main position
  valid_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to    TIMESTAMPTZ,                       -- NULL = open ended
  derived     BOOLEAN NOT NULL DEFAULT false,
  meta        JSONB NOT NULL DEFAULT '{}',       -- delegation recurrence lives here

  UNIQUE (org_id, dimension, type, parent_id, child_id)
);
```

What each edge type expresses:

| Type | Parent → Child | Meaning |
|---|---|---|
| `contains` | unit → unit | The structure tree |
| `reports` | position → position | A reporting line, within one dimension |
| `member` | person → position | **An assignment.** Person holds this role at this unit |
| `member` | person → group | Committee / team membership |
| `delegates` | position → position | Stand-in, with a mandatory validity window |

**There is never one global tree.** Each dimension is its own tree (`customization.md` §4).
Within one dimension a node has exactly one parent; across dimensions it may have many. This
is what lets a head of department report to the dean academically and the registrar
administratively without a special case.

**"Dean who is also a Professor" is two `member` edges from one person node.** No
duplication, no workaround. The entire multi-hat problem dissolves here, and every later
feature — committees, delegation, multi-project crews — is a variation on the same idea.

### 2.3 `grants`

```sql
CREATE TYPE grant_scope  AS ENUM ('self', 'own_unit', 'subtree', 'all');
CREATE TYPE grant_effect AS ENUM ('allow', 'deny');

CREATE TABLE grants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject_id   UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  capability   TEXT NOT NULL,       -- from the catalogue, 11-PERMISSION-ENGINE §3
  scope        grant_scope  NOT NULL DEFAULT 'own_unit',
  effect       grant_effect NOT NULL DEFAULT 'allow',
  params       JSONB NOT NULL DEFAULT '{}',   -- { "maxAmount": 25000 }, { "maxDays": 3 }
  valid_from   TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to     TIMESTAMPTZ,
  derived      BOOLEAN NOT NULL DEFAULT false,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, subject_id, capability, scope, effect)
);
```

`subject_id` points at a **role**, **position**, **group**, or **person** node. Role grants
are the common case and are what the powers grid edits (`33-PAGE-roles-and-powers-grid.md`);
person grants are per-individual overrides and should be rare.

`params` is what lets one capability have different strength at different levels — a
supervisor approving up to ₹5,000 and a department head up to ₹25,000 — instead of inventing
five artificial roles to encode limits (`customization.md` §5).

Resolution semantics, including deny-beats-allow (INV-004) and narrower-scope-wins, are
specified in `11-PERMISSION-ENGINE.md` §4. They are **not** re-stated here; the schema only
stores.

### 2.4 The level rule, demoted to a seed

`BUILD_PLAN_EVAL1.md` §2 makes "a user sees data below their role level, within their unit's
subtree" *the* enforcement mechanism. Here it is only a **derived default** (CONF-002): at
org creation the preset writes `derived: true` grants that reproduce exactly that behaviour,
and the administrator can then edit them.

This matters for the viva. The level rule is a good default and a bad ceiling — it cannot
express a student on a committee who can book a hall, or a vendor who must never see
footage. The GRANT layer can, and it still produces the level rule for free on day one.

---

## 3. Tenancy and identity

```sql
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  industry    TEXT NOT NULL,             -- university | hotel | hospital | company | custom
  labels        JSONB NOT NULL,          -- the vocabulary system. see 22.
  settings      JSONB NOT NULL DEFAULT '{}',   -- incl. authzVersion (11 §7), paramMode (11 §5)
  logo_file_id  UUID REFERENCES files(id) ON DELETE SET NULL,   -- 48
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email          CITEXT NOT NULL,
  password_hash  TEXT,                   -- NULL for invited-not-yet-activated
  name           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active', -- active | invited | disabled
  avatar_file_id  UUID REFERENCES files(id) ON DELETE SET NULL,  -- 48
  last_login_at   TIMESTAMPTZ,
  disabled_at     TIMESTAMPTZ,            -- set by account.revoke, CLEARED on activation (57)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);
```

`files` is declared in §5 but referenced here, so the migration must create `files` before
adding these two foreign keys — or add them in a follow-up statement. Prisma orders this
correctly on its own; a hand-written migration does not.

`organizations.labels` is the vocabulary system and the visible product claim. Shape:

```json
{
  "unit":       { "one": "Department",     "many": "Departments" },
  "subject":    { "one": "Course",         "many": "Courses" },
  "respondent": { "one": "Student",        "many": "Students" },
  "reviewee":   { "one": "Faculty",        "many": "Faculty" },
  "campaign":   { "one": "Feedback cycle", "many": "Feedback cycles" }
}
```

Every user-facing domain noun in the UI reads from here (INV-001, `22-VOCABULARY-SYSTEM.md`).

**`users` are staff. Respondents are not users** (DEC-009). This is not only a privacy
decision — it is also why billing can count seats honestly (`16`): a college with 4,000
students has perhaps 200 `users` rows.

---

## 4. The feedback domain

### 4.1 `subjects` — the thing being reviewed

```sql
CREATE TABLE subjects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id        UUID REFERENCES nodes(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'general',
  linked_user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- set when the subject IS a person
  meta           JSONB NOT NULL DEFAULT '{}',
  archived_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The single biggest unlock in the model. A course, a restaurant, a room, a ward, a trainer, an
event, a bus route. `linked_user_id` is what turns "review the thing" into "review the
person" without two code paths — and it is also the billing meter (`16`).

### 4.2 `templates` and `questions`

```sql
CREATE TYPE question_kind AS ENUM ('rating','single','multi','text','yesno','nps');

CREATE TABLE templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = library
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,
  industry          TEXT,
  description       TEXT,
  cloned_from_id    UUID REFERENCES templates(id) ON DELETE SET NULL,
  estimated_seconds INT NOT NULL DEFAULT 0,     -- DERIVED from questions, never entered
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  kind        question_kind NOT NULL,
  text        TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',   -- scale bounds, anchors, options, multiline
  required    BOOLEAN NOT NULL DEFAULT false,
  position    INT NOT NULL,
  UNIQUE (template_id, position) DEFERRABLE INITIALLY DEFERRED
);
```

`org_id IS NULL` means library template. Cloning copies the template and its questions into
the org and records `cloned_from_id`.

**Six kinds, frozen** (DEC-010). `config` shapes per kind are specified in
`14-DTO-AND-VALIDATION.md` §4 as discriminated Zod unions, which is what stops `config` from
becoming an untyped bag.

**A poll is a one-question template.** There is no poll entity, ever. Build the form engine
once and polling comes free.

`position` is deferrable-unique so a reorder can be written as one `UPDATE` statement inside
a transaction rather than a shuffle through a temporary value.

### 4.3 `campaigns`

```sql
-- There is no campaign_status type and no status column. Status is DERIVED ON READ from
-- closed_at / public_token / starts_at / ends_at (DEC-016). A stored status needs something
-- to write it, and that something is a scheduler that can be late, be down, or leave a row
-- stuck between states on the one morning it matters.

CREATE TABLE campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id   UUID NOT NULL REFERENCES templates(id),
  name          TEXT NOT NULL,
  audience_rule JSONB NOT NULL DEFAULT '{}',   -- { unitId, includeSubtree, roleIds[] }
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  anonymous     BOOLEAN NOT NULL DEFAULT true,
  access        TEXT NOT NULL DEFAULT 'public',  -- 'public' | 'organization'. DEC-037.
                                                 -- A SECOND AXIS, not a kind of audience_rule:
                                                 -- audience_rule describes WHO IS EXPECTED and
                                                 -- is a denominator; access decides WHO GETS IN
                                                 -- and is a gate. Immutable after launch, same
                                                 -- trigger and same reason as `anonymous`.
  public_token  TEXT UNIQUE,                   -- the /r/:token link. NULL until launched.
                                              -- 8 chars, unambiguous alphabet (DEC-017).
  closed_at     TIMESTAMPTZ,                  -- set by /close. the only stored transition.
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaign_subjects (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, subject_id)
);
```

**Status is derived, never stored** (DEC-016):

```
closed_at IS NOT NULL   ->  closed
public_token IS NULL    ->  draft
starts_at > now()       ->  scheduled
ends_at   < now()       ->  closed
otherwise               ->  open
```

`anonymous` **and `access`** are **immutable once the campaign leaves draft**, and leaving
draft is exactly `public_token IS NOT NULL` — minting the token is the irreversible act, so the
trigger is keyed on the column that carries the truth. Enforced by a trigger, not only in the
service layer. Respondents were promised anonymity at submission time; letting an admin flip it
afterwards would retroactively break that promise (INV-006, `52`).

`access` joins that trigger rather than getting a softer rule of its own. Loosening it
mid-flight would let people who were told *"only your colleagues can answer this"* be answered
alongside strangers, and tightening it would strand a link already handed out. Both are
promises made at the moment the code was printed on a table card, and neither is a promise the
product should be able to take back. **One trigger, two columns, one reason.**

### 4.4 `responses` and `answers`

```sql
CREATE TABLE responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  subject_id    UUID REFERENCES subjects(id) ON DELETE SET NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel       TEXT NOT NULL DEFAULT 'link',   -- link | qr | kiosk | api
  duration_ms   INT,
  meta          JSONB NOT NULL DEFAULT '{}'     -- NEVER identity. see below.
);

CREATE TABLE answers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id   UUID NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  value         JSONB NOT NULL,      -- typed by question kind
  numeric_value NUMERIC,             -- denormalised for rating/nps aggregation
  UNIQUE (response_id, question_id)
);
```

**There is no respondent column on `responses`, and there will never be one** (INV-006). Not
a user id, not a hashed email, not an IP. The table cannot identify a respondent because it
has nothing to identify them with — anonymity is a property of the schema, not a setting the
application respects.

Duplicate submission is prevented without breaking that, via a separate table:

```sql
CREATE TABLE invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  used_at      TIMESTAMPTZ,
  meta         JSONB NOT NULL DEFAULT '{}'
);
```

```sql
-- DEC-037. The `organization`-access counterpart to `invitations`, and deliberately the
-- SAME SHAPE: it records THAT a member responded, never WHAT they said.
CREATE TABLE campaign_participants (
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);
```

**There is no `response_id` on that table and there will never be one** — it is the column
that would undo INV-006 in a single migration. The primary key is what prevents a second
submission; the absence of a third column is what keeps the first one anonymous.

`invitations` records **that** a token was used. `campaign_participants` records **that** a
member responded. `responses` records **what** was said.
Nothing joins them. So the system can say "312 of 400 invited people responded" and still
cannot say which response is whose. This separation is the whole privacy architecture and is
worth stating explicitly under questioning.

**What that costs, said out loud rather than left for someone to notice:** on an
`organization` campaign, participation is *not* anonymous — an administrator can see that Priya
answered and that Sam did not, exactly as `invitations` has always allowed for invited
campaigns. What stays anonymous is the answer. That is a real and defensible guarantee, and it
is a different one from *"nobody knows I took part"*, so `39`'s `<AccessNotice>` says which of
the two the respondent is being given (`24` §7). A promise the product cannot keep is worse
than a narrower promise it can.

`numeric_value` exists because every results query aggregates rating and NPS answers, and
`(value->>'n')::numeric` on every row is the difference between a fast page and a slow one.
It is written by the service layer alongside `value`, never independently.

---

## 5. Cross-cutting tables

```sql
-- Staff sessions. DEC-014. Managed by connect-pg-simple, NOT by Prisma —
-- the library owns this shape, so do not model it in schema.prisma.
-- Create it in a plain SQL migration and leave it alone.
CREATE TABLE sessions (
  sid     TEXT PRIMARY KEY,
  sess    JSONB NOT NULL,
  expire  TIMESTAMPTZ NOT NULL
);
CREATE INDEX ON sessions (expire);

-- Uploaded binaries: org logos and user avatars only (48).
-- The bytes live on disk; this row is the metadata and the id in the URL.
CREATE TABLE files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,          -- 'logo' | 'avatar'
  mime        TEXT NOT NULL,          -- always the RE-ENCODED type, never the uploaded one
  bytes       INT  NOT NULL,
  width       INT,
  height      INT,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  org_id        UUID REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id),
  action        TEXT NOT NULL,          -- the capability string
  target_type   TEXT,
  target_id     UUID,
  outcome       TEXT NOT NULL DEFAULT 'allowed',  -- 'allowed' | 'denied'. DEC-041.
  decided_by    JSONB,                  -- WHICH GRANT decided it. INV-007.
  request_id    TEXT,
  ip            INET,                   -- NULL FOR NON-USER PRINCIPALS. DEC-040. See below.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Endur -> customer messages. DEC-101, spec 58 § From Endur, 70 § Messaging.
-- ONE ROW PER RECIPIENT, not one per message: the read state is the reader's, exactly as
-- inbox_state is (58 § Capabilities), and a shared row would mean one administrator
-- marking the org's mail read for everybody.
--
-- WHY IT EXISTS AT ALL: messageAdministrators() wrote only platform_audit_log, which is the
-- OPERATOR'S table -- so the customer's administrators had no route and no screen, and the
-- operator was told "sent to 3 administrators" while nothing had been sent. DEC-101.
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,          -- 'platform_message' today. The column is here so the
                                      -- second kind is a value, not a migration.
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,          -- CAPTURED, never joined back to the audit row. The
                                      -- audit payload is the operator's record; this is the
                                      -- customer's copy, and they must not diverge silently.
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON notifications (user_id, read_at);

-- A customer asking to be sold Enterprise. DEC-100, spec 49 + 70 § The Enterprise queue.
--
-- A WORK ITEM, NOT A NOTIFICATION, and `status` is the whole difference: what has to survive
-- is not "somebody was told" but "somebody has to ring this customer back". Reading the queue
-- changes nothing.
--
-- ONE OPEN ROW PER ORG, enforced in the database rather than in the handler -- a second
-- request while one is open is a 409, and a partial unique index is what makes that true
-- under two simultaneous clicks.
CREATE TABLE enterprise_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asked_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  asked_name    TEXT NOT NULL,        -- captured, for the reason payments.payer_name is
  asked_email   TEXT NOT NULL,
  note          TEXT,                 -- the one optional field on the dialog
  status        TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'contacted' | 'closed'
  handled_by    UUID REFERENCES platform_users(id),
  handled_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON enterprise_requests (org_id) WHERE status = 'open';

-- Account provisioning. DEC-038, spec 57.
-- NOT called `invitations` -- that name is taken, means campaign tokens, and two tables
-- called invitations in one schema is a mistake somebody makes at 2am.
CREATE TABLE account_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,     -- SHA-256. The link is shown ONCE and never stored.
  expires_at  TIMESTAMPTZ NOT NULL,     -- 7 days
  accepted_at TIMESTAMPTZ,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON account_invites (user_id) WHERE accepted_at IS NULL;
-- ^ one live invite per person. Re-issuing (account.reset) deletes the old row rather than
-- adding a second, so a superseded link stops working the moment its replacement is minted.

-- Per-caller inbox triage. 58.
CREATE TABLE inbox_state (
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response_id UUID NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  read_at     TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, response_id)
);
-- Keyed by USER, not by org: read state is a reader's, not the organisation's, so two
-- administrators triaging one campaign never mark each other's queue. org_id rides along
-- for the tenant seam (db/tenant.ts) and for a cascade that does not need a join.
-- It holds no response CONTENT, so it is not a second path to one (INV-006, 58).

CREATE TABLE api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,    -- the key itself is shown once, never stored
  prefix       TEXT NOT NULL,           -- first 8 chars, for display
  scopes       TEXT[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  org_id       UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  tier         TEXT NOT NULL DEFAULT 'bronze',   -- bronze|silver|gold|enterprise
  seats        INT  NOT NULL DEFAULT 0,          -- reviewees + staff. never respondents.
                                                 -- NEVER WRITTEN by anything (D-013), which
                                                 -- is why /ops/analytics stops reporting it
                                                 -- (DEC-102) and both live seat counts are
                                                 -- computed from 16 §5 instead.
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,                    -- ONE CALENDAR MONTH since DEC-096, was 365
                                                 -- days in three separate hardcoded places.
  pending_tier TEXT,                             -- DEC-098. A DOWNGRADE THE CUSTOMER ASKED
                                                 -- FOR, applied by the first read after
                                                 -- period_end and cleared.
  lapsed_from  TEXT,                             -- DEC-113. THE TIER THAT RAN OUT when a
                                                 -- period ended with nobody renewing. NULL is
                                                 -- the ordinary case. it is what lets the page
                                                 -- say "your Gold plan has ended" rather than
                                                 -- showing a bronze row with no account of
                                                 -- where Gold went. cleared by a join, by an
                                                 -- operator override, and by the next bronze
                                                 -- roll-over, so it lives one period.
                                                 -- NEITHER COLUMN IS A SECOND ANSWER TO WHICH
                                                 -- PLAN IS IN FORCE. `tier` is, and since
                                                 -- DEC-113 both requireEntitlement and
                                                 -- readBilling derive it through ONE function,
                                                 -- billing/effective.ts effectiveTier() --
                                                 -- because a column alone stops answering the
                                                 -- moment period_end passes (49 § Interactions).
  status       TEXT NOT NULL DEFAULT 'trialing'  -- and NOTHING WRITES 'trialing' on the
                                                 -- sign-up path since DEC-048, which is what
                                                 -- made /ops/analytics' trial counters unable
                                                 -- to move (DEC-102).
);
```

**Expiry is evaluate-on-read, and that is a deliberate choice over a scheduler.**
`17-BACKGROUND-JOBS.md` is unwritten and `OPEN-005` says nothing owns a cron; `readBilling`
already repairs a missing subscription row on read (`D-012`) and its comment carries the
argument — the write happens on the read so the entitlement gate and the page agree from the
next request onward.

**`DEC-098`'s accepted cost had to shrink for `DEC-113` to be safe**, and the difference is the
most important thing on this table. *"An organisation nobody opens never transitions"* was
harmless while the only transition was a downgrade the customer had **asked for**. Once a period
ending takes away a tier nobody asked to lose, the same sentence describes the reported bug: an
organisation that never opens `/app/plan` but hammers the gated routes would keep a plan it
stopped paying for. So the **row** still catches up on the next read, and the **decision** does
not wait for it — `requireEntitlement` derives the effective tier from these columns on every
request, and writes nothing.

`audit_log.decided_by` stores the decision trace from the resolver. It is what turns "access
denied" from an assertion into evidence, and it is what the simulator replays (`42`).

### `audit_log.ip` is NULL for non-user principals — DEC-040

`ip` is written for a `user` principal and **must be NULL for a `respondent` one**. This is not
hygiene; it closes a live path back to a respondent:

> Every response submission writes an audit row — correctly, INV-007 covers every state change
> and a submission is the most consequential one in the product. That row carries
> `action: 'response.submit'`, the campaign id, `created_at`, and — until 2026-08-23 — the
> **submitting IP address**. `responses.submitted_at` is written in the same transaction. So
> ordering the audit rows and the response rows by time and zipping them yields a list of IPs
> against responses, and INV-006 is defeated through a table it never mentions.

Nothing read `audit_log` while that was true, which is exactly why it survived four audits.
**`56-PAGE-activity-log.md` is what would have made it live**, and the column is fixed with the
page rather than after it.

For a `user` principal `ip` earns its place — *who changed this permission, and from where* is
real forensics on the one table that answers it. The rule is therefore narrow and mechanical:
`db/tx.ts` writes `ip` only when `principal.kind === 'user'`, asserted by a test that submits a
response and checks the column is NULL.

### `audit_log.outcome` — the log records refusals too, DEC-041

INV-007 says every state change writes a row, so historically a row meant *something
happened*. **A denial is also worth recording**, and it is the half an administrator actually
wants from something called a log: *somebody tried to launch a campaign in Engineering and was
refused* is a security event; *somebody launched one* is a business record.

Scoped deliberately to keep the volume honest: **denials of mutating capabilities only.** A
403 on a `GET` is the permission system working as designed, thousands of times a day, and
writing all of them would produce a table nobody can read — the same reasoning that keeps a
403 at `warn` rather than `error` in `18` §4.

`decided_by` is populated on a denial too, and on a denial it is the *most useful* — the
narrowest deny that stopped it, which is the answer to "whom do I ask".

### The four tables with no `org_id` — `19` §10, built `T-059`

`platform_users`, `platform_sessions` and `platform_audit_log` are in
`database/schema.prisma` and are **specified in `19`, which owns the surface**. They are named
here so that a reader of this document is not surprised by them, and because their one shared
property is a statement about this document rather than about that one:

> **Every table above carries `org_id`. These three carry none, and the absence is the
> design (DEC-033).** An operator hosted in `users` — which is `@@unique([org_id, email])`
> with `org_id` NOT NULL — would need a fake home organisation, and that fake organisation
> would then appear in the estate list, the seat count and the revenue figures it exists to
> report on. `CONF-013`'s cross-tenant lockout is what that class of shortcut looks like when
> it goes wrong.

`organizations.suspended_at` is the fourth change and it is a real column on a real tenant
table: set by `platform.org.suspend`, read by `tenantResolver`, and refusing **only** a tenant
resolved from a staff session (`DEC-073`).

`platform_audit_log` is separate from `audit_log` for a customer-facing reason rather than a
tidy one: `audit_log` rows carry an `org_id` and belong to the organisation that can export
them (`56`). Writing *"Endur changed your plan"* into a customer's exportable trail would put
our internal activity inside their evidence.

---

## 6. Recursive queries — the raw-SQL seam

Prisma cannot express recursive CTEs. These live in **`src/backend/db/graph.ts`, the only
file in the app permitted to use `$queryRaw`** (DEC-007). Each is wrapped in a typed function
so callers never see SQL.

```ts
// src/backend/db/graph.ts
export async function unitSubtree(orgId: string, rootId: string): Promise<string[]>
export async function unitAncestors(orgId: string, unitId: string): Promise<string[]>
export async function positionsInSubtree(orgId: string, rootId: string): Promise<Position[]>
export async function wouldCreateCycle(orgId: string, dimension: string,
                                       parentId: string, childId: string): Promise<boolean>
```

The subtree query, which is the one everything else depends on:

```sql
WITH RECURSIVE subtree AS (
  SELECT n.id, 0 AS depth
    FROM nodes n
   WHERE n.id = $2 AND n.org_id = $1 AND n.kind = 'unit'
  UNION ALL
  SELECT c.id, s.depth + 1
    FROM subtree s
    JOIN edges e ON e.parent_id = s.id
                AND e.type = 'contains'
                AND e.org_id = $1
                AND (e.valid_to IS NULL OR e.valid_to > now())
    JOIN nodes c ON c.id = e.child_id
   WHERE s.depth < 32                  -- hard depth guard, see below
)
SELECT id FROM subtree;
```

Two guards that are not optional:

- **`depth < 32`.** Cycle prevention is enforced on write (`wouldCreateCycle`), but a
  recursive query with no depth bound turns a data bug into a hung connection. Belt and
  braces.
- **`org_id = $1` on every join.** Tenant isolation must hold inside the CTE too (INV-010);
  a recursive query that escapes its tenant is the worst possible bug in a multi-tenant app.

**If this file grows past ~8 functions, revisit the ORM choice** (DEC-007, REVISIT
2026-10-01). A large raw-SQL surface is the signal that Prisma is the wrong fit and Drizzle
would have been better.

---

## 7. Indexes

Written from the actual query patterns, not speculatively.

```sql
-- tenant scoping: every table that has org_id
CREATE INDEX ON nodes      (org_id, kind);
CREATE INDEX ON edges      (org_id, dimension, type);
CREATE INDEX ON grants     (org_id, capability);

-- graph traversal, both directions
CREATE INDEX ON edges (parent_id, type) WHERE valid_to IS NULL;
CREATE INDEX ON edges (child_id,  type) WHERE valid_to IS NULL;

-- the resolver's hot path: grants for a set of subject nodes
CREATE INDEX ON grants (subject_id, capability) WHERE valid_to IS NULL;

-- positions by unit — INV-005 asks this on every capability check
CREATE INDEX ON nodes (unit_id) WHERE kind = 'position';

-- results aggregation
CREATE INDEX ON responses (campaign_id, submitted_at DESC);
CREATE INDEX ON answers   (question_id) INCLUDE (numeric_value);

-- the respondent link. single most latency-visible lookup in the demo.
CREATE UNIQUE INDEX ON campaigns (public_token) WHERE public_token IS NOT NULL;

-- audit, read by time within a tenant
CREATE INDEX ON audit_log (org_id, created_at DESC);

-- uploads
CREATE INDEX ON files (org_id, kind);

-- jsonb search: campaign audience rules, node meta
CREATE INDEX ON campaigns USING GIN (audience_rule);
CREATE INDEX ON nodes     USING GIN (meta);
```

The partial indexes on `valid_to IS NULL` matter: almost every read wants currently-valid
rows only, and expired rows accumulate forever because history is retained for audit.

---

## 8. Tenant isolation

`org_id` is **injected by `tenantResolver` middleware and never read from a request body**
(INV-010, `12-MIDDLEWARE-STACK.md` §4). A body-supplied `orgId` is an attack, not an input.

Two layers of defence:

1. **Application** — every Prisma call goes through a per-request client wrapper that injects
   `where: { orgId }`. Services never construct a bare `prisma.x.findMany()`.
2. **Database** — Postgres row-level security policies on the tenant tables, with the session
   variable set at connection checkout. This is deliberately redundant with layer 1. If the
   application ever forgets, the database still refuses.

RLS is a **P1 stretch** — layer 1 is required for M0, layer 2 lands before P1 closes. It is
worth doing, and it is a strong answer to "how do you know tenants cannot see each other?"

---

## 9. Versioning and history

Organisations change, and audit requires the past to survive.

- **Assignments carry date ranges** (`edges.valid_from` / `valid_to`). A wrapped project or a
  departed staff member remains in history while their access is already gone.
- **Temporary units cascade end dates.** A unit marked `is_temporary` gives every child an
  `ends_at`; when the date passes every position inside expires automatically. Nobody has to
  remember to revoke anything (`customization.md` §9 screen 2).
- **Nothing structural is hard-deleted while it has responses attached.** Templates,
  campaigns and subjects are archived, not dropped.
- **Grants are never edited in place when they were `derived`.** Editing a derived grant
  clears its `derived` flag, which stops the next regeneration from silently reverting the
  administrator's change. This is the schema half of the round-trip rule
  (`customization.md` §7).

---

## 10. Validation enforced at the data layer

These belong in the database because the UI is not the only writer — seeds, the API and
imports all write too (`customization.md` §6).

| Rule | Where |
|---|---|
| Cycle detection per dimension | `wouldCreateCycle()` before any `contains`/`reports` insert |
| One level per role | `CHECK` + the `node_level_only_on_role` constraint |
| Single parent per dimension | Unique index on `(org_id, dimension, type, child_id)` for `contains`/`reports` |
| Campaign anonymity **and access** immutable after draft | One trigger on `campaigns`, both columns (§4.3) |
| One live account invite per person | Partial unique index on `account_invites (user_id) WHERE accepted_at IS NULL` |
| A member responds at most once to an `organization` campaign | `campaign_participants` primary key, **not** a service check |
| Answer type matches question kind | Service layer, via the discriminated DTO union (`14` §4) |
| Response only while campaign is `open` | Service layer + `CHECK` on the write path |

Softer checks — orphan capability, duplicate role, self-approval loop, vacancy, expiry — are
**warnings surfaced in the UI**, not constraints. They are judgement calls, and blocking a
save on a judgement call is how administrators learn to fight the tool. Self-approval loop
detection is the highest-value of these (`customization.md` §6) and is specified in
`33-PAGE-roles-and-powers-grid.md`.

---

## 11. Acceptance

- [ ] `npm run db:reset` runs clean from an empty database. NOT `migrate dev` -- N-073. This
      schema is drifted from the database by design (N-013), so `dev` reads the hand-written
      SQL below as a mistake and offers to drop it.
- [ ] Seed produces four orgs across industries, each with historical responses (`50`)
- [ ] `unitSubtree` returns correct ids for a 4-level tree and terminates on a cycle
- [x] `campaigns.access` cannot change once `public_token` is set — trigger test, alongside
      the existing `anonymous` one and in the same trigger. Built at `T-069`: one function,
      `endur_campaign_promises_are_immutable()`, raising a different message per column, and
      the `anonymous` half is re-asserted in the same file so the rename cannot have dropped
      it. A `CHECK` refuses any third value, tested on a **draft** — on a launched campaign
      the trigger fires first and the constraint would go unproven
- [x] `campaign_participants` has no column referencing a response, asserted against the
      live schema rather than the migration file — three columns, exactly
- [x] A respondent submission writes an audit row whose `ip` is **NULL** (DEC-040) — **and
      whose actor is NULL too, whoever is signed in** (DEC-045). The narrower rule is the one
      that survives `access: 'organization'`, where the submitter *is* a user principal
- [x] A staff mutation writes an audit row whose `ip` **and actor** are populated — the same
      test, inverted, so the rule cannot be satisfied by blinding the log
- [ ] Re-issuing an account invite invalidates the previous link, enforced by the partial
      unique index and not by a service `deleteMany`
- [ ] A cross-tenant read is impossible: attempting one with a forged `orgId` in a body has
      no effect, because the body value is never consulted
- [ ] `responses` has no column referencing a person, verified by inspecting the schema
- [ ] A campaign's `anonymous` flag cannot be changed after launch — trigger test
- [ ] Deleting a unit with children is either refused or reparents them, and the
      confirmation states the real number affected
- [ ] `grep -rn '\$queryRaw' src/backend` returns hits only in `db/graph.ts`
- [ ] `sessions` exists and is created by a plain SQL migration, not modelled in Prisma
- [ ] Deleting a `files` row nulls the referencing column rather than cascading a user away

## 12. Out of scope

| Not modelling | Why |
|---|---|
| Attendance, marks, payroll, timetables | Not an HR or LMS system (`01` §10) |
| Semester / academic year | Education-specific. Campaigns carry their own date windows |
| Threaded discussion, posts, messages | Communities are P3 stretch; modelling them now is thrown-away work |
| Per-question conditional logic | Contradicts the short-forms constraint (DEC-010) |
| Soft-delete on every table | Only where history is genuinely required — §9. Universal soft-delete makes every query wrong by default |
