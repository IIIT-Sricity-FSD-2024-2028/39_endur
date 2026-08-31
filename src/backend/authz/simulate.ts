// The "why was this allowed?" simulator. It only calls resolve(), so it can never show a decision the system would not make.
import { resolve, type ResolveInput } from './resolve.js';
import type { Decision } from './types.js';

export const simulate = (input: ResolveInput): Promise<Decision> => resolve(input);
