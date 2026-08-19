// The "why was this allowed?" wrapper behind doc 42.
//
// **It calls resolve(). It must never re-implement the algorithm.** A simulator that is a
// second implementation is worse than useless: it would show a decision the system did not
// actually make (_MEMORY.md N-005). This file is deliberately three lines long, and that
// is the feature.
import { resolve, type ResolveInput } from './resolve.js';
import type { Decision } from './types.js';

export const simulate = (input: ResolveInput): Promise<Decision> => resolve(input);
