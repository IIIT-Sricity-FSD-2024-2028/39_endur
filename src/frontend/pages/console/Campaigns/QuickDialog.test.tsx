// The poll and suggestion-box dialog. It creates AND launches in one press, so a closing time
// that has already passed would make a live QR code that turns everybody away: it is refused
// here, before the button, and again by the server.
//
// Runs on the real store and the real API layer (`stubApi` replaces only `fetch`): the
// dialog's state is `state.campaigns.quick`, and the create is a thunk over RTK Query.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { QuickCampaignPurpose } from '@endur/shared';
import {
  NONSENSE_LABELS,
  errorReply,
  makeStore,
  renderWithProviders,
  stubApi,
  type StubCall,
} from '../../../test-utils.js';
import { toLocalInput } from '../../../lib/when.js';
import { quickDialogOpened } from '../../../store/screens/campaigns.js';
import { QuickDialog } from './QuickDialog.js';

const HOUR = 60 * 60 * 1000;
const onCreated = vi.fn();
let calls: StubCall[] = [];

const mount = (purpose: QuickCampaignPurpose = 'poll') => {
  const store = makeStore({ labels: NONSENSE_LABELS });
  store.dispatch(quickDialogOpened(purpose));
  return renderWithProviders(<QuickDialog onCreated={onCreated} />, {}, store);
};

const fillPoll = (): void => {
  fireEvent.change(screen.getByLabelText('What are you asking?'), { target: { value: 'Hi' } });
  fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: '2' } });
};

const createButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Create and share' });
const creates = () => calls.filter((call) => call.method === 'POST' && call.path === '/campaigns/quick');

beforeEach(() => {
  vi.clearAllMocks();
  calls = stubApi({ 'POST /campaigns/quick': { body: { data: { id: 'c1', name: 'Hi' } } } });
});
afterEach(() => vi.unstubAllGlobals());

describe('closing it automatically', () => {
  it('will not create a poll whose closing time has already passed', () => {
    mount();
    fillPoll();
    expect(createButton().disabled).toBe(false);

    const ends = screen.getByLabelText<HTMLInputElement>('Close it automatically (optional)');
    fireEvent.change(ends, { target: { value: toLocalInput(Date.now() - 3 * 24 * HOUR) } });

    expect(screen.getByRole('alert').textContent).toMatch(/already passed/);
    expect(ends.getAttribute('aria-invalid')).toBe('true');
    expect(createButton().disabled).toBe(true);
    fireEvent.submit(createButton().closest('form') as HTMLFormElement);
    expect(creates()).toHaveLength(0);
  });

  it('offers only the future in the picker', () => {
    mount();
    const ends = screen.getByLabelText<HTMLInputElement>('Close it automatically (optional)');
    // Minute precision: what the input shows, in the browser's own time zone.
    expect(Date.parse(ends.min)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(ends.min)).toBeGreaterThan(Date.now() - 2 * 60 * 1000);
  });

  it('creates with a closing time in the future, or with none', async () => {
    const { store } = mount();
    fillPoll();
    fireEvent.change(screen.getByLabelText('Close it automatically (optional)'), {
      target: { value: toLocalInput(Date.now() + 2 * HOUR) },
    });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(createButton());

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' })));
    const body = creates()[0]?.body as { endsAt: string; options: string[]; purpose: string };
    expect(Date.parse(body.endsAt)).toBeGreaterThan(Date.now());
    expect(body.options).toEqual(['1', '2']);
    expect(body.purpose).toBe('poll');
    // A public link is minted: the press carries an idempotency key.
    expect(creates()[0]?.headers.get('idempotency-key')).toMatch(/^quick:/);
    // Created: the dialog's state is gone.
    expect(store.getState().campaigns?.quick).toBeNull();
  });

  it('a time that passes while the dialog is open is caught on submit', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      mount();
      fillPoll();
      fireEvent.change(screen.getByLabelText('Close it automatically (optional)'), {
        target: { value: toLocalInput(Date.now() + 5 * 60 * 1000) },
      });
      expect(createButton().disabled).toBe(false);

      vi.setSystemTime(Date.now() + 10 * 60 * 1000);
      fireEvent.click(createButton());

      expect(creates()).toHaveLength(0);
      expect(screen.getByRole('alert').textContent).toMatch(/already passed/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the rest of the dialog', () => {
  it('adds options up to ten and removes them down to two', () => {
    mount();
    const add = () => screen.getByRole('button', { name: /Add option/ });
    for (let index = 0; index < 8; index += 1) fireEvent.click(add());
    expect(screen.getByLabelText('Option 10')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add option/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remove option 10' }));
    expect(screen.queryByLabelText('Option 10')).toBeNull();
    for (let index = 9; index > 2; index -= 1) {
      fireEvent.click(screen.getByRole('button', { name: `Remove option ${index}` }));
    }
    // Two left: neither can be removed.
    expect(screen.queryByRole('button', { name: /Remove option/ })).toBeNull();
  });

  it('a suggestion box needs only its question', async () => {
    mount('suggestion');
    expect(screen.queryByText('Options')).toBeNull();
    fireEvent.change(screen.getByLabelText('What are you asking for?'), {
      target: { value: 'Ideas?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open the box' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(creates()[0]?.body).toEqual({ purpose: 'suggestion', name: 'Ideas?' });
  });

  it("shows the server's refusal and keeps everything typed", async () => {
    stubApi({
      'POST /campaigns/quick': errorReply(402, 'PLAN_LIMIT', 'Your plan allows 3 open polls.'),
    });
    const { store } = mount();
    fillPoll();
    fireEvent.click(createButton());

    expect((await screen.findByRole('alert')).textContent).toBe('Your plan allows 3 open polls.');
    expect(onCreated).not.toHaveBeenCalled();
    expect(store.getState().campaigns?.quick?.name).toBe('Hi');
    expect(createButton().disabled).toBe(false);
  });

  it('Cancel and Escape close it', () => {
    const { store } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(store.getState().campaigns?.quick).toBeNull();

    act(() => {
      store.dispatch(quickDialogOpened('poll'));
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(store.getState().campaigns?.quick).toBeNull();
  });
});
