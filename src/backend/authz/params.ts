// Step 6 — combining params across several surviving allows.
//
// This is what lets ONE capability carry different strength at different levels — a
// supervisor approving up to 5,000 and a department head up to 25,000 — instead of
// inventing five artificial roles to encode limits (11 §3).
import type { CandidateGrant } from './types.js';

export type ParamMode = 'union' | 'highest';

export function combineParams(
  allows: CandidateGrant[],
  mode: ParamMode = 'union',
): Record<string, number> | undefined {
  const withParams = allows.filter((grant) => Object.keys(grant.params).length > 0);
  if (withParams.length === 0) return undefined;

  if (mode === 'highest') {
    // Params from the most senior assignment only. Lower level number = more senior.
    const best = withParams.reduce((a, b) => ((a.level ?? 99) <= (b.level ?? 99) ? a : b));
    return { ...best.params };
  }

  // union: the strongest value the person holds anywhere wins.
  const out: Record<string, number> = {};
  for (const grant of withParams) {
    for (const [key, value] of Object.entries(grant.params)) {
      const current = out[key];
      out[key] = current === undefined ? value : Math.max(current, value);
    }
  }
  return out;
}
