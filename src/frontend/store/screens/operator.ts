// The operator console's screens (`/ops`): signing in, the estate's search box and the
// Enterprise queue's writes, one organisation's page (plan override, suspension, support
// access, the message), and the log export. docs/REDUX-PLAN.md §6.10 (R-713, DEC-R03).
//
// The operator API is its own (`opsApi`, with its own error shape and its own session), so
// its thunks are typed with `SerializedOpsError`; otherwise they follow every other screen
// slice exactly. The operator's password follows DEC-014 as the customer's does: its box is
// uncontrolled and it is only ever a thunk's argument.
//
// Trace for "Change plan" on an organisation:
//   the PlanPicker → `orgTierPicked` → <ConfirmDialog> from `pendingTier` → Change plan →
//   `orgPlanSet(id)` → `opsEndpoints.setOrgPlan` → the organisation and the estate re-read
//   through their tags, and a toast says what changed.
import { createAsyncThunk, createSelector, createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { EnterpriseStatus, Tier } from '@endur/shared';
import type { LogFilter } from '../../lib/oplogs.js';
import { opsDownload, opsRequest } from '../../lib/ops.js';
import { opsSignedIn, opsSignedOut } from '../opsSlice.js';
import { toastShown } from '../uiSlice.js';
import { opsApi, serializeOpsError, type SerializedOpsError } from '../api/opsApi.js';
import { opsEndpoints } from '../api/endpoints/ops.js';
import { rootReducer, type AppDispatch, type RootState } from '../index.js';

export type { SerializedOpsError };

/** `createAsyncThunk` for the operator API: its rejection is the operator API's plain error. */
const createOpsThunk = createAsyncThunk.withTypes<{
  state: RootState;
  dispatch: AppDispatch;
  rejectValue: SerializedOpsError;
}>();

const asOpsError = (error: unknown): SerializedOpsError =>
  typeof error === 'object' && error !== null && 'kind' in error && 'status' in error
    ? (error as SerializedOpsError)
    : serializeOpsError(error);

/** The server's own words for an operator failure, or `fallback` when there was no answer. */
export function opsMessageOf(error: SerializedOpsError | null | undefined, fallback: string): string | null {
  if (!error) return null;
  return error.kind === 'ops' ? error.message : fallback;
}

/** The fewest characters a support reason may have; the server's DTO says the same. */
export const SUPPORT_REASON_MIN = 10;

export type OrgPage = {
  pendingTier: Tier | null;
  planBusy: boolean;
  suspendOpen: boolean;
  suspendConfirmText: string;
  suspendBusy: boolean;
  supportReason: string;
  supportBusy: boolean;
  message: { subject: string; body: string };
  messageSending: boolean;
  error: { during: 'plan' | 'suspend' | 'support' | 'message'; error: SerializedOpsError } | null;
};

export type LogExport = { name: string; lines: number; truncated: boolean };

export type OperatorScreenState = {
  login: { email: string; code: string; reveal: boolean; submitting: boolean; error: SerializedOpsError | null };
  estate: { term: string | null; queueBusyId: string | null; queueError: SerializedOpsError | null };
  orgs: Record<string, OrgPage>;
  logs: {
    /** The file being read; `null` until one is picked, when the error stream opens. */
    file: string | null;
    /** What narrows its lines. The export uses the same, so the file saved is what was read. */
    filter: LogFilter;
    format: 'ndjson' | 'csv';
    exporting: boolean;
    exportError: SerializedOpsError | null;
    last: LogExport | null;
  };
};

const blankLogin: OperatorScreenState['login'] = { email: '', code: '', reveal: false, submitting: false, error: null };
const blankLogs: OperatorScreenState['logs'] = {
  file: null,
  filter: {},
  format: 'ndjson',
  exporting: false,
  exportError: null,
  last: null,
};

const initialState: OperatorScreenState = {
  login: blankLogin,
  estate: { term: null, queueBusyId: null, queueError: null },
  orgs: {},
  logs: blankLogs,
};

const blankOrg = (): OrgPage => ({
  pendingTier: null,
  planBusy: false,
  suspendOpen: false,
  suspendConfirmText: '',
  suspendBusy: false,
  supportReason: '',
  supportBusy: false,
  message: { subject: '', body: '' },
  messageSending: false,
  error: null,
});

const orgOf = (state: OperatorScreenState, id: string): OrgPage => (state.orgs[id] ??= blankOrg());

/** The message failures' words, by what was being done. */
export const ORG_FAILED: Record<NonNullable<OrgPage['error']>['during'], string> = {
  plan: 'Could not change the plan.',
  suspend: 'Could not change suspension.',
  support: 'Could not open a support session.',
  message: 'Could not send the message.',
};

// ---- signing in

/**
 * Email, password and the authenticator code; then `/me`, which `opsSlice` takes. A 401
 * here is the ANSWER (those do not match), not an expired session, so the request does not
 * trip the sign-out handler.
 */
export const operatorSignedIn = createOpsThunk(
  'operator/operatorSignedIn',
  async (credentials: { email: string; password: string; code: string }, { dispatch, rejectWithValue }) => {
    try {
      await opsRequest('POST', '/auth/login', credentials, { suppress401Handler: true });
      const me = await dispatch(
        opsApi.endpoints.getOpsMe.initiate(undefined, { subscribe: false, forceRefetch: true }),
      ).unwrap();
      dispatch(opsSignedIn({ operator: me.operator, capabilities: me.capabilities }));
      return undefined;
    } catch (error) {
      return rejectWithValue(asOpsError(error));
    }
  },
  { condition: (_, { getState }) => !selectOperator(getState()).login.submitting },
);

/**
 * The operator shell's "Sign out". The server ends the session; locally it ends whatever the
 * answer, as the customer's sign-out does.
 */
export const operatorSignedOut = createAsyncThunk('operator/operatorSignedOut', async (_: void, { dispatch }) => {
  try {
    await opsRequest('POST', '/auth/logout');
  } catch {
    // Ended locally below regardless.
  }
  dispatch(opsSignedOut());
});

// ---- the estate's Enterprise queue

/**
 * Contacted, or closed. A refusal is KEPT and shown: these used to fail silently, and an
 * operator pressed Contacted and the row sat there.
 */
export const enterpriseRequestMoved = createOpsThunk(
  'operator/enterpriseRequestMoved',
  async ({ id, status }: { id: string; status: EnterpriseStatus }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(opsEndpoints.endpoints.updateEnterpriseRequest.initiate({ id, status })).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asOpsError(error));
    }
  },
  { condition: (_, { getState }) => selectOperator(getState()).estate.queueBusyId === null },
);

/** Approve: closes the request AND moves that organisation's plan. */
export const enterpriseRequestApproved = createOpsThunk(
  'operator/enterpriseRequestApproved',
  async (id: string, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(opsEndpoints.endpoints.approveEnterpriseRequest.initiate(id)).unwrap();
      return undefined;
    } catch (error) {
      return rejectWithValue(asOpsError(error));
    }
  },
  { condition: (_, { getState }) => selectOperator(getState()).estate.queueBusyId === null },
);

// ---- one organisation

const orgIdle = (state: RootState, id: string, flag: 'planBusy' | 'suspendBusy' | 'supportBusy' | 'messageSending') =>
  !selectOperator(state).orgs[id]?.[flag];

/** The confirmed plan override. */
export const orgPlanSet = createOpsThunk(
  'operator/orgPlanSet',
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    const tier = selectOperator(getState()).orgs[id]?.pendingTier;
    if (!tier) return undefined;
    try {
      await dispatch(opsEndpoints.endpoints.setOrgPlan.initiate({ id, tier })).unwrap();
      dispatch(toastShown({ message: `Plan set to ${tier}.` }));
      return undefined;
    } catch (error) {
      return rejectWithValue(asOpsError(error));
    }
  },
  { condition: (id, { getState }) => orgIdle(getState(), id, 'planBusy') },
);

/**
 * Suspend (after the organisation's name is typed) or reinstate. `suspended` is what the
 * page showed, so the request asks for the opposite of what the operator saw.
 */
export const orgSuspensionSet = createOpsThunk(
  'operator/orgSuspensionSet',
  async (
    { id, suspended, name }: { id: string; suspended: boolean; name: string },
    { dispatch, getState, rejectWithValue },
  ) => {
    if (!suspended && selectOperator(getState()).orgs[id]?.suspendConfirmText !== name) return undefined;
    try {
      await dispatch(opsEndpoints.endpoints.setOrgSuspended.initiate({ id, suspended: !suspended })).unwrap();
      dispatch(toastShown({ message: suspended ? 'Organization reinstated.' : 'Organization suspended.' }));
      return undefined;
    } catch (error) {
      return rejectWithValue(asOpsError(error));
    }
  },
  { condition: ({ id }, { getState }) => orgIdle(getState(), id, 'suspendBusy') },
);

/** Opens the organisation's console as a support session; the page goes where it says. */
export const supportSessionEntered = createOpsThunk(
  'operator/supportSessionEntered',
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    const reason = (selectOperator(getState()).orgs[id]?.supportReason ?? '').trim();
    try {
      const answer = await dispatch(opsEndpoints.endpoints.enterSupportSession.initiate({ id, reason })).unwrap();
      return answer.redirectTo;
    } catch (error) {
      return rejectWithValue(asOpsError(error));
    }
  },
  {
    condition: (id, { getState }) =>
      orgIdle(getState(), id, 'supportBusy') &&
      (selectOperator(getState()).orgs[id]?.supportReason.trim().length ?? 0) >= SUPPORT_REASON_MIN,
  },
);

/** The message to the administrators: into their Endur inbox, and the platform audit log. */
export const orgMessaged = createOpsThunk(
  'operator/orgMessaged',
  async (id: string, { dispatch, getState, rejectWithValue }) => {
    const message = selectOperator(getState()).orgs[id]?.message ?? { subject: '', body: '' };
    try {
      const { sentTo } = await dispatch(opsEndpoints.endpoints.messageOrg.initiate({
        id,
        subject: message.subject.trim(),
        body: message.body.trim(),
      })).unwrap();
      dispatch(toastShown({ message: `Sent to ${sentTo} administrator${sentTo === 1 ? '' : 's'}.` }));
      return undefined;
    } catch (error) {
      return rejectWithValue(asOpsError(error));
    }
  },
  {
    condition: (id, { getState }) => {
      const page = selectOperator(getState()).orgs[id];
      return !!page && !page.messageSending && page.message.subject.trim() !== '' && page.message.body.trim() !== '';
    },
  },
);

// ---- the log export

/** DEC-074: the same filters as the view, so the file on disk is what was on screen. */
export const logExported = createOpsThunk(
  'operator/logExported',
  async ({ file, search }: { file: string; search: string }, { getState, rejectWithValue }) => {
    const { format } = selectOperator(getState()).logs;
    const joiner = search ? '&' : '?';
    try {
      return await opsDownload(`/logs/${encodeURIComponent(file)}/export${search}${joiner}format=${format}`);
    } catch (error) {
      return rejectWithValue(asOpsError(error));
    }
  },
  { condition: (_, { getState }) => !selectOperator(getState()).logs.exporting },
);

export const operatorScreenSlice = createSlice({
  name: 'operator',
  initialState,
  reducers: {
    operatorLoginEdited(state, action: PayloadAction<{ email?: string; code?: string }>) {
      if (action.payload.email !== undefined) state.login.email = action.payload.email;
      if (action.payload.code !== undefined) state.login.code = action.payload.code;
    },
    operatorRevealToggled(state) {
      state.login.reveal = !state.login.reveal;
    },
    operatorLoginLeft(state) {
      state.login = blankLogin;
    },

    /** The estate's search box: what is typed, until Enter or leaving the box sends it. */
    estateSearchTyped(state, action: PayloadAction<{ term: string }>) {
      state.estate.term = action.payload.term;
    },
    estateLeft(state) {
      state.estate = initialState.estate;
    },

    orgTierPicked(state, action: PayloadAction<{ id: string; tier: Tier | null }>) {
      orgOf(state, action.payload.id).pendingTier = action.payload.tier;
    },
    orgSuspendAsked(state, action: PayloadAction<{ id: string }>) {
      orgOf(state, action.payload.id).suspendOpen = true;
    },
    orgSuspendNameTyped(state, action: PayloadAction<{ id: string; text: string }>) {
      orgOf(state, action.payload.id).suspendConfirmText = action.payload.text;
    },
    orgSuspendDismissed(state, action: PayloadAction<{ id: string }>) {
      const page = orgOf(state, action.payload.id);
      page.suspendOpen = false;
      page.suspendConfirmText = '';
    },
    supportReasonTyped(state, action: PayloadAction<{ id: string; reason: string }>) {
      orgOf(state, action.payload.id).supportReason = action.payload.reason;
    },
    orgMessageEdited(state, action: PayloadAction<{ id: string; subject?: string; body?: string }>) {
      const { message } = orgOf(state, action.payload.id);
      if (action.payload.subject !== undefined) message.subject = action.payload.subject;
      if (action.payload.body !== undefined) message.body = action.payload.body;
    },
    orgPageLeft(state, action: PayloadAction<{ id: string }>) {
      delete state.orgs[action.payload.id];
    },

    /** Another file: its own lines, so the last file's filters go with it. */
    logFileChosen(state, action: PayloadAction<{ file: string }>) {
      state.logs.file = action.payload.file;
      state.logs.filter = {};
      state.logs.last = null;
      state.logs.exportError = null;
    },
    logFilterChanged(state, action: PayloadAction<LogFilter>) {
      const next: LogFilter = {};
      for (const [key, value] of Object.entries(action.payload) as [keyof LogFilter, LogFilter[keyof LogFilter]][]) {
        if (value !== undefined && value !== '' && !(typeof value === 'number' && Number.isNaN(value))) {
          (next as Record<string, unknown>)[key] = value;
        }
      }
      state.logs.filter = next;
    },
    logFiltersCleared(state) {
      state.logs.filter = {};
    },
    logFormatChosen(state, action: PayloadAction<{ format: 'ndjson' | 'csv' }>) {
      state.logs.format = action.payload.format;
    },
    /** The export's progress goes; the file and filters stay, so Back returns to them. */
    logsLeft(state) {
      state.logs = { ...blankLogs, file: state.logs.file, filter: state.logs.filter, format: state.logs.format };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(operatorSignedIn.pending, (state) => {
        state.login.submitting = true;
        state.login.error = null;
      })
      .addCase(operatorSignedIn.fulfilled, (state) => {
        state.login = blankLogin;
      })
      .addCase(operatorSignedIn.rejected, (state, action) => {
        state.login.submitting = false;
        state.login.error = action.payload ?? null;
      })

      .addCase(orgPlanSet.pending, (state, action) => {
        const page = orgOf(state, action.meta.arg);
        page.planBusy = true;
        page.error = null;
      })
      .addCase(orgPlanSet.fulfilled, (state, action) => {
        const page = orgOf(state, action.meta.arg);
        page.planBusy = false;
        page.pendingTier = null;
      })
      .addCase(orgPlanSet.rejected, (state, action) => {
        const page = orgOf(state, action.meta.arg);
        page.planBusy = false;
        if (action.payload) page.error = { during: 'plan', error: action.payload };
      })
      .addCase(orgSuspensionSet.pending, (state, action) => {
        const page = orgOf(state, action.meta.arg.id);
        page.suspendBusy = true;
        page.error = null;
      })
      .addCase(orgSuspensionSet.fulfilled, (state, action) => {
        const page = orgOf(state, action.meta.arg.id);
        page.suspendBusy = false;
        page.suspendOpen = false;
        page.suspendConfirmText = '';
      })
      .addCase(orgSuspensionSet.rejected, (state, action) => {
        const page = orgOf(state, action.meta.arg.id);
        page.suspendBusy = false;
        if (action.payload) page.error = { during: 'suspend', error: action.payload };
      })
      .addCase(supportSessionEntered.pending, (state, action) => {
        const page = orgOf(state, action.meta.arg);
        page.supportBusy = true;
        page.error = null;
      })
      // Still "Opening…" until the browser has gone.
      .addCase(supportSessionEntered.rejected, (state, action) => {
        const page = orgOf(state, action.meta.arg);
        page.supportBusy = false;
        if (action.payload) page.error = { during: 'support', error: action.payload };
      })
      .addCase(orgMessaged.pending, (state, action) => {
        const page = orgOf(state, action.meta.arg);
        page.messageSending = true;
        page.error = null;
      })
      // Sent: the composer is emptied, so the same words are not sent twice by accident.
      .addCase(orgMessaged.fulfilled, (state, action) => {
        const page = orgOf(state, action.meta.arg);
        page.messageSending = false;
        page.message = { subject: '', body: '' };
      })
      .addCase(orgMessaged.rejected, (state, action) => {
        const page = orgOf(state, action.meta.arg);
        page.messageSending = false;
        if (action.payload) page.error = { during: 'message', error: action.payload };
      })

      .addCase(logExported.pending, (state) => {
        state.logs.exporting = true;
        state.logs.exportError = null;
      })
      .addCase(logExported.fulfilled, (state, action) => {
        state.logs.exporting = false;
        state.logs.last = action.payload;
      })
      .addCase(logExported.rejected, (state, action) => {
        state.logs.exporting = false;
        state.logs.exportError = action.payload ?? null;
      })
      // Everything but the sign-in form: a boot that answers "nobody is signed in" late must
      // not wipe an address being typed (as `entry` does for the customer's sign-in).
      .addCase(opsSignedOut, (state) => ({ ...initialState, login: state.login }));

    // The queue's two writes share one busy row and one failure line.
    for (const thunk of [enterpriseRequestMoved, enterpriseRequestApproved]) {
      builder
        .addCase(thunk.pending, (state, action) => {
          const arg = action.meta.arg as string | { id: string };
          state.estate.queueBusyId = typeof arg === 'string' ? arg : arg.id;
          state.estate.queueError = null;
        })
        .addCase(thunk.fulfilled, (state) => {
          state.estate.queueBusyId = null;
        })
        .addCase(thunk.rejected, (state, action) => {
          state.estate.queueBusyId = null;
          state.estate.queueError = action.payload ?? null;
        });
    }
  },
  selectors: {
    selectOperator: (state) => state,
    selectOrgPage: (state, id: string): OrgPage => state.orgs[id] ?? BLANK_ORG,
  },
});

const BLANK_ORG = blankOrg();

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof operatorScreenSlice> {}
}

const injected = operatorScreenSlice.injectInto(rootReducer);

export const {
  operatorLoginEdited,
  operatorRevealToggled,
  operatorLoginLeft,
  estateSearchTyped,
  estateLeft,
  orgTierPicked,
  orgSuspendAsked,
  orgSuspendNameTyped,
  orgSuspendDismissed,
  supportReasonTyped,
  orgMessageEdited,
  orgPageLeft,
  logFileChosen,
  logFilterChanged,
  logFiltersCleared,
  logFormatChosen,
  logsLeft,
} = operatorScreenSlice.actions;

export const { selectOperator, selectOrgPage } = injected.selectors;

/**
 * The file on screen: the one picked, or, before any is, the newest ERROR stream (the
 * reason somebody opens logs), else the first file. Worked out here, from the cached list,
 * rather than by an effect that writes a default somewhere.
 */
export const selectLogFile = createSelector(
  [
    (state: RootState) => selectOperator(state).logs.file,
    (state: RootState) => opsEndpoints.endpoints.getLogFiles.select()(state).data?.data,
  ],
  (picked, files): string | null => {
    if (picked) return picked;
    if (!files || files.length === 0) return null;
    return (files.find((file) => file.stream === 'error') ?? files[0])?.name ?? null;
  },
);

/** Whether any filter narrows the lines (the empty state then offers to clear them). */
export const selectLogFiltered = createSelector(
  [(state: RootState) => selectOperator(state).logs.filter],
  (filter) => Object.keys(filter).length > 0,
);
