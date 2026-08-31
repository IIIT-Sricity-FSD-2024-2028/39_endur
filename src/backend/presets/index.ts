// The five presets in one lookup.
// Registration, the setup wizard and the seed script all read from here, so there is only ever one copy.
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

// Custom is the fallback, so an unknown industry still gets a working organisation.
export const presetFor = (industry: string): Preset =>
  PRESETS[industry as Industry] ?? custom;

// What GET /org/presets returns. Templates are summarised to a question count, not sent whole.
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

// Roughly how long one of a preset's templates takes to answer.
export const estimateFor = (preset: Preset, templateName: string): number => {
  const template = preset.templates.find((entry) => entry.name === templateName);
  return template ? estimateSeconds(template.questions.map((q) => q.kind)) : 0;
};

export type { Preset, TemplateSeed, UnitSeed } from './types.js';
export { GRANT_MATRIX, UNIVERSAL_SELF_GRANTS, grantsForLevel, levelForRole } from './grant-matrix.js';
export type { GrantSeed, Level } from './grant-matrix.js';
