# 🟦 Endur

### Feedback management and performance analysis

#### [Jira Link](https://endur.atlassian.net/jira/software/projects/END/boards/1)

Endur collects structured feedback about **anything an organisation wants to improve** — a
course, a restaurant, a hospital ward, a bus route, a manager — and turns it into results
the people responsible can act on.

---

## 🟥 The problem

Feedback systems fail in the same three ways regardless of who runs them.

- **Nobody fills them in.** Long forms at the end of a term, when it is too late to change
  anything for the people answering.
- **Nobody trusts them.** If a respondent suspects their name is attached, they write
  nothing useful.
- **They only fit one organisation.** A tool built for a college cannot be used by a hotel
  without a rewrite, because its vocabulary and its hierarchy are hardcoded.

The third is the interesting one, and it is what Endur is actually about.

## 🟩 The idea

> **The organisation is data, not code.**

There is no `Course` table, no `Student` role, no `Semester`. There is a graph of **nodes**
(units, roles, people, positions, groups) joined by **edges**, and a set of **grants** that
say who may do what, where. A university, a hotel and a hospital are the *same rows* with
different names.

Two consequences worth seeing in action:

- **Every domain noun on screen is a label read from the database.** Switch organisation and
  the entire interface re-skins into hotel language with no code change. "Department" becomes
  "Property", "Course" becomes "Restaurant".
- **Permissions are grants, not levels.** An integer rank cannot express "a student on a
  committee who may book a hall" or "a vendor who must never see footage". A capability plus
  a scope plus an effect can.

Anonymity is a property of the schema rather than a setting: the `responses` table has no
column that could identify a respondent, and it never will. A separate `invitations` table
records *that* a token was used; nothing joins the two. So Endur can report "312 of 400
responded" and still not know whose answer is whose.

## 🟨 Architecture

| Layer | Choice |
|---|---|
| Frontend | React 18 · Vite · TypeScript · React Router · Redux Toolkit |
| Backend | Express 5 · TypeScript · an explicit, ordered middleware chain |
| Contracts | Zod schemas as DTOs in `packages/shared`, inferred by **both** sides |
| Database | PostgreSQL 16 · Prisma, with a raw-SQL seam for recursive graph queries |
| Auth | Cookie sessions for staff · opaque tokens for respondents, who never hold accounts |

## 🟦 State (Redux Toolkit)

All client state lives in one store, `src/frontend/store/`. It holds two kinds of state:

| Kind | Where | What |
|---|---|---|
| Server data | RTK Query: `api` (the org API) and `opsApi` (the operator console) | Every read the console makes, cached, de-duplicated and refreshed by tags. Endpoints are injected per domain from `store/api/endpoints/*.ts` |
| Client state | Slices: `auth`, `vocabulary`, `ops`, `ui` (toasts); and, injected only when their page loads, `builder`, `wizard`, `powersGrid` | What the user is editing and has not saved, with undo |

- **Pages never talk to the store's API layer.** They call the `use*` hooks in
  `src/frontend/lib/` (`useCampaign`, `useUnits`, …), which keep the shape pages were
  written against: `{ data, loading, error }` plus commands that resolve or throw an
  `ApiError`. Lint enforces it: a page or component may not import `store/api`, nor the
  untyped `useSelector` / `useDispatch` (use `useAppSelector` / `useAppDispatch`).
- **Writes refresh what they change.** A mutation invalidates the tags of everything it
  affects. Anything that changes what the signed-in user may do (a grant, a role
  reorder, a position) invalidates `Me`, so `/auth/me` is re-read and the nav follows,
  with no reload.
- **Middleware:** the builder's autosave and undo history, and the cache reset on sign-out
  or org switch, are listener middleware (`store/middleware/`). A 401 from any query ends
  the session through a classic middleware (`sessionExpired.ts`).
- **The respondent pages (`/r/…`, `/book/…`) never load the store.** They run on a phone
  over a venue network; `pages/respond/bundle.test.ts` fails the build if anything under
  `store/` reaches them.
- **Redux DevTools** connects in development. Any password in an action's argument is
  blanked before DevTools sees it (`store/devtools.ts`).

To add a server read: an endpoint in the domain's `store/api/endpoints/<domain>.ts` (with
`providesTags`, and `invalidatesTags` on the mutations that change it), then a hook in
`lib/<domain>.ts` built on `useLoadable` from `lib/query.ts`. Tests stub `fetch` with
`stubApi` from `test-utils.tsx` and run the real store.

## 🟪 Repository

```
src/backend/        Express + Prisma. The middleware chain is src/app.ts
src/frontend/        React SPA
packages/shared/    Zod DTOs, the capability catalogue, error codes, labels
scripts/            invariant audits that run in CI
```

## 🟫 Running it

Requires **Node 20+** and **PostgreSQL 16**.

```bash
cp .env.example .env                     # then set SESSION_SECRET (32+ chars)

npm install
# If this fails with EBADPLATFORM (an esbuild optional dependency for a
# different OS), it's an npm issue unrelated to this project — retry with:
#   npm install --force

# Postgres — either one, they produce an identical database:
sudo bash scripts/install-postgres.sh    # native install (Linux / WSL)
npm run db:up                            # docker compose, if you have Docker

npm run db:migrate
npm run db:seed

npm run dev                              # api :4000 · web :5173, one labelled job
```

`npm run dev` runs both servers under `concurrently`: their output is prefixed `[api]` /
`[web]`, and if either one stops the other is stopped too, so a dead half is never left
looking alive. Run it in a terminal you keep open; if that terminal is closed (a VS Code
reload closes them), stop the leftovers and start it again.

`.env` has to exist **before** `npm install` — its `postinstall` hook runs
`prisma generate`, which needs `DATABASE_URL` to already be set.

On WSL, services do not start at boot: `sudo service postgresql start` after a restart.

Useful checks:

```bash
npm run typecheck
npm run lint          # includes rules enforcing the project's invariants
npm run audit:vocab   # no hardcoded domain noun in a component
npm run audit:css     # no undefined CSS token, no offset on an element that is never positioned
npm run format:check  # Prettier, not yet enforced (see CI below)
```

## 🟦 Testing

```bash
npm run test                 # every workspace that has tests — @endur/api and @endur/web
npm run test -w @endur/api   # backend only (Vitest + Supertest against the real database)
npm run test -w @endur/web   # frontend only (Vitest + React Testing Library)

npm run test -w @endur/api -- tiers.test.ts   # a single backend test file
npm run test -w @endur/web -- Start           # frontend tests matching a name/path
```

The backend tests run against a real database (`TEST_DATABASE_URL` in `.env.example`, a
separate `endur_test` database) rather than mocks — `test/globalSetup.ts` creates and
migrates it automatically on the first run, so no manual setup is needed beyond Postgres
itself being up.

End-to-end tests drive the real app in Chromium (Playwright, `e2e/`):

```bash
npx playwright install chromium   # once per machine
npm run test:e2e
```

They use a database of their own, `endur_e2e`, which `scripts/e2e-db.mjs` drops, recreates,
migrates and seeds on every run (it refuses any name that does not end in `_e2e`), and their
own ports (API 4100, web 5180), so they run beside `npm run dev` without touching it.

## 🟩 CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:
typecheck, lint, `audit:vocab`, `audit:css`, both test suites (against a throwaway
Postgres 16), the build, and the end-to-end tests. `format:check` runs but does not fail
the build yet: the codebase predates the formatter being enforced. After a one-off
`npm run format` commit, remove its `continue-on-error`.


## 🟧 Deploying

Live at **https://endur.azurewebsites.net** — Azure App Service (Linux, Node 24, free F1)
plus Azure Database for PostgreSQL 16 (B1ms), both in `endur-rg`, Southeast Asia.

```bash
az login                                   # once; the sign-in expires after 90 days unused
bash scripts/deploy-azure.sh               # build HEAD and upload it
bash scripts/deploy-azure.sh --migrate     # also apply new migrations first
```

Only committed code is deployed. `--migrate` reads `AZ_DATABASE_URL` from `.env.azure`
(git-ignored, never commit it) and allows your current IP through the database firewall.
Secrets live in the Web App's settings, not in the repo.
