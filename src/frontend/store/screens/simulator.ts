// The permission simulator: the sentence being filled in, the run, and the last five
// answers. docs/REDUX-PLAN.md §6.10 (R-711, DEC-R03); 42 § State.
//
// The history is the SESSION's, as its heading says ("Earlier this session"): it survives
// leaving the page and coming back, and goes on sign-out. The sentence itself starts afresh
// each visit. Every value is plain data: the date stays the input's string here and becomes
// a `Date` only in the request.
//
// Trace for "Test":
//   the button → `simulationRun` (below) → `simulatorApi.simulate`, which is the server's
//   `resolve()` itself → `simulationRun.fulfilled` puts the decision at the top of `history`,
//   and the page draws `history[0]` as the verdict.
import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { Capability, DecisionView, SimulateTarget } from '@endur/shared';
import { signedOut } from '../authSlice.js';
import { simulatorApi } from '../api/endpoints/simulator.js';
import { rootReducer } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

export type TargetKind = SimulateTarget['kind'];
export type PickedPerson = { userId: string; name: string };
/** The two person pickers in the sentence: who tries, and who it is tried on. */
export type PickerSlot = 'principal' | 'target';

/** A question as asked: plain data, the date as the input gave it. */
export type SimulationQuery = {
  principalUserId: string;
  capability: Capability;
  target: SimulateTarget;
  /** `yyyy-mm-dd`, or absent for "now". */
  at?: string;
};

export type SimulationRecord = {
  id: string;
  query: SimulationQuery;
  principalName: string;
  targetLabel: string;
  capabilityLabel: string;
  decision: DecisionView;
};

export type SimulatorForm = {
  principal: PickedPerson | null;
  capability: Capability | '';
  targetKind: TargetKind;
  targetUnitId: string;
  targetPerson: PickedPerson | null;
  targetSubjectId: string;
  targetCampaignId: string;
  subjectTerm: string;
  at: string;
  /** What is typed into each person picker. */
  terms: Record<PickerSlot, string>;
};

export type SimulatorScreenState = {
  form: SimulatorForm;
  running: boolean;
  error: SerializedApiError | null;
  /** Most recent first, at most five (42 § State). */
  history: SimulationRecord[];
};

const HISTORY = 5;

const blankForm: SimulatorForm = {
  principal: null,
  capability: '',
  targetKind: 'org',
  targetUnitId: '',
  targetPerson: null,
  targetSubjectId: '',
  targetCampaignId: '',
  subjectTerm: '',
  at: '',
  terms: { principal: '', target: '' },
};

const initialState: SimulatorScreenState = { form: blankForm, running: false, error: null, history: [] };

/**
 * "Test". The labels are what the page showed for the person, the target and the action,
 * kept with the answer so the history reads as the sentence that was asked.
 */
export const simulationRun = createScreenThunk(
  'simulator/simulationRun',
  async (
    { query }: { query: SimulationQuery; labels: Omit<SimulationRecord, 'id' | 'query' | 'decision'> },
    { dispatch, rejectWithValue },
  ) => {
    try {
      return await dispatch(simulatorApi.endpoints.simulate.initiate({
        principalUserId: query.principalUserId,
        capability: query.capability,
        target: query.target,
        at: query.at ? new Date(query.at) : undefined,
      })).unwrap();
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (_, { getState }) => !selectSimulator(getState()).running },
);

export const simulatorScreenSlice = createSlice({
  name: 'simulator',
  initialState,
  reducers: {
    /** A person picked, or `null` for "change". The picker's search is emptied either way. */
    personPicked(state, action: PayloadAction<{ slot: PickerSlot; person: PickedPerson | null }>) {
      const { slot, person } = action.payload;
      if (slot === 'principal') state.form.principal = person;
      else state.form.targetPerson = person;
      state.form.terms[slot] = '';
    },
    personSearched(state, action: PayloadAction<{ slot: PickerSlot; term: string }>) {
      state.form.terms[action.payload.slot] = action.payload.term;
    },
    capabilityChosen(state, action: PayloadAction<{ capability: Capability | '' }>) {
      state.form.capability = action.payload.capability;
    },
    /** A different kind of target: whatever was chosen for the last kind no longer applies. */
    targetKindChosen(state, action: PayloadAction<{ kind: TargetKind }>) {
      state.form.targetKind = action.payload.kind;
      state.form.targetUnitId = '';
      state.form.targetPerson = null;
      state.form.targetSubjectId = '';
      state.form.targetCampaignId = '';
      state.form.terms.target = '';
    },
    targetChosen(
      state,
      action: PayloadAction<{ field: 'targetUnitId' | 'targetSubjectId' | 'targetCampaignId'; id: string }>,
    ) {
      state.form[action.payload.field] = action.payload.id;
    },
    subjectSearched(state, action: PayloadAction<{ term: string }>) {
      state.form.subjectTerm = action.payload.term;
    },
    simulationDateChosen(state, action: PayloadAction<{ at: string }>) {
      state.form.at = action.payload.at;
    },
    /** The sentence starts afresh next visit; the history is the session's and stays. */
    simulatorLeft(state) {
      state.form = blankForm;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(simulationRun.pending, (state) => {
        state.running = true;
        state.error = null;
      })
      .addCase(simulationRun.fulfilled, (state, action) => {
        state.running = false;
        const { query, labels } = action.meta.arg;
        state.history = [
          { id: action.meta.requestId, query, ...labels, decision: action.payload },
          ...state.history,
        ].slice(0, HISTORY);
      })
      .addCase(simulationRun.rejected, (state, action) => {
        state.running = false;
        state.error = action.payload ?? null;
      })
      .addCase(signedOut, () => initialState);
  },
  selectors: {
    selectSimulator: (state) => state,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof simulatorScreenSlice> {}
}

const injected = simulatorScreenSlice.injectInto(rootReducer);

export const {
  personPicked,
  personSearched,
  capabilityChosen,
  targetKindChosen,
  targetChosen,
  subjectSearched,
  simulationDateChosen,
  simulatorLeft,
} = simulatorScreenSlice.actions;

export const { selectSimulator } = injected.selectors;
