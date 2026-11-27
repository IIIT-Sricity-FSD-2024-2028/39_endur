// `/ops/analytics` through the real store and a stubbed operator API (R-716): the server
// answers counts, and every percentage on the page is `selectAnalyticsView`'s, printed with
// what it is a percentage OF.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { PlatformAnalytics } from '@endur/shared';
import { errorReply, renderWithProviders, stubApi } from '../../../test-utils.js';
import { reportWindowChanged } from '../../../store/screens/opsReports.js';
import Analytics from './index.js';

const ANALYTICS: PlatformAnalytics = {
  window: { from: '2026-01-01T00:00:00.000Z', to: '2026-02-28T00:00:00.000Z', granularity: 'month' },
  orgs: { total: 50, joined: 37, trialing: 10, cancelled: 3 },
  byTier: [
    { tier: 'bronze', orgs: 20 },
    { tier: 'silver', orgs: 10 },
    { tier: 'gold', orgs: 7 },
    { tier: 'enterprise', orgs: 3 },
  ],
  movement: [
    { period: '2026-01', new: 4, upgraded: 1, downgraded: 0, churned: 1, trialStarted: 2 },
    { period: '2026-02', new: 8, upgraded: 2, downgraded: 1, churned: 0, trialStarted: 0 },
  ],
  adoption: { orgsWithACampaign: 40, orgsWithAResponse: 30, orgsQuiet30d: 5 },
  totals: { campaigns: 80, responses: 1000 },
};

beforeEach(() => {
  stubApi({ 'GET /platform/analytics*': { body: { data: ANALYTICS } } });
});
afterEach(() => vi.unstubAllGlobals());

const render = () => renderWithProviders(<Analytics />, { path: '/ops/analytics' });

describe('the analytics page', () => {
  it('every share says what it is a share of', async () => {
    render();
    const kpis = await screen.findByRole('region', { name: 'The estate in numbers' });
    expect(kpis.textContent).toContain('37 of 50 organizations · 74%');
    expect(kpis.textContent).toContain('5 of 50 · 10%');
    expect(kpis.textContent).toContain('12.5');
  });

  it('the plan mix is of the organisations on a plan, and adds up to 100', async () => {
    render();
    const mix = await screen.findByRole('region', { name: /Plan mix/ });
    expect(mix.textContent).toContain('Of the 40 organizations on a plan');
    expect(mix.textContent).toContain('20 of 40');
    expect(mix.textContent).toContain('50%');
    expect(mix.textContent).toContain('18%');
  });

  it('the funnel narrows, step by step', async () => {
    render();
    const adoption = await screen.findByRole('region', { name: /Adoption/ });
    const steps = within(adoption).getAllByRole('listitem').map((item) => item.textContent);
    expect(steps[0]).toContain('50 · 100%');
    expect(steps[1]).toContain('40 · 80%');
    expect(steps[2]).toContain('30 · 60%');
    expect(steps[2]).toContain('75% of the step before');
  });

  it('movement: five counts per period, and the window’s totals in the legend', async () => {
    render();
    const movement = await screen.findByRole('region', { name: /Movement/ });
    expect(movement.textContent).toContain('New12');
    expect(within(movement).getByRole('button', { name: /^Feb 2026: New 8/ })).toBeTruthy();
  });

  it('opens at the window chosen on Earnings: one window, in the store', async () => {
    const calls = stubApi({ 'GET /platform/analytics*': { body: { data: ANALYTICS } } });
    const { store } = renderWithProviders(<p />, { path: '/' });
    store.dispatch(reportWindowChanged({ granularity: 'quarter' }));
    renderWithProviders(<Analytics />, { path: '/ops/analytics' }, store);
    await screen.findByRole('region', { name: 'The estate in numbers' });
    expect(calls.map((call) => call.path)).toContain('/platform/analytics?granularity=quarter');
  });

  it('a 403 names the capability', async () => {
    stubApi({ 'GET /platform/analytics*': errorReply(403, 'FORBIDDEN', 'Owner only.') });
    render();
    expect(await screen.findByText('platform.analytics.read')).toBeTruthy();
  });
});
