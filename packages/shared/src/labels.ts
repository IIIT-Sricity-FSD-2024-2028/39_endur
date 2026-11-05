// The vocabulary system's data contract. Authoritative: architecture/22.
// INV-001 — no user-facing domain noun is written in a component; every one resolves
// through these labels. Switching organisation re-skins the whole UI with no code change.
//
// Singular and plural are BOTH stored because English plurals are not mechanical:
// "Faculty" pluralises to "Faculty", and deriving it would be wrong exactly where a
// university is watching.
import { z } from 'zod';
import { LABEL_KEYS } from './label-defaults.js';

// The plain values live in `label-defaults.ts` so the console's entry chunk can use them
// without zod; they are re-exported here, so every import of them is unchanged.
export { LABEL_KEYS, DEFAULT_LABELS, resolveLabels, type ResolvedLabels } from './label-defaults.js';

export const LabelKey = z.enum(LABEL_KEYS);
export type LabelKey = z.infer<typeof LabelKey>;

export const Label = z.object({
  one: z.string().min(1).max(40),
  many: z.string().min(1).max(40),
});
export type Label = z.infer<typeof Label>;

/** What is stored in organizations.labels (10 §3). Partial — a missing key falls back. */
export const LabelSet = z.record(LabelKey, Label);
export type LabelSet = z.infer<typeof LabelSet>;
