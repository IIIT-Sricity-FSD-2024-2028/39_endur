import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { PublicCampaign, ResolvedLabels } from '@endur/shared';
import { ApiError } from '../../lib/api.js';
import Fill from './Fill.js';

const LABELS: ResolvedLabels = {
  unit: { one: 'Zblorn', many: 'Zblorns' },
  subject: { one: 'Quaxel', many: 'Quaxels' },
  respondent: { one: 'Frimble', many: 'Frimbles' },
  reviewee: { one: 'Vandor', many: 'Vandors' },
  campaign: { one: 'Plithe', many: 'Plithes' },
};

const CAMPAIGN: PublicCampaign = {
  campaignName: 'Mid-term feedback',
  organizationName: 'Northfield',
  labels: LABELS,
  anonymous: true,
  access: 'public',
  estimatedSeconds: 110,
  subjects: [{ id: 's1', name: 'Data Structures' }],
  questions: [
    {
      id: 'q1', kind: 'rating', text: 'How clear were the explanations?', required: true, position: 1,
      config: { kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Excellent' },
    },
    {
      id: 'q2', kind: 'yesno', text: 'Was the pace right?', required: true, position: 2,
      config: { kind: 'yesno' },
    },
    {
      id: 'q3', kind: 'text', text: 'What should change?', required: false, position: 3,
      config: { kind: 'text', multiline: true },
    },
  ],
};

const usePublicCampaign = vi.fn();
const submitResponse = vi.fn();
const markResponded = vi.fn();
let responded = false;

vi.mock('../../lib/respond.js', () => ({
  usePublicCampaign: (...args: unknown[]) => usePublicCampaign(...args) as unknown,
  submitResponse: (...args: unknown[]) => submitResponse(...args) as unknown,
  submitKey: (token: string) => `key-for-${token}`,
  hasResponded: () => responded,
  markResponded: (...args: unknown[]) => markResponded(...args) as unknown,
}));

const reload = vi.fn();
const ready = (over: Partial<PublicCampaign> = {}) => ({
  campaign: { ...CAMPAIGN, ...over }, loading: false, unavailable: false, gate: null,
  error: null, reload,
});

const gated = (kind: 'signIn' | 'notMember', organizationName = 'Northfield') => ({
  campaign: null, loading: false, unavailable: false, error: null, reload,
  gate: { kind, organizationName },
});

function DoneProbe(): JSX.Element {
  const state = useLocation().state as { responseCount?: number; subjectName?: string } | null;
  return <p>DONE {state?.responseCount} {state?.subjectName}</p>;
}

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/r/K4M9X2PQ']}>
      <Routes>
        <Route path="/r/:token" element={<Fill />} />
        <Route path="/r/:token/done" element={<DoneProbe />} />
      </Routes>
    </MemoryRouter>,
  );

const answerAll = (): void => {
  fireEvent.click(screen.getByRole('radio', { name: '4' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  responded = false;
  usePublicCampaign.mockReturnValue(ready());
  submitResponse.mockResolvedValue({ responseCount: 613 });
});

describe('the header tells them the cost before they scroll', () => {
  it('names the campaign, the subject and the honest number', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Mid-term feedback' })).toBeTruthy();
    expect(screen.getByText('Data Structures')).toBeTruthy();
    expect(screen.getByText('3 questions · about 2 minutes · anonymous')).toBeTruthy();
  });

  it('states anonymity twice — header and above submit (rule 6)', () => {
    mount();
    expect(screen.getByText(/· anonymous/)).toBeTruthy();
    expect(screen.getByText('Your answers are anonymous.')).toBeTruthy();
  });

  it('claims it nowhere when the campaign is not anonymous', () => {
    usePublicCampaign.mockReturnValue(ready({ anonymous: false }));
    mount();
    expect(screen.queryByText(/anonymous/)).toBeNull();
  });
});

describe('the progress bar counts questions, not scroll (rule 3)', () => {
  it('moves as questions are answered', () => {
    mount();
    const bar = screen.getByRole('progressbar', { name: 'Questions answered' });
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText('0/3')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: '4' }));
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('does not count a text box that was typed in and cleared', () => {
    mount();
    const box = screen.getByRole('textbox', { name: /What should change/ });
    fireEvent.change(box, { target: { value: 'more labs' } });
    expect(screen.getByText('1/3')).toBeTruthy();
    fireEvent.change(box, { target: { value: '' } });
    expect(screen.getByText('0/3')).toBeTruthy();
  });
});

describe('nothing is validated until Submit is pressed (rule 4, § Validation)', () => {
  it('shows no error and no count on an untouched form', () => {
    mount();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();
  });

  it('marks the gaps and counts them on the button, and sends nothing', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(submitResponse).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '2 questions left' })).toBeTruthy();
    expect(screen.getAllByText('Pick an answer to continue.')).toHaveLength(2);
  });

  it('clears the error the instant that question is answered', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    fireEvent.click(screen.getByRole('radio', { name: '4' }));

    expect(screen.getAllByText('Pick an answer to continue.')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '1 question left' })).toBeTruthy();
  });

  it('leaves the optional question alone', () => {
    mount();
    answerAll();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();
  });
});

describe('submitting', () => {
  it('sends only what was answered, with the fill\'s idempotency key', async () => {
    mount();
    answerAll();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(submitResponse).toHaveBeenCalledTimes(1));
    expect(submitResponse).toHaveBeenCalledWith(
      'K4M9X2PQ',
      {
        answers: [
          { questionId: 'q1', value: { kind: 'rating', n: 4 } },
          { questionId: 'q2', value: { kind: 'yesno', yes: true } },
        ],
        channel: 'link',
        // No `subjectId`, and that is right: the server resolves the single-subject case
        // itself. The client only names one when the reader had a choice to make.
      },
      'key-for-K4M9X2PQ',
    );
  });

  it('lands on the thank-you with the count the server just returned', async () => {
    mount();
    answerAll();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByText(/DONE 613 Data Structures/)).toBeTruthy());
    expect(markResponded).toHaveBeenCalledWith('K4M9X2PQ');
  });

  it('a double press submits once', async () => {
    let release: (value: unknown) => void = () => undefined;
    submitResponse.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    mount();
    answerAll();

    const button = screen.getByRole('button', { name: 'Submit' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(submitResponse).toHaveBeenCalledTimes(1);

    release({ responseCount: 613 });
    await waitFor(() => expect(screen.getByText(/DONE 613/)).toBeTruthy());
  });

  it('keeps every answer when the submit fails', async () => {
    submitResponse.mockRejectedValue(new Error('network'));
    mount();
    answerAll();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/still here/));
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '4' }).checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();
  });

  it('puts a server 422 under the question it is about', async () => {
    submitResponse.mockRejectedValue(new ApiError({
      code: 'VALIDATION_FAILED', status: 422, requestId: 'r1', message: 'no',
      details: { fields: [{ path: 'body.answers.1.value', message: 'That answer does not match the question' }] },
    }));
    mount();
    answerAll();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByText(/does not match the question/)).toBeTruthy());
    const card = screen.getByText(/does not match the question/).closest('fieldset');
    expect(within(card as HTMLElement).getByRole('radio', { name: 'Yes' })).toBeTruthy();
  });

  it('does not say "try again" when the answers already went through', async () => {
    submitResponse.mockRejectedValue(new ApiError({
      code: 'CONFLICT', status: 409, requestId: 'r1', message: 'key reused',
    }));
    mount();
    answerAll();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/already recorded/));
  });
});

describe('the campaign with more than one subject', () => {
  const TWO = ready({
    subjects: [{ id: 's1', name: 'Data Structures' }, { id: 's2', name: 'Thermodynamics' }],
  });

  it('asks which one, in the org\'s own word (INV-001)', () => {
    usePublicCampaign.mockReturnValue(TWO);
    mount();
    expect(screen.getByText(/Which Quaxel is this about\?/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Thermodynamics' })).toBeTruthy();
  });

  it('will not submit without it, and counts it as one of the gaps', () => {
    usePublicCampaign.mockReturnValue(TWO);
    mount();
    answerAll();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(submitResponse).not.toHaveBeenCalled();
    expect(screen.getByText('Choose one to continue.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '1 question left' })).toBeTruthy();
  });

  it('sends the chosen one', async () => {
    usePublicCampaign.mockReturnValue(TWO);
    mount();
    answerAll();
    fireEvent.click(screen.getByRole('radio', { name: 'Thermodynamics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(submitResponse).toHaveBeenCalledTimes(1));
    expect((submitResponse.mock.calls[0]?.[1] as { subjectId: string }).subjectId).toBe('s2');
  });

  it('does not ask when there is only one', () => {
    mount();
    expect(screen.queryByText(/is this about\?/)).toBeNull();
  });
});

describe('the dead ends — every one of them breaks the demo if missing', () => {
  it('shows one honest screen for the 404, naming all three things it could be', () => {
    usePublicCampaign.mockReturnValue({
      campaign: null, loading: false, unavailable: true, error: null, reload,
    });
    mount();
    expect(screen.getByRole('heading', { name: "This link isn't active" })).toBeTruthy();
    expect(screen.getByText(/may have closed.*not have opened yet.*code may be wrong/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('offers a retry for a failure that is worth retrying', () => {
    usePublicCampaign.mockReturnValue({
      campaign: null, loading: false, unavailable: false, error: new Error('offline'), reload,
    });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('remembers a phone that already answered, without asking the server', () => {
    responded = true;
    mount();
    expect(screen.getByRole('heading', { name: "You've already responded" })).toBeTruthy();
    expect(usePublicCampaign).toHaveBeenCalledWith(undefined);
  });

  it('shows one skeleton while it loads, not one per question', () => {
    usePublicCampaign.mockReturnValue({
      campaign: null, loading: true, unavailable: false, error: null, reload,
    });
    const { container } = mount();
    expect(container.querySelectorAll('.rf-skeleton')).toHaveLength(1);
  });
});

describe('the two access dead ends — DEC-037, 39 § States', () => {
  it('a stranger is told WHICH organisation, and offered a way in', () => {
    usePublicCampaign.mockReturnValue(gated('signIn', 'Northfield University'));
    mount();

    expect(screen.getByRole('heading', { name: 'Sign in to answer' })).toBeTruthy();
    expect(screen.getByText('Only people in Northfield University can answer this one.')).toBeTruthy();
  });

  it('the sign-in link carries `next`, so they come BACK to the form', () => {
    usePublicCampaign.mockReturnValue(gated('signIn'));
    mount();

    const link = screen.getByRole<HTMLAnchorElement>('link', { name: 'Sign in' });
    expect(link.getAttribute('href')).toBe('/login?next=%2Fr%2FK4M9X2PQ');
  });

  it('somebody signed in ELSEWHERE gets no action at all', () => {
    usePublicCampaign.mockReturnValue(gated('notMember', 'Northfield University'));
    mount();

    expect(screen.getByRole('heading', { name: "This isn't your organization's link" })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('a gate is NOT offered a retry — the button would always do the same thing', () => {
    usePublicCampaign.mockReturnValue(gated('signIn'));
    mount();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('a BAD TOKEN still lands on the plain dead end, never on a gate', () => {
    usePublicCampaign.mockReturnValue({
      campaign: null, loading: false, unavailable: true, gate: null, error: null, reload,
    });
    mount();

    expect(screen.getByRole('heading', { name: "This link isn't active" })).toBeTruthy();
    expect(screen.queryByText(/Only people in/)).toBeNull();
  });
});

describe('<AccessNotice> on the form itself', () => {
  it('a restricted campaign says participation is not private', () => {
    usePublicCampaign.mockReturnValue(
      ready({ access: 'organization', organizationName: 'Northfield University' }),
    );
    mount();

    expect(
      screen.getByText(
        'Your answers are anonymous. ' +
        'Northfield University will see that you responded, but not what you said.',
      ),
    ).toBeTruthy();
  });

  it('an open link says only what is true of it', () => {
    mount();
    expect(screen.getByText('Your answers are anonymous.')).toBeTruthy();
    expect(screen.queryByText(/will see that you responded/)).toBeNull();
  });
});
