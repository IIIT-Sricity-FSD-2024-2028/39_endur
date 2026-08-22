# Status — visual overhaul and dashboard ranges

Written 23 Aug 2026. Covers the frontend overhaul and the follow-up pass that added time
ranges to the dashboard, checked for placeholders, and fixed the bugs that pass found.

Nothing here has been committed. `git status` shows 30-odd changed and new files; the repo's
own `CLAUDE.md` reserves commits for you.

---

## 1 · Running it

The app runs from inside WSL, not from `D:`. Native Windows npm cannot create the workspace
symlinks this monorepo needs — `EISDIR: illegal operation on a directory, symlink` — and no
combination of Developer Mode, an administrator shell, `--install-links` or an npm downgrade
got past it. The working copy on `D:` is the one to edit; it is synced into WSL to run.

```bash
wsl -d Ubuntu-22.04
sudo service postgresql start        # after a reboot only
cd ~/projects/39_endur && npm run dev
```

Web on <http://localhost:5174>, API on <http://localhost:4000>. Port 5173 is held by a
process left over from an earlier session, which is why Vite picks 5174.

To push edits made on `D:` into the running copy:

```bash
wsl -d Ubuntu-22.04 -- bash -lc "rsync -a --delete \
  --exclude node_modules --exclude .git --exclude dist --exclude .env \
  '/mnt/d/Coding/Project/FDFED/endur/Version 2.0/39_endur/' ~/projects/39_endur/"
```

Sign in as `admin@northfield.endur.test` with `endur-demo-password`. The other three seeded
organisations use the same password at `@grand-palace`, `@meridian` and `@riverside`.

---

## 2 · What the overhaul changed

**Type.** A display face and a body face replacing the previous single-weight pairing, both
variable, both self-hosted in `public/fonts` so a blocked CDN cannot strip the typography
mid-demo. A named type scale replaced the vendored layer's fixed pixel sizes; body text went
from 15px to 16px. Recorded as `DEC-027`.

**Dark mode.** Every colour token is declared twice, and `[data-theme]` is set by an inline
script in `index.html` before first paint, so a dark machine never flashes white. The choice
is three-valued — light, dark, system — because "following the OS" is genuinely different
from having chosen light. The swap is a View Transitions circular wipe opening from the
control you pressed, degrading to an instant set where the API is missing or the reader has
asked for reduced motion. `DEC-028`.

**Glass.** Tint, blur, a hairline edge and an inset sheen on chrome and cards, with a
`@supports not (backdrop-filter)` branch back to opaque — without it, older Firefox and iOS
render unreadable text over a moving background. `AmbientBackground` is the field the glass
refracts: a blur with nothing behind it is a grey rectangle. It draws the organisation graph
rather than gradient blobs, on the grounds that the field may as well say something true.
`DEC-029`.

**Landing page.** The vocabulary switcher became the hero mechanic — pick an organisation
type and the headline rewrites itself into that organisation's own words. Below it: a noun
proof grid, a three-step sequence, two claim cards (anonymity is in the schema, permissions
are grants), and a closing call.

**Illustrations.** Line art authored in SVGator, inlined with `?raw` so `var(--illus-*)`
resolves against the page tokens and one drawing serves both themes. Through an `<img>` tag
an SVG is a separate document and would stay stuck in light mode. The animation is CSS
keyframes rather than SVGator's JS player, because an injected `<script>` does not execute —
and CSS gets reduced-motion handling for free. `DEC-030`.

**Auth, structure, templates.** Larger type and a three-point aside beside both forms.
`/app/structure` gained a stats band and `UnitMap`, which draws the org tree as an actual
node-link graph. Template cards carry a drawing of the form they contain so twelve are
comparable at a glance, and Preview opens an Apple-glass quick look that loads the real
questions.

---

## 3 · Dashboard time ranges — `DEC-031`

Your note was that an all-time response count answers nothing. It was right: an all-time
total only goes up, prompts no action, and by month three is large enough to read as
decoration. `/app` now carries a range picker — **Today · 7 days · 30 days · All time** —
and defaults to 30 days rather than all time.

The four cards are now **Responses**, **Response rate**, **_Subjects_ covered**, and
**Active _campaigns_** (both nouns come from the organisation's vocabulary). The old
"Responses today" card is gone, since today is a range now. "Subjects covered" is distinct
subjects with at least one response in the range — the number that says whether feedback is
spread or concentrated, which an undivided response count cannot: 200 responses about two
courses is a very different week from 200 about forty.

Four decisions inside that are worth knowing, because each one is a place the obvious
implementation would have been wrong:

- **Active campaigns is deliberately not windowed.** It is a fact about the present, and
  "campaigns open at some point in the last 30 days" is a different and much less useful
  number that would look identical sitting in that row. The card says "collecting right now"
  out loud so the two cannot be confused.
- **The response rate's denominator only counts campaigns that were actually collecting
  during the range.** Charging a campaign that closed last year against this week is the
  same class of mistake as the 4675% response rate `N-043` fixed, moved into the time
  dimension: a denominator from one period over a numerator from another.
- **The k-anonymity gate still keys off the all-time campaign total**, not the windowed one.
  Gating on the window would make a campaign enter and leave the rate as the range moved,
  which reads as a bug and leaks the same aggregate to anyone who presses two buttons.
- **A hidden `responsesEver` decides the empty state.** "This organisation has never
  collected anything" and "nothing arrived in the last 30 days" are different sentences.
  Reading the windowed count there would show a two-year-old organisation the welcome
  screen — with its range control hidden — every quiet month.

`<TrendChip>` is still not built. A window makes a previous period genuinely measurable,
which retires one of `CONF-017`'s three reasons and neither of the other two: doc `46`
§ Out of scope rules trends off this page by name, and § Purpose forbids it becoming an
analysis surface. The range changes what a number is measured over; it never adds a
direction.

Changing the range refetches rather than filtering client-side, because the k-anon gate and
the rate's denominator are both decided on the server — a client slicing all-time rows would
be holding the rows the gate exists to withhold. The previous figures stay on screen and dim
while the new ones load, rather than being replaced by four skeletons that make the page jump
more than the data moves.

`GET /api/v1/home?window=` is the only query parameter in the API that tolerates a bad value
instead of returning 400. A range is a display preference, nothing is written or authorised
from it, and a stale bookmark must not break the first screen after sign-in.

The stats on `/app/structure` were left alone on purpose. Those are structural counts —
units, levels, people, subjects — not a time series, so a range control there would be a
question with no answer.

---

## 4 · Placeholders

Five console routes still render the shared `Placeholder` component. They are original
scaffolding from `T-026`, not anything introduced by this work, and each names the task that
replaces it. The sidebar already marks all five **"Soon"** and does not link them, so nobody
walks into one by accident.

| Route | File | Waiting on |
|---|---|---|
| `/app/roles` | `pages/console/Roles.tsx` | P2, `architecture/33` |
| `/app/people` | `pages/console/People.tsx` | P2, `architecture/34` |
| `/app/people/:id` | `pages/console/PersonDetail.tsx` | P2, `architecture/34` |
| `/app/simulator` | `pages/console/Simulator.tsx` | P2, `architecture/42` |
| `/app/profile` | `pages/console/Profile.tsx` | P2, `architecture/47` |

Everything else the grep turned up was a genuine input `placeholder` attribute — search
boxes, "Untitled form", "Your answer" — or a comment explaining one. No lorem ipsum
anywhere: the seed's comment pool is written prose on purpose, and `seed.test.ts` asserts it.

---

## 5 · Bugs found and fixed

**The one I introduced, and the repo's own test caught it.** Importing `ThemeToggle`
statically into `router/layouts.tsx` pulled `Icon` and with it lucide-react's thirty glyphs
into the entry chunk that *every* route downloads — including a respondent's phone, before
the first question renders. `pages/respond/bundle.test.ts` exists to catch exactly that, and
did. It is `lazy()` now, the same as `AppShell`. Recorded as `N-026`.

**`UnitMap` said "units" out loud.** The map's `aria-label` read "Map of 9 units", which is a
hardcoded domain noun and an `INV-001` breach. `audit:vocab` did not catch it because it
hunts the English nouns a preset would replace — Department, Course, Student — and "unit" is
Endur's own internal generic name, so it reads as structural. It is not: nothing in the
product says "unit" to a reader, and a screen-reader user would have been the only person
ever hearing it. The component now takes a `unitWord` prop like it already took
`subjectWord`.

**`UnitMap` was an image with buttons inside it.** The `<svg>` carried `role="img"`, which
makes its whole subtree presentational — so the pressable nodes stopped existing for a
screen reader while remaining in the tab order. Reachable by keyboard, invisible to the thing
announcing what you had reached. It is `role="group"` when the nodes are pressable and
`role="img"` when they are not.

**The template preview closed itself mid-read.** Its backdrop used `onClick`, so selecting a
question's text and releasing the mouse past the dialog's edge fired a click on the backdrop
and threw the preview away. `ConfirmDialog` uses `onMouseDown` for precisely this reason;
the preview now matches. It also restores focus to whatever opened it, which matters because
this dialog is opened a dozen times in a row while comparing templates — `ConfirmDialog` and
`ShareSheet` do not restore focus either, but they are opened once, which is why nobody
noticed.

**The theme toggle was three tab stops pretending to be one control.** It declared
`role="radiogroup"` but gave every segment `tabIndex=0` and handled no arrow keys, so a
keyboard reader tabbed three times through a widget the ARIA pattern says should cost one,
and the arrow keys they reached for did nothing. It now uses a roving tabindex with arrow-key
navigation that wraps.

**A stale range could have overwritten a fresh one.** `useHome` guarded its state writes with
an `alive` boolean, which was sufficient while it fetched exactly once. Making the range a
dependency broke that: pressing "30 days" then "Today" fires two requests, and a slow first
one landing last would paint a month of responses under a card reading "today". It uses a
sequence number now, so a response has to prove it is the newest before it may write.

**The decision ledger failed its own audit.** `DEC-027` named all four typefaces, and
`audit:drift` forbids design values in `architecture/` — that separation is what keeps the
docs and `design_specs` from contradicting each other. The entry now describes the change
without naming a face; `tokens.css` remains the only place the names appear.

Six existing tests were also updated, none of them weakened. Nouns and unit names now
legitimately appear twice on a page — headline and grid, map and tree — so `getByText`
became `getAllByText`.

---

## 6 · Checks

| Check | Result |
|---|---|
| Frontend tests | 629 passing, plus 17 new passing — 646, but measured in two runs, not one |
| Backend tests | 213 passing |
| `npm run audit:vocab` | clean — 106 component/page files |
| `npm run audit:drift` | clean — 53 docs, 61 capabilities |
| `npm run typecheck` | clean except 3 pre-existing errors — see below |
| `npx eslint .` | clean except 9 pre-existing errors — see below |

Seventeen new tests were added in two new files: eight for the theme toggle and nine for
`UnitMap`. The range coverage was folded into the existing home, cards and hook suites, which
is why the 629 figure already includes it. **The two new files were run on their own and
passed; a single full-suite run covering all 646 has not been done** — you asked me to stop
running tests before I got to it.

One caution about running the suites: `npm run test -w @endur/web` and
`npm run test -w @endur/api` chained in a single shell command produced eighteen spurious
backend failures. Run separately, both are green. The backend suite shares one database and
does not like being started while another vitest run is still tearing down.

---

## 7 · What is left

**Not mine, and left deliberately untouched so the diff stays readable.** All of these exist
on the `vishv` branch as it was cloned:

- Nine ESLint errors — seven in `pages/console/Settings.test.tsx`, one in
  `pages/console/Settings.tsx`, one in `src/backend/test/database.ts`. All auto-fixable with
  `eslint --fix`.
- Three TypeScript errors in `src/backend/test/org.test.ts` at lines 388 and 398, all
  "possibly undefined" on an array index.

**Open work already on the board in `PROGRESS.md`:**

- `T-043` — resolve `OPEN-002`, the public URL and QR decision. Marked "do early".
- `T-045` — three demo rehearsals.
- The five placeholder routes in section 4.

**From the overhaul brief, not finished:**

- Task 2 asked for line-art illustrations *"on all pages wherever possible"*. Only the
  landing hero was drawn. Every other page received the ambient background, the glass, dark
  mode, and the structure and template visuals — but no figure work. Empty states are the
  obvious next candidates: they are where a drawing does the most and where there is nothing
  else on the screen to compete with it.

**One thing to watch:**

- `design_specs/` does not exist on this branch, so `tokens.css` is no longer a verbatim copy
  of any spec section. When that folder comes back, its §2 must be reconciled *against* the
  token block rather than copied over it — copying over it would wipe the fonts and dark mode
  in one move. This is `DRIFT-001` in `PROGRESS.md`.

---

## 8 · Where the decisions are written down

`architecture/_MEMORY.md` carries `DEC-027` through `DEC-031` and `N-026`, per the
override-and-log approach you chose. `architecture/46-PAGE-home-dashboard.md` and
`architecture/13-API-CONTRACT.md` were both updated so the page and endpoint contracts match
what the code now does. `PROGRESS.md` has the session log entry.
