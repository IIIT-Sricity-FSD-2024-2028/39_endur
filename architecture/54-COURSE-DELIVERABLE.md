# 54 — React course deliverable

Phase: P2 · Owns: docs only · Decisions: `_MEMORY.md` DEC-013, CONF-009

**This is the document to hand the React teacher.** It answers their pre-preparation
requirements directly, in their vocabulary, and states our situation honestly.

Keep it current as pages land — it is the one doc written for someone outside the team.

---

## 1. Where this project starts from

The course's framing is converting an existing multi-page application into a SPA. **Endur is
being rebuilt from scratch this semester**, so there is no prior application of any kind —
multi-page or otherwise — to bring in. We build the SPA directly (DEC-013).

That is deliberate. An EJS multi-page baseline and an incremental islands approach were both
considered and declined, because building the interface once beats building it as an MPA and
then converting it.

**What this means for the course**, and it is most of it: the teacher's own framing is *"you
will learn React concepts while applying them directly to your own project."* Because Endur is
being built **during** the semester rather than before it, every concept taught lands on real,
in-progress code — arguably a better fit than retrofitting concepts onto a finished app.

If a conversion exercise is wanted specifically, the cheap options are:

1. Apply each React concept to the project as it is taught, and demonstrate that.
2. Convert one screen *backwards* to a server-rendered page and forwards again — small, and it
   shows exactly the contrast the course is built around.
3. Use §4's per-page MPA-versus-SPA contrast as the written artefact.

---

## 2. Their checklist → our project

| Their requirement | Status | Where |
|---|---|---|
| Complete existing project ready | The 26 Aug milestone (M0) | `02` §2 |
| Application running properly | `npm run dev`, `npm run db:reset` | `03` §2, §5 |
| Based on Node.js + Express.js | **Yes** — Express 5 + TypeScript | `12`, `13` |
| Backend/API and database working | Postgres + Prisma, full REST API | `10`, `13` |
| Identify all major pages/features | §3 below | this doc |
| Git repository with working backup | Yes, branch-per-member | `03` §9 |
| Fix bugs / organise code / working APIs | Continuous | `51` |

---

## 3. Page and feature inventory

Their categories, our screens.

| Their term | Our screen | Route | Doc |
|---|---|---|---|
| **Login / Register** | Sign in · Create organization | `/login` · `/start` | `30` |
| **Home / Dashboard** | Organization home | `/app` | `46` |
| **Profile** | My account, with effective permissions | `/app/profile` | `47` |
| **Products / Services** | Subjects — the things being reviewed | `/app/subjects` | `35` |
| **CRUD operations** | Units · Roles · People · Subjects · Templates · Campaigns | `/app/*` | `32`–`38` |
| **Search / Filter** | People · Subjects · Templates · Results | — | `34`–`36`, `40` |
| **File Upload** | Org logo · avatar (binary) · CSV import (parsed) | — | `48`, `34` |
| **Admin pages** | Roles + powers grid · Settings · Permission simulator | `/app/roles` · `/app/settings` · `/app/simulator` | `33`, `41`, `42` |

Beyond their list, and worth mentioning because they are the interesting parts:

| Ours | What it is | Doc |
|---|---|---|
| Setup wizard | 5 steps, configures an entire organisation in ~90 seconds | `31` |
| Form builder | 6 question types, drag reorder, live preview | `37` |
| Respondent flow | Public, no account, phone-first, QR-driven | `39` |
| Results | Aggregates, distributions, k-anonymity suppression | `40` |
| Permission simulator | *"Why was this allowed?"* with a full decision trace | `42` |

---

## 4. MPA versus SPA, per page

The contrast the course is built around, written out. Useful in class even without a
conversion to perform.

| Screen | As a multi-page app | As our SPA |
|---|---|---|
| **Login** | POST form → 302 redirect → full reload | `fetch` → session cookie → client route |
| **Subjects list** | `?page=2&q=data` → full reload per keystroke, or no live search at all | Local state, debounced fetch, no reload |
| **Setup wizard** | 5 pages, 5 POSTs, server-held partial state, back button breaks it | One component, one state object, one commit |
| **Form builder** | Impossible without heavy JS anyway — reorder would be a POST per move | Local draft + autosave + drag reorder |
| **Results** | Reload to see new responses | Poll, and new rows animate in |
| **Org switcher** | Reload the entire app to change vocabulary | Store update, every subscriber re-renders |
| **Respondent form** | One POST at the end — actually fine as an MPA | Same UX, but shares components with the preview |

**The honest observation** — worth making in class rather than hiding: the respondent form
would be *perfectly acceptable* as a server-rendered page. It is one form, submitted once, and
a SPA buys it almost nothing on its own. It is a SPA here for a different reason: it shares
its six `<QuestionInput>` components with the builder's preview (INV-008), so the preview
cannot drift from what respondents actually see.

That is a better argument for React than "SPAs are faster", and it is the kind of reasoning
the course says it wants: *what problem does each React feature actually solve?*

The screens where a SPA genuinely wins are the ones with **client-side state that outlives a
single request** — the builder's draft, the wizard's five steps, the powers grid's working
copy. Those three are where React is load-bearing rather than decorative.

---

## 5. Demonstrating React concepts on this project

Mapping likely course topics to where they already appear, so each lesson has a concrete
target.

| Concept | Where it lives here |
|---|---|
| Components and props | `24-COMPONENT-INVENTORY.md` — 20 components with typed contracts |
| Composition over inheritance | `<PageHeader>` on every console page |
| Lists and keys | `<ResponsiveTable>`, `<UnitTree>` |
| Conditional rendering | `useCan()` capability-aware UI (`20` §6) |
| State | Form builder draft (`37`), wizard (`31`) |
| Lifting state up | `<QuestionCard>` expansion, controlled at the parent |
| Controlled inputs | All six `<QuestionEditor>` / `<QuestionInput>` pairs |
| `useEffect` and data fetching | Per-page `use*` hooks (`20` §4) |
| Custom hooks | `useLabels()` (`22`), `useCan()`, `useCampaigns()` |
| Context vs store | `vocabularySlice` — and *why* it is a slice, not a context |
| Routing, nested routes | Three route trees, three layouts (`20` §2) |
| Route guards | `<RequireSession>`, `<RequireCapability>` |
| Recursive components | `<UnitTree>` — one implementation, three placements |
| Error boundaries | One per world |
| Code splitting | Respondent bundle excludes the console (`20` §8) |
| Redux | Phase 3 (`23`) |

---

## 6. Running it

```bash
docker compose up -d db     # Postgres 16
npm install
npm run db:reset            # migrate + seed 4 demo orgs with historical responses
npm run dev                 # API on :4000, web on :5173
```

Seeded credentials print at the end of `db:reset` (`50` §4).

Four demo organisations across different industries — university, hotel, hospital, company —
all running the same code with different data. Switching between them changes every noun in
the interface, which is the fastest way to see what the project is actually about.

---

## 7. Keeping this current

- [ ] Update §3 when a page doc is added or a route changes
- [ ] Update §5 when the course covers a concept not yet mapped
- [ ] Re-check §2 before the first class, and again before evaluation
- [ ] If the teacher asks for a conversion exercise, record which of §1's three options was chosen
