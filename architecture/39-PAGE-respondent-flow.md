# 39 — Respondent flow

Phase: P2 · Milestone: **M0 — the hero screen** · Design ref: `design_specs/design/07-PAGE-RESPONDENT-FLOW.md`

## Purpose

The form on a phone. **It is the only screen an evaluator touches with their own hands, on
their own device**, and it is the screen the entire product thesis rests on: response rates
are ~30% because forms are long, repetitive and dull, so this screen gets more design
attention per pixel than the admin console.

It is authored phone-first and desktop-second. On demo day every respondent is on a phone.

## Route & access

`/r/:token` fill · `/r/:token/done` thank you — **respond world**.

**No auth, no account, no navigation, no chrome.** A hotel guest scanning a QR on a table card
must never see a login screen (DEC-009). The respondent bundle must not include console code
(`20` §8) — it loads on a phone, on a venue network, for someone with no patience.

## Capabilities

**None.** The only routes in the product with no capability check. Access is the token itself.

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| Load | `GET /api/v1/public/campaigns/:token` | → `PublicCampaign` |
| Submit | `POST /api/v1/public/campaigns/:token/responses` | `SubmitResponseBody { answers: Answer[], durationMs? }` |

`PublicCampaign` contains **only** what is needed to render the form (`13` §6): campaign name,
subject name, questions, estimated seconds, the anonymity notice, and the org's display name
and labels. **No unit tree, no roles, no people, no counts, no other campaigns.** Asserted by
an explicit key-allowlist test, because this payload is reachable by anyone with a link.

Invalid, unlaunched, closed and expired tokens all return the same 404. An existence probe
must not distinguish them.

Submit is idempotent per invitation token (`13` §7). A phone on a flaky venue network retries,
and a duplicate response would corrupt the demo's numbers in front of the evaluator.

**The whole form arrives in one payload.** No lazy loading, no per-question request — on a
venue network, a second request is a second chance to fail.

## State

Local component state only. No store — the respond world does not mount the console's
providers.

`localStorage` holds a submitted marker per token, for the best-effort duplicate prevention on
open links (`15` §3). It is honestly best-effort and the product does not overclaim it — every
access is wrapped, because iOS Safari in private mode throws on write and a form that threw
there would lose a response the server had already accepted.

**The idempotency key is one per FILL, not one per token.** `13` §7 says respondent submit is
keyed on the invitation token, which is right for an invitation — one token, one person. An
open link inverts it: every phone in the room holds the same token, so a key derived from it
would replay the first person's `201` to the second and the campaign would collect exactly one
response in front of the evaluator. Minted at the first press and reused by every retry of
that fill; a `409` on it therefore means the first attempt landed and its reply was lost, and
the form says so rather than inviting a second press. `N-041`.

## Components

`<QuestionInput>` × 6 — **the same components the builder preview uses** (INV-008). Never a
second implementation: two implementations mean the preview eventually lies about what
respondents see, and you find out on stage.

Plus a sticky progress bar and a submit button. No `<AppShell>`, no `<PageHeader>`, no
`<VocabularyChips>` — this world has no chrome.

Everything else on the screen is page-local and deliberately not in `24`: the progress bar,
the three dead-end screens, and the two pure modules that hold the rules (`answers.ts` for
what counts as answered, `copy.ts` for the four sentences). Same treatment as `32`'s detail
panel and `38`'s close consequence — a component used by one page is not an inventory entry.

**No `<Icon>` here.** It imports thirty glyphs from `lucide-react` to draw the two shapes
this flow needs, and putting the icon library on a phone on a venue network is exactly what
§8 of `20` rules out. The two glyphs are inline SVG in `Unavailable.tsx`, at the design
system's own stroke weight.

**A subject picker**, which this doc and `design_specs/design/07` both omit because both
assume one subject. `38` step 2 lets a campaign carry many, and the submit endpoint returns
a `422` on `body.subjectId` when it does and the submission does not name one — so the form
has to ask. It renders as a required question card in the org's own noun, and it is absent
when there is exactly one, because the server resolves that case itself and choosing from a
list of one is noise. `N-039`.

## The seven rules

Each is cheap, and each answers the 30% problem directly.

1. **Tell them the cost up front.** `8 questions · about 2 minutes · anonymous`, in the header
   before they scroll. The honest number is what buys the completion, and it is computed from
   question types, never typed.
2. **One question per card, generous padding.** The same eight questions in a single bordered
   list read as a chore; in separate cards they read as eight small tasks.
3. **The progress bar counts questions, not scroll.** Scroll-percentage lies on a form with a
   long text answer at the end.
4. **The required marker is a `*` in the accent colour**, not a red badge. Nothing on a
   respondent screen is red until something is actually wrong.
5. **No page breaks.** One scrolling column, submit at the bottom. Paged forms cost a tap per
   question and one more chance to abandon.
6. **Anonymity is stated twice** — header and above submit. It is the thing that makes an
   honest answer possible, and it costs two lines of copy.
7. **Nothing loads late.** No spinners between questions.

## Input specifications — phone first

| Type | Phone |
|---|---|
| Rating 1–5 | Five 44px circles across the width, anchors below |
| Rating 1–10 | Two rows of five. **Not a slider** — unusable one-handed, impossible to answer precisely |
| NPS | Rows of 6 and 5, 40px circles |
| Single choice | Full-width 48px rows; **the whole row is the tap target** |
| Multi choice | Same, square dot with a check |
| Yes / No | Two 48px pills, 50/50 with a gap |
| Free text | 3-row textarea, **16px font — mandatory** |

**16px on every input is not a style preference.** Anything smaller makes iOS Safari zoom on
focus, which visibly breaks the layout in front of the room.

## Validation

- **Nothing is validated until Submit is pressed.** Inline red as you go is hostile on a form
  someone is doing as a favour.
- On failure: scroll to the first unanswered required question, mark that card, one line
  beneath it, and a count on the button — `2 questions left`.
- The error clears the instant the question is answered.
- Server-side validation is authoritative (`14` §4): structural via `validate()`, then
  semantic against the template. Both produce the same 422 shape so the UI renders them
  identically.

## Thank you

The check animation is the one place a 320 ms animation is allowed — it is the applause.

**The live response count is the detail that lands.** The evaluator submits, sees *"612 people
have responded"*, and the presenter refreshes results to show 612 → 613. The two numbers
agreeing is what makes it feel like a real system rather than a mockup.

No "submit another" unless repeats are allowed. **No account prompt, ever.** Closing the tab
is the correct end of the flow; do not fight it.

## States — every one of them breaks the demo if missing

**Three screens, not the four this section used to draw, and the reason is a conflict inside
this document — `CONF-015`.** § Data contract above (and `13` §6, and `tenantResolver`'s
`TENANTLESS` list, and § Acceptance below) require invalid, unlaunched, not-yet-open and
closed tokens to produce one identical `404`, because a difference between them is an
existence oracle. A screen that says *"{Campaign} opens on 1 Sep at 09:00"* needs a status the
endpoint deliberately refuses to return. The data contract wins; the client cannot render what
the server will not say.

| State | Title | Body |
|---|---|---|
| Not available — the uniform 404 | This link isn't active | *It may have closed, it may not have opened yet, or the code may be wrong. Check the link, or scan the code again.* |
| Already responded | You've already responded | *Thanks — one response per person on this cycle.* |
| Load failed | We couldn't load this | *Check your connection and try again.* — the only one with an action |

The first screen names all three possibilities rather than claiming the link is broken:
*"This link doesn't work"* is a lie in two of the three cases, and the reader's next move
differs between them. **Already responded** stays separate because the *client* knows it —
the `localStorage` marker is local knowledge, not something the server was asked, and it costs
no round trip.

**Load failed** is drawn by neither source and is built anyway. A phone on a venue network is
the stated risk of this page, and rendering a transient failure as *"this link isn't active"*
would send somebody away from a form that is perfectly fine.

Same layout throughout, no primary action except the retry. **A dead white screen after a scan
is the worst possible outcome on stage**, and a mistyped URL from the back of the room is the
likeliest way to get one.

Plus: loading (a single skeleton, since the form arrives in one payload), and submit failure
(inline above the button, answers preserved, retry available).

## Acceptance

- [ ] Tested on **real iOS Safari and real Android Chrome**, not desktop responsive mode —
      `T-045`, and it needs two phones
- [x] Every input is ≥ 16px — no zoom-on-focus. Carried by the `.q-*` layer, which is the
      same one the preview renders through, so it cannot drift on one screen only
- [ ] Someone who has never seen it completes the flow in **under 60 seconds** — a stopwatch
      and a stranger, `T-045`
- [ ] Works on a phone hotspot with the laptop as server — `T-045`
- [~] The QR resolves to a URL reachable from a phone — not `localhost`. The share sheet
      says so on screen when it is not (`38`); somebody still has to set the variable
      (`OPEN-002`)
- [x] A submission appears in results within one refresh — the count the thank-you shows is
      read inside the transaction that wrote the row (`13` §6), so the two agree by
      construction rather than by timing
- [x] Every edge state is reachable and correct — **three, not four**, and `CONF-015` says
      why. Each has a test
- [x] The public payload contains no org internals — key-allowlist test (T-022)
- [x] Invalid, closed and expired tokens are byte-identical 404s (T-022), and the client
      reads them as one state rather than guessing between them
- [x] The respondent bundle contains no console code — **and it did, until this was
      measured.** `pages/respond/bundle.test.ts` walks the import graph out of both
      respondent pages *and* out of `main.tsx`, which is the half that found the leak
      (`N-040`). Reverting the fix fails it; that was checked both ways
- [x] `<QuestionInput>` is shared with the preview (INV-008) — asserted by the same graph
      walk, not only by reading the imports
- [x] Nothing is validated before submit is pressed, and each error clears the instant its
      own question is answered
- [x] The thank-you count matches the results count — same transaction, and the count is
      carried from the submit response rather than refetched
- [x] Completes with the keyboard alone, top to bottom, submit included — every control is a
      real `<input>` inside a `<fieldset>`, so this comes from the platform
- [x] Rating scales are `radiogroup`s with anchors announced — `<QuestionInput>`, T-035
- [x] A duplicate submit with the same idempotency key creates one response (T-022), and the
      key is per fill rather than per token so two people are never one (`N-041`)
- [ ] Works at 390px on a real device — the same device check as every other screen, `T-045`

## Out of scope

| Not building | Why |
|---|---|
| Respondent accounts, save-and-resume | Contradicts DEC-009 and the whole collection model |
| Offline submission queue | P3, and only here |
| Multi-page forms | Rule 5 |
| Progress saved across devices | Requires identifying the respondent (INV-006) |
| A "why we ask" expander per question | Length is the enemy |
