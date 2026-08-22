// D-004 — a test for the thing that protects the tests.
//
// The resolver decides which database 201 integration tests are allowed to truncate, so it
// is the one piece of test infrastructure that deserves tests of its own. Both rules are
// asserted by their FAILURE, because a guard that never refuses anything is not a guard.
//
// These call `resolveTestUrl` rather than `testDatabaseUrl`, so they test the rules instead
// of whatever happens to be in the developer's `.env`.
import { describe, expect, it } from 'vitest';
import { nameOf, resolveTestUrl, testDatabaseUrl } from './database.js';

const DEV = 'postgresql://endur:endur@localhost:5432/endur';

describe('the test database resolver', () => {
  it('derives a `_test` sibling when nothing is configured', () => {
    expect(nameOf(resolveTestUrl(DEV))).toBe('endur_test');
  });

  it('prefers an explicit TEST_DATABASE_URL', () => {
    const url = resolveTestUrl(DEV, 'postgresql://endur:endur@localhost:5432/somewhere_test');
    expect(nameOf(url)).toBe('somewhere_test');
  });

  it('keeps the host, port and credentials — only the database name changes', () => {
    const url = new URL(resolveTestUrl('postgresql://someone:secret@db.internal:6543/appdb'));
    expect(url.host).toBe('db.internal:6543');
    expect(url.username).toBe('someone');
    expect(url.pathname).toBe('/appdb_test');
  });

  // Rule 1. This is the one that stops a typo from truncating `endur` an hour before a demo.
  it('refuses a database whose name does not end in `_test`', () => {
    expect(() => resolveTestUrl(DEV, DEV)).toThrow(/does not end in "_test"/);
  });

  it('refuses a production-looking name just as firmly', () => {
    expect(() => resolveTestUrl(DEV, 'postgresql://u:p@db.example.com:5432/endur_production'))
      .toThrow(/does not end in "_test"/);
  });

  // Rule 2. Passes rule 1 — the name ends in `_test` — and is still the developer's own
  // database, which is the case a name check alone cannot see.
  it('refuses a `_test` name that is nonetheless the database in .env', () => {
    const theirs = 'postgresql://endur:endur@localhost:5432/scratch_test';
    expect(() => resolveTestUrl(DEV, theirs, theirs))
      .toThrow(/same as the DATABASE_URL in \.env/);
  });

  // globalSetup points the process at the test database, so by the second call DATABASE_URL
  // legitimately IS the test URL. A guard comparing against it would fire for the exact
  // reason everything was correct — which is why rule 2 reads the file instead.
  it('is stable when called again after the process has been switched', () => {
    const first = resolveTestUrl(DEV, undefined, DEV);
    expect(resolveTestUrl(first, undefined, DEV)).toBe(first);
  });

  it('resolves for real, from this repo’s own environment', () => {
    expect(nameOf(testDatabaseUrl())).toMatch(/_test$/);
  });
});
