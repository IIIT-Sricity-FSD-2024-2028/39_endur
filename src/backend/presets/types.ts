// The shape of an industry preset. A preset is DATA, not code, so adding a sixth needs no migration.
// It pre-fills roles, structure, vocabulary and starter forms, all still editable afterwards.
import type { Industry, LabelSet } from '@endur/shared';
import type { QuestionInput } from '@endur/shared';

// Flat, with temporary client-side ids, exactly the shape POST /org/setup already accepts.
export type UnitSeed = {
  tempId: string;
  name: string;
  parentTempId: string | null;
};

export type TemplateSeed = {
  name: string;
  category: string;
  description?: string;
  // Never more than 10. Short forms are the whole idea, and a test enforces it.
  questions: QuestionInput[];
};

export type Preset = {
  key: Industry;
  displayName: string;
  // ORDER IS THE LEVEL: index 0 is level 1, the most senior. No level number is ever stored here.
  roles: Array<{ name: string }>;
  units: UnitSeed[];
  labels: LabelSet;
  templates: TemplateSeed[];
};

// Small helpers, so the preset files read as data rather than ceremony.
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
