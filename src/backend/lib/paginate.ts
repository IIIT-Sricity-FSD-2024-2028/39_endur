// Cursor pagination. 13 §4.
//
// Not offset pagination. Offset on a growing table returns duplicate rows and skips
// others while someone else is inserting — and a live campaign inserts into `responses`
// by definition, so the one list most likely to be watched during a demo is the one
// offset would get wrong.
//
// The cursor encodes the sort key of the last row returned, so the next page asks for
// "everything after this exact row" rather than "skip 50". Rows inserted meanwhile shift
// nothing.
import { AppError } from './errors.js';

/** What every cursor-paginated list returns. `meta.total` is scope-filtered (INV-003). */
export type Paged<T> = {
  data: T[];
  page: { nextCursor: string | null; hasMore: boolean };
  meta: { total: number };
};

export type CursorPoint = { createdAt: Date; id: string };

export function encodeCursor(point: CursorPoint): string {
  return Buffer.from(
    JSON.stringify({ t: point.createdAt.toISOString(), i: point.id }),
    'utf8',
  ).toString('base64url');
}

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
    // A cursor is opaque to the client, so a malformed one is a bug or a probe, never a
    // typo. 400 rather than a silent reset to page one: silently restarting a paginated
    // export would drop rows without anyone noticing.
    throw new AppError('BAD_REQUEST', 'That page cursor is not valid.');
  }
}

/**
 * The `where` fragment for "strictly after this point", with `id` as the tiebreak so rows
 * created in the same millisecond still have a total order. Without the tiebreak a page
 * boundary landing inside a batch insert repeats or drops rows.
 */
export const afterCursor = (cursor: string | undefined) => {
  if (!cursor) return {};
  const { createdAt, id } = decodeCursor(cursor);
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
};

/** Newest first, everywhere. The tiebreak has to be part of the sort, not just the filter. */
export const CURSOR_ORDER = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

/**
 * Most tables sort by `created_at`. `responses` sorts by `submitted_at` — it has no
 * created_at, because for a response those would be the same instant and a second column
 * would be a second thing to get wrong (10 §4.4).
 */
export const afterCursorOn = (field: 'createdAt' | 'submittedAt', cursor: string | undefined) => {
  if (!cursor) return {};
  const { createdAt, id } = decodeCursor(cursor);
  return { OR: [{ [field]: { lt: createdAt } }, { [field]: createdAt, id: { lt: id } }] };
};

export const orderOn = (field: 'createdAt' | 'submittedAt') =>
  [{ [field]: 'desc' as const }, { id: 'desc' as const }];

/**
 * Call the query with `limit + 1` rows and hand the result here: the extra row is how
 * `hasMore` is known without a second count query.
 *
 * The cursor is taken from the DATABASE row, before any mapping — a response shape usually
 * carries `createdAt` as an ISO string, and building a cursor from that would round-trip
 * the timestamp through two conversions for no reason.
 */
export function pageOf<Row extends { id: string }, Out = Row>(
  rows: Row[],
  limit: number,
  total: number,
  map: (row: Row) => Out = (row) => row as unknown as Out,
  // Which timestamp forms the cursor. Defaults to createdAt, which every table but
  // `responses` has.
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
