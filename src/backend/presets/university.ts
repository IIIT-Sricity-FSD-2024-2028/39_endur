// The university preset. 50 §1.
//
// THE ONLY FILE IN THE CODEBASE WHERE EDUCATION VOCABULARY IS ALLOWED, and only as data
// (INV-002). Every word below is a string in a seed, never an identifier, a type, a table
// or a route. Rename them in the wizard and the product is a hotel.
import type { Preset } from './types.js';
import { multi, nps, rating, single, text_, yesno } from './types.js';

export const university: Preset = {
  key: 'university',
  displayName: 'University',
  roles: [
    { name: 'Dean' },
    { name: 'Head of Department' },
    { name: 'Faculty' },
    { name: 'Student' },
  ],
  units: [
    { tempId: 'root', name: 'University', parentTempId: null },
    { tempId: 'eng', name: 'School of Engineering', parentTempId: 'root' },
    { tempId: 'sci', name: 'School of Science', parentTempId: 'root' },
    { tempId: 'cs', name: 'Computer Science', parentTempId: 'eng' },
    { tempId: 'mech', name: 'Mechanical Engineering', parentTempId: 'eng' },
    { tempId: 'phy', name: 'Physics', parentTempId: 'sci' },
  ],
  labels: {
    unit: { one: 'Department', many: 'Departments' },
    subject: { one: 'Course', many: 'Courses' },
    respondent: { one: 'Student', many: 'Students' },
    reviewee: { one: 'Faculty', many: 'Faculty' },
    campaign: { one: 'Feedback cycle', many: 'Feedback cycles' },
  },
  templates: [
    {
      name: 'Course feedback',
      category: 'Teaching',
      description: 'The standard end-of-term form. Eight questions, under two minutes.',
      questions: [
        rating('How clearly was the material explained?', 'Not clearly', 'Very clearly', true),
        rating('How well paced was the course?', 'Too slow or fast', 'Well paced'),
        rating('How useful were the practical sessions?', 'Not useful', 'Very useful'),
        rating('How approachable was the teaching staff?', 'Not approachable', 'Very approachable'),
        yesno('Were the assessment criteria explained before the assessment?'),
        single('How much of the course did you attend?', [
          'Almost all of it',
          'Most of it',
          'About half',
          'Very little',
        ]),
        nps('How likely are you to recommend this course to another student?'),
        text_('What is the one thing that would most improve this course?', 'One thing'),
      ],
    },
    {
      name: 'Facilities pulse',
      category: 'Facilities',
      description: 'Three questions. Runs in a week, answers in a minute.',
      questions: [
        rating('How would you rate the study spaces?', 'Poor', 'Excellent'),
        multi('Which facilities do you use most?', [
          'Library',
          'Laboratories',
          'Study rooms',
          'Cafeteria',
          'Sports facilities',
        ]),
        text_('Anything about the facilities we should know?'),
      ],
    },
    {
      name: 'Semester review',
      category: 'Programme',
      description: 'Broader than a single course — how the whole term went.',
      questions: [
        rating('How manageable was the overall workload?', 'Overwhelming', 'Manageable', true),
        rating('How well did the courses fit together?', 'Disjointed', 'Coherent'),
        rating('How useful was the academic support available to you?', 'Not useful', 'Very useful'),
        yesno('Did you know who to approach when you had a problem?'),
        nps('How likely are you to recommend this programme?'),
        text_('What would you change about this semester?'),
      ],
    },
    {
      name: 'Quick pulse',
      category: 'Teaching',
      description: 'One question. A poll, without the product needing a poll feature.',
      questions: [nps('How likely are you to recommend this course to another student?')],
    },
  ],
};
