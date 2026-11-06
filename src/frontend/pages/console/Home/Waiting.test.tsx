// Forms waiting for the reader's answer, answered on Home: the real hooks and the real RTK
// Query cache over a stubbed `fetch`. The list is `/home/waiting`; the form and the submit
// are the respondent routes, the same two the `/r/…` link uses.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { PublicCampaign, ResolvedLabels, SubmitResponseBody, WaitingForm } from '@endur/shared';
import { errorReply, NONSENSE_LABELS, renderWithProviders, stubApi, type StubCall } from '../../../test-utils.js';
import { useWaiting } from '../../../lib/waiting.js';
import { Sidebar } from '../../../components/layout/Sidebar.js';
import { Waiting } from './Waiting.js';

const form = (campaignId: string, name: string, over: Partial<WaitingForm> = {}): WaitingForm => ({
  campaignId,
  token: `TOK${campaignId}`,
  name,
  about: 'Algebra',
  questionCount: 1,
  estimatedSeconds: 30,
  endsAt: null,
  ...over,
});

const CAMPAIGN: PublicCampaign = {
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

/** Home's wiring: the live list into the card. */
function Harness(): JSX.Element {
  const waiting = useWaiting();
  return <Waiting rows={waiting.rows} orgName="Northfield" />;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the waiting card on Home', () => {
  it('is absent when nothing is waiting', async () => {
    const calls = stubApi({ 'GET /home/waiting': { body: { data: [] } } });
    renderWithProviders(<Harness />, { labels: NONSENSE_LABELS });
    await waitFor(() => expect(calls.some((call) => call.path === '/home/waiting')).toBe(true));
    expect(screen.queryByText('Waiting for your answer')).toBeNull();
  });

  it('lists each form with what it is about, its size and when it closes', async () => {
    stubApi({
      'GET /home/waiting': { body: { data: [
        form('c1', 'Spring check', { endsAt: '2026-11-20T10:00:00.000Z', questionCount: 6, estimatedSeconds: 120 }),
        form('c2', 'Facilities pulse', { about: null }),
      ] } },
    });
    renderWithProviders(<Harness />, { labels: NONSENSE_LABELS });

    expect(await screen.findByText('Spring check')).toBeTruthy();
    expect(screen.getByText(/Algebra · 6 questions · about 2 minutes · closes/)).toBeTruthy();
    expect(screen.getByText('Facilities pulse')).toBeTruthy();
    expect(screen.getByText(/Northfield would like your feedback/)).toBeTruthy();
  });

  it('answers ON HOME: the same submit as the link, channel "home", and then the card goes', async () => {
    let answered = false;
    const calls = stubApi({
      'GET /home/waiting': () => ({ body: { data: answered ? [] : [form('c1', 'Spring check')] } }),
      'GET /public/campaigns/TOKc1': { body: { data: CAMPAIGN } },
      'POST /public/campaigns/TOKc1/responses': () => {
        answered = true;
        return { status: 201, body: { data: { ok: true, responseCount: 12 } } };
      },
    });
    renderWithProviders(<Harness />, { labels: NONSENSE_LABELS });

    fireEvent.click(await screen.findByRole('button', { name: 'Answer “Spring check”' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    // A toast says it went, and the list is re-read without being asked: the card is gone.
    expect(await screen.findByText('Sent. Thank you for answering “Spring check”.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Waiting for your answer')).toBeNull());

    const post = calls.find((call: StubCall) => call.method === 'POST');
    const body = post?.body as SubmitResponseBody;
    expect(body.channel).toBe('home');
    expect(body.answers).toEqual([{ questionId: 'q1', value: { kind: 'yesno', yes: true } }]);
    // Idempotent like the link's: a retry on a weak network is the same submission.
    expect(post?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('answered elsewhere already: says so, and the card still goes', async () => {
    let refused = false;
    stubApi({
      'GET /home/waiting': () => ({ body: { data: refused ? [] : [form('c1', 'Spring check')] } }),
      'GET /public/campaigns/TOKc1': { body: { data: CAMPAIGN } },
      'POST /public/campaigns/TOKc1/responses': () => {
        refused = true;
        return errorReply(409, 'CONFLICT', 'You have already responded to this one.');
      },
    });
    renderWithProviders(<Harness />, { labels: NONSENSE_LABELS });

    fireEvent.click(await screen.findByRole('button', { name: 'Answer “Spring check”' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.queryByText('Waiting for your answer')).toBeNull());
  });
});

describe('the count beside Home in the sidebar', () => {
  it('shows how many forms are waiting, and says so to a screen reader', async () => {
    stubApi({
      'GET /home/waiting': { body: { data: [form('c1', 'Spring check'), form('c2', 'Facilities pulse')] } },
    });
    renderWithProviders(<Sidebar />, { labels: NONSENSE_LABELS });

    const home = await screen.findByRole('link', { name: /^Home\s*,\s*2 waiting for your answer$/ });
    expect(within(home).getByText('2').className).toBe('sidebar-count');
  });

  it('shows nothing when nothing is waiting', async () => {
    const calls = stubApi({ 'GET /home/waiting': { body: { data: [] } } });
    renderWithProviders(<Sidebar />, { labels: NONSENSE_LABELS });
    await waitFor(() => expect(calls.some((call) => call.path === '/home/waiting')).toBe(true));
    expect(screen.getByRole('link', { name: 'Home' })).toBeTruthy();
    expect(document.querySelector('.sidebar-count')).toBeNull();
  });
});
