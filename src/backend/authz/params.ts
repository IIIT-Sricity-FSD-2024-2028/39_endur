// Combines the numeric limits (params) carried by grants, so one capability can be stronger at a higher level.
import type { CandidateGrant } from './types.js';

export type ParamMode = 'union' | 'highest';

// Merges the params of every allow that survived the check into one set of limits.
export function combineParams(
  allows: CandidateGrant[],
  mode: ParamMode = 'union',
): Record<string, number> | undefined {
  const withParams = allows.filter((grant) => Object.keys(grant.params).length > 0);
  if (withParams.length === 0) return undefined;

  if (mode === 'highest') {
    // 'highest' mode: take the params of the most senior assignment only.
    const best = withParams.reduce((a, b) => ((a.level ?? 99) <= (b.level ?? 99) ? a : b));
    return { ...best.params };
  }

  // 'union' mode: for each limit, the strongest value the person holds anywhere wins.
  const out: Record<string, number> = {};
  for (const grant of withParams) {
    for (const [key, value] of Object.entries(grant.params)) {
      const current = out[key];
      out[key] = current === undefined ? value : Math.max(current, value);
    }
  }
  return out;
}
