// The hospital preset. 50 §1.
import type { Preset } from './types.js';
import { multi, rating, single, text_, yesno } from './types.js';

export const hospital: Preset = {
  key: 'hospital',
  displayName: 'Hospital',
  roles: [
    { name: 'Director' },
    { name: 'Head of Department' },
    { name: 'Nurse' },
    { name: 'Patient' },
  ],
  units: [
    { tempId: 'root', name: 'Hospital', parentTempId: null },
    { tempId: 'med', name: 'Medicine', parentTempId: 'root' },
    { tempId: 'surg', name: 'Surgery', parentTempId: 'root' },
    { tempId: 'ward-a', name: 'Ward A', parentTempId: 'med' },
    { tempId: 'ward-b', name: 'Ward B', parentTempId: 'med' },
    { tempId: 'theatre', name: 'Theatres', parentTempId: 'surg' },
  ],
  labels: {
    unit: { one: 'Ward', many: 'Wards' },
    subject: { one: 'Service', many: 'Services' },
    respondent: { one: 'Patient', many: 'Patients' },
    reviewee: { one: 'Clinician', many: 'Clinicians' },
    campaign: { one: 'Patient survey', many: 'Patient surveys' },
  },
  templates: [
    // T-093. THE TWO QUICK SURFACES, seeded per industry so the start gallery is never
    // empty and each industry's example reads as its own — a hotel poll is not a university
    // poll. Both are ordinary one-question templates: the CATEGORY is the whole of what
    // marks them (`DEC-088`), and neither adds a kind, a table or a column.
    {
      name: 'Waiting-area poll',
      category: 'Poll',
      description: 'One question on a screen in the waiting area.',
      questions: [
        single('How long did you wait before you were seen?', [
          'Under ten minutes',
          'Ten to thirty minutes',
          'Over half an hour',
        ]),
      ],
    },
    {
      name: 'Suggestion box',
      category: 'Suggestion box',
      description: 'One open question, answered anonymously and read in the Inbox.',
      questions: [
        text_('What would have made your visit easier?', 'One thing'),
      ],
    },
    {
      name: 'Patient experience',
      category: 'Care',
      description: 'The standard inpatient form. Plain language, seven questions.',
      questions: [
        rating('How well was your care explained to you?', 'Not explained', 'Fully explained', true),
        rating('How well were you treated with dignity and respect?', 'Poorly', 'Very well'),
        rating('How would you rate the cleanliness of the ward?', 'Poor', 'Excellent'),
        yesno('Did you know which member of staff was responsible for your care?'),
        yesno('Were you given enough privacy when you needed it?'),
        single('How long did you usually wait when you asked for help?', [
          'Straight away',
          'A few minutes',
          'A long time',
          'Nobody came',
        ]),
        text_('Is there anything you would like us to know about your stay?'),
      ],
    },
    {
      name: 'Ward facilities',
      category: 'Facilities',
      description: 'The physical environment, separate from the care itself.',
      questions: [
        rating('How comfortable was the ward?', 'Uncomfortable', 'Comfortable', true),
        rating('How would you rate the food?', 'Poor', 'Excellent'),
        multi('What made it harder to rest?', [
          'Noise at night',
          'Lighting',
          'Temperature',
          'Nothing in particular',
        ]),
        text_('Anything about the ward we should fix?'),
      ],
    },
    {
      name: 'Discharge pulse',
      category: 'Care',
      description: 'Three questions, asked on the way out.',
      questions: [
        yesno('Did you understand what happens next in your care?'),
        rating('How ready did you feel to go home?', 'Not ready', 'Ready'),
        text_('What would have made leaving easier?'),
      ],
    },
    {
      name: 'Quick pulse',
      category: 'Care',
      description: 'One question. A poll, without the product needing a poll feature.',
      questions: [
        rating('How would you rate the care you received?', 'Poor', 'Excellent', true),
      ],
    },
  ],
};
