// The people screens' state: the directory's search box and what is open on it, each
// person's page, the position editors, and the CSV import. docs/REDUX-PLAN.md §6.10
// (R-708, DEC-R03). The people themselves are the cache's (`getPeople`, `getPerson`).
//
// Every command is a thunk over the RTK Query mutation, and every one of them re-reads what
// it changed through the tags: a position change moves POWERS, which are resolved on the
// server across the whole catalogue, so nothing here guesses the new state (34, 57).
import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type {
  AccountInvite,
  CreateAssignmentBody,
  CreatePersonBody,
  ImportPeopleBody,
  ImportPreview,
  ImportRow,
  PersonSummary,
} from '@endur/shared';
import { signedOut } from '../authSlice.js';
import { peopleApi, type ImportResult } from '../api/endpoints/people.js';
import { accountsApi } from '../api/endpoints/accounts.js';
import { rootReducer, type RootState } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

/** Which command an error came from, so the screen says which one did not happen. */
export type PeopleCommand =
  | 'add' | 'rename' | 'email' | 'remove' | 'assign' | 'unassign' | 'invite' | 'reset' | 'revoke';

export const FAILED: Record<PeopleCommand, string> = {
  add: 'That person could not be added.',
  rename: 'That name could not be saved.',
  email: 'That address could not be saved.',
  remove: 'That person could not be removed.',
  assign: 'That position could not be added.',
  unassign: 'That position could not be removed.',
  invite: 'That link could not be created.',
  reset: 'That link could not be created.',
  revoke: 'That account could not be revoked.',
};

export type Failure = { error: SerializedApiError; during: PeopleCommand };

export type PersonDraft = { name: string; email: string };

/** The directory page. */
export type PeopleList = {
  /** The search box as typed; `null` until typed, when it shows the URL's `q`. */
  searchDraft: string | null;
  /** The add-person dialog, while open. */
  adding: { draft: PersonDraft; saving: boolean; error: SerializedApiError | null } | null;
  /** The person whose removal is being confirmed. */
  removingId: string | null;
  /** The row whose position editor is open. */
  assigningId: string | null;
  assignBusy: boolean;
  /** The row a command failed on. */
  rowError: ({ id: string } & Failure) | null;
  /** The person a sign-in link is being made for, and the link once made. */
  invitingId: string | null;
  invite: { personId: string; data: AccountInvite } | null;
  importing: boolean;
};

/** One person's page (`/app/people/:id`). */
export type PersonPage = {
  assigning: boolean;
  assignBusy: boolean;
  assignError: SerializedApiError | null;
  editingEmail: boolean;
  /** The identity card's error: a rename, an address, or a position removed. */
  failure: Failure | null;
  /** The position whose removal is being confirmed. */
  unassigning: { edgeId: string; label: string } | null;
  accountBusy: boolean;
  accountFailure: Failure | null;
  invite: AccountInvite | null;
  confirmingRevoke: boolean;
};

export type PositionDraft = { roleId: string; unitId: string; isPrimary: boolean };

export type ImportStep = 'pick' | 'reading' | 'review' | 'committing' | 'done';

export type ImportState = {
  step: ImportStep;
  csv: string;
  preview: ImportPreview | null;
  error: SerializedApiError | null;
  /** What could not be read before the server was asked (a file the browser refused). */
  readError: string | null;
  roleMapping: Record<string, string>;
  unitMapping: Record<string, string>;
  result: ImportResult | null;
};

export type PeopleScreenState = {
  list: PeopleList;
  pages: Record<string, PersonPage>;
  /** Position editors on screen, by instance id. */
  positionDrafts: Record<string, PositionDraft>;
  import: ImportState | null;
};

const freshList = (): PeopleList => ({
  searchDraft: null,
  adding: null,
  removingId: null,
  assigningId: null,
  assignBusy: false,
  rowError: null,
  invitingId: null,
  invite: null,
  importing: false,
});

export const BLANK_PERSON_PAGE: PersonPage = {
  assigning: false,
  assignBusy: false,
  assignError: null,
  editingEmail: false,
  failure: null,
  unassigning: null,
  accountBusy: false,
  accountFailure: null,
  invite: null,
  confirmingRevoke: false,
};

const freshImport = (): ImportState => ({
  step: 'pick',
  csv: '',
  preview: null,
  error: null,
  readError: null,
  roleMapping: {},
  unitMapping: {},
  result: null,
});

const initialState: PeopleScreenState = {
  list: freshList(),
  pages: {},
  positionDrafts: {},
  import: null,
};

const pageOf = (state: PeopleScreenState, personId: string): PersonPage =>
  (state.pages[personId] ??= { ...BLANK_PERSON_PAGE });

type From = 'list' | 'page';

/** The failure goes where the press was: the row on the list, or the person's page. */
function failed(state: PeopleScreenState, from: From, personId: string, failure: Failure | null): void {
  if (!failure) return;
  if (from === 'list') state.list.rowError = { id: personId, ...failure };
  else pageOf(state, personId).failure = failure;
}

const rejection = (error: unknown) => asStoreError(error);

// ---------------------------------------------------------------- commands

/** Adds a person. Straight into the position editor after, for whoever may assign one. */
export const personAdded = createScreenThunk(
  'people/personAdded',
  async ({ body }: { body: CreatePersonBody; thenAssign: boolean }, { dispatch, rejectWithValue }) => {
    try {
      const created: PersonSummary = await dispatch(peopleApi.endpoints.createPerson.initiate(body)).unwrap();
      return created;
    } catch (error) {
      return rejectWithValue(rejection(error));
    }
  },
  { condition: (_, { getState }) => !selectPeopleList(getState()).adding?.saving },
);

export const personRenamed = createScreenThunk(
  'people/personRenamed',
  async ({ personId, name }: { personId: string; name: string; from: From }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(peopleApi.endpoints.updatePerson.initiate({ id: personId, body: { name } })).unwrap();
      return { personId };
    } catch (error) {
      return rejectWithValue(rejection(error));
    }
  },
);

/** The ONE place an address changes (47): behind `person.update`, with an audit row. */
export const personEmailChanged = createScreenThunk(
  'people/personEmailChanged',
  async ({ personId, email }: { personId: string; email: string }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(peopleApi.endpoints.updatePerson.initiate({ id: personId, body: { email } })).unwrap();
      return { personId };
    } catch (error) {
      return rejectWithValue(rejection(error));
    }
  },
);

export const personRemoved = createScreenThunk(
  'people/personRemoved',
  async ({ personId }: { personId: string }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(peopleApi.endpoints.deletePerson.initiate(personId)).unwrap();
      return { personId };
    } catch (error) {
      return rejectWithValue(rejection(error));
    }
  },
);

/**
 * Gives somebody a position. NOT optimistic: INV-012 can refuse it (`403 WOULD_ESCALATE`)
 * even for a caller holding `assignment.create`, and a chip that appeared then vanished
 * would read as a bug rather than as the rule it is.
 */
export const positionAdded = createScreenThunk(
  'people/positionAdded',
  async (
    { personId, body }: { personId: string; body: CreateAssignmentBody; from: From },
    { dispatch, rejectWithValue },
  ) => {
    try {
      await dispatch(peopleApi.endpoints.assignPerson.initiate({ id: personId, body })).unwrap();
      return { personId };
    } catch (error) {
      return rejectWithValue(rejection(error));
    }
  },
);

export const positionRemoved = createScreenThunk(
  'people/positionRemoved',
  async (
    { personId, edgeId }: { personId: string; edgeId: string; from: From },
    { dispatch, rejectWithValue },
  ) => {
    try {
      await dispatch(peopleApi.endpoints.unassignPerson.initiate({ id: personId, edgeId })).unwrap();
      return { personId };
    } catch (error) {
      return rejectWithValue(rejection(error));
    }
  },
);

/** A sign-in link: the first one (`invite`), or a fresh one that kills the last (`reset`). */
export const accountLinkMade = createScreenThunk(
  'people/accountLinkMade',
  async (
    { personId, mode }: { personId: string; mode: 'invite' | 'reset'; from: From },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const endpoint = mode === 'invite' ? accountsApi.endpoints.inviteAccount : accountsApi.endpoints.resetAccount;
      const invite: AccountInvite = await dispatch(endpoint.initiate(personId)).unwrap();
      return invite;
    } catch (error) {
      return rejectWithValue(rejection(error));
    }
  },
);

export const accountRevoked = createScreenThunk(
  'people/accountRevoked',
  async ({ personId }: { personId: string }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(accountsApi.endpoints.revokeAccount.initiate(personId)).unwrap();
      return { personId };
    } catch (error) {
      return rejectWithValue(rejection(error));
    }
  },
);

// ---------------------------------------------------------------- the CSV import

/** A file's text, through `FileReader`: what every browser the product supports has. */
const readText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
    reader.readAsText(file);
  });

/**
 * Reads the picked file and asks the server what it would do. The `File` is the thunk's
 * argument and never enters the store (it is not serialisable; RTK leaves `meta.arg`
 * unchecked): only its text does.
 */
export const importFileRead = createScreenThunk(
  'people/importFileRead',
  async (file: File, { dispatch, rejectWithValue }) => {
    let csv: string;
    try {
      csv = await readText(file);
    } catch {
      return rejectWithValue({ kind: 'network', status: 0, message: 'That file could not be read.' });
    }
    try {
      const preview: ImportPreview = await dispatch(peopleApi.endpoints.previewImport.initiate(csv)).unwrap();
      return { csv, preview };
    } catch (error) {
      return rejectWithValue(rejection(error));
    }
  },
);

/** One key per FILE, so committing the same file twice is one import (13 §7). */
export function importKey(csv: string): string {
  let hash = 0;
  for (let i = 0; i < csv.length; i += 1) {
    hash = (Math.imul(31, hash) + csv.charCodeAt(i)) | 0;
  }
  return `import-${csv.length}-${hash}`;
}

/** The rows the commit sends, by the header's column names (and their usual aliases). */
export function parseCsvRows(csv: string): ImportRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const columns = splitLine(lines[0] as string).map((column) => column.trim());
  const index = (...names: string[]) =>
    columns.findIndex((column) => names.includes(column.toLowerCase()));

  const nameAt = index('name', 'full name');
  const emailAt = index('email', 'email address', 'e-mail');
  const roleAt = index('role', 'title', 'position');
  const unitAt = index('unit', 'department', 'team', 'ward', 'property');
  const alsoAt = index('also in', 'also', 'second unit', 'additional unit', 'other unit');

  const rows: ImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line);
    const email = (cells[emailAt] ?? '').trim();
    const name = (cells[nameAt] ?? '').trim();
    if (!email || !name) continue;
    rows.push({
      name,
      email,
      ...(roleAt >= 0 && cells[roleAt]?.trim() ? { roleName: cells[roleAt].trim() } : {}),
      ...(unitAt >= 0 && cells[unitAt]?.trim() ? { unitName: cells[unitAt].trim() } : {}),
      ...(alsoAt >= 0 && cells[alsoAt]?.trim() ? { alsoUnitName: cells[alsoAt].trim() } : {}),
    });
  }
  return rows;
}

/** Splits one CSV line, honouring double quotes. */
function splitLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

/** Commits the file as reviewed, with the names it lacked mapped to roles and units. */
export const importCommitted = createScreenThunk(
  'people/importCommitted',
  async (_: void, { getState, dispatch, rejectWithValue }) => {
    const state = selectImport(getState());
    if (!state) throw new Error('The import is closed.');
    const body: ImportPeopleBody = {
      rows: parseCsvRows(state.csv),
      roleMapping: state.roleMapping,
      unitMapping: state.unitMapping,
    };
    try {
      const result: ImportResult = await dispatch(
        peopleApi.endpoints.importPeople.initiate({ body, key: importKey(state.csv) }),
      ).unwrap();
      return result;
    } catch (error) {
      return rejectWithValue(rejection(error));
    }
  },
  { condition: (_, { getState }) => selectImport(getState())?.step === 'review' },
);

// ---------------------------------------------------------------- the slice

export const peopleScreenSlice = createSlice({
  name: 'people',
  initialState,
  reducers: {
    // the directory
    peopleSearchTyped(state, action: PayloadAction<{ term: string }>) {
      state.list.searchDraft = action.payload.term;
    },
    addPersonOpened(state) {
      state.list.adding = { draft: { name: '', email: '' }, saving: false, error: null };
    },
    addPersonClosed(state) {
      state.list.adding = null;
    },
    addPersonEdited(state, action: PayloadAction<Partial<PersonDraft>>) {
      if (state.list.adding) Object.assign(state.list.adding.draft, action.payload);
    },
    removePersonAsked(state, action: PayloadAction<{ personId: string }>) {
      state.list.removingId = action.payload.personId;
    },
    removePersonDismissed(state) {
      state.list.removingId = null;
    },
    rowPositionOpened(state, action: PayloadAction<{ personId: string }>) {
      state.list.assigningId = action.payload.personId;
      state.list.rowError = null;
    },
    rowPositionClosed(state) {
      state.list.assigningId = null;
      state.list.rowError = null;
    },
    inviteLinkClosed(state) {
      state.list.invite = null;
    },
    importOpened(state) {
      state.list.importing = true;
      state.import = freshImport();
    },
    importClosed(state) {
      state.list.importing = false;
      state.import = null;
    },
    peopleListLeft(state) {
      state.list = freshList();
      state.import = null;
    },

    // one person's page
    pagePositionOpened(state, action: PayloadAction<{ personId: string }>) {
      const page = pageOf(state, action.payload.personId);
      page.assigning = true;
      page.assignError = null;
    },
    pagePositionClosed(state, action: PayloadAction<{ personId: string }>) {
      const page = pageOf(state, action.payload.personId);
      page.assigning = false;
      page.assignError = null;
    },
    emailEditOpened(state, action: PayloadAction<{ personId: string }>) {
      pageOf(state, action.payload.personId).editingEmail = true;
    },
    emailEditClosed(state, action: PayloadAction<{ personId: string }>) {
      pageOf(state, action.payload.personId).editingEmail = false;
    },
    unassignAsked(state, action: PayloadAction<{ personId: string; edgeId: string; label: string }>) {
      const { personId, edgeId, label } = action.payload;
      pageOf(state, personId).unassigning = { edgeId, label };
    },
    unassignDismissed(state, action: PayloadAction<{ personId: string }>) {
      pageOf(state, action.payload.personId).unassigning = null;
    },
    revokeAsked(state, action: PayloadAction<{ personId: string }>) {
      pageOf(state, action.payload.personId).confirmingRevoke = true;
    },
    revokeDismissed(state, action: PayloadAction<{ personId: string }>) {
      pageOf(state, action.payload.personId).confirmingRevoke = false;
    },
    pageInviteClosed(state, action: PayloadAction<{ personId: string }>) {
      pageOf(state, action.payload.personId).invite = null;
    },
    personPageLeft(state, action: PayloadAction<{ personId: string }>) {
      delete state.pages[action.payload.personId];
    },

    // position editors
    positionDraftEdited(state, action: PayloadAction<{ id: string; isPrimaryDefault: boolean } & Partial<PositionDraft>>) {
      const { id, isPrimaryDefault, ...patch } = action.payload;
      const draft = (state.positionDrafts[id] ??= { roleId: '', unitId: '', isPrimary: isPrimaryDefault });
      Object.assign(draft, patch);
    },
    positionEditorLeft(state, action: PayloadAction<{ id: string }>) {
      delete state.positionDrafts[action.payload.id];
    },

    // the import
    importRoleMapped(state, action: PayloadAction<{ name: string; roleId: string }>) {
      if (state.import) state.import.roleMapping[action.payload.name] = action.payload.roleId;
    },
    importUnitMapped(state, action: PayloadAction<{ name: string; unitId: string }>) {
      if (state.import) state.import.unitMapping[action.payload.name] = action.payload.unitId;
    },
    importRestarted(state) {
      if (state.import) state.import = freshImport();
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(personAdded.pending, (state) => {
        if (!state.list.adding) return;
        state.list.adding.saving = true;
        state.list.adding.error = null;
      })
      // Added: straight into the position editor for them (34 § Interactions). Creating
      // somebody grants them nothing, and a new row that can do nothing is half the job.
      .addCase(personAdded.fulfilled, (state, action) => {
        state.list.adding = null;
        if (action.meta.arg.thenAssign) state.list.assigningId = action.payload.id;
      })
      .addCase(personAdded.rejected, (state, action) => {
        if (!state.list.adding) return;
        state.list.adding.saving = false;
        state.list.adding.error = action.payload ?? null;
      })
      .addCase(personRenamed.pending, (state, action) => {
        if (action.meta.arg.from === 'list') state.list.rowError = null;
        else pageOf(state, action.meta.arg.personId).failure = null;
      })
      .addCase(personRenamed.rejected, (state, action) => {
        const { from, personId } = action.meta.arg;
        failed(state, from, personId, action.payload ? { error: action.payload, during: 'rename' } : null);
      })
      .addCase(personEmailChanged.pending, (state, action) => {
        const page = pageOf(state, action.meta.arg.personId);
        page.failure = null;
        page.editingEmail = false;
      })
      .addCase(personEmailChanged.rejected, (state, action) => {
        failed(state, 'page', action.meta.arg.personId, action.payload ? { error: action.payload, during: 'email' } : null);
      })
      .addCase(personRemoved.pending, (state) => {
        state.list.removingId = null;
        state.list.rowError = null;
      })
      .addCase(personRemoved.rejected, (state, action) => {
        failed(state, 'list', action.meta.arg.personId, action.payload ? { error: action.payload, during: 'remove' } : null);
      })
      .addCase(positionAdded.pending, (state, action) => {
        if (action.meta.arg.from === 'list') {
          state.list.assignBusy = true;
          state.list.rowError = null;
        } else {
          const page = pageOf(state, action.meta.arg.personId);
          page.assignBusy = true;
          page.assignError = null;
        }
      })
      .addCase(positionAdded.fulfilled, (state, action) => {
        if (action.meta.arg.from === 'list') {
          state.list.assignBusy = false;
          state.list.assigningId = null;
        } else {
          const page = pageOf(state, action.meta.arg.personId);
          page.assignBusy = false;
          page.assigning = false;
        }
      })
      .addCase(positionAdded.rejected, (state, action) => {
        if (action.meta.arg.from === 'list') {
          state.list.assignBusy = false;
          if (action.payload) state.list.rowError = { id: action.meta.arg.personId, error: action.payload, during: 'assign' };
        } else {
          const page = pageOf(state, action.meta.arg.personId);
          page.assignBusy = false;
          page.assignError = action.payload ?? null;
        }
      })
      .addCase(positionRemoved.pending, (state, action) => {
        if (action.meta.arg.from === 'list') {
          state.list.rowError = null;
        } else {
          const page = pageOf(state, action.meta.arg.personId);
          page.unassigning = null;
          page.failure = null;
        }
      })
      .addCase(positionRemoved.rejected, (state, action) => {
        const { from, personId } = action.meta.arg;
        failed(state, from, personId, action.payload ? { error: action.payload, during: 'unassign' } : null);
      })
      .addCase(accountLinkMade.pending, (state, action) => {
        const { from, personId } = action.meta.arg;
        if (from === 'list') {
          state.list.invitingId = personId;
          state.list.rowError = null;
        } else {
          const page = pageOf(state, personId);
          page.accountBusy = true;
          page.accountFailure = null;
        }
      })
      .addCase(accountLinkMade.fulfilled, (state, action) => {
        const { from, personId } = action.meta.arg;
        if (from === 'list') {
          state.list.invitingId = null;
          state.list.invite = { personId, data: action.payload };
        } else {
          const page = pageOf(state, personId);
          page.accountBusy = false;
          page.invite = action.payload;
        }
      })
      .addCase(accountLinkMade.rejected, (state, action) => {
        const { from, personId, mode } = action.meta.arg;
        const failure = action.payload ? { error: action.payload, during: mode } : null;
        if (from === 'list') {
          state.list.invitingId = null;
          failed(state, 'list', personId, failure);
        } else {
          const page = pageOf(state, personId);
          page.accountBusy = false;
          page.accountFailure = failure;
        }
      })
      .addCase(accountRevoked.pending, (state, action) => {
        const page = pageOf(state, action.meta.arg.personId);
        page.confirmingRevoke = false;
        page.accountBusy = true;
        page.accountFailure = null;
      })
      .addCase(accountRevoked.fulfilled, (state, action) => {
        pageOf(state, action.meta.arg.personId).accountBusy = false;
      })
      .addCase(accountRevoked.rejected, (state, action) => {
        const page = pageOf(state, action.meta.arg.personId);
        page.accountBusy = false;
        page.accountFailure = action.payload ? { error: action.payload, during: 'revoke' } : null;
      })
      .addCase(importFileRead.pending, (state) => {
        if (!state.import) return;
        state.import.step = 'reading';
        state.import.readError = null;
      })
      .addCase(importFileRead.fulfilled, (state, action) => {
        if (!state.import) return;
        state.import.step = 'review';
        state.import.csv = action.payload.csv;
        state.import.preview = action.payload.preview;
        state.import.error = null;
      })
      // Back to the picker, with the reason beside it rather than in a browser alert box.
      .addCase(importFileRead.rejected, (state, action) => {
        if (!state.import) return;
        state.import.step = 'pick';
        state.import.readError = action.payload?.message ?? 'That file could not be read.';
      })
      .addCase(importCommitted.pending, (state) => {
        if (!state.import) return;
        state.import.step = 'committing';
        state.import.error = null;
      })
      .addCase(importCommitted.fulfilled, (state, action) => {
        if (!state.import) return;
        state.import.step = 'done';
        state.import.result = action.payload;
      })
      .addCase(importCommitted.rejected, (state, action) => {
        if (!state.import) return;
        state.import.step = 'review';
        state.import.error = action.payload ?? null;
      })
      .addCase(signedOut, () => initialState);
  },
  selectors: {
    selectPeopleList: (state) => state.list,
    selectImport: (state) => state.import,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof peopleScreenSlice> {}
}

const injected = peopleScreenSlice.injectInto(rootReducer);

export const {
  peopleSearchTyped,
  addPersonOpened,
  addPersonClosed,
  addPersonEdited,
  removePersonAsked,
  removePersonDismissed,
  rowPositionOpened,
  rowPositionClosed,
  inviteLinkClosed,
  importOpened,
  importClosed,
  peopleListLeft,
  pagePositionOpened,
  pagePositionClosed,
  emailEditOpened,
  emailEditClosed,
  unassignAsked,
  unassignDismissed,
  revokeAsked,
  revokeDismissed,
  pageInviteClosed,
  personPageLeft,
  positionDraftEdited,
  positionEditorLeft,
  importRoleMapped,
  importUnitMapped,
  importRestarted,
} = peopleScreenSlice.actions;

export const { selectPeopleList, selectImport } = injected.selectors;

export const selectPersonPage = (state: RootState, personId: string): PersonPage =>
  injected.selectSlice(state).pages[personId] ?? BLANK_PERSON_PAGE;

export const selectPositionDraft = (state: RootState, id: string): PositionDraft | undefined =>
  injected.selectSlice(state).positionDrafts[id];
