# 01 — Product contract

Phase: all · Source: `design_specs/SCOPE.md`, generalised past the stale
`definitions.yaml` (see `_MEMORY.md` CONF-007 and § GLOSSARY)

---

## 1. What Endur is

**A platform organisations use to hear from their people and act on what they hear.**

It gives the people at the bottom of an organisation a safe voice, and gives the people
responsible for them real information about what needs fixing. Most institutional systems
are built for the people at the top — they measure, report, administer. Endur is built the
other way round, and the commercial argument is that doing it that way produces better
information than any top-down system can.

It began as student feedback on teaching at one college. It is being generalised so any
organisation can run the same thing.

## 2. The foundation

Everything rests on Endur knowing **who's who and who sits where**. Each customer defines
its own hierarchy — dean → head of department → faculty → student, or GM → manager → staff →
guest, or executive → manager → employee. Endur understands units, groups, reporting lines,
and what each person is eligible for.

This is the hard part and it is what makes the rest possible. A survey tool does not know
who your students are. A messaging app does not know who is eligible for what.

**Architecturally this means:** the org graph is not a feature, it is the substrate. See
`10-DATA-MODEL.md` and `11-PERMISSION-ENGINE.md`. Everything else is built on top of it.

## 3. The five layers

| # | Layer | What it does | Phase |
|---|---|---|---|
| 1 | **Communicate** | Announcements to self-maintaining groups the org graph defines | P3 stretch |
| 2 | **Communities** | Spaces where issues get raised, run by elected representatives | P3 stretch |
| 3 | **Collect** | Feedback, polls, surveys, voting, forms — all one form engine | **P1–P2** |
| 4 | **Analyze** | Themes, sentiment, drivers, trends, reliability | P3 |
| 5 | **Improve** | Self-assessment → gap → plan → check-in → re-measure | P3 |

**P1 and P2 build layer 3 and the substrate under it.** Layers 1, 2, 4 and 5 appear in the
navigation as disabled items with a "Soon" tag and nowhere else — no stub pages, because a
dead link is worse than a disabled item (`design_specs/design/02` §7).

Why they belong in one product, which is the answer to "why not just use Google Forms?":
communication earns daily attention, which is what lifts response rates; communities surface
problems early; collection turns them into evidence; analysis says which matter; the
improvement loop makes something actually change, which is what convinces people to respond
next time. Break any link and the chain weakens.

## 4. The actors

Roles are **rows, not enum values** (`_MEMORY.md` DEC-002, INV-002). These are the archetypes
the presets seed, not types in the code.

| Archetype | Does | Generic model |
|---|---|---|
| Respondent | Answers forms. Never has an account. | Not a `User` at all — a token holder |
| Reviewee | The person or thing being reviewed | `Subject`, optionally `linkedUserId` |
| Supervisor | Reviews their unit, runs campaigns | `User` + assignment at a level |
| Administrator | Configures structure, roles, powers | `User` with `org.*` capabilities |
| Owner | Billing, API keys, danger zone | `User` with `billing.*`, `apikey.*` |

The single most important generalisation is **Subject** — the thing being reviewed. A
course, a restaurant, a ward, a trainer, an event, a bus route. It is what replaces the
education lock-in, and it optionally links to a `User` when the subject is a person.

## 5. Engagement is a constraint, not a feature

The problem Endur exists to solve is that **only ~30% of students respond**, because forms
are long, repetitive and dull. So engagement constrains the architecture:

- **Forms are short.** Competitors ship 40+ question templates. Copying that rebuilds the
  exact problem we exist to solve. Estimated completion time is derived from the question
  set and shown before the respondent starts (`37-PAGE-form-builder.md`).
- **Feedback goes to people**, not the other way round. Token links and QR codes in P2;
  email/SMS/WhatsApp in P3. No respondent ever has to remember a portal exists.
- **The respondent screen is the hero.** It gets more design attention per pixel than the
  admin console, because it is the only screen an outsider ever touches.

## 6. What we sell

Four tiers, defined by what the customer can **do**. Priced per person *reviewed*, per
month. See `16-TENANCY-BILLING-ENTITLEMENTS.md` for the entitlement map.

| Tier | Can do | Gates |
|---|---|---|
| **Bronze — Measure** | Run campaigns, get results | `campaign.*`, `results.read` |
| **Silver — Understand** | Themes, trends, reliability | `+ analysis.read` |
| **Gold — Improve** | The full loop: reflection, gap, plans, check-ins | `+ reflection.*`, `actionplan.*`, `checkin.*` |
| **Enterprise — Decide** | Formal evidence: 360°, full audit, appeals, SSO, **API access** | `+ audit.read`, `apikey.*`, `api.*` |

Two rules that are architecture, not pricing policy:

1. **Respondents are never charged for.** A college with 4,000 students pays for the staff
   being reviewed and the staff running the system. Metering counts `Subject` rows with
   `linkedUserId`, plus `User` rows — never response volume. This is why respondents are not
   `User`s in the schema.
2. **Correct handling of who-can-see-what is in every tier.** The permission engine is never
   gated by entitlement. Selling privacy as an upgrade would be indefensible, and it also
   keeps `requireCapability` and `requireEntitlement` cleanly separate (DEC-011).

## 7. Who we sell to

First colleges and universities, entering through accreditation reporting they must produce
anyway. Then companies, for employee feedback and reviews. Then hospitals and hospitality.
Other sectors only if they come to us.

**Architectural consequence:** the industry presets that ship are University, Hotel,
Hospital, Company, and Custom (`50-SEED-AND-DEMO.md`). A sixth preset is data, not code —
adding one must never require a migration.

## 8. The template library

A browsable gallery organised by industry then use case. Customers preview a template
exactly as respondents will see it, then clone it into their account and edit freely. Each
shows question count and completion time. `Template.orgId = null` means library template;
cloning copies it into the org (`36-PAGE-templates-library.md`).

This is also the organic-search entry point — people looking for "student feedback form
template" find us through it.

## 9. In scope

- Customer-defined role hierarchies and org structure
- Anonymous feedback, polls, surveys, voting, and forms — one engine
- A template library organised by industry and use case
- Collection by link and QR, no respondent account
- Analysis: themes, sentiment, drivers, trends, reliability *(P3)*
- The improvement loop *(P3)*
- Role-based access with adjustable, per-customer rules
- Many customer organisations, fully separated
- APIs and integrations *(P3, Enterprise tier)*

## 10. Out of scope — permanently

Stating these clearly is worth marks; drifting into them is worth none.

| Not building | Why |
|---|---|
| Video calling | Not our problem to solve |
| Replacing WhatsApp for casual chat | We handle official communication only |
| Managing public reviews (Google, app stores) | Different product |
| A complete HR system — payroll, hiring, attendance | Adjacent, not ours |
| A learning or course-delivery platform | The education lock-in we are escaping |
| Sector-specific features for government or non-profits | Not chasing those buyers yet |
| Attendance-based response weighting | v1 requirement, deliberately dropped (GLOSSARY) |

## 11. Deliberate simplifications for P1–P2

Each is defensible on product grounds, not only on time grounds — which is what makes them
answerable in a viva.

| Simplification | Product justification |
|---|---|
| Respondents never log in | A hotel guest scanning a QR on a table card has no account and never will |
| Anonymous by default | It is the condition under which honest feedback happens at all |
| No email/SMS delivery yet | Link + QR proves the collection model; channels are integration work, not design work |
| No refresh-token rotation, no password reset in P1 | Auth surface stays small while the graded work is the middleware chain |
| No conditional logic or branching in forms | Directly contradicts the "forms must be short" constraint |

---

## Cross-references

- Visual and copy authority: `design_specs/design/`
- Scope prose this distils: `design_specs/SCOPE.md`
- The demo this must survive: `design_specs/BUILD_PLAN_EVAL1.md` §6
- Terms replaced from v1: `_MEMORY.md` § GLOSSARY
