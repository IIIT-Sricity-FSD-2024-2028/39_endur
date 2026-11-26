// State for the SHARED components: widgets that appear on many pages, sometimes several on
// one page. docs/REDUX-PLAN.md §6.10 (DEC-R03).
//
// Each instance is kept under its own id (React's `useId()`, made by the component), so two
// on one page never share anything, and each removes its own entry when it unmounts
// (`…Left`), which is when its `useState` used to go. An instance with no entry yet reads as
// its blank state, so a mount, an unmount and a mount again (StrictMode) leave nothing wrong.
import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { AnswerValue, QuestionKind } from '@endur/shared';
import { signedOut } from '../authSlice.js';
import { rootReducer, type RootState } from '../index.js';

export type PreviewWidth = 'desktop' | 'tablet' | 'phone';

/** <FormPreview>: the frame width, and answers given to try the form out (never saved). */
export type PreviewState = { width: PreviewWidth; answers: Record<string, AnswerValue> };

/** <QuestionCard>: a kind change that would lose something, waiting for a yes. */
export type RetypeState = { kind: QuestionKind; warning: string };

/** <UnitTree>: folded branches, a drag or keyboard move in progress, and a refused drop. */
export type TreeState = {
  collapsed: string[];
  dragId: string | null;
  /** The row a drag is over, for the drop highlight. Changes only when the row does. */
  overId: string | null;
  /** A move started from the row's own button (keyboard and touch), not a drag. */
  movingId: string | null;
  /** The row asked to start renaming (the side panel's Rename). */
  focusRow: string | null;
  refusal: { id: string; text: string } | null;
  /** The last request from the page acted on, so a re-render does not act on it twice. */
  handledNonce: number | null;
};

/** <FileUpload>: a drag over it, an upload or removal in flight, its failure, the preview. */
export type UploadState = {
  busy: boolean;
  dragging: boolean;
  error: string | null;
  /** The picked file shown at once, as an object URL, until the server's copy replaces it. */
  preview: string | null;
};

/** <PaymentDialog>: the simulated checkout's phase. */
export type PaymentPhase = 'idle' | 'paying' | 'done';

export type ShareState = { presenting: boolean; qrFailed: boolean };

/**
 * An inline rename in progress. `base` is the value the typing started from: once the value
 * itself changes (the rename landed, or somebody else's did), the draft is stale and the new
 * value shows, which is what an effect copying the prop into state used to do.
 */
export type NameDraft = { text: string; base: string };

export type WidgetsState = {
  previews: Record<string, PreviewState>;
  retypes: Record<string, RetypeState>;
  trees: Record<string, TreeState>;
  uploads: Record<string, UploadState>;
  payments: Record<string, PaymentPhase>;
  /** Which one item an instance has open (a row's details, a log line), or none. */
  disclosures: Record<string, string | null>;
  /** A "Copy link" button's answer: copied (for a moment), or refused by the browser. */
  copies: Record<string, 'copied' | 'failed'>;
  /** <ShareSheet>: shown full screen for a room, and whether the code could be drawn. */
  shares: Record<string, ShareState>;
  /** <InviteLink>: a new link being made. */
  regenerating: Record<string, boolean>;
  /** <InlineName>: what is typed, and the value it started from. */
  names: Record<string, NameDraft>;
};

const initialState: WidgetsState = {
  previews: {}, retypes: {}, trees: {}, uploads: {}, payments: {}, disclosures: {},
  copies: {}, shares: {}, regenerating: {}, names: {},
};

export const BLANK_UPLOAD: UploadState = { busy: false, dragging: false, error: null, preview: null };

const uploadOf = (state: WidgetsState, id: string): UploadState =>
  (state.uploads[id] ??= { ...BLANK_UPLOAD });

export const BLANK_TREE: TreeState = {
  collapsed: [],
  dragId: null,
  overId: null,
  movingId: null,
  focusRow: null,
  refusal: null,
  handledNonce: null,
};

const treeOf = (state: WidgetsState, id: string): TreeState =>
  (state.trees[id] ??= { ...BLANK_TREE, collapsed: [] });

export const BLANK_PREVIEW: PreviewState = { width: 'desktop', answers: {} };

const previewOf = (state: WidgetsState, id: string): PreviewState =>
  (state.previews[id] ??= { width: 'desktop', answers: {} });

export const widgetsSlice = createSlice({
  name: 'widgets',
  initialState,
  reducers: {
    previewWidthChosen(state, action: PayloadAction<{ id: string; width: PreviewWidth }>) {
      previewOf(state, action.payload.id).width = action.payload.width;
    },
    previewAnswered(state, action: PayloadAction<{ id: string; questionId: string; value: AnswerValue }>) {
      previewOf(state, action.payload.id).answers[action.payload.questionId] = action.payload.value;
    },
    previewLeft(state, action: PayloadAction<{ id: string }>) {
      delete state.previews[action.payload.id];
    },

    /** A kind change that drops options or text: asked about before it happens. */
    questionRetypeAsked(state, action: PayloadAction<{ id: string; kind: QuestionKind; warning: string }>) {
      const { id, kind, warning } = action.payload;
      state.retypes[id] = { kind, warning };
    },
    /** Answered either way: the question changed, or it was kept. */
    questionRetypeSettled(state, action: PayloadAction<{ id: string }>) {
      delete state.retypes[action.payload.id];
    },

    treeBranchToggled(state, action: PayloadAction<{ id: string; nodeId: string }>) {
      const tree = treeOf(state, action.payload.id);
      const at = tree.collapsed.indexOf(action.payload.nodeId);
      if (at === -1) tree.collapsed.push(action.payload.nodeId);
      else tree.collapsed.splice(at, 1);
    },
    treeDragStarted(state, action: PayloadAction<{ id: string; nodeId: string }>) {
      treeOf(state, action.payload.id).dragId = action.payload.nodeId;
    },
    treeDraggedOver(state, action: PayloadAction<{ id: string; nodeId: string }>) {
      treeOf(state, action.payload.id).overId = action.payload.nodeId;
    },
    /** The row's own Move button: press again to put it down. */
    treeMoveToggled(state, action: PayloadAction<{ id: string; nodeId: string }>) {
      const tree = treeOf(state, action.payload.id);
      tree.movingId = tree.movingId === action.payload.nodeId ? null : action.payload.nodeId;
    },
    /** A drag or move ended: dropped, refused, or let go. */
    treeMoveEnded(state, action: PayloadAction<{ id: string; refusal?: { id: string; text: string } | null }>) {
      const tree = treeOf(state, action.payload.id);
      tree.dragId = null;
      tree.overId = null;
      tree.movingId = null;
      if (action.payload.refusal !== undefined) tree.refusal = action.payload.refusal;
    },
    /** The page asked the tree to start a rename or a move on one row (side panel). */
    treeRequestTaken(
      state,
      action: PayloadAction<{ id: string; nodeId: string; action: 'rename' | 'move'; nonce: number }>,
    ) {
      const tree = treeOf(state, action.payload.id);
      if (tree.handledNonce === action.payload.nonce) return;
      tree.handledNonce = action.payload.nonce;
      if (action.payload.action === 'move') tree.movingId = action.payload.nodeId;
      else tree.focusRow = action.payload.nodeId;
    },
    treeLeft(state, action: PayloadAction<{ id: string }>) {
      delete state.trees[action.payload.id];
    },

    uploadDragChanged(state, action: PayloadAction<{ id: string; dragging: boolean }>) {
      uploadOf(state, action.payload.id).dragging = action.payload.dragging;
    },
    /** Refused before sending: the wrong type, or too big. */
    uploadRefused(state, action: PayloadAction<{ id: string; error: string }>) {
      const upload = uploadOf(state, action.payload.id);
      upload.error = action.payload.error;
      upload.dragging = false;
    },
    uploadStarted(state, action: PayloadAction<{ id: string; preview: string | null }>) {
      const upload = uploadOf(state, action.payload.id);
      upload.busy = true;
      upload.error = null;
      upload.dragging = false;
      if (action.payload.preview !== null) upload.preview = action.payload.preview;
    },
    /** Done: the preview goes either way. On success the server's image is `current`; on a
     *  failure there is nothing to preview. (The preview used to stay after success, pointing
     *  at an object URL already revoked: a broken image until the page was reloaded.) */
    uploadFinished(state, action: PayloadAction<{ id: string; error: string | null }>) {
      const upload = uploadOf(state, action.payload.id);
      upload.busy = false;
      upload.error = action.payload.error;
      upload.preview = null;
    },
    uploadLeft(state, action: PayloadAction<{ id: string }>) {
      delete state.uploads[action.payload.id];
    },

    /** Pay pressed, the server's answer came, or it refused (back to idle). */
    paymentPhaseChanged(state, action: PayloadAction<{ id: string; phase: PaymentPhase }>) {
      state.payments[action.payload.id] = action.payload.phase;
    },
    paymentLeft(state, action: PayloadAction<{ id: string }>) {
      delete state.payments[action.payload.id];
    },

    /** An item opened, or closed again if it was the open one. One open at a time. */
    disclosureToggled(state, action: PayloadAction<{ id: string; item: string }>) {
      const { id, item } = action.payload;
      state.disclosures[id] = state.disclosures[id] === item ? null : item;
    },
    /** Nothing open (the list under it changed). */
    disclosureClosed(state, action: PayloadAction<{ id: string }>) {
      state.disclosures[action.payload.id] = null;
    },
    disclosureLeft(state, action: PayloadAction<{ id: string }>) {
      delete state.disclosures[action.payload.id];
    },

    /** The clipboard's answer to "Copy link". */
    linkCopied(state, action: PayloadAction<{ id: string; ok: boolean }>) {
      state.copies[action.payload.id] = action.payload.ok ? 'copied' : 'failed';
    },
    /** "Copied" has been on screen long enough. A refusal stays: it tells them what to do. */
    copiedFaded(state, action: PayloadAction<{ id: string }>) {
      if (state.copies[action.payload.id] === 'copied') delete state.copies[action.payload.id];
    },
    shareStageToggled(state, action: PayloadAction<{ id: string; presenting: boolean }>) {
      const share = (state.shares[action.payload.id] ??= { presenting: false, qrFailed: false });
      share.presenting = action.payload.presenting;
    },
    /** The QR code drew, or could not be drawn (the address below it still works). */
    qrDrawn(state, action: PayloadAction<{ id: string; ok: boolean }>) {
      const share = (state.shares[action.payload.id] ??= { presenting: false, qrFailed: false });
      share.qrFailed = !action.payload.ok;
    },
    linkRegenerating(state, action: PayloadAction<{ id: string; busy: boolean }>) {
      if (action.payload.busy) {
        state.regenerating[action.payload.id] = true;
        delete state.copies[action.payload.id];
      } else {
        delete state.regenerating[action.payload.id];
      }
    },
    nameTyped(state, action: PayloadAction<{ id: string; text: string; base: string }>) {
      state.names[action.payload.id] = { text: action.payload.text, base: action.payload.base };
    },
    /** Escape, an empty name, or nothing to save: back to the value. */
    nameReset(state, action: PayloadAction<{ id: string }>) {
      delete state.names[action.payload.id];
    },
    /** One of these widgets has gone: everything it kept goes with it. */
    instanceLeft(state, action: PayloadAction<{ id: string }>) {
      const { id } = action.payload;
      delete state.copies[id];
      delete state.shares[id];
      delete state.regenerating[id];
      delete state.names[id];
    },
  },
  extraReducers: (builder) => {
    builder.addCase(signedOut, () => initialState);
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof widgetsSlice> {}
}

const injected = widgetsSlice.injectInto(rootReducer);

export const {
  previewWidthChosen,
  previewAnswered,
  previewLeft,
  questionRetypeAsked,
  questionRetypeSettled,
  treeBranchToggled,
  treeDragStarted,
  treeDraggedOver,
  treeMoveToggled,
  treeMoveEnded,
  treeRequestTaken,
  treeLeft,
  uploadDragChanged,
  uploadRefused,
  uploadStarted,
  uploadFinished,
  uploadLeft,
  paymentPhaseChanged,
  paymentLeft,
  disclosureToggled,
  disclosureClosed,
  disclosureLeft,
  linkCopied,
  copiedFaded,
  shareStageToggled,
  qrDrawn,
  linkRegenerating,
  nameTyped,
  nameReset,
  instanceLeft,
} = widgetsSlice.actions;

export const selectPreview = (state: RootState, id: string): PreviewState =>
  injected.selectSlice(state).previews[id] ?? BLANK_PREVIEW;

export const selectRetype = (state: RootState, id: string): RetypeState | null =>
  injected.selectSlice(state).retypes[id] ?? null;

export const selectTree = (state: RootState, id: string): TreeState =>
  injected.selectSlice(state).trees[id] ?? BLANK_TREE;

export const selectUpload = (state: RootState, id: string): UploadState =>
  injected.selectSlice(state).uploads[id] ?? BLANK_UPLOAD;

export const selectPaymentPhase = (state: RootState, id: string): PaymentPhase =>
  injected.selectSlice(state).payments[id] ?? 'idle';

/** The item open in this instance, or `null`. */
export const selectDisclosure = (state: RootState, id: string): string | null =>
  injected.selectSlice(state).disclosures[id] ?? null;

const BLANK_SHARE: ShareState = { presenting: false, qrFailed: false };

export const selectCopy = (state: RootState, id: string): 'copied' | 'failed' | null =>
  injected.selectSlice(state).copies[id] ?? null;

export const selectShare = (state: RootState, id: string): ShareState =>
  injected.selectSlice(state).shares[id] ?? BLANK_SHARE;

export const selectRegenerating = (state: RootState, id: string): boolean =>
  injected.selectSlice(state).regenerating[id] ?? false;

/** What an inline name shows: the draft, while it is still about this value. */
export const selectNameShown = (state: RootState, id: string, value: string): string => {
  const draft = injected.selectSlice(state).names[id];
  return draft && draft.base === value ? draft.text : value;
};
