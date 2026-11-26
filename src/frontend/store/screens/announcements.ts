// The announcements page: the composer's draft, the two confirmations, and every write.
// docs/REDUX-PLAN.md §6.10 (R-711, DEC-R03). The list is the cache's (`getAnnouncements`),
// shared with Home's banner; every write invalidates `Announcement`, so both catch up.
//
// Trace for "Publish":
//   the card's Publish → `publishConfirmOpened(id)` → <ConfirmDialog> from `publishingId` →
//   Publish → `announcementPublished(id)` → `announcementsApi.publishAnnouncement` with this
//   announcement's idempotency key → the list re-reads through its tag.
import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { AnnouncementSummary, AudienceRule } from '@endur/shared';
import { signedOut } from '../authSlice.js';
import { announcementsApi } from '../api/endpoints/announcements.js';
import { rootReducer } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

/**
 * One key per announcement, so a double press, or a retry after a timeout, writes ONE set of
 * receipts: the server answers a repeated key with its first response (13 §7).
 */
export const publishKey = (id: string): string => `announcement-publish-${id}`;

export type ComposerDraft = {
  /** The draft being edited, or `null` for a new one. */
  editingId: string | null;
  title: string;
  body: string;
  audience: AudienceRule;
  /** The audience as JSON once it has stopped changing for a moment: what is counted. */
  settledAudience: string | null;
  saving: boolean;
  error: SerializedApiError | null;
};

export type AnnouncementsScreenState = {
  /** `null` while the composer is closed. */
  composer: ComposerDraft | null;
  publishingId: string | null;
  removingId: string | null;
  /** The announcement being published or deleted, for its card's buttons. */
  workingId: string | null;
  failure: SerializedApiError | null;
};

const initialState: AnnouncementsScreenState = {
  composer: null,
  publishingId: null,
  removingId: null,
  workingId: null,
  failure: null,
};

/** "Save draft": a new draft, or the one being edited. Saving is not sending (11 §3). */
export const announcementSaved = createScreenThunk(
  'announcements/announcementSaved',
  async (_: void, { dispatch, getState, rejectWithValue }) => {
    const draft = selectAnnouncementsScreen(getState()).composer;
    if (!draft) return undefined;
    const body = { title: draft.title.trim(), body: draft.body.trim(), audience: draft.audience };
    try {
      await (draft.editingId
        ? dispatch(announcementsApi.endpoints.updateAnnouncement.initiate({ id: draft.editingId, body }))
        : dispatch(announcementsApi.endpoints.createAnnouncement.initiate(body))
      ).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  {
    condition: (_, { getState }) => {
      const draft = selectAnnouncementsScreen(getState()).composer;
      return !!draft && !draft.saving && draft.title.trim() !== '' && draft.body.trim() !== '';
    },
  },
);

/** Publishing writes the receipts. Irreversible, so it is keyed (`publishKey`). */
export const announcementPublished = createScreenThunk(
  'announcements/announcementPublished',
  async (id: string, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(
        announcementsApi.endpoints.publishAnnouncement.initiate({ id, key: publishKey(id) }),
      ).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (_, { getState }) => selectAnnouncementsScreen(getState()).workingId === null },
);

/** Only a draft can be deleted; it was sent to nobody. */
export const announcementDeleted = createScreenThunk(
  'announcements/announcementDeleted',
  async (id: string, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(announcementsApi.endpoints.deleteAnnouncement.initiate(id)).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (_, { getState }) => selectAnnouncementsScreen(getState()).workingId === null },
);

export const announcementsScreenSlice = createSlice({
  name: 'announcements',
  initialState,
  reducers: {
    /** "New announcement", or a draft's "Edit": the composer opens on its words. */
    composerOpened(state, action: PayloadAction<{ editing: AnnouncementSummary | null }>) {
      const { editing } = action.payload;
      state.composer = {
        editingId: editing?.id ?? null,
        title: editing?.title ?? '',
        body: editing?.body ?? '',
        audience: editing?.audience ?? { kind: 'anyone' },
        settledAudience: null,
        saving: false,
        error: null,
      };
    },
    composerEdited(state, action: PayloadAction<{ title?: string; body?: string }>) {
      if (!state.composer) return;
      if (action.payload.title !== undefined) state.composer.title = action.payload.title;
      if (action.payload.body !== undefined) state.composer.body = action.payload.body;
    },
    composerAudienceChosen(state, action: PayloadAction<{ audience: AudienceRule }>) {
      if (state.composer) state.composer.audience = action.payload.audience;
    },
    /** The composer's debounce has run out: count the audience as it is now. */
    composerAudienceSettled(state) {
      if (state.composer) state.composer.settledAudience = JSON.stringify(state.composer.audience);
    },
    composerClosed(state) {
      if (!state.composer?.saving) state.composer = null;
    },
    publishConfirmOpened(state, action: PayloadAction<{ id: string }>) {
      state.publishingId = action.payload.id;
    },
    publishConfirmClosed(state) {
      state.publishingId = null;
    },
    removeConfirmOpened(state, action: PayloadAction<{ id: string }>) {
      state.removingId = action.payload.id;
    },
    removeConfirmClosed(state) {
      state.removingId = null;
    },
    announcementsLeft() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(announcementSaved.pending, (state) => {
        if (!state.composer) return;
        state.composer.saving = true;
        state.composer.error = null;
      })
      .addCase(announcementSaved.fulfilled, (state) => {
        state.composer = null;
      })
      .addCase(announcementSaved.rejected, (state, action) => {
        if (!state.composer) return;
        state.composer.saving = false;
        state.composer.error = action.payload ?? null;
      });

    // Publishing and deleting: the confirmation closes as the request goes, and a refusal
    // is said once above the list.
    for (const thunk of [announcementPublished, announcementDeleted]) {
      builder
        .addCase(thunk.pending, (state, action) => {
          state.workingId = action.meta.arg;
          state.publishingId = null;
          state.removingId = null;
          state.failure = null;
        })
        .addCase(thunk.fulfilled, (state) => {
          state.workingId = null;
        })
        .addCase(thunk.rejected, (state, action) => {
          state.workingId = null;
          if (action.payload) state.failure = action.payload;
        });
    }
    builder.addCase(signedOut, () => initialState);
  },
  selectors: {
    selectAnnouncementsScreen: (state) => state,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof announcementsScreenSlice> {}
}

const injected = announcementsScreenSlice.injectInto(rootReducer);

export const {
  composerOpened,
  composerEdited,
  composerAudienceChosen,
  composerAudienceSettled,
  composerClosed,
  publishConfirmOpened,
  publishConfirmClosed,
  removeConfirmOpened,
  removeConfirmClosed,
  announcementsLeft,
} = announcementsScreenSlice.actions;

export const { selectAnnouncementsScreen } = injected.selectors;
