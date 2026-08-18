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

export type Page<T> = {
  items: T[];
  page: { nextCursor: string | null; hasMore: boolean };
};

/** Free-text search box. Bounded like every string — an unbounded string is an unbounded row. */
export const SearchQuery = z.object({ q: z.string().max(120).optional() });

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
