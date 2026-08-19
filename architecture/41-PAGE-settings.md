# 41 — Settings

Phase: P2 · Milestone: — (cut-list: keep the Words card, cut the rest) · Design ref: `design_specs/design/04` §4.6

## Purpose

Org profile, **the vocabulary editor**, billing summary, and the danger zone. The vocabulary
card is the only part that matters for the demo — it is where the product claim is edited, and
`design_specs/design/11` §1 keeps it while cutting everything else on this page.

## Route & access

`/app/settings` with anchors: `#profile`, `#words`, `#billing`, `#danger`. The `#words` anchor
is linked from `<VocabularyChips>` on every console page, so it must land on the right card.

## Capabilities

| Section | Capability |
|---|---|
| View | `org.read` |
| Profile, vocabulary | `org.update` |
| Billing | `billing.read` / `billing.update` |
| Danger zone | `org.delete` |

Sections the caller cannot read are **absent**, not greyed (INV-003).

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| Load | `GET /api/v1/org` | → `OrgDetail` |
| Logo | `POST`/`DELETE` `/api/v1/org/logo` | multipart (`48`) |
| Profile | `PATCH /api/v1/org` | `UpdateOrgBody { name?, industry? }` |
| Vocabulary | `PATCH /api/v1/org/labels` | `UpdateLabelsBody { labels: LabelSet }` |
| Billing | `GET /api/v1/billing`, `GET /api/v1/billing/usage` | → tier, seats, breakdown |
| Delete org | `DELETE /api/v1/org` | typed confirmation required |

`LabelSet` is validated server-side (`22` §2) — each key needs a non-empty singular and plural
under 40 characters. A blank label would render `undefined` across every screen.

## State

Local. On a successful label save, `vocabularySlice` is updated so **every open screen
re-renders immediately** (`22` §3) — no reload, because watching the sidebar change is the
point.

## Components

`<PageHeader>` · `<ConfirmDialog>` · `<Toast>` · `<FileUpload>` (`48`) · the live-preview
pattern (`24` §7).

## Interactions

**Profile.** Org name, org logo (`<FileUpload>`, spec in `48`), and industry. Changing industry does **not** re-seed roles, units or
labels — it only affects which templates are suggested. Re-seeding would destroy a configured
organisation, and the copy says so: *"This only changes which templates we suggest."*

**Words — the vocabulary editor.** The same five fields and the same live preview as wizard
step 4 (`31`), so the pattern is learned once and there is one implementation.

Save updates `vocabularySlice` and every open screen changes. This is the ten-second proof
repeated outside the wizard, which matters because an evaluator may ask *"can you change that
after setup?"*

Plural override persists — the hotel org needs "Staff / Staff".

**Billing.** Current tier, seat count, and the breakdown of what is counted. **Respondents are
visibly excluded**, with a line saying so: *"Students who answer forms are not counted."* It
is the clearest expression of the pricing thesis (`16` §5) and it belongs where a customer
checks their bill.

**Danger zone.** Delete organisation, behind a typed confirmation of the org name — not a
checkbox. `<ConfirmDialog>` states real numbers: *"This permanently deletes 214 people, 18
courses, 6 feedback cycles and 3,204 responses."*

## States

| State | Behaviour |
|---|---|
| Empty | N/A |
| Loading | Card skeletons |
| Error | Inline within the affected card; other cards stay usable |
| 403 | Unreadable sections are absent; read-only sections render without controls |
| Saving | Per-card indicator; other cards remain editable |

## Acceptance

- [ ] `#words` from the vocabulary chips lands on the right card
- [ ] Logo upload follows every validation rule in `48`, including server-side re-encode
- [ ] Saving labels updates every open screen without a reload
- [ ] Label validation rejects blanks and over-length values with an inline message
- [ ] The plural override persists for "Staff / Staff"
- [ ] Changing industry does not re-seed roles, units, or labels, and the copy says so
- [ ] The billing card states that respondents are not counted
- [ ] Seat count matches `billable_seats` (`16` §5)
- [ ] Org deletion requires typing the org name and states real numbers
- [ ] Sections the caller cannot read are absent, not greyed
- [ ] Every noun from `useLabels()` (INV-001)
- [ ] Works at 390px

## Out of scope

| Not building | Why |
|---|---|
| Plan changes / payment | No processor in P1–P3 (`16` §8) |
| Notification preferences | No notification channels yet |
| Data export of the whole org | Per-campaign CSV covers the real request |
| Audit log viewer | Separate surface, P2 later, behind `audit.read` |
| SSO configuration | Enterprise, P3 |
| Theme or branding customisation | The vocabulary system is the customisation story (`21` §10) |
