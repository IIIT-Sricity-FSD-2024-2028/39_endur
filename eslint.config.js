// Flat config. 03-REPO-AND-TOOLING §6.
// The three custom rule groups here enforce invariants a reviewer would otherwise
// have to catch by eye. Each cites the invariant/decision it protects.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** INV-002 — nothing is education-specific. */
const BANNED_DOMAIN_NOUNS = {
  selector:
    'Identifier[name=/^(Course|Faculty|Student|Semester)s?$/], TSTypeReference > Identifier[name=/^(Course|Faculty|Student|Semester)s?$/]',
  message:
    'INV-002: no education-specific noun as an identifier. Use Unit, Subject, Respondent, Reviewee. Domain words are data (organization.labels), not code.',
};

/** DEC-007 — raw SQL lives in exactly one file. */
const NO_RAW_SQL = {
  selector: "MemberExpression > Identifier[name=/^\\$query(Raw|RawUnsafe)$/]",
  message:
    "DEC-007: $queryRaw is confined to db/graph.ts. Add the query there and export a typed function.",
};

/** 14 §3 — handlers read req.data, never req.body. */
const NO_REQ_BODY = {
  selector: "MemberExpression[object.name='req'][property.name='body']",
  message:
    "14 §3: read req.data (validated) — req.body is unvalidated input and bypasses validate(Dto).",
};

/** DEC-012 — design values live in design_specs, never inline. */
const NO_INLINE_HEX = {
  selector: 'Literal[value=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]',
  message:
    'DEC-012: no literal hex colour outside design-system/. Reference a token from tokens.css.',
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-config/**',
      '**/dist-types/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      'src/backend/storage/**',
      'src/backend/database/migrations/**',
      'design_specs/**',
      'architecture/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // INV-002, everywhere that ships.
  {
    files: ['src/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', BANNED_DOMAIN_NOUNS] },
  },

  // IMPORTANT: flat config REPLACES a rule's options, it does not merge them. Every block
  // that sets `no-restricted-syntax` therefore has to list EVERY selector that should apply
  // to those files. Getting this wrong is silent — the rule stays configured and quietly
  // stops checking what an earlier block checked, which is worse than not having it at all.
  // Found 2026-08-19: DEC-007 had been unenforced inside features/** since T-001, because
  // the req.body block below replaced it.

  // DEC-007 — raw SQL lives in exactly one file.
  {
    files: ['src/backend/**/*.ts'],
    ignores: ['src/backend/db/graph.ts'],
    rules: { 'no-restricted-syntax': ['error', BANNED_DOMAIN_NOUNS, NO_RAW_SQL] },
  },

  // 14 §3 — handlers read req.data, never req.body. Feature files are backend files too,
  // so they carry the raw-SQL selector as well.
  {
    files: ['src/backend/features/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', BANNED_DOMAIN_NOUNS, NO_RAW_SQL, NO_REQ_BODY],
    },
  },

  // DEC-012 — the design system is the only place colour values exist.
  {
    files: ['src/frontend/**/*.{ts,tsx}'],
    ignores: ['src/frontend/design-system/**'],
    rules: { 'no-restricted-syntax': ['error', BANNED_DOMAIN_NOUNS, NO_INLINE_HEX] },
  },

  // Tests assert on supertest's `res.body`, which its types declare as `any`. Typed-lint
  // noise there buys no safety: a wrong assumption about the shape fails the test loudly,
  // which is the entire purpose of the file.
  //
  // DEC-007's $queryRaw confinement is relaxed here for one specific reason: some
  // invariants are about the PHYSICAL table and cannot be checked through the ORM at all.
  // INV-006 is the example — "the responses table has no column that could identify a
  // respondent" is a claim about the columns themselves, and asking Prisma would only ever
  // return the columns Prisma was told about. The rule protects production code from
  // scattering SQL; a test reading information_schema is the opposite of that risk.
  {
    files: ['src/*/test/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      'no-restricted-syntax': ['error', BANNED_DOMAIN_NOUNS],
    },
  },

  // The seed is the one place a preset may name real-world roles — they are data there.
  {
    files: ['src/backend/database/seed/**/*.ts', 'src/backend/presets/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // The audit scripts are plain Node ESM — no TS project, and they use console/process
  // as their entire interface.
  {
    files: ['**/*.{js,mjs,cjs}', 'scripts/**'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: { projectService: false, project: false },
      globals: { console: 'readonly', process: 'readonly' },
    },
    // Spread disableTypeChecked's rules rather than replacing them — the object it
    // provides IS how the typed rules get switched off for these files.
    rules: { ...tseslint.configs.disableTypeChecked.rules, 'no-console': 'off' },
  },
);
