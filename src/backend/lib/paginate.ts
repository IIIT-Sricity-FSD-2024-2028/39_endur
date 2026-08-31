// Cursor pagination: each page asks for "everything after this exact row" instead of "skip 50".
// Offset paging would duplicate or skip rows while new ones are being inserted, which a live campaign does constantly.
import type { Page } from '@endur/shared';
import { AppError } from './errors.js';

// What every paginated list returns. meta.total is already filtered to what the caller may see.
export type Paged<T> = Page<T>;

export type CursorPoint = { createdAt: Date; id: string };

// Packs a row's sort key into an opaque cursor string.
export function encodeCursor(point: CursorPoint): string {
  return Buffer.from(
    JSON.stringify({ t: point.createdAt.toISOString(), i: point.id }),
    'utf8',
  ).toString('base64url');
}

// Unpacks a cursor back into a sort key, or fails with 400.
export function decodeCursor(cursor: string): CursorPoint {
  try {
    const raw: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof raw !== 'object' || raw === null) throw new Error('not an object');
    const { t, i } = raw as { t?: unknown; i?: unknown };
    if (typeof t !== 'string' || typeof i !== 'string') throw new Error('wrong shape');
    const createdAt = new Date(t);
    if (Number.isNaN(createdAt.getTime())) throw new Error('bad date');
    return { createdAt, id: i };
  } catch {
    // A cursor is opaque to the client, so a broken one is a bug or a probe: fail with 400 rather than silently restarting.
    throw new AppError('BAD_REQUEST', 'That page cursor is not valid.');
  }
}

// The "strictly after this point" filter, with id as a tiebreak so rows made in the same millisecond still have an order.
export const afterCursor = (cursor: string | undefined) => {
  if (!cursor) return {};
  const { createdAt, id } = decodeCursor(cursor);
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
};

// Newest first, everywhere. The tiebreak has to be in the sort as well as the filter.
export const CURSOR_ORDER = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

// Same thing for tables that sort by another column: responses use submitted_at, not created_at.
export const afterCursorOn = (field: 'createdAt' | 'submittedAt', cursor: string | undefined) => {
  if (!cursor) return {};
  const { createdAt, id } = decodeCursor(cursor);
  return { OR: [{ [field]: { lt: createdAt } }, { [field]: createdAt, id: { lt: id } }] };
};

// The sort order for a table that uses another timestamp column.
export const orderOn = (field: 'createdAt' | 'submittedAt') =>
  [{ [field]: 'desc' as const }, { id: 'desc' as const }];

// Turns rows into a page. Ask the query for limit + 1 rows: the extra one is how hasMore is known
// without a second query. The cursor is built from the database row, before any mapping.
export function pageOf<Row extends { id: string }, Out = Row>(
  rows: Row[],
  limit: number,
  total: number,
  map: (row: Row) => Out = (row) => row as unknown as Out,
  // Which timestamp forms the cursor. Defaults to createdAt, which every table but responses has.
  point: (row: Row) => CursorPoint = (row) => row as unknown as CursorPoint,
): Paged<Out> {
  const hasMore = rows.length > limit;
  const kept = hasMore ? rows.slice(0, limit) : rows;
  const last = kept.at(-1);
  return {
    data: kept.map(map),
    page: { nextCursor: hasMore && last ? encodeCursor(point(last)) : null, hasMore },
    meta: { total },
  };
}
