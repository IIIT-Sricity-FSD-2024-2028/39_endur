// Every endpoint name is injected into an API ONCE. Two files injecting the same name into
// `api` do not fail loudly: the first one injected wins, silently, so which definition a
// page gets depends on which chunk loaded first. That is how the console's "Cancel" on a
// booking came to call the public picker's route (`cancelOwnBooking` now), which no unit
// test saw because each loads only one of the two files.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = path.resolve(import.meta.dirname, 'endpoints');
const DECLARED = /^ {4}([A-Za-z]+): build\.(?:query|mutation|infiniteQuery)</gm;

describe('injected endpoints', () => {
  it('never declares one name twice for the same API', () => {
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const file of readdirSync(DIR).filter((name) => name.endsWith('.ts') && !name.includes('.test.'))) {
      const source = readFileSync(path.join(DIR, file), 'utf8');
      const target = source.includes('opsApi.injectEndpoints') ? 'opsApi' : 'api';
      for (const [, name] of source.matchAll(DECLARED)) {
        const key = `${target}.${name}`;
        const first = seen.get(key);
        if (first) twice.push(`${key} in ${first} and ${file}`);
        else seen.set(key, file);
      }
    }
    expect(twice).toEqual([]);
    // The scan found something to check: a broken pattern must not pass by finding nothing.
    expect(seen.size).toBeGreaterThan(50);
  });
});
