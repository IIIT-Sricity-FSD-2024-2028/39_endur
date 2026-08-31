// The four preset vocabularies, as DATA both apps can read. 22, 50 §1.
//
// WHY THIS IS IN `shared` AND NOT IN A COMPONENT.
//
// The public landing page's one interactive element is a vocabulary switcher — pick an
// industry, watch the noun row change (design_specs/design/03 §3.1). It is the entire
// pitch: the same product, four vocabularies. But there is no organisation on `/`, so
// there is no `organization.labels` to resolve and `useLabels()` has nothing to give.
//
// Writing the nouns into the component would break INV-001, and `audit:vocab` correctly
// fails the build for it. So they live here, where they are what they actually are:
// ADVERTISING COPY ABOUT THE PRESETS, in the same category as `src/backend/presets/**`
// and `database/seed/**` — the only places an education noun may appear (INV-002).
//
// `src/backend/test/vocabularies.test.ts` asserts every entry below still matches the real
// preset it advertises. A landing page promising "Course" while the university preset has
// been renamed is a lie told on the first screen, and drift is otherwise invisible.
import type { Industry } from './dto/org.js';
import type { ResolvedLabels } from './labels.js';

export type PresetVocabulary = {
  key: Industry;
  /** What the segment reads. Endur's own word for the preset, not the customer's. */
  displayName: string;
  labels: ResolvedLabels;
};

/**
 * `custom` is deliberately ABSENT. It has no vocabulary to show off — its labels are the
 * generic fallbacks — so putting it on the landing page would demonstrate nothing.
 */
export const PRESET_VOCABULARIES: PresetVocabulary[] = [
  {
    key: 'university',
    displayName: 'University',
    labels: {
      unit: { one: 'Department', many: 'Departments' },
      subject: { one: 'Course', many: 'Courses' },
      respondent: { one: 'Student', many: 'Students' },
      reviewee: { one: 'Faculty', many: 'Faculty' },
      campaign: { one: 'Feedback cycle', many: 'Feedback cycles' },
    },
  },
  {
    key: 'hotel',
    displayName: 'Hotel',
    labels: {
      unit: { one: 'Property', many: 'Properties' },
      subject: { one: 'Restaurant', many: 'Restaurants' },
      respondent: { one: 'Guest', many: 'Guests' },
      reviewee: { one: 'Staff member', many: 'Staff members' },
      campaign: { one: 'Guest survey', many: 'Guest surveys' },
    },
  },
  {
    key: 'hospital',
    displayName: 'Hospital',
    labels: {
      unit: { one: 'Ward', many: 'Wards' },
      subject: { one: 'Service', many: 'Services' },
      respondent: { one: 'Patient', many: 'Patients' },
      reviewee: { one: 'Clinician', many: 'Clinicians' },
      campaign: { one: 'Patient survey', many: 'Patient surveys' },
    },
  },
  {
    key: 'company',
    displayName: 'Company',
    labels: {
      unit: { one: 'Team', many: 'Teams' },
      subject: { one: 'Project', many: 'Projects' },
      respondent: { one: 'Employee', many: 'Employees' },
      reviewee: { one: 'Manager', many: 'Managers' },
      campaign: { one: 'Review cycle', many: 'Review cycles' },
    },
  },
];

/** The four nouns the landing row shows, in the order it shows them. */
export const PITCH_KEYS = ['unit', 'subject', 'respondent', 'reviewee'] as const;
