// Primitives reused by every other DTO file. 14 §2.
import { z } from 'zod';

/** Every id in the system is a UUID (10 §2). */
export const Id = z.string().uuid();
export type Id = z.infer<typeof Id>;

/**
 * Cursor pagination, not offset. Offset pagination on a growing table returns duplicate
 * rows and skips others while someone else is inserting — which is exactly what a live
 * campaign does to the responses table (13 §4).
 */
export const Cursor = z.string().min(1).max(512);

export const PageQuery = z.object({
  cursor: Cursor.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type PageQuery = z.infer<typeof PageQuery>;

/**
 * The paginated envelope, exactly as `13` §4 specifies it.
 *
 * This type said `{ items }` from T-003 until T-034 found it, because NOTHING consumed it:
 * the backend had its own `Paged<T>` in lib/paginate.ts and every list handler used that.
 * The first caller to trust it — T-033's people list in the structure detail panel — read
 * `.items` off a response that has `.data`, and its tests passed because the mock repeated
 * the same wrong shape. A shared type nobody imports is not a contract, it is a guess.
 *
 * `src/backend/lib/paginate.ts` now aliases this, so the two cannot drift again.
 */
export type Page<T> = {
  data: T[];
  page: { nextCursor: string | null; hasMore: boolean };
  /** Scope-filtered: it counts what the caller may see, not what exists (INV-003). */
  meta: { total: number };
};

/** Free-text search box. Bounded like every string — an unbounded string is an unbounded row. */
export const SearchQuery = z.object({ q: z.string().max(120).optional() });

/**
 * A NAME SOMEBODY TYPED — a person, a unit, a role, an organisation, a subject.
 *
 * ONE DEFINITION, BECAUSE `min(1).max(n)` WAS WRITTEN OUT TWENTY-ODD TIMES AND EVERY COPY
 * ACCEPTED `"12345"` AND `"   "`. Three rules, and each is here because the field was
 * reachable without it:
 *
 *   · TRIMMED FIRST, so `"   "` becomes `""` and fails `min(1)`. Without the trim a name of
 *     three spaces was a valid name, and it rendered as a blank row nobody could find again.
 *     The trim also normalises what is STORED — a trailing space on a role name is a role
 *     that never matches the one the CSV importer is looking for.
 *   · AT LEAST ONE LETTER. `"12345"` is not a name, and the owner met this by typing digits
 *     into every field on the sign-up form and being allowed all the way to a payment screen.
 *     The test is `\p{L}` with the `u` flag, so it is every ALPHABET rather than `[A-Za-z]`:
 *     देवनागरी, தமிழ், 中文 and Кириллица are names, and a product that is generic across
 *     organisation types (INV-002) has no business being English-only about them.
 *   · A LENGTH THE CALLER CHOOSES, because the columns differ — a person is 120, a unit 80,
 *     a role 60 — and the number belongs beside the column it protects.
 *
 * IT IS NOT A CHARACTER ALLOWLIST. `O'Brien`, `Ram-Kumar`, `Nguyễn`, `Dr. X (visiting)` and
 * `3M` are all names; a rule that admitted only letters and spaces would reject more real
 * people than it protected. The bar is "contains something a human would read as a word".
 */
export const nameField = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'This cannot be empty.')
    .max(max, `Keep this to ${max} characters or fewer.`)
    .refine((value) => /\p{L}/u.test(value), 'Use a real name — it needs at least one letter.');

/**
 * Free text somebody typed into a box: a note, a description, a message body.
 *
 * NO LETTER RULE, deliberately. A note reading `+91 98765 43210` is a useful note, and the
 * argument that makes `nameField` right — a name is a word — says nothing about a field whose
 * whole purpose is that the writer decides what goes in it. What it still gets is the TRIM and
 * the BOUND, because an unbounded string is an unbounded row.
 */
export const textField = (max: number) => z.string().trim().max(max);

export const IdParam = z.object({ id: Id });

/**
 * Composes body / query / params into one schema, so a single DTO describes a whole
 * request and `validate()` has exactly one thing to parse (12 §4.9, 14 §3).
 */
export const dto = <B, Q, P>(parts: {
  body?: z.ZodType<B>;
  query?: z.ZodType<Q>;
  params?: z.ZodType<P>;
}) =>
  z.object({
    body: parts.body ?? z.object({}).optional(),
    query: parts.query ?? z.object({}).optional(),
    params: parts.params ?? z.object({}).optional(),
  });

export type { LabelSet, ResolvedLabels } from '../labels.js';
