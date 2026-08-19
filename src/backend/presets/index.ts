// The five presets, as one lookup. 50 §1.
//
// Registration and POST /org/setup both read from here, and so does the seed (T-025) —
// one copy, so a preset edited for the demo is the same preset the wizard offers.
import type { Industry } from '@endur/shared';
import { estimateSeconds } from '@endur/shared';
import type { PresetView } from '@endur/shared';
import { university } from './university.js';
import { hotel } from './hotel.js';
import { hospital } from './hospital.js';
import { company } from './company.js';
import { custom } from './custom.js';
import type { Preset } from './types.js';

export const PRESETS: Record<Industry, Preset> = {
  university,
  hotel,
  hospital,
  company,
  custom,
};

export const PRESET_LIST: Preset[] = [university, hotel, hospital, company, custom];

/** Custom is the fallback, never a blank set — an unknown industry still gets a working org. */
export const presetFor = (industry: string): Preset =>
  PRESETS[industry as Industry] ?? custom;

/**
 * What GET /org/presets returns. Templates are summarised rather than sent whole: the
 * wizard shows "Course feedback · 8 questions" and only needs the count, and shipping five
 * presets' full question sets to render a radio group is a page of payload for nothing.
 */
export const presetView = (preset: Preset): PresetView => ({
  key: preset.key,
  displayName: preset.displayName,
  roles: preset.roles,
  units: preset.units,
  labels: preset.labels,
  templates: preset.templates.map((template) => ({
    name: template.name,
    category: template.category,
    questionCount: template.questions.length,
  })),
});

export const estimateFor = (preset: Preset, templateName: string): number => {
  const template = preset.templates.find((entry) => entry.name === templateName);
  return template ? estimateSeconds(template.questions.map((q) => q.kind)) : 0;
};

export type { Preset, TemplateSeed, UnitSeed } from './types.js';
export { GRANT_MATRIX, UNIVERSAL_SELF_GRANTS, grantsForLevel } from './grant-matrix.js';
export type { GrantSeed, Level } from './grant-matrix.js';
