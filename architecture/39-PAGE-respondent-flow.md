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
open links (`15` §3). It is honestly best-effort and the product does not overclaim it.

## Components

`<QuestionInput>` × 6 — **the same components the builder preview uses** (INV-008). Never a
second implementation: two implementations mean the preview eventually lies about what
respondents see, and you find out on stage.

Plus a sticky progress bar and a submit button. No `<AppShell>`, no `<PageHeader>`, no
`<VocabularyChips>` — this world has no chrome.

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

## States — all four break the demo if missing

| State | Title | Body |
|---|---|---|
| Not open yet | This isn't open yet | *{Campaign} opens on 1 Sep at 09:00.* |
| Closed | This {campaign} has closed | *It ran from 11 to 26 August. Thanks if you took part.* |
| Bad token | This link doesn't work | *Check the link, or scan the code again.* |
| Already responded | You've already responded | *Thanks — one response per person on this cycle.* |

Same layout, no primary action. **A dead white screen after a scan is the worst possible
outcome on stage**, and bad-token is the most likely case if someone mistypes from the back of
the room.

Plus: loading (a single skeleton, since the form arrives in one payload), and submit failure
(inline above the button, answers preserved, retry available).

## Acceptance

- [ ] Tested on **real iOS Safari and real Android Chrome**, not desktop responsive mode
- [ ] Every input is ≥ 16px — no zoom-on-focus
- [ ] Someone who has never seen it completes the flow in **under 60 seconds**
- [ ] Works on a phone hotspot with the laptop as server
- [ ] The QR resolves to a URL reachable from a phone — not `localhost`
- [ ] A submission appears in results within one refresh
- [ ] All four edge states are reachable and correct
- [ ] The public payload contains no org internals — key-allowlist test
- [ ] Invalid, closed and expired tokens are byte-identical 404s
- [ ] The respondent bundle contains no console code
- [ ] `<QuestionInput>` is shared with the preview (INV-008)
- [ ] Nothing is validated before submit is pressed
- [ ] The thank-you count matches the results count
- [ ] Completes with the keyboard alone, top to bottom, submit included
- [ ] Rating scales are `radiogroup`s with anchors announced
- [ ] A duplicate submit with the same idempotency key creates one response

## Out of scope

| Not building | Why |
|---|---|
| Respondent accounts, save-and-resume | Contradicts DEC-009 and the whole collection model |
| Offline submission queue | P3, and only here |
| Multi-page forms | Rule 5 |
| Progress saved across devices | Requires identifying the respondent (INV-006) |
| A "why we ask" expander per question | Length is the enemy |
