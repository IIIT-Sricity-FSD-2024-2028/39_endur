# 53 — Novelty claims

Phase: all · Owns no path

What is genuinely novel here, what is merely well-executed, and how to defend each claim when
someone pushes back. Overclaiming is the fastest way to lose a viva; **knowing which of your
claims are ordinary is itself a mark of judgement.**

---

## 1. The four real claims

### Claim 1 — The generic organisation graph

**What:** Roles, units, positions, groups and permissions are three tables — `nodes`, `edges`,
`grants` — with nothing hardcoded to any industry. A film studio, a college and a hotel are the
same schema with different rows.

**Why it is novel:** most feedback tools hardcode their vertical. Ours has no `Course`, no
`Faculty`, no `Department` anywhere in the code (INV-002). A new organisation type is data,
never a migration.

**How to demonstrate:** switch from the university org to the hotel org. Every noun changes.
Then create a type nobody prepared for, live, in ninety seconds.

**Honest limit:** the *feedback domain* tables are concrete on purpose (`10` §1). Making
everything generic would have been unbuildable, and knowing where to stop abstracting is the
actual design decision.

---

### Claim 2 — Permissions as data, with an explainable resolver

**What:** `capability + scope + params + effect`, resolved through role, position, group,
delegation and person-override paths, with deny-beats-allow and per-assignment unit anchoring.
Every decision returns a **trace**.

**Why it is novel:** most course projects — and plenty of products — do
`if (user.role === 'admin')`. This is an attribute-scoped policy engine that an administrator
edits through a grid and interrogates through a simulator, without seeing a single technical
word.

**How to demonstrate:** open the simulator and let the evaluator ask a question. Then show the
INV-005 case: the same person is a Director on one project and an Editor on another, and the
system explains precisely why they are blocked on the second — *"this would be allowed if the
project were Ayaan"*.

**Honest limit:** capabilities are a fixed catalogue, not user-defined (`11` §11). That is
deliberate — unbounded verbs would mean an unbounded UI, which cannot be made simple. It is a
design choice with a stated reason, not an omission.

---

### Claim 3 — The vocabulary system

**What:** every user-facing domain noun comes from `organization.labels`. Zero hardcoded
(INV-001), proved by setting every label to nonsense and walking every screen.

**Why it is novel:** less as an idea than as a *discipline*. Most systems claim
configurability and leak "Student" in an empty state, a confirmation dialog, an `aria-label`,
or a CSV header. Ours is audited mechanically and by hand (`22` §5).

**How to demonstrate:** the chip row re-renders first on org switch. Ten seconds, no
explanation needed.

**Honest limit:** it is terminology, not internationalisation, and we say so (`22` §8).

---

### Claim 4 — Anonymity as a schema property

**What:** the `responses` table has no column that could identify a respondent, and duplicate
prevention is achieved by separating `invitations` (that someone responded) from `responses`
(what was said), with nothing joining them. Plus k-anonymity suppression below five responses.

**Why it is novel:** most systems store a respondent id and promise not to look. Ours cannot
look. That is a categorically different guarantee, and it is checkable by reading the schema
rather than trusting a policy.

**How to demonstrate:** show the schema. There is nothing to join. Then show suppression on
an under-subscribed campaign — the promise being kept when it is inconvenient.

**Honest limit:** for open links, one-response-per-person is best-effort. We state it
(`52` §1). A shared link cannot be both fully anonymous and strictly one-per-person, and
saying so is stronger than claiming otherwise.

---

## 2. Good engineering, not novelty

Claiming these as innovations would undermine the four above. Present them as competence.

| | What it is |
|---|---|
| The middleware chain | Textbook cross-cutting-concern separation, done properly and enforced by a structural test |
| Shared Zod DTOs | Standard practice in a TypeScript monorepo |
| Cursor pagination | Correct, not clever |
| Row-level security | A well-known Postgres feature used as intended |
| The design system | Careful execution of a specified system |
| Idempotency keys | Standard API practice |

## 3. Answers to the questions that will be asked

**"Why not just use Google Forms?"**
Google Forms does not know who your students are, which courses exist, who reports to whom, or
who is eligible for what. It cannot scope results by department, cannot enforce that a reviewee
reflects before seeing scores, and cannot guarantee anonymity while preventing duplicates. The
org graph is the product; the form is the least interesting part of it.

**"Why one platform instead of five tools?"**
Each layer makes the others work. Communication earns daily attention, which lifts response
rates. Communities surface problems early. Collection turns them into evidence. Analysis says
which matter. The improvement loop makes something change, which is what convinces people to
respond next time. Break any link and the chain weakens (`01` §3).

**"How do you know tenants cannot see each other?"**
Two layers. The application injects `orgId` from the verified credential and never from a
request body. Postgres row-level security refuses cross-tenant reads even if the application
forgets. Tested with a forged `orgId` against every list endpoint.

**"What happens if an administrator misconfigures permissions?"**
Three things. The powers grid makes over-granting visible as a dark column. The validator
detects self-approval loops and proposes a fix. The simulator answers "why can this person do
that?" in under thirty seconds. And a save that would lock everyone out is refused outright
(`33`).

**"Why Express and not NestJS?"**
NestJS would give this structure for free through decorators — and that is exactly why we did
not use it here. The composition and the ordering constraints between authorisation, tenancy,
validation and audit are the thing being demonstrated, and in Express they are explicit at the
route definition rather than implied by a decorator (`02` §3).

**"What is not done?"**
Communities, announcements, voting, multichannel delivery, the analysis engine, the improve
loop, SSO, payment processing. All scoped deliberately (`01` §10), all listed, none pretended
otherwise. Knowing the boundary is part of the design.

## 4. What would make this genuinely publishable

Honest assessment, in case it is asked how far this could go:

- **The permission model** is the strongest piece. A UI that compiles a friendly wizard down
  into a general policy graph, with a round-trip guarantee back to friendly controls
  (`customization.md` §7), is a real contribution to the "policy engines are unusable" problem.
- **The reflection-before-results ordering** (`44`) is a small idea with real behavioural
  grounding, and it is enforced by the API rather than by convention.
- **Everything else is good engineering**, and saying so is the right answer.
