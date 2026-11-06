// Past feedback on Home: the members-only forms the reader has answered. The real hooks and the
// real RTK Query cache over a stubbed `fetch`, so answering a waiting card is seen to move it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AnsweredForm, PublicCampaign, ResolvedLabels, WaitingForm } from '@endur/shared';
import { NONSENSE_LABELS, renderWithProviders, stubApi } from '../../../test-utils.js';
import { useAnswered, useWaiting } from '../../../lib/waiting.js';
import { Answered, SHOWN } from './Answered.js';
import { Waiting } from './Waiting.js';

const past = (campaignId: string, name: string, over: Partial<AnsweredForm> = {}): AnsweredForm => ({
  campaignId,
  name,
  about: 'Algebra',
  status: 'closed',
  closedAt: '2026-10-12T10:00:00.000Z',
  endsAt: null,
  ...over,
});

/** Home's wiring for the two cards, as `Home/index.tsx` has it. */
function Harness(): JSX.Element {
  const waiting = useWaiting();
  const answered = useAnswered();
  return (
    <>
      <Waiting rows={waiting.rows} orgName="Northfield" />
      <Answered rows={answered.rows} orgName="Northfield" caughtUp={waiting.rows.length === 0} />
    </>
  );
}

const card = () => screen.getByRole('region', { name: /Your past feedback/ });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('past feedback on Home', () => {
  it('is absent until something has been answered', async () => {
    const calls = stubApi({
      'GET /home/waiting': { body: { data: [] } },
      'GET /home/answered': { body: { data: [] } },
    });
    renderWithProviders(<Harness />, { labels: NONSENSE_LABELS });
    await waitFor(() => expect(calls.some((call) => call.path === '/home/answered')).toBe(true));
    expect(screen.queryByText('Your past feedback')).toBeNull();
  });

  it('lists each answered form, what it was about, and whether it is still open', async () => {
    stubApi({
      'GET /home/waiting': { body: { data: [] } },
      'GET /home/answered': { body: { data: [
        past('c1', 'Mid-term check', { status: 'open', closedAt: null, endsAt: '2026-11-20T10:00:00.000Z' }),
        past('c2', 'Facilities pulse', { about: null, status: 'open', closedAt: null }),
        past('c3', 'Spring check'),
      ] } },
    });
    renderWithProviders(<Harness />, { labels: NONSENSE_LABELS });

    expect(await screen.findByText('Mid-term check')).toBeTruthy();
    const rows = within(card()).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/Mid-term check.*Algebra · open until .*2026.*Open/),
      expect.stringMatching(/Facilities pulse.*still open.*Open/),
      expect.stringMatching(/Spring check.*Algebra · closed .*2026.*Closed/),
    ]);
    // It says why the answers themselves are not there, and with nothing waiting, says that too.
    expect(within(card()).getByText(/Nothing is waiting for your answer right now/)).toBeTruthy();
    expect(within(card()).getByText(/never what you said/)).toBeTruthy();
  });

  it('shows the latest few, and the rest on request', async () => {
    const many = Array.from({ length: SHOWN + 3 }, (_, index) => past(`c${index}`, `Form ${index}`));
    stubApi({
      'GET /home/waiting': { body: { data: [] } },
      'GET /home/answered': { body: { data: many } },
    });
    renderWithProviders(<Harness />, { labels: NONSENSE_LABELS });

    expect(await screen.findByText('Form 0')).toBeTruthy();
    expect(within(card()).getAllByRole('listitem')).toHaveLength(SHOWN);
    fireEvent.click(screen.getByRole('button', { name: `Show all ${SHOWN + 3}` }));
    expect(within(card()).getAllByRole('listitem')).toHaveLength(SHOWN + 3);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(within(card()).getAllByRole('listitem')).toHaveLength(SHOWN);
  });

  it('a form answered on Home moves from waiting to past feedback, with no reload', async () => {
    const waiting: WaitingForm = {
      campaignId: 'c1', token: 'TOKc1', name: 'Spring check', about: 'Algebra',
      questionCount: 1, estimatedSeconds: 30, endsAt: null,
    };
    const form: PublicCampaign = {
      campaignName: 'Spring check',
      organizationName: 'Northfield',
      labels: NONSENSE_LABELS as ResolvedLabels,
      anonymous: true,
      access: 'organization',
      estimatedSeconds: 30,
      subjects: [{ id: 's1', name: 'Algebra' }],
      questions: [
        { id: 'q1', kind: 'yesno', text: 'Was the pace right?', required: true, position: 1, config: { kind: 'yesno' } },
      ],
    };
    let answered = false;
    stubApi({
      'GET /home/waiting': () => ({ body: { data: answered ? [] : [waiting] } }),
      'GET /home/answered': () => ({
        body: { data: answered ? [past('c1', 'Spring check', { status: 'open', closedAt: null })] : [] },
      }),
      'GET /public/campaigns/TOKc1': { body: { data: form } },
      'POST /public/campaigns/TOKc1/responses': () => {
        answered = true;
        return { status: 201, body: { data: { ok: true, responseCount: 3 } } };
      },
    });
    renderWithProviders(<Harness />, { labels: NONSENSE_LABELS });

    fireEvent.click(await screen.findByRole('button', { name: 'Answer “Spring check”' }));
    expect(screen.queryByText('Your past feedback')).toBeNull();
    fireEvent.click(await screen.findByRole('radio', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.queryByText('Waiting for your answer')).toBeNull());
    expect(await screen.findByRole('region', { name: /Your past feedback/ })).toBeTruthy();
    expect(within(card()).getByText('Spring check')).toBeTruthy();
  });
});
