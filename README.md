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

Documentation lives in [`architecture/`](architecture/) — 53 documents covering the data
model, the permission engine, the middleware chain, every page and every feature. Start with
[`architecture/README.md`](architecture/README.md).

The live build state is in [`PROGRESS.md`](PROGRESS.md).

## 🟪 Repository

```
src/backend/           Express + Prisma. The middleware chain is src/app.ts
src/frontend/           React SPA
packages/shared/    Zod DTOs, the capability catalogue, error codes, labels
architecture/       contracts: schema, routes, capabilities, acceptance criteria
design_specs/       visual authority: tokens, type, colour, component anatomy
scripts/            invariant audits that run in CI
```

## 🟫 Running it

Requires **Node 20+** and **PostgreSQL 16**.

```bash
npm install

# Postgres — either one, they produce an identical database:
sudo bash scripts/install-postgres.sh    # native install (Linux / WSL)
npm run db:up                            # docker compose, if you have Docker

cp .env.example .env                     # then set SESSION_SECRET (32+ chars)
npm run db:migrate
npm run db:seed

npm run dev                              # api :4000 · web :5173
```

On WSL, services do not start at boot: `sudo service postgresql start` after a restart.

Useful checks:

```bash
npm run typecheck
npm run lint          # includes rules enforcing the project's invariants
npm run audit:drift   # docs and code cannot silently disagree about a capability
npm run audit:vocab   # no hardcoded domain noun in a component
```

## 🟧 Team

Three members. Work is tracked as stable task ids (`T-001`…) defined in
[`architecture/55-BUILD-ORDER.md`](architecture/55-BUILD-ORDER.md) and referenced in commit
messages.
