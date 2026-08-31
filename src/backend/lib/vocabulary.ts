// The server's half of the vocabulary system: even API messages use the organisation's own words.
// A hotel that calls its units Properties should never be told "that unit does not exist".
import type { Request } from 'express';
import { DEFAULT_LABELS, type Label, type ResolvedLabels } from '@endur/shared';

// The tenant's nouns for a message. Falls back to the defaults on routes with no organisation, such as login.
export const nounsOf = (req: Request): ResolvedLabels => req.ctx.labels ?? DEFAULT_LABELS;

// Count and noun agreeing: "3 Properties", "1 Property". Takes the label, because not every plural just adds an s.
export const counted = (count: number, label: Label): string =>
  `${count} ${count === 1 ? label.one : label.many}`;
