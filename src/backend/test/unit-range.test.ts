// The range grammar: "Floor 1..8" creates eight sibling units in one request.
// The interesting half is that a huge range must be refused. The grammar lives in the shared package
// because both sides read it - the client to preview it, the server to expand it and enforce the cap.
import { describe, expect, it } from 'vitest';
import {
  CreateUnitBody,
  MAX_REPEAT,
  expandUnitNames,
  parseUnitRange,
  repeatCount,
} from '@endur/shared';

describe('parseUnitRange — 32 § Range syntax', () => {
  it('reads a numeric range', () => {
    expect(parseUnitRange('Floor 1..8')).toEqual({
      name: 'Floor',
      repeat: { from: 1, to: 8, letters: false },
    });
  });

  it('reads a letter range', () => {
    expect(parseUnitRange('Wing A..F')).toEqual({
      name: 'Wing',
      repeat: { from: 0, to: 5, letters: true },
    });
  });

  it('accepts lowercase letters and normalises them', () => {
    expect(parseUnitRange('Block a..c').repeat).toEqual({ from: 0, to: 2, letters: true });
  });

  it('leaves an ordinary name alone', () => {
    expect(parseUnitRange('School of Engineering')).toEqual({ name: 'School of Engineering' });
  });

  it('leaves a name that merely contains dots alone', () => {
    expect(parseUnitRange('Wing 3.2')).toEqual({ name: 'Wing 3.2' });
  });

  it('refuses to treat a bare range as a name — there would be nothing to call them', () => {
    // A range with no stem parses as a plain name rather than eight unnamed units.
    expect(parseUnitRange('1..8')).toEqual({ name: '1..8' });
  });

  it('parses an over-cap range rather than rejecting it, so the client can say the number', () => {
    const parsed = parseUnitRange('Floor 1..10000');
    expect(parsed.repeat).toEqual({ from: 1, to: 10000, letters: false });
    expect(repeatCount(parsed.repeat!)).toBe(10000);
  });
});

describe('expandUnitNames — one definition, both sides', () => {
  it('expands a numeric range in order', () => {
    expect(expandUnitNames('Floor', { from: 1, to: 4, letters: false })).toEqual([
      'Floor 1', 'Floor 2', 'Floor 3', 'Floor 4',
    ]);
  });

  it('expands a letter range', () => {
    expect(expandUnitNames('Wing', { from: 0, to: 3, letters: true })).toEqual([
      'Wing A', 'Wing B', 'Wing C', 'Wing D',
    ]);
  });

  it('is the identity for a plain name', () => {
    expect(expandUnitNames('Emergency')).toEqual(['Emergency']);
  });

  it('round-trips what parse produced', () => {
    const { name, repeat } = parseUnitRange('Ward 2..4');
    expect(expandUnitNames(name, repeat)).toEqual(['Ward 2', 'Ward 3', 'Ward 4']);
  });
});

describe('the cap is in the schema, not in a handler', () => {
  it('accepts a range at the cap', () => {
    const parsed = CreateUnitBody.safeParse({
      name: 'Floor', parentId: null, repeat: { from: 1, to: MAX_REPEAT },
    });
    expect(parsed.success).toBe(true);
  });

  it('refuses one past it', () => {
    const parsed = CreateUnitBody.safeParse({
      name: 'Floor', parentId: null, repeat: { from: 1, to: MAX_REPEAT + 1 },
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses a letter range past Z', () => {
    const parsed = CreateUnitBody.safeParse({
      name: 'Wing', parentId: null, repeat: { from: 0, to: 26, letters: true },
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses a backwards range', () => {
    const parsed = CreateUnitBody.safeParse({
      name: 'Floor', parentId: null, repeat: { from: 8, to: 1 },
    });
    expect(parsed.success).toBe(false);
  });
});
