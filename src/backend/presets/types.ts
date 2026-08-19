// Industry presets. Authoritative table: 50 §1.
//
// A preset is DATA, not code. Adding a sixth must never require a migration (01 §7), which
// is why this file describes a shape and holds no behaviour.
//
// What a preset buys: a from-scratch wizard takes ten minutes on stage, and silence kills
// a demo. Presets pre-fill roles, structure, vocabulary and starter forms — all still
// editable — so live creation is ~90 seconds AND customisability is still demonstrated,
// because the preset is edited in front of the audience.
import type { Industry, LabelSet } from '@endur/shared';
import type { QuestionInput } from '@endur/shared';

/**
 * Flat, with client-side ids, exactly like SetupUnit — the wizard hands this shape
 * straight back to POST /org/setup, so a preset is a pre-filled request rather than a
 * second format that needs converting.
 */
export type UnitSeed = {
  tempId: string;
  name: string;
  parentTempId: string | null;
};

export type TemplateSeed = {
  name: string;
  category: string;
  description?: string;
  /** Never more than 10. Short forms are the product thesis, and a seed test enforces it (01 §5). */
  questions: QuestionInput[];
};

export type Preset = {
  key: Industry;
  displayName: string;
  /** ORDER IS THE LEVEL. Index 0 is level 1, the most senior. Never a stored number here. */
  roles: Array<{ name: string }>;
  units: UnitSeed[];
  labels: LabelSet;
  templates: TemplateSeed[];
};

/** Shorthands, so the preset files read as data and not as ceremony. */
export const rating = (
  text: string,
  lowLabel: string,
  highLabel: string,
  required = false,
): QuestionInput => ({
  kind: 'rating',
  text,
  config: { kind: 'rating', max: 5, lowLabel, highLabel },
  required,
});

export const nps = (text: string): QuestionInput => ({
  kind: 'nps',
  text,
  config: { kind: 'nps' },
  required: false,
});

export const yesno = (text: string): QuestionInput => ({
  kind: 'yesno',
  text,
  config: { kind: 'yesno' },
  required: false,
});

export const text_ = (text: string, placeholder?: string): QuestionInput => ({
  kind: 'text',
  text,
  config: { kind: 'text', multiline: true, ...(placeholder ? { placeholder } : {}) },
  required: false,
});

export const single = (text: string, options: string[]): QuestionInput => ({
  kind: 'single',
  text,
  config: { kind: 'single', options, allowOther: false },
  required: false,
});

export const multi = (text: string, options: string[]): QuestionInput => ({
  kind: 'multi',
  text,
  config: { kind: 'multi', options },
  required: false,
});
