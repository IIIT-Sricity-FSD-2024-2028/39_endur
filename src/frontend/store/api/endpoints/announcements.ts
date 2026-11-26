// Announcements on RTK Query: the reads. 13 § Announcements; docs/REDUX-PLAN.md (R-501).
//
// No polling: an announcement list is a record of what was sent, not a monitor, and a list
// that re-fetches under the reader moves the row they were reading. (The plan's task title
// said "polling"; §4 was corrected: nothing here ever polled.)
//
// The writes are mutations too (DEC-R03, R-705): each invalidates `Announcement`, so the list
// page and Home's banner, which read ONE cache entry, both catch up by themselves.
import type {
  AnnouncementPreview,
  AnnouncementSummary,
  AudienceRule,
  CreateAnnouncementBody,
  UpdateAnnouncementBody,
} from '@endur/shared';
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

    createAnnouncement: build.mutation<AnnouncementSummary, CreateAnnouncementBody>({
      query: (body) => ({ url: '/announcements', method: 'POST', body }),
      transformResponse: (response: { data: AnnouncementSummary }) => response.data,
      invalidatesTags: ['Announcement'],
    }),

    updateAnnouncement: build.mutation<AnnouncementSummary, { id: string; body: UpdateAnnouncementBody }>({
      query: ({ id, body }) => ({ url: `/announcements/${id}`, method: 'PATCH', body }),
      transformResponse: (response: { data: AnnouncementSummary }) => response.data,
      invalidatesTags: ['Announcement'],
    }),

    /**
     * Publishing writes the receipts: the irreversible act. `key` is the caller's idempotency
     * key, so a double press writes ONE set (the server answers a repeat with the first
     * response, 13 §7).
     */
    publishAnnouncement: build.mutation<AnnouncementSummary, { id: string; key: string }>({
      query: ({ id, key }) => ({
        url: `/announcements/${id}/publish`,
        method: 'POST',
        idempotencyKey: key,
      }),
      transformResponse: (response: { data: AnnouncementSummary }) => response.data,
      invalidatesTags: ['Announcement'],
    }),

    deleteAnnouncement: build.mutation<void, string>({
      query: (id) => ({ url: `/announcements/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Announcement'],
    }),

    /** Marks the caller's OWN receipt. There is no id here but the announcement's. */
    markAnnouncementRead: build.mutation<void, string>({
      query: (id) => ({ url: `/announcements/${id}/read`, method: 'POST' }),
      invalidatesTags: ['Announcement'],
    }),
  }),
});

export const { useGetAnnouncementsQuery, useGetRecipientCountQuery } = announcementsApi;
