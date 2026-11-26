// The campaign screens' slice on its own: initial state, every action, and the lifetime
// rule (docs/REDUX-PLAN.md §6.10). The dialog's behaviour on screen is QuickDialog.test.tsx.
import { describe, expect, it } from 'vitest';
import { signedOut } from '../authSlice.js';
import {
  accessChosen,
  anonymityChosen,
  audienceChosen,
  autoName,
  campaignNameEdited,
  campaignWizardLeft,
  closesAtEdited,
  draftBody,
  formPicked,
  launchAttempted,
  libraryFormCopied,
  opensAtEdited,
  stepsReady,
  subjectToggled,
  wizardStepChanged,
  campaignListLeft,
  campaignsScreenSlice,
  quickBody,
  quickClosingTimeEdited,
  quickDialogClosed,
  quickDialogOpened,
  quickNameEdited,
  quickOptionAdded,
  quickOptionEdited,
  quickOptionRemoved,
  quickReady,
  quickSubmitAttempted,
  shareSheetClosed,
  shareSheetOpened,
  type CampaignsScreenState,
} from './campaigns.js';

const reduce = campaignsScreenSlice.reducer;
const initial = reduce(undefined, { type: '@@init' });
const HOUR = 60 * 60 * 1000;
const local = (ms: number): string => {
  const date = new Date(ms);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const opened = (): CampaignsScreenState => reduce(initial, quickDialogOpened('poll'));

describe('campaigns screen slice', () => {
  it('starts with nothing open', () => {
    expect(initial.quick).toBeNull();
    expect(initial.sharingId).toBeNull();
    expect(initial.wizard).toMatchObject({
      step: 0, templateId: '', name: '', subjectIds: [], audience: { kind: 'anyone' },
      startsAt: '', endsAt: '', anonymous: true, access: 'public', copied: null,
      sending: false, error: null, launched: null,
    });
  });

  it('opens a fresh dialog every time, stamped with when it opened', () => {
    const before = Date.now();
    const state = reduce(
      { ...initial, quick: { ...opened().quick!, name: 'left over' } },
      quickDialogOpened('suggestion'),
    );
    expect(state.quick).toMatchObject({
      purpose: 'suggestion', name: '', options: ['', ''], endsAt: '', sending: false, error: null,
    });
    expect(state.quick!.judgedAt).toBeGreaterThanOrEqual(before);
  });

  it('records the name, the options and the closing time as typed', () => {
    let state = opened();
    state = reduce(state, quickNameEdited({ name: 'Lunch?' }));
    state = reduce(state, quickOptionEdited({ index: 1, value: 'Pizza' }));
    state = reduce(state, quickOptionEdited({ index: 7, value: 'nowhere' }));
    state = reduce(state, quickClosingTimeEdited('2099-01-01T10:00'));
    expect(state.quick).toMatchObject({
      name: 'Lunch?', options: ['', 'Pizza'], endsAt: '2099-01-01T10:00',
    });
  });

  it('keeps between two and ten options', () => {
    let state = opened();
    state = reduce(state, quickOptionRemoved({ index: 0 }));
    expect(state.quick!.options).toHaveLength(2);
    for (let index = 0; index < 12; index += 1) state = reduce(state, quickOptionAdded());
    expect(state.quick!.options).toHaveLength(10);
    state = reduce(state, quickOptionEdited({ index: 4, value: 'five' }));
    state = reduce(state, quickOptionRemoved({ index: 3 }));
    expect(state.quick!.options).toHaveLength(9);
    expect(state.quick!.options[3]).toBe('five');
  });

  it('judges the closing time again on the press', () => {
    let state = opened();
    state = reduce(state, { type: quickSubmitAttempted.type, payload: { at: 123 } });
    expect(state.quick!.judgedAt).toBe(123);
  });

  it('is ready with a name, two options and no closing time gone by', () => {
    let state = opened();
    expect(quickReady(state.quick!)).toBe(false);
    state = reduce(state, quickNameEdited({ name: 'Lunch?' }));
    state = reduce(state, quickOptionEdited({ index: 0, value: 'Pizza' }));
    expect(quickReady(state.quick!)).toBe(false);
    state = reduce(state, quickOptionEdited({ index: 1, value: 'Rice' }));
    expect(quickReady(state.quick!)).toBe(true);
    state = reduce(state, quickClosingTimeEdited(local(Date.now() - HOUR)));
    expect(quickReady(state.quick!)).toBe(false);
    state = reduce(state, quickClosingTimeEdited(local(Date.now() + HOUR)));
    expect(quickReady(state.quick!)).toBe(true);
  });

  it('sends only what was filled in', () => {
    let state = reduce(initial, quickDialogOpened('poll'));
    state = reduce(state, quickNameEdited({ name: '  Lunch?  ' }));
    state = reduce(state, quickOptionAdded());
    state = reduce(state, quickOptionEdited({ index: 0, value: ' Pizza ' }));
    state = reduce(state, quickOptionEdited({ index: 2, value: 'Rice' }));
    expect(quickBody(state.quick!)).toEqual({ purpose: 'poll', name: 'Lunch?', options: ['Pizza', 'Rice'] });
  });

  it('opens and closes the share sheet by id', () => {
    const state = reduce(initial, shareSheetOpened({ campaignId: 'c1' }));
    expect(state.sharingId).toBe('c1');
    expect(reduce(state, shareSheetClosed()).sharingId).toBeNull();
  });

  it('forgets everything when the dialog closes, the page is left, or the session ends', () => {
    const busy = reduce(reduce(opened(), shareSheetOpened({ campaignId: 'c1' })), quickNameEdited({ name: 'x' }));
    expect(reduce(busy, quickDialogClosed()).quick).toBeNull();
    expect(reduce(busy, campaignListLeft())).toEqual(initial);
    expect(reduce(busy, signedOut())).toEqual(initial);
  });

  it('ignores edits when no dialog is open', () => {
    expect(reduce(initial, quickNameEdited({ name: 'x' }))).toEqual(initial);
    expect(reduce(initial, quickOptionAdded())).toEqual(initial);
    expect(reduce(initial, quickClosingTimeEdited('2099-01-01T10:00'))).toEqual(initial);
  });
});

describe('the campaign wizard', () => {
  it('names the campaign after the form, unless a name was typed', () => {
    let state = reduce(initial, formPicked('t1', 'Mid-term'));
    expect(state.wizard).toMatchObject({ templateId: 't1', name: autoName('Mid-term') });
    state = reduce(state, campaignNameEdited({ name: 'Mine' }));
    state = reduce(state, formPicked('t2', 'Other'));
    expect(state.wizard).toMatchObject({ templateId: 't2', name: 'Mine' });
  });

  it('toggles subjects, and records audience, access, window and anonymity', () => {
    let state = reduce(initial, subjectToggled({ subjectId: 's1' }));
    state = reduce(state, subjectToggled({ subjectId: 's2' }));
    state = reduce(state, subjectToggled({ subjectId: 's1' }));
    state = reduce(state, audienceChosen({ audience: { kind: 'unit', unitId: 'u1', includeSubtree: true } }));
    state = reduce(state, accessChosen({ access: 'organization' }));
    state = reduce(state, opensAtEdited({ value: '2099-01-01T09:00' }));
    state = reduce(state, closesAtEdited('2099-01-02T09:00'));
    state = reduce(state, anonymityChosen({ anonymous: false }));
    expect(state.wizard).toMatchObject({
      subjectIds: ['s2'],
      audience: { kind: 'unit', unitId: 'u1', includeSubtree: true },
      access: 'organization', startsAt: '2099-01-01T09:00', endsAt: '2099-01-02T09:00',
      anonymous: false,
    });
  });

  it('moves between the three steps only, judging Closes afresh on arrival', () => {
    let state = reduce(initial, wizardStepChanged(2));
    expect(state.wizard.step).toBe(2);
    expect(state.wizard.judgedAt).toBeGreaterThan(0);
    expect(reduce(state, wizardStepChanged(5)).wizard.step).toBe(2);
    expect(reduce(state, wizardStepChanged(-1)).wizard.step).toBe(0);
    state = reduce(state, { type: launchAttempted.type, payload: { at: 42 } });
    expect(state.wizard.judgedAt).toBe(42);
  });

  it('is ready step by step, and refuses a window out of order or already closed', () => {
    let state = reduce(initial, wizardStepChanged(2));
    expect(stepsReady(state.wizard)).toEqual([false, false, true]);
    state = reduce(state, formPicked('t1', 'Mid-term'));
    state = reduce(state, subjectToggled({ subjectId: 's1' }));
    expect(stepsReady(state.wizard)).toEqual([true, true, true]);
    state = reduce(state, opensAtEdited({ value: local(Date.now() + 3 * HOUR) }));
    state = reduce(state, closesAtEdited(local(Date.now() + 2 * HOUR)));
    expect(stepsReady(state.wizard)[2]).toBe(false);
    state = reduce(state, opensAtEdited({ value: '' }));
    state = reduce(state, closesAtEdited(local(Date.now() - HOUR)));
    expect(stepsReady(state.wizard)[2]).toBe(false);
  });

  it('sends the trimmed name, the copy it was given, and only the dates that were set', () => {
    let state = reduce(initial, formPicked('lib1', 'Pulse'));
    state = reduce(state, campaignNameEdited({ name: '  Pulse  ' }));
    state = reduce(state, subjectToggled({ subjectId: 's1' }));
    const body = draftBody(state.wizard, 'copy-1');
    expect(body).toEqual({
      name: 'Pulse', templateId: 'copy-1', subjectIds: ['s1'], audience: { kind: 'anyone' },
      anonymous: true, access: 'public',
    });
  });

  it('remembers the library copy, so a retried launch does not copy twice', () => {
    const state = reduce(initial, libraryFormCopied({ from: 'lib1', id: 'copy-1' }));
    expect(state.wizard.copied).toEqual({ from: 'lib1', id: 'copy-1' });
  });

  it('starts from nothing once the wizard is left, or the session ends', () => {
    let state = reduce(initial, formPicked('t1', 'Mid-term'));
    state = reduce(state, wizardStepChanged(1));
    expect(reduce(state, campaignWizardLeft()).wizard).toEqual(initial.wizard);
    expect(reduce(state, signedOut()).wizard).toEqual(initial.wizard);
    // Leaving the list does not touch a wizard in progress elsewhere.
    expect(reduce(state, campaignListLeft()).wizard.templateId).toBe('t1');
  });
});
