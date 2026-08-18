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

  // DEC-007 — raw SQL lives in exactly one file.
  {
    files: ['src/backend/**/*.ts'],
    ignores: ['src/backend/db/graph.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        BANNED_DOMAIN_NOUNS,
        {
          selector: "MemberExpression > Identifier[name=/^\\$query(Raw|RawUnsafe)$/]",
          message:
            'DEC-007: $queryRaw is confined to db/graph.ts. Add the query there and export a typed function.',
        },
      ],
    },
  },

  // 14 §3 — handlers read req.data, never req.body.
  {
    files: ['src/backend/features/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        BANNED_DOMAIN_NOUNS,
        {
          selector: "MemberExpression[object.name='req'][property.name='body']",
          message:
            '14 §3: read req.data (validated) — req.body is unvalidated input and bypasses validate(Dto).',
        },
      ],
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
  {
    files: ['src/*/test/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
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
