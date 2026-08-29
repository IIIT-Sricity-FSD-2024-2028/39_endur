// The hotel preset. 50 §1.
//
// This is the one that lands the demo's core claim. Switching from the university to this
// org changes every noun on every screen with no code path involved (50 §5, step 2).
import type { Preset } from './types.js';
import { nps, rating, single, text_, yesno } from './types.js';

export const hotel: Preset = {
  key: 'hotel',
  displayName: 'Hotel',
  roles: [
    { name: 'General Manager' },
    { name: 'Manager' },
    { name: 'Staff' },
    { name: 'Guest' },
  ],
  units: [
    { tempId: 'root', name: 'Hotel Group', parentTempId: null },
    { tempId: 'city', name: 'City Property', parentTempId: 'root' },
    { tempId: 'coast', name: 'Coastal Property', parentTempId: 'root' },
    { tempId: 'front', name: 'Front Office', parentTempId: 'city' },
    { tempId: 'house', name: 'Housekeeping', parentTempId: 'city' },
    { tempId: 'food', name: 'Food and Beverage', parentTempId: 'city' },
  ],
  labels: {
    unit: { one: 'Property', many: 'Properties' },
    subject: { one: 'Restaurant', many: 'Restaurants' },
    respondent: { one: 'Guest', many: 'Guests' },
    reviewee: { one: 'Staff member', many: 'Staff members' },
    campaign: { one: 'Guest survey', many: 'Guest surveys' },
  },
  templates: [
    // T-093. THE TWO QUICK SURFACES, seeded per industry so the start gallery is never
    // empty and each industry's example reads as its own — a hotel poll is not a university
    // poll. Both are ordinary one-question templates: the CATEGORY is the whole of what
    // marks them (`DEC-088`), and neither adds a kind, a table or a column.
    {
      name: 'Lobby poll',
      category: 'Poll',
      description: 'One question on a card at the desk, answered on the way past.',
      questions: [
        single('What would you like us to add to breakfast?', [
          'More fruit',
          'Hot options',
          'Local dishes',
          'Nothing — it is good',
        ]),
      ],
    },
    {
      name: 'Suggestion box',
      category: 'Suggestion box',
      description: 'One open question, answered anonymously and read in the Inbox.',
      questions: [
        text_('What would have made your stay better?', 'One thing'),
      ],
    },
    {
      name: 'Stay experience',
      category: 'Guest',
      description: 'The post-checkout form. Six questions, answered on a phone.',
      questions: [
        rating('How would you rate your stay overall?', 'Poor', 'Excellent', true),
        rating('How clean was your room on arrival?', 'Not clean', 'Spotless'),
        rating('How helpful was the staff you dealt with?', 'Not helpful', 'Very helpful'),
        yesno('Was your room ready at the time you were promised?'),
        nps('How likely are you to recommend us to a friend?'),
        text_('What would have made your stay better?', 'One thing'),
      ],
    },
    {
      name: 'Restaurant feedback',
      category: 'Food and beverage',
      description: 'Left on the table, scanned at the end of a meal.',
      questions: [
        rating('How was the food?', 'Poor', 'Excellent', true),
        rating('How was the service?', 'Poor', 'Excellent'),
        single('How long did you wait to be served?', [
          'No wait at all',
          'A few minutes',
          'Longer than I expected',
          'Far too long',
        ]),
        text_('Anything you would like the chef to know?'),
      ],
    },
    {
      name: 'Quick pulse',
      category: 'Guest',
      // One question. This is DEC-010 made concrete: a poll IS a one-question template,
      // and there is no poll entity anywhere in the product.
      description: 'One question. A poll, without the product needing a poll feature.',
      questions: [nps('How likely are you to stay with us again?')],
    },
  ],
};
