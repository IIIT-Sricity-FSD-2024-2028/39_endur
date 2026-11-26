// `/app/simulator` through the real store: the blanks are filled from RTK Query reads, the
// sentence and the history are `state.simulator`, and "Test" is the `simulationRun` thunk
// (store/screens/simulator.ts). `stubApi` is the server.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Capability, DecisionView } from '@endur/shared';
import { errorReply, renderWithProviders, stubApi, type StubCall } from '../../test-utils.js';
import Simulator from './Simulator.js';

const AMARA = { id: 'p1', userId: 'u-amara', name: 'Amara Rao' };
const NO_ACCOUNT = { id: 'p2', userId: null, name: 'Amar Singh' };

let decision: DecisionView;
let calls: StubCall[] = [];

const server = (overrides: Parameters<typeof stubApi>[0] = {}) => {
  calls = stubApi({
    'GET /authz/capabilities': {
      body: { data: [
        { key: 'campaign.launch', module: 'Campaigns', label: 'launch a campaign', phase: 'P2' },
        { key: 'person.read', module: 'People', label: 'see people', phase: 'P2' },
      ] },
    },
    'GET /units': { body: { data: [] } },
    'GET /people*': { body: { data: [AMARA, NO_ACCOUNT], page: { nextCursor: null, hasMore: false }, meta: { total: 2 } } },
    'GET /subjects*': { body: { data: [], page: { nextCursor: null, hasMore: false }, meta: { total: 0 } } },
    'GET /campaigns*': { body: { data: [{ id: 'c1', name: 'Autumn round' }], page: { nextCursor: null, hasMore: false }, meta: { total: 1 } } },
    'POST /authz/simulate': () => ({ body: { data: decision } }),
    ...overrides,
  });
};

const ALL: Capability[] = ['simulator.run', 'person.read', 'unit.read', 'subject.read', 'campaign.read'];

const mount = (capabilities: Capability[] = ALL) =>
  renderWithProviders(
    <Routes>
      <Route path="/app/simulator" element={<Simulator />} />
      <Route path="/app" element={<p>HOME</p>} />
    </Routes>,
    { capabilities, path: '/app/simulator' },
  );

const test = () => screen.getByRole<HTMLButtonElement>('button', { name: /^(Test|Testing…)$/ });

/** "If Amara Rao tries to launch a campaign on the whole organization". */
async function fillSentence(): Promise<void> {
  const [who] = screen.getAllByPlaceholderText('a person');
  fireEvent.change(who!, { target: { value: 'Ama' } });
  // Only people with an account can be asked about: there is nobody to resolve for otherwise.
  expect(await screen.findByRole('button', { name: 'Amara Rao' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Amar Singh' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Amara Rao' }));
  const action = screen.getAllByRole<HTMLSelectElement>('combobox')[0]!;
  await waitFor(() => expect(action.options.length).toBe(3));
  fireEvent.change(action, { target: { value: 'campaign.launch' } });
}

beforeEach(() => {
  decision = { allowed: true, capability: 'campaign.launch', reason: 'granted' };
  server();
});
afterEach(() => vi.unstubAllGlobals());

describe('the permission simulator — 42', () => {
  it('waits for the whole sentence before it offers Test', async () => {
    mount();
    expect(test().disabled).toBe(true);
    await fillSentence();
    expect(test().disabled).toBe(false);
  });

  it('asks the server and shows its verdict', async () => {
    mount();
    await fillSentence();
    fireEvent.click(test());

    expect(await screen.findByText('ALLOWED')).toBeTruthy();
    expect(calls.find((call) => call.path === '/authz/simulate')?.body).toEqual({
      principalUserId: 'u-amara', capability: 'campaign.launch', target: { kind: 'org' },
    });
  });

  it('says a hard block is a hard block, and keeps the earlier answer below', async () => {
    mount();
    await fillSentence();
    fireEvent.click(test());
    await screen.findByText('ALLOWED');

    decision = {
      allowed: false, capability: 'campaign.launch', reason: 'explicit_deny',
      decidedBy: { subjectName: 'Visitor' } as DecisionView['decidedBy'],
    };
    fireEvent.click(test());
    expect(await screen.findByText('BLOCKED')).toBeTruthy();
    expect(screen.getByText(/Cannot be overridden/)).toBeTruthy();
    expect(screen.getByText('Earlier this session')).toBeTruthy();
    expect(screen.getByText(/Amara Rao · launch a campaign · the whole organization/)).toBeTruthy();
  });

  it('sends the date as an instant when one is given', async () => {
    mount();
    await fillSentence();
    const date = document.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(date, { target: { value: '2026-12-01' } });
    fireEvent.click(test());
    await screen.findByText('ALLOWED');
    expect((calls.find((call) => call.path === '/authz/simulate')?.body as { at: string }).at)
      .toBe(new Date('2026-12-01').toISOString());
  });

  it('a different kind of target clears the last one\'s choice', async () => {
    mount();
    await fillSentence();
    const kind = screen.getAllByRole<HTMLSelectElement>('combobox')[1]!;
    fireEvent.change(kind, { target: { value: 'campaign' } });
    expect(test().disabled).toBe(true);
    const campaign = await waitFor(() => {
      const select = screen.getAllByRole<HTMLSelectElement>('combobox')[2]!;
      expect(select.options.length).toBe(2);
      return select;
    });
    fireEvent.change(campaign, { target: { value: 'c1' } });
    expect(test().disabled).toBe(false);

    fireEvent.change(kind, { target: { value: 'person' } });
    expect(test().disabled).toBe(true);
  });

  it('changes the person with "change"', async () => {
    mount();
    await fillSentence();
    fireEvent.click(screen.getByRole('button', { name: 'change' }));
    expect(screen.getAllByPlaceholderText('a person')).toHaveLength(1);
    expect(test().disabled).toBe(true);
  });

  it('a 403 says you may not simulate, rather than printing an error', async () => {
    server({ 'POST /authz/simulate': errorReply(403, 'FORBIDDEN', 'No.') });
    mount();
    await fillSentence();
    fireEvent.click(test());
    expect((await screen.findByRole('alert')).textContent).toBe('You do not have permission to run the simulator.');
  });

  it('any other failure is the server\'s sentence', async () => {
    server({ 'POST /authz/simulate': errorReply(409, 'CONFLICT', 'That person holds no position.') });
    mount();
    await fillSentence();
    fireEvent.click(test());
    expect((await screen.findByRole('alert')).textContent).toBe('That did not run. That person holds no position.');
  });

  it('without simulator.run there is nothing to fill in', () => {
    mount(['person.read']);
    expect(screen.getByText('You do not have access to this')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Test/ })).toBeNull();
  });
});
