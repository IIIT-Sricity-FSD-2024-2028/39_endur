// The vocabulary system's data contract. Authoritative: architecture/22.
// INV-001 — no user-facing domain noun is written in a component; every one resolves
// through these labels. Switching organisation re-skins the whole UI with no code change.
//
// Singular and plural are BOTH stored because English plurals are not mechanical:
// "Faculty" pluralises to "Faculty", and deriving it would be wrong exactly where a
// university is watching.
import { z } from 'zod';

export const LabelKey = z.enum(['unit', 'subject', 'respondent', 'reviewee', 'campaign']);
export type LabelKey = z.infer<typeof LabelKey>;

export const Label = z.object({
  one: z.string().min(1).max(40),
  many: z.string().min(1).max(40),
});
export type Label = z.infer<typeof Label>;

/** What is stored in organizations.labels (10 §3). Partial — a missing key falls back. */
export const LabelSet = z.record(LabelKey, Label);
export type LabelSet = z.infer<typeof LabelSet>;

/** What a component actually consumes: every key present, so no render can hit undefined. */
export type ResolvedLabels = Record<LabelKey, Label>;

/**
 * The Custom preset. Also the fallback for every key, so a missing label renders a
 * generic word — never `undefined`, never a crash (22 §3).
 */
export const DEFAULT_LABELS: ResolvedLabels = {
  unit: { one: 'Unit', many: 'Units' },
  subject: { one: 'Subject', many: 'Subjects' },
  respondent: { one: 'Respondent', many: 'Respondents' },
  reviewee: { one: 'Reviewee', many: 'Reviewees' },
  campaign: { one: 'Campaign', many: 'Campaigns' },
};

/**
 * Merge per key, not per set. An org that has renamed only `subject` still gets sensible
 * words for the other four; falling back to the whole default set would silently discard
 * the renames it does have.
 */
export function resolveLabels(stored: LabelSet | null | undefined): ResolvedLabels {
  if (!stored) return DEFAULT_LABELS;
  const out = { ...DEFAULT_LABELS };
  for (const key of LabelKey.options) {
    const label = stored[key];
    if (label) out[key] = label;
  }
  return out;
}
