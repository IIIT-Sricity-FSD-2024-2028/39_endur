# 22 — The vocabulary system

Phase: P2 · Milestone: M0 · Owns: `apps/web/src/lib/labels.ts`
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
// apps/web/src/lib/labels.ts
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
`design_specs/design/02` §4 and `09` §2.2.

## 5. The audit — how we prove it

> Set every label to a nonsense string and walk every screen. **Any English domain noun still
> visible is a hardcoded string and a bug.**

Two halves, both required.

**Mechanical — `npm run audit:vocab`** (`03` §7). Greps `apps/web/src/pages` and `components`
for the banned nouns outside a `useLabels()` expression. Runs in CI. Catches the common case
cheaply.

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

## 6. Server-side labels

The API also produces user-facing strings — validation messages, confirmation text, export
headers. These go through the same system: the label set is on `req.ctx` after
`tenantResolver`, and message builders take it.

A CSV export whose header column says "Course" for a hotel is exactly the kind of leak the
manual audit is for, and it is the one nobody thinks to check.

## 7. Acceptance

- [ ] `labels.ts` exists before any page component does
- [ ] No component contains a literal domain noun (INV-001, INV-002)
- [ ] `npm run audit:vocab` passes in CI
- [ ] The nonsense walk finds zero English domain nouns across every screen, including empty
      states, dialogs, `aria-label`s, and the respondent flow
- [ ] The chip row renders on every console page, in the same position
- [ ] Switching org re-renders the chip row before anything else on the page
- [ ] The respondent form shows correct labels with no session
- [ ] A missing or malformed label renders the generic default, never `undefined`
- [ ] Editing a label in settings updates every open screen without a reload
- [ ] CSV export headers use the org's labels

## 8. Out of scope

| Not doing | Why |
|---|---|
| Real i18n (locales, translation files) | Different problem. The vocabulary system is per-org terminology within one language. Post-P3 |
| Automatic pluralisation | "Faculty" → "Facultys". Both forms are stored deliberately |
| Per-user label overrides | Terminology is an organisational fact, not a preference |
| Labels for structural product words | They describe Endur, not the customer (§1) |
| More than five label keys | Each new key is a new thing to keep consistent across every screen. Add one only when a screen genuinely cannot be written without it |
