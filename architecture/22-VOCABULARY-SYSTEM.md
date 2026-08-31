# 22 — The vocabulary system

Phase: P2 · Milestone: M0 · Owns: `src/frontend/lib/labels.ts`
Design ref: `design_specs/design/02-IA-AND-NAVIGATION.md` §4
Invariants: INV-001, INV-002

This is the mechanism that makes Endur generic, and it is the product claim made visible in
ten seconds. Getting it wrong loses the evaluation.

---

## 1. The rule

> **No user-facing domain noun is written in a component.** Every one comes from
> `useLabels()`.

```tsx
const L = useLabels();
<h2>{L.subject.many}</h2>                        // "Courses" / "Restaurants" / "Wards"
<Button>Add {L.subject.one.toLowerCase()}</Button>
```

Switch organisation and the whole UI re-skins into hotel language without a code change.
Cheap to build, and it makes "highly customizable" *visible* rather than asserted on a slide.

### What stays hardcoded

Structural product words are the product's own vocabulary and correctly do not change:

```
Home · Settings · Save · Cancel · Delete · Results · Template · Question
Response · Preview · Sign in · Sign out · Search · Next · Back · Launch
```

If a word describes **the customer's world**, it is a label. If it describes **Endur**, it is
literal. That test resolves nearly every case; the ambiguous ones are decided once here and
not re-argued per screen.

## 2. The data

`organizations.labels`, JSONB (`10` §3). Five keys, each with a singular and a plural, because
English plurals are not mechanical — "Faculty" pluralises to "Faculty", and deriving it would
be wrong exactly where a university is watching.

```json
{
  "unit":       { "one": "Department",     "many": "Departments" },
  "subject":    { "one": "Course",         "many": "Courses" },
  "respondent": { "one": "Student",        "many": "Students" },
  "reviewee":   { "one": "Faculty",        "many": "Faculty" },
  "campaign":   { "one": "Feedback cycle", "many": "Feedback cycles" }
}
```

Preset vocabularies (`design_specs/design/02` §4, seeded by `50`):

| | University | Hotel | Hospital | Company | Custom |
|---|---|---|---|---|---|
| unit | Department | Property | Ward | Team | Unit |
| subject | Course | Restaurant | Service | Project | Subject |
| respondent | Student | Guest | Patient | Employee | Respondent |
| reviewee | Faculty | Staff member | Clinician | Manager | Reviewee |
| campaign | Feedback cycle | Guest survey | Patient survey | Review cycle | Campaign |

Type lives in `packages/shared/src/labels.ts` so the server can validate a label update and
the client can consume it from one definition (DEC-003):

```ts
export const LabelKey = z.enum(['unit','subject','respondent','reviewee','campaign']);
export const LabelSet = z.record(LabelKey,
  z.object({ one: z.string().min(1).max(40), many: z.string().min(1).max(40) }));
export type LabelSet = z.infer<typeof LabelSet>;
```

## 3. Implementation

```ts
// src/frontend/lib/labels.ts
export const useLabels = (): LabelSet =>
  useAppSelector(s => s.vocabulary.labels) ?? DEFAULT_LABELS;
```

Three lines, and the most important file in the frontend. **Write it on day one, before any
page**, so no component ever gets the chance to hardcode a noun
(`design_specs/design/09` §4).

`vocabularySlice` is one of only two slices in P1–P2 (DEC-008), hydrated from `/auth/me` at
boot alongside the session. It is a slice rather than a context because labels change on org
switch and on the settings edit, and both need to re-render every subscriber immediately.

For the respondent world there is no session, so labels arrive in the public campaign payload
(`13` §6) — the respondent form must say "Rate this course" or "Rate this restaurant"
correctly, on a phone, with no account.

`DEFAULT_LABELS` is the Custom preset: Unit, Subject, Respondent, Reviewee, Campaign. A
missing label renders a generic word, never `undefined` and never a crash.

## 4. The chip row

Under the page title on every console page: four `.tag-neutral` chips reading live from
`organization.labels`, plus a ghost Edit link to settings.

Nothing else on any page occupies that position, so the eye learns it fast. **On org switch it
is the first thing to re-render** — that is the ten-second proof
(`design_specs/design/01` §1, `_MEMORY.md` N-003).

Spend boldness there; everything else stays quiet. Anatomy and spacing are in
`design_specs/design/02` §4 and `design_specs/design/09` §2.2.

## 5. The audit — how we prove it

> Set every label to a nonsense string and walk every screen. **Any English domain noun still
> visible is a hardcoded string and a bug.**

Two halves, both required.

**Mechanical — `npm run audit:vocab`** (`03` §7). Three passes since T-044: banned education
nouns in component code, **the five default labels in user-facing text**, and **the server's
own message strings**. Runs in CI.

The second and third passes exist because T-044 ran the walk and found things the first pass
was structurally unable to see, so each was converted from "somebody must notice this" into
"the check fails". What a pass cannot reach is listed below and stays manual on purpose.

**Manual — the nonsense walk.** Set the demo org's labels to `Zork` / `Blimp` / `Frob` /
`Quux` / `Snarf` and click through every screen including empty states, error messages,
confirmation dialogs, and the respondent flow.

The manual pass is not optional, because the mechanical one cannot see:

- nouns inside sentences in copy — *"No students have responded yet"*
- nouns in confirmation dialogs — *"Deleting Computer Science moves 64 people…"*
- nouns baked into seeded template question text
- nouns in `aria-label`s and placeholder attributes
- pluralisation done by appending `s`

**Do this on 24 Aug, not 26 Aug** (`02` §2). It always finds something, and finding it on the
last day means shipping it.

### What T-044 found

It found something, as predicted, and the interesting part is that **not one of the four was
an education word** — the class the mechanical check had been built around since T-003.

| Where | What it said | Class |
|---|---|---|
| `<ShareSheet>` | *"Respondents don't need an account."* | A default label in a sentence, on the component that IS the demo. Live since T-038, through four audits |
| The server, 17 sites | *"That unit does not exist."*, *"That campaign has launched."* | §6, below. Rendered verbatim by ten console pages |
| `/app/campaigns/new` | *"About 1 frimbles can respond."* | The plural passed as both forms — the agreement case this list names |
| `/app/subjects/:id` | *"3 cycles so far"* | The DTO's internal word for a campaign, on screen beside a kicker reading "Active {campaign.many}" |

The generalisation, and it is the one worth carrying: **the default vocabulary is the
likeliest thing to be hardcoded, precisely because it does not look like a domain word.**
Nobody types "Guests don't need an account" while building generic UI. Everybody types
"Respondents". The banned list was full of words a developer would have to go out of their
way to write.

The first three are now mechanical (`03` §7). The fourth is not and cannot be: nothing but a
reader knows that "cycle" and "{campaign}" are the same thing.

## 6. Server-side labels

The API also produces user-facing strings — validation messages, confirmation text, export
headers. These go through the same system: the label set is on `req.ctx` after
`tenantResolver`, and message builders take it.

A CSV export whose header column says "Course" for a hotel is exactly the kind of leak the
manual audit is for, and it is the one nobody thinks to check. **It happened.** The export
shipped at T-023 saying the literal word "Subject" and was found at T-040 — `_MEMORY.md`
`N-044`, which also wrote the brief for the rest: *only one of the three kinds had ever been
audited.*

**Built at T-044.** `tenantResolver` resolves the labels in the query it already ran for
`authzVersion`, so this costs nothing (`12` §4.6). `src/backend/lib/vocabulary.ts` holds
`nounsOf(req)` and `counted(n, label)`; seventeen message sites across seven services now go
through them, and `audit:vocab` pass 3 fails on any new one that does not.

Three rules came out of doing it:

- **A 404's uniformity is about the answer, not the language.** `assertVisible` throws the
  same message on both branches — no row, and out of scope — so the two are indistinguishable
  (`13` §5). Saying it in the org's noun does not change that.
- **The wizard reads the body, not `ctx`.** `POST /org/setup` validates a structure while the
  reader is looking at words they picked two steps ago and the database has not been told
  about. `validateStructure` takes the labels from `SetupOrgBody`.
- **Structural words stay structural, in the same sentence.** *"That template is used by 1
  review round"* — a hotel calls a template a template, and calls the other thing a guest
  survey.

## 7. Acceptance

- [x] `labels.ts` exists before any page component does — written at T-026, before the first
      page, exactly as §3 asks
- [x] No component contains a literal domain noun (INV-001, INV-002) — three of the four
      T-044 findings are now mechanical, and each new pass was proved by planting a real
      violation and watching it fail
- [x] `npm run audit:vocab` passes in CI
- [x] The nonsense walk finds zero English domain nouns across every screen, including empty
      states, dialogs, `aria-label`s, and the respondent flow — T-044. Four findings, all
      fixed; every empty state, every `<ConfirmDialog>` consequence, the three error
      boundaries and the 404 page were read individually
- [x] The chip row renders on every console page, in the same position — `<PageHeader>` owns
      it, so a page cannot forget it
- [~] Switching org re-renders the chip row before anything else on the page — the slice and
      the chip row are built and tested; org switching itself is `41`, after M0
- [x] The respondent form shows correct labels with no session — from the public payload, not
      `useLabels()`, because the respond world mounts no store (`39` § State)
- [x] A missing or malformed label renders the generic default, never `undefined` —
      `resolveLabels` merges per key, so a partial set keeps the renames it does have
- [~] Editing a label in settings updates every open screen without a reload — the wizard's
      Words step does this live; the settings page is `41`, after M0
- [x] CSV export headers use the org's labels — T-040, and the test pins the test org's own
      noun and asserts the English one is absent
- [x] **The server's user-facing messages use them too** — T-044, `12` §4.6 and §6 above.
      Added because the CSV was the only one of §6's three kinds anybody had checked

## 8. Out of scope

| Not doing | Why |
|---|---|
| Real i18n (locales, translation files) | Different problem. The vocabulary system is per-org terminology within one language. Post-P3 |
| Automatic pluralisation **at render time** | "Faculty" → "Facultys". Both forms are stored deliberately, and `pluralise(n, one, many)` takes both. The wizard's Words step does pre-fill the plural field from the singular (`derivePlural`), which is a different thing: it fills an editable box before anything is stored, and the reader can overwrite it. Nothing ever derives a plural from a stored label to put on a screen — T-044 checked, and found one screen passing the plural as both forms instead |
| Per-user label overrides | Terminology is an organisational fact, not a preference |
| Labels for structural product words | They describe Endur, not the customer (§1) |
| More than five label keys | Each new key is a new thing to keep consistent across every screen. Add one only when a screen genuinely cannot be written without it |
