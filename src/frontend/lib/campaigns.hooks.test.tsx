// R-202, R-205: the campaign hooks on RTK Query, run for real over a stubbed `fetch`.
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CampaignDetail, CampaignStatus, CreateCampaignBody } from '@endur/shared';
import { setupStore, type AppStore } from '../store/index.js';
import { stubApi } from '../test-utils.js';
import { useCampaign, useCampaignList } from './campaigns.js';
import { useHome } from './home.js';

/** Only the fields these tests read; the hooks pass the rest through untouched. */
const campaign = (id: string, status: CampaignStatus, name = 'Mid-term round') =>
  ({ id, name, status }) as unknown as CampaignDetail;

function render<T>(hook: () => T, store: AppStore = setupStore()) {
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(hook, { wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useCampaignList', () => {
  it('create(): the list refetches by itself, and the dates go out as ISO strings', async () => {
    // A `Date` in a mutation's argument is fine: RTK keeps no argument for a mutation in the
    // store, and its serialisability check ignores `meta.arg` in actions. JSON writes the
    // ISO string on the wire.
    const consoleError = vi.spyOn(console, 'error');
    const calls = stubApi({
      'GET /campaigns': (_call, count) => ({
        body: { data: count === 1 ? [] : [campaign('c1', 'draft')], nextCursor: null },
      }),
      'POST /campaigns': { body: { data: campaign('c1', 'draft') } },
    });
    const { result } = render(() => useCampaignList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const body = {
      name: 'Mid-term round',
      startsAt: new Date('2026-12-01T09:00:00.000Z'),
    } as unknown as CreateCampaignBody;
    await act(async () => { await result.current.create(body); });

    await waitFor(() => expect(result.current.data?.data).toHaveLength(1));
    expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      startsAt: '2026-12-01T09:00:00.000Z',
    });
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('useCampaign: each command resolves once the page can show its result', () => {
  it('launch() re-reads the campaign before resolving, so the page already says open', async () => {
    const calls = stubApi({
      'GET /campaigns/c1': (_call, count) => ({ body: { data: campaign('c1', count === 1 ? 'draft' : 'open') } }),
      'POST /campaigns/c1/launch': { body: { data: { publicToken: 'tok', url: '/r/tok', status: 'open' } } },
    });
    const { result } = render(() => useCampaign('c1'));
    await waitFor(() => expect(result.current.data?.status).toBe('draft'));

    let link = '';
    await act(async () => { link = (await result.current.launch('launch:c1:k')).url; });

    expect(link).toBe('/r/tok');
    expect(result.current.data?.status).toBe('open');
    expect(calls.find((call) => call.method === 'POST')?.headers.get('Idempotency-Key')).toBe('launch:c1:k');
  });

  it('close() takes the server\'s answer straight into the cache, with no extra read', async () => {
    const calls = stubApi({
      'GET /campaigns/c1': { body: { data: campaign('c1', 'open') } },
      'POST /campaigns/c1/close': { body: { data: campaign('c1', 'closed') } },
    });
    const { result } = render(() => useCampaign('c1'));
    await waitFor(() => expect(result.current.data?.status).toBe('open'));

    await act(async () => { await result.current.close(); });

    expect(result.current.data?.status).toBe('closed');
    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(1);
  });

  it('update() does the same, and keeps its dates out of the store too', async () => {
    stubApi({
      'GET /campaigns/c1': { body: { data: campaign('c1', 'draft') } },
      'PATCH /campaigns/c1': { body: { data: campaign('c1', 'draft', 'Renamed') } },
    });
    const { result } = render(() => useCampaign('c1'));
    await waitFor(() => expect(result.current.data?.name).toBe('Mid-term round'));

    await act(async () => { await result.current.update({ name: 'Renamed' }); });

    expect(result.current.data?.name).toBe('Renamed');
  });
});

describe('R-205: one create, two screens catch up', () => {
  it('creating a campaign updates the campaign list AND Home, with no reload anywhere', async () => {
    const created = { value: false };
    stubApi({
      'GET /campaigns': () => ({
        body: { data: created.value ? [campaign('c1', 'draft')] : [], nextCursor: null },
      }),
      'GET /home?window=30d': () => ({
        body: {
          data: {
            stats: { window: '30d', responses: 0, subjectsCovered: 0, activeCampaigns: created.value ? 1 : 0, responseRate: null, responsesEver: 0 },
            activeCampaigns: [], prompts: [], configured: true,
          },
        },
      }),
      'POST /campaigns': () => {
        created.value = true;
        return { body: { data: campaign('c1', 'draft') } };
      },
    });
    // Both on screen at once, from one store: the Home widgets and the list.
    const { result } = render(() => ({ list: useCampaignList(), home: useHome() }));
    await waitFor(() => expect(result.current.home.data?.stats.activeCampaigns).toBe(0));
    await waitFor(() => expect(result.current.list.data?.data).toHaveLength(0));

    await act(async () => { await result.current.list.create({ name: 'Mid-term round' } as CreateCampaignBody); });

    // `createCampaign` invalidates `Campaign:LIST` and `Home`; both refetch by themselves.
    await waitFor(() => expect(result.current.list.data?.data).toHaveLength(1));
    await waitFor(() => expect(result.current.home.data?.stats.activeCampaigns).toBe(1));
  });
});
