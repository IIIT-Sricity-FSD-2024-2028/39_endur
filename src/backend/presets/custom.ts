// The custom preset. 50 §1.
//
// CUSTOM IS NOT BLANK, and that is the whole point of the entry. Someone who picks Custom
// and presses Continue four times must still end with a working organisation — a blank
// start is the enemy (customization.md §8). The generic words here are the same ones
// DEFAULT_LABELS falls back to, so an org that renames nothing still reads sensibly.
import type { Preset } from './types.js';
import { nps, rating, single, text_, yesno } from './types.js';

export const custom: Preset = {
  key: 'custom',
  displayName: 'Custom',
  roles: [
    { name: 'Level 1' },
    { name: 'Level 2' },
    { name: 'Level 3' },
    { name: 'Level 4' },
  ],
  units: [
    { tempId: 'root', name: 'Organisation', parentTempId: null },
    { tempId: 'unit-a', name: 'Unit A', parentTempId: 'root' },
    { tempId: 'unit-b', name: 'Unit B', parentTempId: 'root' },
  ],
  labels: {
    unit: { one: 'Unit', many: 'Units' },
    subject: { one: 'Subject', many: 'Subjects' },
    respondent: { one: 'Respondent', many: 'Respondents' },
    reviewee: { one: 'Reviewee', many: 'Reviewees' },
    campaign: { one: 'Campaign', many: 'Campaigns' },
  },
  templates: [
    // T-093. THE TWO QUICK SURFACES, seeded per industry so the start gallery is never
    // empty and each industry's example reads as its own — a hotel poll is not a university
    // poll. Both are ordinary one-question templates: the CATEGORY is the whole of what
    // marks them (`DEC-088`), and neither adds a kind, a table or a column.
    {
      name: 'Quick poll',
      category: 'Poll',
      description: 'One question, a few options, answerable from a phone.',
      questions: [
        single('What should we do next?', ['Option one', 'Option two', 'Option three']),
      ],
    },
    {
      name: 'Suggestion box',
      category: 'Suggestion box',
      description: 'One open question, answered anonymously and read in the Inbox.',
      questions: [
        text_('What should we change?', 'One thing'),
      ],
    },
    {
      name: 'General feedback',
      category: 'General',
      description: 'A working starting point for anything. Edit it rather than start blank.',
      questions: [
        rating('How would you rate your experience overall?', 'Poor', 'Excellent', true),
        rating('How easy was it to get what you needed?', 'Difficult', 'Easy'),
        yesno('Did anything go wrong?'),
        nps('How likely are you to recommend us?'),
        text_('What would you change?'),
      ],
    },
    {
      name: 'Quick pulse',
      category: 'General',
      description: 'One question. A poll, without the product needing a poll feature.',
      questions: [nps('How likely are you to recommend us?')],
    },
  ],
};
