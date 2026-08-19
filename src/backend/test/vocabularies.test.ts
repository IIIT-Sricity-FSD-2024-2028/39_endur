// T-031 — the landing page's pitch must be true.
//
// `PRESET_VOCABULARIES` in packages/shared is what `/` advertises to someone who has no
// organisation and therefore no `useLabels()`. It is a hand-written copy of the real
// preset labels, and a copy drifts. If somebody renames the university preset's `subject`
// and the landing page still promises the old word, the first screen of the product is
// telling a lie about the second — and nothing else in the repo would notice.
//
// This is the check that notices. It lives on the backend side because that is where the
// presets are (src/backend/presets/**, owned by 50), and a frontend test cannot import
// them without crossing the app boundary.
import { describe, expect, it } from 'vitest';
import { PRESET_VOCABULARIES, PITCH_KEYS, LabelKey } from '@endur/shared';
import { presetFor } from '../presets/index.js';

describe('landing vocabularies — 30 § Landing, CONF-011', () => {
  it('advertises exactly the four presets that have a vocabulary worth showing', () => {
    expect(PRESET_VOCABULARIES.map((entry) => entry.key)).toEqual([
      'university',
      'hotel',
      'hospital',
      'company',
    ]);
  });

  it('never advertises Custom — its labels ARE the generic fallbacks, so it shows nothing', () => {
    expect(PRESET_VOCABULARIES.some((entry) => entry.key === 'custom')).toBe(false);
  });

  it.each(PRESET_VOCABULARIES)('$key matches the real preset label for label', (entry) => {
    const preset = presetFor(entry.key);
    for (const key of LabelKey.options) {
      expect(entry.labels[key], `${entry.key}.${key}`).toEqual(preset.labels[key]);
    }
  });

  it('has every one of the four pitch nouns filled in, singular and plural', () => {
    for (const entry of PRESET_VOCABULARIES) {
      for (const key of PITCH_KEYS) {
        expect(entry.labels[key].one.length, `${entry.key}.${key}.one`).toBeGreaterThan(0);
        expect(entry.labels[key].many.length, `${entry.key}.${key}.many`).toBeGreaterThan(0);
      }
    }
  });

  it('gives no two presets the same four-noun row — the pitch is that they differ', () => {
    const rows = PRESET_VOCABULARIES.map((entry) =>
      PITCH_KEYS.map((key) => entry.labels[key].one).join(' · '),
    );
    expect(new Set(rows).size).toBe(rows.length);
  });
});
