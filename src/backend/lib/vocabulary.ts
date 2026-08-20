// The server's half of the vocabulary system. 22 §6, INV-001.
//
// THE SERVER PRODUCES USER-FACING STRINGS TOO, and until T-044 none of them except the CSV
// header knew it. `That unit does not exist.` is rendered verbatim by ten console pages —
// they read `error.message` straight out of the envelope — so a hotel whose org calls them
// Properties was told about a "unit" by the API. 22 §6 named all three kinds (validation
// messages, confirmation text, export headers) and `_MEMORY.md` N-044 flagged that only
// one had ever been audited.
//
// `audit:vocab` cannot see any of this: it scans the frontend, because that is where
// components render. Its backend pass (T-044) is what keeps this file honest.
import type { Request } from 'express';
import { DEFAULT_LABELS, type Label, type ResolvedLabels } from '@endur/shared';

/**
 * The tenant's nouns, for a message builder.
 *
 * `tenantResolver` put them on `req.ctx` in the same query it already ran for
 * `authzVersion`, so this costs nothing at the call site. The fallback is not defensive
 * padding — the tenantless routes (login, register, the respondent surface) genuinely have
 * no org resolved, and a message builder must never render `undefined` at somebody.
 */
export const nounsOf = (req: Request): ResolvedLabels => req.ctx.labels ?? DEFAULT_LABELS;

/**
 * `3 Properties`, `1 Property` — the count and its noun, agreeing.
 *
 * Takes a `Label` rather than two strings on purpose. 22 §5 lists "pluralisation done by
 * appending s" among the things the mechanical audit cannot see, and `Faculty` pluralises
 * to `Faculty`: a signature that cannot be handed a derived plural cannot produce one.
 */
export const counted = (count: number, label: Label): string =>
  `${count} ${count === 1 ? label.one : label.many}`;
