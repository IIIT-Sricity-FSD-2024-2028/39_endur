import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Capability, OrgView, PresetView } from '@endur/shared';
import { NONSENSE_LABELS, renderWithProviders } from '../../test-utils.js';
import Settings from './Settings.js';

const ORG: OrgView = {
  id: 'o1', name: 'Northfield', slug: 'northfield', industry: 'university',
  labels: {
    unit: { one: 'Zblorn', many: 'Zblorns' },
    subject: { one: 'Quaxel', many: 'Quaxels' },
    respondent: { one: 'Frimble', many: 'Frimbles' },
    reviewee: { one: 'Vandor', many: 'Vandors' },
    campaign: { one: 'Plithe', many: 'Plithe' },
  },
  configured: true,
  logoUrl: null,
  createdAt: '2026-08-01T00:00:00.000Z',
};

const PRESETS: PresetView[] = [
  { key: 'university', displayName: 'University', roles: [], units: [], labels: {}, templates: [] },
  { key: 'hotel', displayName: 'Hotel', roles: [], units: [], labels: {}, templates: [] },
];

const updateOrg = vi.fn();
const updateLabels = vi.fn();
let org: OrgView | null = ORG;

vi.mock('../../lib/org.js', async () => {
  const react = await import('react');
  return {
    useOrg: () => {
      const [data, set] = react.useState<OrgView | null>(org);
      return { data, loading: false, error: null, set };
    },
    usePresets: () => ({ data: PRESETS, loading: false, error: null }),
    useUpdateOrg: () => updateOrg,
    useUpdateLabels: () => updateLabels,
    useUploadLogo: () => uploadLogo,
    useRemoveLogo: () => removeLogo,
  };
});

const uploadLogo = vi.fn();
const removeLogo = vi.fn();

const ALL: Capability[] = ['org.read', 'org.update'];

const mount = (capabilities: Capability[] = ALL) =>
  renderWithProviders(
    <Routes>
      <Route path="/app/settings" element={<Settings />} />
    </Routes>,
    { capabilities, labels: NONSENSE_LABELS, path: '/app/settings' },
  );

beforeEach(() => {
  vi.clearAllMocks();
  org = ORG;
  updateOrg.mockResolvedValue(ORG);
  updateLabels.mockResolvedValue(ORG);
});

describe('the words card', () => {
  it('opens on the org’s own words, not the defaults', () => {
    mount();
    expect(screen.getByLabelText<HTMLInputElement>('A part of the organization').value)
      .toBe('Zblorn');
    expect(screen.getByLabelText<HTMLInputElement>('The thing being reviewed').value)
      .toBe('Quaxel');
  });

  it('reads a saved plural that differs from the derived one as an override', () => {
    mount();
    const hints = screen.getAllByText(/your plural/);
    expect(hints).toHaveLength(1);
  });

  it('derives the plural as you type, until you take it over', () => {
    mount();
    fireEvent.change(screen.getByLabelText('A part of the organization'), {
      target: { value: 'Wing' },
    });
    expect(screen.getByLabelText<HTMLInputElement>('Plural of Wing').value).toBe('Wings');

    fireEvent.change(screen.getByLabelText('Plural of Wing'), { target: { value: 'Wing' } });
    fireEvent.change(screen.getByLabelText('A part of the organization'), {
      target: { value: 'Wingg' },
    });
    expect(screen.getByLabelText<HTMLInputElement>('Plural of Wingg').value).toBe('Wing');
  });

  it('refuses to save a blank word, and says why', () => {
    mount();
    fireEvent.change(screen.getByLabelText('A part of the organization'), {
      target: { value: '  ' },
    });
    expect(screen.getByText(/needs a singular and a plural/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save words' }).disabled)
      .toBe(true);
  });

  it('updates every open screen on save, without a reload', async () => {
    updateLabels.mockResolvedValue({
      ...ORG,
      labels: { ...ORG.labels, subject: { one: 'Studio', many: 'Studios' } },
    });

    const { store } = mount();
    expect(store.getState().vocabulary.labels.subject.many).toBe('Quaxels');

    fireEvent.change(screen.getByLabelText('The thing being reviewed'), {
      target: { value: 'Studio' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save words' }));

    await waitFor(() =>
      expect(store.getState().vocabulary.labels.subject.many).toBe('Studios'));
    expect(updateLabels).toHaveBeenCalledWith(
      expect.objectContaining({ subject: { one: 'Studio', many: 'Studios' } }),
    );
  });

  it('leaves the other card usable when this one fails', async () => {
    updateLabels.mockRejectedValue(new Error('nope'));
    mount();

    fireEvent.click(screen.getByRole('button', { name: 'Save words' }));
    await waitFor(() => expect(screen.getByText(/Could not save those words/)).toBeTruthy());

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save organization' })
      .disabled).toBe(false);
  });
});

describe('the organization card', () => {
  it('says what changing the industry does not do', () => {
    mount();
    expect(screen.getByText('This only changes which templates we suggest.')).toBeTruthy();
  });

  it('sends the name and the industry together', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Northfield College' } });
    fireEvent.change(screen.getByLabelText('Industry'), { target: { value: 'hotel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save organization' }));

    await waitFor(() =>
      expect(updateOrg).toHaveBeenCalledWith({ name: 'Northfield College', industry: 'hotel' }));
  });
});

describe('a caller who can read but not update', () => {
  it('sees the words and no way to change them', () => {
    mount(['org.read']);
    expect(screen.getByLabelText<HTMLInputElement>('A part of the organization').disabled)
      .toBe(true);
    expect(screen.queryByRole('button', { name: 'Save words' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save organization' })).toBeNull();
  });
});
