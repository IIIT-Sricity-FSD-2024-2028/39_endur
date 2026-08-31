// T-033 — the delete sentence. 32 § Interactions, 24 §6.
//
// This is the copy rule the type system cannot enforce: "never Are you sure?, always the
// real numbers". The sentence is a pure function precisely so it can be checked here
// rather than by reading a dialog on stage.
import { describe, expect, it } from 'vitest';
import { resolveLabels, type UnitImpact } from '@endur/shared';
import { checkingConsequence, deleteConsequence, unknownConsequence } from './consequence.js';

const labels = resolveLabels({
  unit: { one: 'Zblorn', many: 'Zblorns' },
  subject: { one: 'Quaxel', many: 'Quaxels' },
});

const impact = (over: Partial<UnitImpact> = {}): UnitImpact => ({
  unitId: 'u2',
  unitName: 'Computer Science',
  descendantCount: 0,
  peopleAffected: 0,
  subjectsAffected: 0,
  campaignsAffected: 0,
  gained: [],
  lost: [],
  ...over,
});

describe('deleteConsequence — real numbers, never "are you sure?"', () => {
  it('names what moves and where, for a unit with children', () => {
    const text = deleteConsequence({
      name: 'Computer Science',
      impact: impact({ descendantCount: 3, peopleAffected: 64, subjectsAffected: 12 }),
      parentName: 'School of Engineering',
      own: { people: 0, subjects: 0 },
      labels,
    });

    expect(text).toBe(
      'Deleting Computer Science moves 3 Zblorns, 64 people and 12 Quaxels into School of Engineering.',
    );
  });

  it('separates what MOVES from what ENDS — positions held directly here do not travel', () => {
    // The database cascades positions anchored at the deleted unit and reassigns the
    // children; stating one number for both would be wrong in whichever direction the
    // reader cared about.
    const text = deleteConsequence({
      name: 'Computer Science',
      impact: impact({ descendantCount: 2, peopleAffected: 64, subjectsAffected: 12 }),
      parentName: 'School of Engineering',
      own: { people: 4, subjects: 1 },
      labels,
    });

    expect(text).toContain('moves 2 Zblorns, 60 people and 11 Quaxels into School of Engineering');
    expect(text).toContain('Its own 4 positions end and 1 Quaxel is left without a zblorn');
  });

  it('describes a leaf in terms of what it destroys, not what it moves', () => {
    const text = deleteConsequence({
      name: 'Physics',
      impact: impact({ peopleAffected: 3, subjectsAffected: 2 }),
      parentName: 'School of Science',
      own: { people: 3, subjects: 2 },
      labels,
    });

    expect(text).toBe('Deleting Physics ends 3 positions in it and leaves 2 Quaxels without a zblorn.');
  });

  it('says plainly when nothing else changes', () => {
    const text = deleteConsequence({
      name: 'Physics',
      impact: impact(),
      parentName: 'School of Science',
      own: { people: 0, subjects: 0 },
      labels,
    });

    expect(text).toBe('Deleting Physics removes an empty zblorn. Nothing else changes.');
  });

  it('uses the organisation vocabulary, never a hardcoded noun (INV-001)', () => {
    const text = deleteConsequence({
      name: 'Physics',
      impact: impact({ subjectsAffected: 1 }),
      parentName: null,
      own: { people: 0, subjects: 1 },
      labels,
    });

    expect(text).toContain('Quaxel');
    expect(text).not.toMatch(/course|department|subject|unit/i);
  });

  it('counts one thing in the singular', () => {
    const text = deleteConsequence({
      name: 'Physics',
      impact: impact({ peopleAffected: 1 }),
      parentName: null,
      own: { people: 1, subjects: 0 },
      labels,
    });

    expect(text).toBe('Deleting Physics ends 1 position in it.');
  });
});

describe('the two states where the numbers are not known', () => {
  it('says it is still checking', () => {
    expect(checkingConsequence('Physics')).toBe('Checking what deleting Physics affects…');
  });

  it('says nothing has changed when the impact call failed', () => {
    expect(unknownConsequence('Physics')).toContain('Nothing has changed');
  });
});
