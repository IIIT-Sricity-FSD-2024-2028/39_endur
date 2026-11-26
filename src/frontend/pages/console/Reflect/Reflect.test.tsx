import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Capability, GapView, ReflectionCycle, ReflectionForm } from '@endur/shared';
import { errorReply, renderWithProviders, stubApi, type StubReply } from '../../../test-utils.js';
import Reflect from './index.js';

const cycle: ReflectionCycle = {
  campaignId: 'c-1', campaignName: 'Autumn round', subjectId: 's-1', subjectName: 'North wing',
  status: 'due', endsAt: '2026-09-30', closed: false,
  reflectedAt: null, planId: null, planFinalisedAt: null,
};

const form: ReflectionForm = {
  campaignId: 'c-1', campaignName: 'Autumn round', subjectId: 's-1', subjectName: 'North wing',
  questions: [
    { id: 'q-1', kind: 'rating', text: 'How clear was it?',
      config: { kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Great' },
      required: true, position: 0 },
  ],
  answers: null,
};

const gap = (over: Partial<Omit<GapView, 'rows'>> & { rows?: GapView['rows'] } = {}): GapView => ({
  campaignId: 'c-1', campaignName: 'Autumn round', subjectId: 's-1', subjectName: 'North wing',
  reflectedAt: '2026-09-01T10:00:00.000Z',
  suppressed: false, threshold: 5, responseCount: 12,
  rows: [
    { questionId: 'q-1', text: 'How clear was it?', self: 5, received: 3, delta: 2, scaleMax: 5 },
  ],
  plan: null,
  ...over,
} as GapView);

/** A route's answer: the data, or (from `throws`) the failure the server sends. */
type Failure = { failure: StubReply };
const answer = (value: object): StubReply =>
  'failure' in value ? (value as Failure).failure : { body: { data: value } };

let cycles: ReflectionCycle[] | Failure;
let gapAnswer: GapView | Failure;
let posted: Array<{ path: string; body: unknown }>;

// The stub server (R-502): the real hooks and the real cache run above it. The writes are
// thunks over mutations (store/screens/reflect.ts), so they reach it too.
const server = () => stubApi({
  'GET /reflect': () => answer(cycles),
  'GET /reflect/c-1': { body: { data: form } },
  'GET /reflect/c-1/gap': () => answer(gapAnswer),
  'POST /reflect/*': (call) => {
    posted.push({ path: call.path, body: call.body });
    return { body: { data: { id: 'r-1' } } };
  },
});

const ALL: Capability[] = ['reflection.read', 'reflection.create', 'actionplan.create'];
const mount = (capabilities: Capability[] = ALL, path = '/app/reflect') =>
  renderWithProviders(<Reflect />, { capabilities, path });

const throws = (status: number, message: string, details?: Record<string, unknown>): Failure => ({
  failure: errorReply(status, 'REFUSED', message, details),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  server();
  cycles = [cycle];
  gapAnswer = throws(404, 'Not found');
  posted = [];
});

describe('/app/reflect', () => {
  it('renders the access screen on 403 and the upgrade card on 402 — never the other', async () => {
    cycles = throws(403, 'nope');
    const first = mount();
    expect(await screen.findByText(/do not have access/i)).toBeTruthy();
    expect(screen.queryByText(/Gold/)).toBeNull();
    first.unmount();

    cycles = throws(402, 'nope', { requiredTier: 'gold', currentTier: 'bronze' });
    mount();
    expect(await screen.findByText(/Gold — Improve/)).toBeTruthy();
    expect(screen.queryByText(/do not have access/i)).toBeNull();
  });

  it('opens the FORM while the gap is locked, and says why the order matters', async () => {
    mount(ALL, '/app/reflect?campaign=c-1');
    expect(await screen.findByText(/Your own assessment/)).toBeTruthy();
    expect(screen.getByText(/before you see anyone else/i)).toBeTruthy();
    expect(screen.getByText('How clear was it?')).toBeTruthy();
    expect(screen.getByRole('group', { name: /How clear was it/ })).toBeTruthy();
    expect(screen.getAllByRole('radio').length).toBe(5);
  });

  it('shows the gap straight after the assessment is recorded: the order is the server\'s', async () => {
    mount(ALL, '/app/reflect?campaign=c-1');
    await screen.findByText(/Your own assessment/);
    fireEvent.click(screen.getByRole('radio', { name: '4' }));
    gapAnswer = gap();
    fireEvent.click(screen.getByRole('button', { name: /record my assessment/i }));
    expect(await screen.findByText(/You rated yourself 2 higher than others did/)).toBeTruthy();
  });

  it('keeps the answers and says why when the assessment is refused', async () => {
    stubApi({
      'GET /reflect': () => answer(cycles),
      'GET /reflect/c-1': { body: { data: form } },
      'GET /reflect/c-1/gap': () => answer(gapAnswer),
      'POST /reflect/c-1': errorReply(409, 'CONFLICT', 'You have already recorded yours.'),
    });
    mount(ALL, '/app/reflect?campaign=c-1');
    await screen.findByText(/Your own assessment/);
    fireEvent.click(screen.getByRole('radio', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: /record my assessment/i }));
    expect((await screen.findByRole('alert')).textContent).toBe('You have already recorded yours.');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '4' }).checked).toBe(true);
  });

  it('submits the reflection to the campaign it is about', async () => {
    mount(ALL, '/app/reflect?campaign=c-1');
    await screen.findByText(/Your own assessment/);
    fireEvent.click(screen.getByRole('radio', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: /record my assessment/i }));

    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0]?.path).toBe('/reflect/c-1');
    expect(posted[0]?.body).toEqual({
      subjectId: 's-1',
      answers: [{ questionId: 'q-1', value: { kind: 'rating', n: 4 } }],
    });
  });

  it('shows the gap once it unlocks, and names no winner', async () => {
    gapAnswer = gap();
    mount(ALL, '/app/reflect?campaign=c-1');

    expect(await screen.findByText(/You rated yourself 2 higher than others did/)).toBeTruthy();
    expect(screen.queryByText(/blind spot is bad|poor|underperform/i)).toBeNull();
    for (const node of document.querySelectorAll('.gap-fill')) {
      expect(node.className).not.toMatch(/fill-(good|bad)/);
    }
  });

  it('suppresses the comparison below the threshold, keeping the reflection', async () => {
    gapAnswer = gap({ suppressed: true, responseCount: 3, rows: undefined });
    mount(ALL, '/app/reflect?campaign=c-1');

    expect(await screen.findByText(/Not enough responses yet/)).toBeTruthy();
    expect(screen.queryByText('How clear was it?')).toBeNull();
    expect(screen.getByText(/Your assessment, recorded/)).toBeTruthy();
  });

  it('renders a finalised plan read-only, with no way to edit it', async () => {
    gapAnswer = gap({
      plan: {
        id: 'p-1',
        items: [{ text: 'Publish slides before each session', status: 'open' }],
        finalisedAt: '2026-09-05T09:00:00.000Z',
        checkins: [],
      },
    });
    mount(ALL, '/app/reflect?campaign=c-1');

    expect(await screen.findByText(/Publish slides before each session/)).toBeTruthy();
    expect(screen.getByText(/cannot be edited/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /finalise|save plan/i })).toBeNull();
  });

  it('writes a plan: adds a line, saves only the lines with words in them', async () => {
    gapAnswer = gap();
    mount(ALL, '/app/reflect?campaign=c-1');
    const first = await screen.findByPlaceholderText('One thing you will change');
    fireEvent.change(first, { target: { value: 'Publish slides before each session' } });
    fireEvent.click(screen.getByRole('button', { name: /Add another/ }));
    expect(screen.getAllByPlaceholderText('One thing you will change')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));

    await waitFor(() => expect(posted.some((post) => post.path === '/reflect/c-1/plan')).toBe(true));
    expect(posted.find((post) => post.path === '/reflect/c-1/plan')?.body).toEqual({
      items: [{ text: 'Publish slides before each session', status: 'open' }],
    });
  });

  it('finalises a saved plan only once it is confirmed', async () => {
    gapAnswer = gap({
      plan: {
        id: 'p-1',
        items: [{ text: 'Publish slides before each session', status: 'open' }],
        finalisedAt: null,
        checkins: [],
      },
    });
    mount(ALL, '/app/reflect?campaign=c-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Finalise' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(posted).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Finalise' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Finalise' }));
    await waitFor(() => expect(posted.map((post) => post.path)).toEqual(['/reflect/plans/p-1/finalise']));
  });

  it('edits a saved plan from what was saved', async () => {
    gapAnswer = gap({
      plan: {
        id: 'p-1',
        items: [{ text: 'Publish slides', status: 'open' }],
        finalisedAt: null,
        checkins: [],
      },
    });
    mount(ALL, '/app/reflect?campaign=c-1');
    const line = await screen.findByDisplayValue('Publish slides');
    fireEvent.change(line, { target: { value: 'Publish slides a day early' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0]?.body).toEqual({ items: [{ text: 'Publish slides a day early', status: 'open' }] });
  });

  it('goes back to the list from a cycle', async () => {
    mount(ALL, '/app/reflect?campaign=c-1');
    await screen.findByText(/Your own assessment/);
    fireEvent.click(screen.getByRole('button', { name: /All cycles/ }));
    expect(await screen.findByRole('button', { name: 'Autumn round' })).toBeTruthy();
  });

  it('lists cycles with a status, and opens one', async () => {
    mount();
    const open = await screen.findByRole('button', { name: 'Autumn round' });
    expect(screen.getByText('Your turn')).toBeTruthy();
    fireEvent.click(open);
    expect(await screen.findByText(/Your own assessment/)).toBeTruthy();
  });
});
