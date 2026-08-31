// T-084 — /app/reflect. 44 § Acceptance, the page half.
//
// Short on purpose. The gates and the ordering constraint are the SERVER's and
// `test/improve.test.ts` owns them; what matters here is that the page renders what it is
// told rather than deciding anything, and that the copy does not turn a gap into a grade.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { Capability, GapView, ReflectionCycle, ReflectionForm } from '@endur/shared';
import { renderWithProviders } from '../../../test-utils.js';
import Reflect from './index.js';

const hoisted = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    details: Record<string, unknown>;
    constructor(status: number, message: string, details: Record<string, unknown> = {}) {
      super(message);
      this.status = status;
      this.details = details;
    }
  }
  return { ApiError };
});

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

/** `Omit<…, 'rows'>` because the suppressed fixture has to say `rows: undefined` EXPLICITLY
 *  — `exactOptionalPropertyTypes` is on, and that is the point of the fixture: the
 *  suppressed body carries no rows key at all. */
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

let cycles: ReflectionCycle[] | (() => never);
let gapAnswer: GapView | (() => never);
let posted: Array<{ path: string; body: unknown }>;

const apiGet = vi.fn((path: string) => {
  if (path.endsWith('/gap')) {
    if (typeof gapAnswer === 'function') return gapAnswer();
    return { data: gapAnswer };
  }
  if (path === '/reflect') {
    if (typeof cycles === 'function') return cycles();
    return { data: cycles };
  }
  if (path.startsWith('/reflect/')) return { data: form };
  throw new Error(`unmocked GET ${path}`);
});

vi.mock('../../../lib/api.js', () => ({
  apiGet: (p: string) => apiGet(p),
  apiPost: (p: string, b: unknown) => {
    posted.push({ path: p, body: b });
    return { data: { id: 'r-1' } };
  },
  apiPut: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(),
  ApiError: hoisted.ApiError,
}));

const ALL: Capability[] = ['reflection.read', 'reflection.create', 'actionplan.create'];
const mount = (capabilities: Capability[] = ALL, path = '/app/reflect') =>
  renderWithProviders(<Reflect />, { capabilities, path });

const throws = (status: number, message: string, details?: Record<string, unknown>) => () => {
  throw new hoisted.ApiError(status, message, details);
};

beforeEach(() => {
  vi.clearAllMocks();
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
    // The 404 on the gap is the ordering constraint, not a missing page.
    expect(await screen.findByText(/Your own assessment/)).toBeTruthy();
    expect(screen.getByText(/before you see anyone else/i)).toBeTruthy();
    // INV-008: the campaign's own question, through the shared input set.
    expect(screen.getByText('How clear was it?')).toBeTruthy();
    // A <fieldset> of real radios, which is what <QuestionInput> renders for a rating —
    // the same control the respondent saw, not a second implementation.
    expect(screen.getByRole('group', { name: /How clear was it/ })).toBeTruthy();
    expect(screen.getAllByRole('radio').length).toBe(5);
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
    // 44 § The gap view: a gap view that reads as an accusation guarantees the next
    // reflection is gamed. No grade, no status ramp on the bars.
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
    // Their own record is still theirs; it is the others' answers being withheld.
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

  it('lists cycles with a status, and opens one', async () => {
    mount();
    const open = await screen.findByRole('button', { name: 'Autumn round' });
    expect(screen.getByText('Your turn')).toBeTruthy();
    fireEvent.click(open);
    expect(await screen.findByText(/Your own assessment/)).toBeTruthy();
  });
});
