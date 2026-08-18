# 03 — Repository and tooling

Phase: P1 · Owns: `/package.json`, `/tsconfig*.json`, `/.env.example`, `/.github`
Decisions: `_MEMORY.md` DEC-003, DEC-007

---

## 1. Layout

npm workspaces. No Turborepo, no Nx — one more tool to explain is not worth it at this size.

```
39_endur/
  CLAUDE.md                    auto-loaded project instructions
  architecture/                contracts — this folder
  design_specs/                visual authority, do not edit

  package.json                 workspaces root, orchestration scripts only
  tsconfig.base.json           shared compiler options
  .env.example                 every variable, documented, no real secrets

  packages/
    shared/                    the contract package — imported by BOTH apps
      src/
        dto/                   zod schemas = DTOs           (14-DTO-AND-VALIDATION)
        capabilities.ts        the capability catalogue      (11-PERMISSION-ENGINE)
        errors.ts              error codes + envelope type   (13-API-CONTRACT)
        labels.ts              LabelSet type + defaults      (22-VOCABULARY-SYSTEM)
        index.ts

  apps/
    api/                       Express + TypeScript
      prisma/
        schema.prisma
        migrations/          incl. a plain-SQL one for `sessions` (10 §5)
        seed/                  presets + demo orgs          (50-SEED-AND-DEMO)
      src/
        app.ts                 the middleware chain assembled (12)
        server.ts              bootstrap, graceful shutdown
        middleware/            one file per link in the chain (12)
        authz/                 the GRANT resolver             (11)
        auth/                  sessions, respondent tokens, api keys (15)
        billing/               entitlements, metering         (16)
        db/
          client.ts            prisma singleton
          graph.ts             THE ONLY raw SQL in the app   (DEC-007)
        features/<name>/       router + handlers + service, one folder per feature
        presets/               industry presets              (50)
        lib/                   logger, errors, ids, config
      storage/                 uploaded binaries (48). gitignored.
                               <orgId>/<fileId>.webp
      test/

    web/                       React + Vite + TypeScript
      public/fonts/            self-hosted faces — see design_specs/design/01 §2
      src/
        main.tsx
        router/                                              (20)
        design-system/         tokens.css organic.css endur.css (21)
        components/            the inventory                 (24)
        pages/
          public/  console/  respond/                        (30-42)
        store/                 thin in P1-P2                 (23)
        lib/
          api.ts               typed fetch wrapper
          labels.ts            useLabels()                   (22)
```

**Why `packages/shared` exists at all:** a DTO defined once and inferred on both sides is the
whole payoff of TypeScript-everywhere (DEC-003). Without it we would hand-write the same
shape twice and they would drift within a week.

## 2. Workspace configuration

```jsonc
// package.json (root)
{
  "name": "endur",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "engines": { "node": ">=20" },
  "scripts": {
    "dev":          "npm run dev -w @endur/api & npm run dev -w @endur/web",
    "build":        "npm run build -w @endur/shared && npm run build -w @endur/api && npm run build -w @endur/web",
    "typecheck":    "tsc -b",
    "lint":         "eslint .",
    "format":       "prettier --write .",
    "test":         "npm run test --workspaces --if-present",

    "db:migrate":   "npm run db:migrate -w @endur/api",
    "db:seed":      "npm run db:seed -w @endur/api",
    "db:reset":     "npm run db:reset -w @endur/api",

    "audit:vocab":  "node scripts/audit-vocab.mjs",
    "audit:drift":  "node scripts/audit-drift.mjs"
  }
}
```

Package names: `@endur/shared`, `@endur/api`, `@endur/web`.

`@endur/shared` is consumed as **source via project references**, not as a built artifact —
one less build step between an edit and a type error surfacing.

## 3. TypeScript

`tsconfig.base.json`, extended by each workspace:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "composite": true,
    "paths": { "@endur/shared": ["./packages/shared/src"] }
  }
}
```

`strict` and `noUncheckedIndexedAccess` are not negotiable. The whole reason for choosing
TypeScript here is that the DTO layer catches contract breaks at compile time; loosening the
compiler gives that up while keeping all of the ceremony.

**Rule:** `any` is banned outside `db/graph.ts` (raw SQL results, cast immediately at the
boundary into a declared type). `unknown` plus a Zod parse is the correct pattern everywhere
else.

## 4. Environment

`.env.example` is committed with every variable present and documented. Real `.env` is not
committed. The app **fails fast at boot** if a required variable is missing — a Zod schema
over `process.env` in `lib/config.ts`, parsed once (see `14-DTO-AND-VALIDATION.md` §5).

```bash
NODE_ENV=development
PORT=4000

DATABASE_URL=postgresql://endur:endur@localhost:5432/endur

SESSION_SECRET=             # >=32 chars. required. DEC-014 — staff auth is a cookie session.
SESSION_TTL_DAYS=7          # rolling: active use extends it
COOKIE_SECURE=false         # true everywhere except local dev

API_KEY_SECRET=             # >=32 chars. signs integration keys only (45, P3)

PUBLIC_BASE_URL=http://localhost:5173   # what the QR code encodes — see OPEN-002
API_BASE_URL=http://localhost:4000

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=300

K_ANON_THRESHOLD=5          # results hidden below this many responses (52)
LOG_LEVEL=info
```

There is deliberately **no JWT secret for staff** — that auth model was replaced (DEC-014).
`API_KEY_SECRET` is the only remaining token secret and it is P3.

`PUBLIC_BASE_URL` is the single most demo-critical variable. If it says `localhost`, the QR
code does not scan from a phone (`_MEMORY.md` OPEN-002).

## 5. Database, locally

**Postgres 16. Two ways to get one, and they produce an identical database** — same version,
same `endur`/`endur` credentials, same `DATABASE_URL`. Nothing downstream can tell which one
it is talking to.

| | When |
|---|---|
| `scripts/install-postgres.sh` | Linux / WSL. **The path actually in use** (`_MEMORY.md` N-011) |
| `docker compose up -d db` | Anyone who already has Docker. Kept because it is the only one-command path on macOS and Windows |

Compose is **not** the primary path any more, and the file is kept for portability rather
than preference. WSL does not start services at boot: `sudo service postgresql start` after
a restart, or every db command fails with something that reads like a config error.

CI uses neither — GitHub Actions provides its own Postgres service container (§8).

```yaml
services:
  db:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: endur, POSTGRES_PASSWORD: endur, POSTGRES_DB: endur }
    ports: ["5432:5432"]
    volumes: ["endur-db:/var/lib/postgresql/data"]
volumes: { endur-db: }
```

`npm run db:reset` drops, migrates and re-seeds in one command. It must stay reliable — it is
the recovery path during a live demo (`50-SEED-AND-DEMO.md`).

## 6. Lint and format

- **ESLint** flat config, `typescript-eslint` recommended-type-checked.
- **Prettier** for formatting. Existing `back-end/.prettierrc` from v1 is gone; re-create at
  the root with defaults plus `printWidth: 100`.
- Custom lint rules worth the effort, because they enforce invariants a reviewer would
  otherwise have to catch by eye:

| Rule | Enforces |
|---|---|
| `no-restricted-syntax` on banned identifiers `Course|Faculty|Student|Semester` in `apps/`, `packages/` | INV-002 |
| `no-restricted-imports` — nothing outside `db/graph.ts` may import `$queryRaw` | DEC-007 |
| `no-restricted-syntax` — no literal hex colour in `apps/web/src/**` outside `design-system/` | DEC-012 |

## 7. Scripts that enforce invariants

Two node scripts in `/scripts`. Both run in CI and both are cheap.

**`audit-vocab.mjs`** (INV-001) — greps `apps/web/src/pages` and `components` for the banned
domain nouns outside `useLabels()` calls. Complements, does not replace, the manual
nonsense-label walkthrough on 24 Aug.

**`audit-drift.mjs`** (DRIFT-003, DRIFT-004) — two checks:
1. No hex colour, font name, or spacing token appears anywhere in `architecture/`
2. Every `capability:` string in a page doc exists in `packages/shared/src/capabilities.ts`

Check 2 is the useful one: it means the docs and the code cannot silently disagree about
what a capability is called.

## 8. CI

GitHub Actions, one workflow, on push and PR:

```
install → typecheck → lint → audit:drift → test (with a postgres service) → build
```

Kept deliberately short. A slow pipeline gets bypassed, and a bypassed pipeline is worse
than none.

## 9. Git conventions

Branch off `main`; current working branch is `vishv`. Commit prefixes matching existing
history: `feat:`, `fix:`, `code:`, `docs:`.

When a commit changes something architectural, **cite the decision id** in the body:

```
feat: entitlement middleware separate from capability

Implements DEC-011 — 402 vs 403 must be distinguishable, and billing
concerns must not enter the grant table.
```

## 10. What is deliberately not set up

| Not doing | Why |
|---|---|
| Turborepo / Nx | Two apps and one package. Remote caching solves a problem we do not have |
| Docker for the apps | Slows the edit loop. Postgres only |
| A component library (MUI, shadcn) | `design_specs` specifies its own system; a library would fight it and hide the design work being graded |
| GraphQL | REST + shared Zod DTOs already gives typed contracts, with a middleware chain that is legible — which is the point in P1 |
| Storybook | Real value, wrong phase. Revisit in P2 if the component inventory stabilises early |
| Monorepo-wide test runner config | Vitest per workspace is enough |
