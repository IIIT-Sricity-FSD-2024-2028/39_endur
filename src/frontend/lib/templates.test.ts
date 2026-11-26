// The pure piece of lib/templates. The hooks are exercised through the pages that use them.
// (The clone key moved into the copy thunk, store/screens/templates.ts, and is tested with
// it in templates.hooks.test.tsx.)
import { describe, expect, it } from 'vitest';
import { librarySearch } from './templates.js';

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
