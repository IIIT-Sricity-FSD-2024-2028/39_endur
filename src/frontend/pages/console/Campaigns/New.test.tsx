// T-038 — /app/campaigns/new. 38 § Interactions, 06 §6.2.
//
// The path that ends at the QR. Two things are load-bearing and both are asserted below:
// **launching produces exactly one token** no matter how the button is pressed, and **the
// share sheet appears with no intermediate success page** in between.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Capability, Page, SubjectSummary, TemplateSummary, UnitNode } from '@endur/shared';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import { ApiError } from '../../../lib/api.js';
import New from './New.js';

vi.mock('qrcode', () => ({
  default: { toCanvas: vi.fn().mockResolvedValue(undefined), toDataURL: vi.fn().mockResolvedValue('data:,') },
}));

const TEMPLATES: TemplateSummary[] = [
  {
    id: 't1', name: 'Mid-term form', category: 'Teaching', description: null, industry: 'university',
    questionCount: 8, estimatedSeconds: 110, campaignCount: 0, isLibrary: false,
    clonedFromId: null, createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const SUBJECTS: SubjectSummary[] = [
  {
    id: 's1', name: 'Data Structures', type: 'general', unitId: 'u1', unitName: 'Engineering',
    linkedUserId: null, linkedUserName: null, activeCampaigns: 0, totalResponses: 0,
    lastResponseAt: null, archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 's2', name: 'Thermodynamics', type: 'general', unitId: 'u1', unitName: 'Engineering',
    linkedUserId: null, linkedUserName: null, activeCampaigns: 0, totalResponses: 0,
    lastResponseAt: null, archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
  },
];

/** Reassignable so one test can shrink the tree to a single person — see the agreement
 *  test at the end of step 2. The mock factory reads the binding on each call. */
let UNITS: UnitNode[] = [{
  id: 'u1', name: 'Engineering', parentId: null, isTemporary: false, endsAt: null,
  peopleCount: 40, subjectCount: 2,
  children: [{
    id: 'u2', name: 'Physics', parentId: 'u1', isTemporary: false, endsAt: null,
    peopleCount: 15, subjectCount: 0, children: [],
  }],
}];

const page = <T,>(rows: T[]): Page<T> => ({
  data: rows, page: { nextCursor: null, hasMore: false }, meta: { total: rows.length },
});

const create = vi.fn();
const launchCampaign = vi.fn();

vi.mock('../../../lib/campaigns.js', () => ({
  launchKey: (id: string) => `key-for-${id}`,
  launchCampaign: (...args: unknown[]) => launchCampaign(...args) as unknown,
  campaignSearch: () => '',
  useCampaignList: () => ({ data: null, loading: false, error: null, reload: vi.fn(), create }),
  useCampaign: () => ({ data: null, loading: false, error: null }),
  useAudiencePreview: () => ({ data: null, loading: false, error: null }),
}));
vi.mock('../../../lib/templates.js', () => ({
  useTemplates: () => ({ data: page(TEMPLATES), loading: false, error: null }),
  useTemplate: () => ({ data: null, loading: false, error: null }),
  useTemplateLibrary: () => ({ data: null, loading: false, error: null }),
  cloneKey: (id: string) => id,
}));
vi.mock('../../../lib/subjects.js', () => ({
  useSubjectList: () => ({ data: page(SUBJECTS), loading: false, error: null }),
  useSubject: () => ({ data: null, loading: false, error: null }),
  subjectSearch: () => '',
}));
vi.mock('../../../lib/units.js', () => ({
  useUnits: () => ({ data: UNITS, loading: false, error: null }),
}));

const ALL: Capability[] = ['campaign.create', 'campaign.launch'];

const mount = () =>
  renderWithProviders(
    <Routes>
      <Route path="/app/campaigns/new" element={<New />} />
      <Route path="/app/campaigns/:id" element={<p>DETAIL</p>} />
    </Routes>,
    { capabilities: ALL, labels: NONSENSE_LABELS, path: '/app/campaigns/new' },
  );

/** Walk to step 3 with a form and one subject chosen. */
const toStepThree = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /Mid-term form/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Data Structures/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({
    id: 'c9', name: 'Mid-term form — August 2026', status: 'draft',
    templateId: 't1', templateName: 'Mid-term form', subjectCount: 1, responseCount: 0,
    anonymous: true, startsAt: null, endsAt: null, closedAt: null,
    publicToken: null, url: null, createdAt: '2026-08-19T00:00:00.000Z',
    audience: { kind: 'anyone' }, subjects: [],
  });
  launchCampaign.mockResolvedValue({
    publicToken: 'K4M9X2PQ', url: 'https://feedback.example.test/r/K4M9X2PQ', status: 'open',
  });
});

describe('step 1 — the form, and one less typing beat', () => {
  it('auto-fills the campaign name from the form', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Mid-term form/ }));
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: /Name this plithe/ }).value)
      .toMatch(/^Mid-term form — /);
  });

  it('does not overwrite a name somebody typed', () => {
    mount();
    fireEvent.change(screen.getByRole('textbox', { name: /Name this plithe/ }), {
      target: { value: 'My own name' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Mid-term form/ }));
    // Overwriting something typed is the kind of small theft that makes a form hostile.
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: /Name this plithe/ }).value)
      .toBe('My own name');
  });

  it('will not continue without a form', () => {
    mount();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' }).disabled).toBe(true);
  });
});

describe('step 2 — two different questions', () => {
  it('asks what is reviewed and who may answer, in the org\'s own words', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Mid-term form/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('What is being reviewed?')).toBeTruthy();
    expect(screen.getByText('Who can respond?')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Everyone in a zblorn/ })).toBeTruthy();
  });

  it('defaults to "anyone with the link", which is the demo path', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Mid-term form/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    // Respondents never log in (DEC-009).
    expect(screen.getByRole<HTMLInputElement>('radio', { name: /Anyone with the link/ }).checked).toBe(true);
  });

  it('will not continue with nothing selected to review', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Mid-term form/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' }).disabled).toBe(true);
  });

  it('AGREES with the count — "1 frimble", not "1 frimbles"', () => {
    // This line passed `labels.respondent.many` as BOTH forms until T-044, so a one-person
    // unit read "About 1 frimbles can respond." The two forms are stored rather than
    // derived precisely so a screen can get this right (22 §2, §5).
    const whole = UNITS;
    UNITS = [{
      id: 'u9', name: 'Solo', parentId: null, isTemporary: false, endsAt: null,
      peopleCount: 1, subjectCount: 0, children: [],
    }];
    try {
      mount();
      fireEvent.click(screen.getByRole('button', { name: /Mid-term form/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      fireEvent.click(screen.getByRole('radio', { name: /Everyone in a zblorn/ }));
      expect(screen.getByText(/About 1 frimble can respond/)).toBeTruthy();
    } finally {
      UNITS = whole;
    }
  });

  it('counts the audience from the org graph when a unit is chosen', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Mid-term form/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('radio', { name: /Everyone in a zblorn/ }));
    // 40 in Engineering plus 15 in Physics: the number moving is the visible proof the
    // hierarchy is wired up rather than decorative.
    expect(screen.getByText(/About 55 frimbles/)).toBeTruthy();
  });
});

describe('step 3 — the summary, then the irreversible button', () => {
  it('restates everything before the launch', () => {
    mount();
    toStepThree();
    expect(screen.getByText(/Mid-term form · 8 questions · ~110 sec · 1 Quaxel/)).toBeTruthy();
    expect(screen.getByText(/Opens as soon as you launch, runs until you close it · anonymous/)).toBeTruthy();
  });

  it('uses the org\'s own word on the button, never "Submit" or "Finish"', () => {
    mount();
    toStepThree();
    expect(screen.getByRole('button', { name: 'Launch plithe' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Submit|Finish/ })).toBeNull();
  });

  it('refuses a window that closes before it opens', () => {
    mount();
    toStepThree();
    fireEvent.change(screen.getByLabelText('Opens'), { target: { value: '2026-09-10T09:00' } });
    fireEvent.change(screen.getByLabelText('Closes'), { target: { value: '2026-09-01T09:00' } });
    expect(screen.getByRole('alert').textContent).toMatch(/after Opens/);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Launch plithe' }).disabled).toBe(true);
  });

  it('creates then launches, and lands straight on the QR with no success page between', async () => {
    mount();
    toStepThree();
    fireEvent.click(screen.getByRole('button', { name: 'Launch plithe' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: /Share/ })).toBeTruthy());
    expect(create).toHaveBeenCalledTimes(1);
    expect(launchCampaign).toHaveBeenCalledWith('c9', 'key-for-c9');
    const sheet = within(screen.getByRole('dialog', { name: /Share/ }));
    expect(sheet.getByText('feedback.example.test/r/K4M9X2PQ')).toBeTruthy();
  });

  it('a double-clicked launch creates ONE campaign', async () => {
    let release: (value: unknown) => void = () => undefined;
    create.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    mount();
    toStepThree();

    const button = screen.getByRole('button', { name: 'Launch plithe' });
    fireEvent.click(button);
    fireEvent.click(button);
    // The QR already on screen would otherwise point at a campaign nobody is looking at.
    expect(create).toHaveBeenCalledTimes(1);

    release({ id: 'c9', name: 'x', anonymous: true, endsAt: null });
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Share/ })).toBeTruthy());
  });

  it('keeps the draft when the launch fails, and mints nothing', async () => {
    // A real ApiError, not a bare Error: only a server message is fit to show a reader.
    // Anything else falls back to one sentence, which is the convention across every page —
    // "Cannot read properties of undefined" is not an error message for a person.
    create.mockRejectedValue(new ApiError({
      code: 'CONFLICT', status: 409, requestId: 'r1',
      message: 'The dates overlap something.',
    }));
    mount();
    toStepThree();
    fireEvent.click(screen.getByRole('button', { name: 'Launch plithe' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/dates overlap/));
    // 38 § States: the draft is preserved and no token is minted. The reader fixes it and
    // presses again rather than starting over.
    expect(launchCampaign).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Launch plithe' })).toBeTruthy();
    expect(screen.getByText(/Mid-term form · 8 questions/)).toBeTruthy();
  });
});
