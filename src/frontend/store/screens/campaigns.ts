// The campaign screens' state: what used to be `useState` in the campaign list, the poll and
// suggestion-box dialog, and the Start page that opens it. docs/REDUX-PLAN.md §6.10 (R-702,
// R-706). The poll dialog is the reference conversion every other screen copies.
//
// Server data is NOT here: the campaigns themselves stay in the RTK Query cache (§7). This
// slice holds what the person is doing to them: which dialog is open, what is typed in it,
// whether its command is in flight and what the server said when it failed.
import { createSelector, createSlice, nanoid, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type {
  AudienceRule,
  CampaignAccess,
  CampaignDetail,
  CreateCampaignBody,
  QuickCampaignBody,
  QuickCampaignPurpose,
} from '@endur/shared';
import { isPast } from '../../lib/when.js';
import { signedOut } from '../authSlice.js';
import { campaignsApi } from '../api/endpoints/campaigns.js';
import { templatesApi } from '../api/endpoints/templates.js';
import { rootReducer, type RootState } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

/** A poll offers at most this many options. */
export const MAX_OPTIONS = 10;

export type QuickDraft = {
  purpose: QuickCampaignPurpose;
  name: string;
  /** A poll's options as typed, blanks included: the inputs on screen. */
  options: string[];
  /** The `datetime-local` value, or '' for "until somebody closes it". */
  endsAt: string;
  /**
   * The moment the closing time was last judged against: when the dialog opened, when the
   * time was typed, and again on the press. A dialog left open past its own closing time
   * cannot then make a link that is already closed. Stamped in `prepare`, never in a reducer.
   */
  judgedAt: number;
  sending: boolean;
  error: SerializedApiError | null;
};

/** What the wizard's launch made: enough for the share sheet that follows it. */
export type LaunchedCampaign = {
  campaignId: string;
  url: string;
  name: string;
  endsAt: string | null;
  anonymous: boolean;
  access: CampaignAccess;
};

/** The three-step campaign wizard (`/app/campaigns/new`). */
export type CampaignDraft = {
  /** 0 the form, 1 who, 2 when. */
  step: number;
  templateId: string;
  name: string;
  subjectIds: string[];
  audience: AudienceRule;
  /** `datetime-local` values, '' for none. */
  startsAt: string;
  endsAt: string;
  /** When Closes was last judged against: on reaching a step, typing it, and pressing Launch. */
  judgedAt: number;
  anonymous: boolean;
  access: CampaignAccess;
  /** The organisation's copy of a library pick, once made: a retried launch reuses it. */
  copied: { from: string; id: string } | null;
  sending: boolean;
  error: SerializedApiError | null;
  launched: LaunchedCampaign | null;
};

/** One campaign's page (`/app/campaigns/:id`): what is open on it and what is in flight. */
export type CampaignPage = {
  sharing: boolean;
  /** The link a launch from this page just minted, until the re-read campaign carries it. */
  launchedUrl: string | null;
  confirmingClose: boolean;
  launching: boolean;
  error: SerializedApiError | null;
};

export type CampaignsScreenState = {
  /** The poll or suggestion-box dialog, or null when it is closed. */
  quick: QuickDraft | null;
  /** The campaign whose share sheet is open on the list, by id (the row is in the cache). */
  sharingId: string | null;
  wizard: CampaignDraft;
  /** Campaign pages, by campaign id: opening B never shows what was open on A. */
  pages: Record<string, CampaignPage>;
};

export const BLANK_PAGE: CampaignPage = {
  sharing: false,
  launchedUrl: null,
  confirmingClose: false,
  launching: false,
  error: null,
};

const freshDraft = (): CampaignDraft => ({
  step: 0,
  templateId: '',
  name: '',
  subjectIds: [],
  audience: { kind: 'anyone' },
  startsAt: '',
  endsAt: '',
  judgedAt: 0,
  anonymous: true,
  access: 'public',
  copied: null,
  sending: false,
  error: null,
  launched: null,
});

const initialState: CampaignsScreenState = {
  quick: null,
  sharingId: null,
  wizard: freshDraft(),
  pages: {},
};

/** The page's entry, made when first touched. */
const pageOf = (state: CampaignsScreenState, campaignId: string): CampaignPage =>
  (state.pages[campaignId] ??= { ...BLANK_PAGE });

/** The name a form suggests for a campaign: "Course feedback — November 2026". */
export function autoName(templateName: string, now = new Date()): string {
  const month = now.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  return `${templateName} — ${month}`;
}

/** Opens before Closes, when both are set. */
export const windowInOrder = (draft: CampaignDraft): boolean =>
  !draft.endsAt || !draft.startsAt || new Date(draft.endsAt) > new Date(draft.startsAt);

/** Whether each step may be left forwards (the last: whether Launch may be pressed). */
export const stepsReady = (draft: CampaignDraft): [boolean, boolean, boolean] => [
  draft.templateId !== '' && draft.name.trim() !== '',
  draft.subjectIds.length > 0,
  windowInOrder(draft) && !isPast(draft.endsAt, draft.judgedAt),
];

/** The body the wizard creates, pointing at `templateId` (the pick, or its copy). */
export const draftBody = (draft: CampaignDraft, templateId: string): CreateCampaignBody => ({
  name: draft.name.trim(),
  templateId,
  subjectIds: draft.subjectIds,
  audience: draft.audience,
  anonymous: draft.anonymous,
  access: draft.access,
  ...(draft.startsAt ? { startsAt: new Date(draft.startsAt) } : {}),
  ...(draft.endsAt ? { endsAt: new Date(draft.endsAt) } : {}),
});

/**
 * Launch, from the wizard: copy the form first if it is the library's (a campaign can only
 * point at the organisation's own), create the campaign, then launch it. Each request is
 * the RTK Query mutation, so the campaign list and Home re-read by themselves (§6.4). The
 * launch carries an idempotency key: minting a public token is the irreversible act, and a
 * double press must not make two. `condition` stops a second press while one is in flight.
 */
export const campaignLaunchSubmitted = createScreenThunk(
  'campaigns/campaignLaunchSubmitted',
  async ({ isLibrary }: { isLibrary: boolean }, { getState, dispatch, rejectWithValue }) => {
    const draft = selectWizard(getState());
    try {
      let formId = draft.templateId;
      if (isLibrary) {
        if (draft.copied?.from === formId) {
          formId = draft.copied.id;
        } else {
          const copy = await dispatch(
            templatesApi.endpoints.cloneTemplate.initiate({
              id: formId,
              key: `clone:${formId}:${nanoid()}`,
            }),
          ).unwrap();
          dispatch(libraryFormCopied({ from: draft.templateId, id: copy.id }));
          formId = copy.id;
        }
      }
      const campaign: CampaignDetail = await dispatch(
        campaignsApi.endpoints.createCampaign.initiate(draftBody(draft, formId)),
      ).unwrap();
      const result = await dispatch(
        campaignsApi.endpoints.launchCampaign.initiate({
          id: campaign.id,
          key: `launch:${campaign.id}:${nanoid()}`,
        }),
      ).unwrap();
      const launched: LaunchedCampaign = {
        campaignId: campaign.id,
        url: result.url,
        name: campaign.name,
        endsAt: campaign.endsAt,
        anonymous: campaign.anonymous,
        access: campaign.access,
      };
      return launched;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  {
    condition: (_, { getState }) => {
      const draft = selectWizard(getState());
      return !draft.sending && !draft.launched && stepsReady(draft).every(Boolean);
    },
  },
);

const freshQuick = (purpose: QuickCampaignPurpose, at: number): QuickDraft => ({
  purpose,
  name: '',
  options: ['', ''],
  endsAt: '',
  judgedAt: at,
  sending: false,
  error: null,
});

/** The options a person actually filled in. */
export const filledOptions = (options: string[]): string[] =>
  options.map((option) => option.trim()).filter(Boolean);

/** Whether a draft can be sent: a name, two options for a poll, no closing time gone by. */
export const quickReady = (draft: QuickDraft): boolean =>
  draft.name.trim() !== '' &&
  (draft.purpose === 'suggestion' || filledOptions(draft.options).length >= 2) &&
  !isPast(draft.endsAt, draft.judgedAt);

/** The body the draft becomes. */
export const quickBody = (draft: QuickDraft): QuickCampaignBody => ({
  purpose: draft.purpose,
  name: draft.name.trim(),
  ...(draft.purpose === 'poll' ? { options: filledOptions(draft.options) } : {}),
  ...(draft.endsAt ? { endsAt: new Date(draft.endsAt) } : {}),
});

/**
 * Creates and launches the poll or suggestion box in the dialog. It reads the draft from the
 * store, so the press carries no payload; `condition` refuses to start while the draft is
 * not ready (a closing time that went by since it was typed included) or a send is already
 * in flight, so a double press sends once.
 */
export const quickCampaignSubmitted = createScreenThunk(
  'campaigns/quickCampaignSubmitted',
  async (_: void, { getState, dispatch, rejectWithValue }) => {
    const draft = selectQuick(getState());
    if (!draft) throw new Error('The dialog is closed.');
    const body = quickBody(draft);
    try {
      const created: CampaignDetail = await dispatch(
        campaignsApi.endpoints.quickCreateCampaign.initiate({ body, key: `quick:${nanoid()}` }),
      ).unwrap();
      return created;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  {
    condition: (_, { getState }) => {
      const draft = selectQuick(getState());
      return Boolean(draft && !draft.sending && quickReady(draft));
    },
  },
);

/**
 * Launch a draft from its own page. Minting the token is the irreversible act, so it carries
 * an idempotency key. The campaign is re-read before this resolves, so the share sheet that
 * opens next already says "open".
 */
export const campaignPageLaunched = createScreenThunk(
  'campaigns/campaignPageLaunched',
  async ({ campaignId }: { campaignId: string }, { dispatch, rejectWithValue }) => {
    try {
      const result = await dispatch(
        campaignsApi.endpoints.launchCampaign.initiate({
          id: campaignId,
          key: `launch:${campaignId}:${nanoid()}`,
        }),
      ).unwrap();
      await dispatch(
        campaignsApi.endpoints.getCampaign.initiate(campaignId, { subscribe: false, forceRefetch: true }),
      );
      return { url: result.url };
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  {
    condition: ({ campaignId }, { getState }) => !selectCampaignPage(getState(), campaignId).launching,
  },
);

/** "Close early", once confirmed. The server's answer, the closed campaign, goes into the cache. */
export const campaignPageClosed = createScreenThunk(
  'campaigns/campaignPageClosed',
  async ({ campaignId }: { campaignId: string }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(campaignsApi.endpoints.closeCampaign.initiate(campaignId)).unwrap();
      return { campaignId };
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
);

export const campaignsScreenSlice = createSlice({
  name: 'campaigns',
  initialState,
  reducers: {
    /** "Poll" or "Suggestion box" pressed: a fresh dialog, whatever was typed last time. */
    quickDialogOpened: {
      reducer(state, action: PayloadAction<{ purpose: QuickCampaignPurpose; at: number }>) {
        state.quick = freshQuick(action.payload.purpose, action.payload.at);
      },
      prepare: (purpose: QuickCampaignPurpose) => ({ payload: { purpose, at: Date.now() } }),
    },
    /** Cancel, Escape, the backdrop, or the page closing round it. */
    quickDialogClosed(state) {
      state.quick = null;
    },
    quickNameEdited(state, action: PayloadAction<{ name: string }>) {
      if (state.quick) state.quick.name = action.payload.name;
    },
    quickOptionEdited(state, action: PayloadAction<{ index: number; value: string }>) {
      const { index, value } = action.payload;
      if (state.quick && index >= 0 && index < state.quick.options.length) {
        state.quick.options[index] = value;
      }
    },
    quickOptionAdded(state) {
      if (state.quick && state.quick.options.length < MAX_OPTIONS) state.quick.options.push('');
    },
    /** A poll keeps at least two option inputs. */
    quickOptionRemoved(state, action: PayloadAction<{ index: number }>) {
      if (state.quick && state.quick.options.length > 2) {
        state.quick.options.splice(action.payload.index, 1);
      }
    },
    /** The closing time typed, judged against the moment it was typed. */
    quickClosingTimeEdited: {
      reducer(state, action: PayloadAction<{ value: string; at: number }>) {
        if (!state.quick) return;
        state.quick.endsAt = action.payload.value;
        state.quick.judgedAt = action.payload.at;
      },
      prepare: (value: string) => ({ payload: { value, at: Date.now() } }),
    },
    /** The create button pressed: the closing time is judged again, now. */
    quickSubmitAttempted: {
      reducer(state, action: PayloadAction<{ at: number }>) {
        if (state.quick) state.quick.judgedAt = action.payload.at;
      },
      prepare: () => ({ payload: { at: Date.now() } }),
    },

    shareSheetOpened(state, action: PayloadAction<{ campaignId: string }>) {
      state.sharingId = action.payload.campaignId;
    },
    shareSheetClosed(state) {
      state.sharingId = null;
    },

    /** The list page closed: nothing it had open survives it, as before. */
    campaignListLeft(state) {
      state.quick = null;
      state.sharingId = null;
    },

    // ---- the wizard ----

    /** A form chosen. The name follows it, unless somebody already typed one. */
    formPicked: {
      reducer(state, action: PayloadAction<{ templateId: string; suggestedName: string }>) {
        state.wizard.templateId = action.payload.templateId;
        if (!state.wizard.name.trim()) state.wizard.name = action.payload.suggestedName;
      },
      prepare: (templateId: string, templateName: string) => ({
        payload: { templateId, suggestedName: autoName(templateName) },
      }),
    },
    campaignNameEdited(state, action: PayloadAction<{ name: string }>) {
      state.wizard.name = action.payload.name;
    },
    subjectToggled(state, action: PayloadAction<{ subjectId: string }>) {
      const ids = state.wizard.subjectIds;
      const at = ids.indexOf(action.payload.subjectId);
      if (at === -1) ids.push(action.payload.subjectId);
      else ids.splice(at, 1);
    },
    audienceChosen(state, action: PayloadAction<{ audience: AudienceRule }>) {
      state.wizard.audience = action.payload.audience;
    },
    accessChosen(state, action: PayloadAction<{ access: CampaignAccess }>) {
      state.wizard.access = action.payload.access;
    },
    opensAtEdited(state, action: PayloadAction<{ value: string }>) {
      state.wizard.startsAt = action.payload.value;
    },
    closesAtEdited: {
      reducer(state, action: PayloadAction<{ value: string; at: number }>) {
        state.wizard.endsAt = action.payload.value;
        state.wizard.judgedAt = action.payload.at;
      },
      prepare: (value: string) => ({ payload: { value, at: Date.now() } }),
    },
    anonymityChosen(state, action: PayloadAction<{ anonymous: boolean }>) {
      state.wizard.anonymous = action.payload.anonymous;
    },
    /** Continue, Back, or a finished step on the rail. Arriving judges Closes afresh. */
    wizardStepChanged: {
      reducer(state, action: PayloadAction<{ step: number; at: number }>) {
        state.wizard.step = Math.max(0, Math.min(2, action.payload.step));
        state.wizard.judgedAt = action.payload.at;
      },
      prepare: (step: number) => ({ payload: { step, at: Date.now() } }),
    },
    /** Launch pressed: Closes is judged again, now, before the thunk's condition reads it. */
    launchAttempted: {
      reducer(state, action: PayloadAction<{ at: number }>) {
        state.wizard.judgedAt = action.payload.at;
      },
      prepare: () => ({ payload: { at: Date.now() } }),
    },
    libraryFormCopied(state, action: PayloadAction<{ from: string; id: string }>) {
      state.wizard.copied = action.payload;
    },
    /** The wizard page closed: a new campaign starts from nothing next time, as before. */
    campaignWizardLeft(state) {
      state.wizard = freshDraft();
    },

    // ---- one campaign's page ----

    campaignShareOpened(state, action: PayloadAction<{ campaignId: string }>) {
      pageOf(state, action.payload.campaignId).sharing = true;
    },
    campaignShareClosed(state, action: PayloadAction<{ campaignId: string }>) {
      pageOf(state, action.payload.campaignId).sharing = false;
    },
    closeConfirmOpened(state, action: PayloadAction<{ campaignId: string }>) {
      pageOf(state, action.payload.campaignId).confirmingClose = true;
    },
    closeConfirmDismissed(state, action: PayloadAction<{ campaignId: string }>) {
      pageOf(state, action.payload.campaignId).confirmingClose = false;
    },
    /** The page closed, or moved to another campaign: this one's entry goes. */
    campaignPageLeft(state, action: PayloadAction<{ campaignId: string }>) {
      delete state.pages[action.payload.campaignId];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(quickCampaignSubmitted.pending, (state) => {
        if (!state.quick) return;
        state.quick.sending = true;
        state.quick.error = null;
      })
      // Created: the dialog's job is done. The page that opened it navigates to the campaign.
      .addCase(quickCampaignSubmitted.fulfilled, (state) => {
        state.quick = null;
      })
      .addCase(quickCampaignSubmitted.rejected, (state, action) => {
        if (!state.quick) return;
        state.quick.sending = false;
        // A rejection with no value was a thrown error, not the server: say so plainly.
        state.quick.error = action.payload ?? {
          kind: 'network',
          status: 0,
          message: action.error.message ?? 'That could not be created.',
        };
      })
      .addCase(campaignLaunchSubmitted.pending, (state) => {
        state.wizard.sending = true;
        state.wizard.error = null;
      })
      .addCase(campaignLaunchSubmitted.fulfilled, (state, action) => {
        state.wizard.sending = false;
        state.wizard.launched = action.payload;
      })
      .addCase(campaignLaunchSubmitted.rejected, (state, action) => {
        state.wizard.sending = false;
        state.wizard.error = action.payload ?? {
          kind: 'network',
          status: 0,
          message: action.error.message ?? 'That could not be launched.',
        };
      })
      .addCase(campaignPageLaunched.pending, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.launching = true;
        page.error = null;
      })
      // Launched: the share sheet opens on the new link, the moment it exists.
      .addCase(campaignPageLaunched.fulfilled, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.launching = false;
        page.launchedUrl = action.payload.url;
        page.sharing = true;
      })
      .addCase(campaignPageLaunched.rejected, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.launching = false;
        page.error = action.payload ?? null;
      })
      // The confirmation goes the moment it is answered; a failure is said on the page.
      .addCase(campaignPageClosed.pending, (state, action) => {
        const page = pageOf(state, action.meta.arg.campaignId);
        page.confirmingClose = false;
        page.error = null;
      })
      .addCase(campaignPageClosed.rejected, (state, action) => {
        pageOf(state, action.meta.arg.campaignId).error = action.payload ?? null;
      })
      .addCase(signedOut, () => initialState);
  },
  selectors: {
    selectQuick: (state) => state.quick,
    selectSharingId: (state) => state.sharingId,
    selectWizard: (state) => state.wizard,
  },
});

// Console-only, so injected from the route chunks that need it (§5).
declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof campaignsScreenSlice> {}
}

const injected = campaignsScreenSlice.injectInto(rootReducer);

export const {
  quickDialogOpened,
  quickDialogClosed,
  quickNameEdited,
  quickOptionEdited,
  quickOptionAdded,
  quickOptionRemoved,
  quickClosingTimeEdited,
  quickSubmitAttempted,
  shareSheetOpened,
  shareSheetClosed,
  campaignListLeft,
  formPicked,
  campaignNameEdited,
  subjectToggled,
  audienceChosen,
  accessChosen,
  opensAtEdited,
  closesAtEdited,
  anonymityChosen,
  wizardStepChanged,
  launchAttempted,
  libraryFormCopied,
  campaignWizardLeft,
  campaignShareOpened,
  campaignShareClosed,
  closeConfirmOpened,
  closeConfirmDismissed,
  campaignPageLeft,
} = campaignsScreenSlice.actions;

export const { selectQuick, selectSharingId, selectWizard } = injected.selectors;

/** One campaign's page; a page nothing has happened on yet reads as blank. */
export const selectCampaignPage = (state: RootState, campaignId: string): CampaignPage =>
  injected.selectSlice(state).pages[campaignId] ?? BLANK_PAGE;

/** Whether each wizard step may be left forwards; the last is whether Launch may be pressed. */
export const selectStepsReady = createSelector([selectWizard], stepsReady);

/** Closes has already gone, as of its last judgement. */
export const selectClosesInPast = createSelector([selectWizard], (draft) =>
  isPast(draft.endsAt, draft.judgedAt),
);

/** Whether the dialog's closing time has already gone, as of its last judgement. */
export const selectQuickClosesInPast = createSelector([selectQuick], (draft) =>
  draft ? isPast(draft.endsAt, draft.judgedAt) : false,
);

/** What enables the create button. */
export const selectQuickReady = createSelector([selectQuick], (draft) =>
  draft ? !draft.sending && quickReady(draft) : false,
);
