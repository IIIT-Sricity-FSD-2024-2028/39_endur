// The two pure pieces of lib/templates. The hooks are exercised through the pages that
// use them; these two are not, and they are the ones with a rule in them.
import { describe, expect, it } from 'vitest';
import { cloneKey, librarySearch } from './templates.js';

describe('librarySearch', () => {
  it('sends nothing when nothing is asked for', () => {
    expect(librarySearch({})).toBe('');
    expect(librarySearch({ industry: undefined, category: undefined })).toBe('');
  });

  it('sends only what was asked for, so a blank filter is not a filter', () => {
    expect(librarySearch({ industry: 'hotel' })).toBe('?industry=hotel');
    expect(librarySearch({ industry: 'hotel', category: 'Stay' })).toBe('?industry=hotel&category=Stay');
  });

  it('encodes, because a category is free text the customer typed', () => {
    expect(librarySearch({ category: 'Front of house' })).toBe('?category=Front+of+house');
  });
});

describe('cloneKey', () => {
  it('carries the template it belongs to, so a stray key cannot replay another clone', () => {
    expect(cloneKey('abc')).toMatch(/^clone:abc:/);
  });

  it('differs per attempt — two presses are two clones, one retry is one', () => {
    // The key exists for the RETRY case: a phone whose response never arrived sends the
    // same request again and must get the first response back (13 §7). Two deliberate
    // clones of the same template are two different attempts and must not collapse.
    expect(cloneKey('abc')).not.toBe(cloneKey('abc'));
  });

  it('still produces one without crypto.randomUUID — the demo may not be a secure context', () => {
    const original = globalThis.crypto;
    // `randomUUID` needs https or localhost, and the demo may well run over plain http
    // from a phone on the venue wifi. The key only has to be unique among this browser's
    // own in-flight requests, so a fallback is correct rather than a compromise.
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try {
      expect(cloneKey('abc')).toMatch(/^clone:abc:.+/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});
