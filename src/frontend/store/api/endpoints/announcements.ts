// Announcements on RTK Query: the reads. 13 § Announcements; docs/REDUX-PLAN.md (R-501).
//
// No polling: an announcement list is a record of what was sent, not a monitor, and a list
// that re-fetches under the reader moves the row they were reading. (The plan's task title
// said "polling"; §4 was corrected: nothing here ever polled.)
//
// The writes stay plain calls in `lib/announcements.ts`, each followed by the page's own
// `reload()`. The list page and Home's banner now read ONE cache entry, so that reload
// reaches both.
import type { AnnouncementPreview, AnnouncementSummary, AudienceRule } from '@endur/shared';
import { api } from '../api.js';

export const announcementsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getAnnouncements: build.query<AnnouncementSummary[], void>({
      query: () => '/announcements',
      transformResponse: (response: { data: AnnouncementSummary[] }) => response.data,
      providesTags: ['Announcement'],
    }),

    /**
     * How many receipts publishing to `audience` would write. A READ, though it is a POST
     * (the rule is the body), so it is a query: one cache entry per rule, and going back to
     * a rule already asked about shows its number at once. The arg is the rule as JSON, so
     * equal rules share an entry whatever order their keys were built in.
     */
    getRecipientCount: build.query<number, string>({
      query: (rule) => ({
        url: '/announcements/preview',
        method: 'POST',
        body: { audience: JSON.parse(rule) as AudienceRule },
      }),
      transformResponse: (response: { data: AnnouncementPreview }) => response.data.recipients,
      // Who an audience reaches moves with the people and the tree.
      providesTags: [{ type: 'Person', id: 'LIST' }, { type: 'Unit', id: 'LIST' }],
    }),
  }),
});

export const { useGetAnnouncementsQuery, useGetRecipientCountQuery } = announcementsApi;
