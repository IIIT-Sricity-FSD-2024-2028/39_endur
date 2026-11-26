// The vocabulary's plain values, with no zod. Re-exported unchanged by `labels.ts`, so
// nothing imports this file by name.
//
// Split out of `labels.ts` for the console's entry chunk, which is also the first thing a
// respondent's phone downloads: the store needs `DEFAULT_LABELS` and `resolveLabels` at
// boot, and when they lived beside the zod schemas they brought all of zod (~13 kB gzipped)
// into every route. The schemas stay in `labels.ts`, built from the key list below.

/** The five label keys. `LabelKey.options` (labels.ts) is the same list, through zod. */
export const LABEL_KEYS = ['unit', 'subject', 'respondent', 'reviewee', 'campaign'] as const;

type Key = (typeof LABEL_KEYS)[number];
type Words = { one: string; many: string };

/** What a component actually consumes: every key present, so no render can hit undefined. */
export type ResolvedLabels = Record<Key, Words>;

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
export function resolveLabels(stored: Partial<Record<Key, Words>> | null | undefined): ResolvedLabels {
  if (!stored) return DEFAULT_LABELS;
  const out = { ...DEFAULT_LABELS };
  for (const key of LABEL_KEYS) {
    const label = stored[key];
    if (label) out[key] = label;
  }
  return out;
}
