// The company preset, also the fallback for anything unexpected: a gym is a Company, an NGO is a Company.
// Picking the nearest preset and renaming a few things handles an odd request gracefully.
import type { Preset } from './types.js';
import { multi, nps, rating, single, text_, yesno } from './types.js';

export const company: Preset = {
  key: 'company',
  displayName: 'Company',
  roles: [
    { name: 'Executive' },
    { name: 'Manager' },
    { name: 'Team Lead' },
    { name: 'Employee' },
  ],
  units: [
    { tempId: 'root', name: 'Company', parentTempId: null },
    { tempId: 'eng', name: 'Engineering', parentTempId: 'root' },
    { tempId: 'ops', name: 'Operations', parentTempId: 'root' },
    { tempId: 'platform', name: 'Platform', parentTempId: 'eng' },
    { tempId: 'product', name: 'Product', parentTempId: 'eng' },
    { tempId: 'support', name: 'Support', parentTempId: 'ops' },
  ],
  labels: {
    unit: { one: 'Team', many: 'Teams' },
    subject: { one: 'Project', many: 'Projects' },
    respondent: { one: 'Employee', many: 'Employees' },
    reviewee: { one: 'Manager', many: 'Managers' },
    campaign: { one: 'Review cycle', many: 'Review cycles' },
  },
  templates: [
    // The two quick-start forms, seeded per industry so the gallery is never empty. Both are ordinary one-question templates.
    {
      name: 'Standup poll',
      category: 'Poll',
      description: 'One question, asked of a room already in the meeting.',
      questions: [
        single('How is this week going?', ['Well', 'Fine', 'Under water']),
      ],
    },
    {
      name: 'Suggestion box',
      category: 'Suggestion box',
      description: 'One open question, answered anonymously and read in the Inbox.',
      questions: [
        text_('What should we stop doing?', 'One thing'),
      ],
    },
    {
      name: 'Manager feedback',
      category: 'People',
      description: 'Upward feedback. Eight questions, anonymous by default.',
      questions: [
        rating('How clear are the expectations set for you?', 'Unclear', 'Very clear', true),
        rating('How useful is the feedback you receive?', 'Not useful', 'Very useful'),
        rating('How supported do you feel when something goes wrong?', 'Unsupported', 'Well supported'),
        rating('How well are decisions explained to you?', 'Not explained', 'Well explained'),
        yesno('Do you have a regular one-to-one that actually happens?'),
        single('How often do you get recognition for good work?', [
          'Regularly',
          'Sometimes',
          'Rarely',
          'Never',
        ]),
        nps('How likely are you to recommend working here to a friend?'),
        text_('What is the one thing your manager could do differently?', 'One thing'),
      ],
    },
    {
      name: 'Team health',
      category: 'Team',
      description: 'A short pulse the team runs on itself.',
      questions: [
        rating('How sustainable is your current workload?', 'Unsustainable', 'Sustainable', true),
        rating('How clear are the team priorities?', 'Unclear', 'Very clear'),
        multi('What is slowing the team down most?', [
          'Unclear priorities',
          'Too many meetings',
          'Waiting on other teams',
          'Tooling',
          'Nothing significant',
        ]),
        yesno('Do you feel able to raise a concern without it counting against you?'),
        text_('What should the team start doing?'),
      ],
    },
    {
      name: 'Quick pulse',
      category: 'Team',
      description: 'One question. A poll, without the product needing a poll feature.',
      questions: [rating('How was this week?', 'Rough', 'Great', true)],
    },
  ],
};
