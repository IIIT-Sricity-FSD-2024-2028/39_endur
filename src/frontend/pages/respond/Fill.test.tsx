// T-039 — /r/:token, the hero screen. 39, design_specs/design/07 §7.1–§7.4.
//
// The most load-bearing assertion in this file is the mount itself: **there is no Redux
// <Provider> anywhere below**. The respond world mounts no store (39 § State), so a page
// that reached for `useLabels()` would throw here — which is what makes "the vocabulary
// comes from the payload" a property rather than an intention.
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
  campaign: { ...CAMPAIGN, ...over }, loading: false, unavailable: false, error: null, reload,
});

/** Reads back what the form handed the thank-you page, since that is the only carrier. */
function DoneProbe(): JSX.Element {
  const state = useLocation().state as { responseCount?: number; subjectName?: string } | null;
  return <p>DONE {state?.responseCount} {state?.subjectName}</p>;
}

const mount = () =>
  render(
    // No <Provider>. That is the test.
    <MemoryRouter initialEntries={['/r/K4M9X2PQ']}>
      <Routes>
        <Route path="/r/:token" element={<Fill />} />
        <Route path="/r/:token/done" element={<DoneProbe />} />
      </Routes>
    </MemoryRouter>,
  );

/** Answer both required questions. */
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
    // Rule 1. The estimate is computed from question types server-side, never typed.
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
    // Inline red as you go is hostile on a form somebody is filling in as a favour.
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
    // A form that demanded the free-text answer would be a form most people abandon at the
    // last question.
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
        // q3 was never touched and is absent — not sent as an empty string.
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

    // Carried, not refetched: the count is not in PublicCampaign at all (13 §6).
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
    // A duplicate response corrupts the demo's numbers in front of the evaluator, and the
    // idempotency key only covers the retry a button cannot.
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
    // 39 § States: answers preserved, retry available. Somebody who has just filled in eight
    // questions will not do it twice.
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

    // The index is into what WE sent — q3 was skipped, so index 1 is q2, not q3. Server-side
    // validation is authoritative (14 §4) and arrives in the same shape as any other 422.
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

    // A conflict on this fill's own key means the first attempt landed and its reply was
    // lost on the way back. Telling them to press again would produce a second response.
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
    // Neither 39 nor design_specs/design/07 draws this; the server 422s on body.subjectId
    // without it, so the form has to ask.
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
    // Asking somebody to pick from a list of one is noise, and the server resolves it.
    expect(screen.queryByText(/is this about\?/)).toBeNull();
  });
});

describe('the dead ends — every one of them breaks the demo if missing', () => {
  it('shows one honest screen for the 404, naming all three things it could be', () => {
    usePublicCampaign.mockReturnValue({
      campaign: null, loading: false, unavailable: true, error: null, reload,
    });
    mount();
    // CONF-015: the server returns the SAME 404 for a wrong token, a campaign that has not
    // opened and one that has closed, because a difference between them is an existence
    // oracle. "This link doesn't work" would be a lie in two of the three cases.
    expect(screen.getByRole('heading', { name: "This link isn't active" })).toBeTruthy();
    expect(screen.getByText(/may have closed.*not have opened yet.*code may be wrong/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('offers a retry for a failure that is worth retrying', () => {
    usePublicCampaign.mockReturnValue({
      campaign: null, loading: false, unavailable: false, error: new Error('offline'), reload,
    });
    mount();
    // A phone on a venue network is the stated risk of this page. Rendering that as "this
    // link isn't active" would send somebody away from a form that is fine.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('remembers a phone that already answered, without asking the server', () => {
    responded = true;
    mount();
    expect(screen.getByRole('heading', { name: "You've already responded" })).toBeTruthy();
    // Best-effort (39 § State), and it costs no round trip: the answer is already local.
    expect(usePublicCampaign).toHaveBeenCalledWith(undefined);
  });

  it('shows one skeleton while it loads, not one per question', () => {
    usePublicCampaign.mockReturnValue({
      campaign: null, loading: true, unavailable: false, error: null, reload,
    });
    const { container } = mount();
    // The form arrives in a single payload, so there is no moment where part of it is
    // known — a per-question skeleton would be an animation pretending to be progress.
    expect(container.querySelectorAll('.rf-skeleton')).toHaveLength(1);
  });
});
