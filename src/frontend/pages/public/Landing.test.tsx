import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { PRESET_VOCABULARIES } from '@endur/shared';
import { renderWithProviders } from '../../test-utils.js';
import Landing from './Landing.js';

const reducedMotion = (matches: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
};

const mount = () => renderWithProviders(<Landing />, { signedOut: true, path: '/' });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('landing — 30 § Landing', () => {
  it('offers one segment per preset vocabulary, named as the preset is named', () => {
    reducedMotion(true);
    mount();
    for (const entry of PRESET_VOCABULARIES) {
      expect(screen.getByRole('radio', { name: entry.displayName })).toBeTruthy();
    }
  });

  it('shows the first preset\'s four nouns before anything is clicked', () => {
    reducedMotion(true);
    mount();
    const first = PRESET_VOCABULARIES[0];
    expect(first).toBeTruthy();
    for (const key of ['unit', 'subject', 'respondent', 'reviewee'] as const) {
      expect(screen.getAllByText(first!.labels[key].one).length).toBeGreaterThan(0);
    }
  });

  it('swaps the whole row when another industry is picked — the entire pitch', () => {
    reducedMotion(true);
    mount();
    const hotel = PRESET_VOCABULARIES.find((entry) => entry.key === 'hotel');
    expect(hotel).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: hotel!.displayName }));

    expect(screen.getAllByText(hotel!.labels.unit.one).length).toBeGreaterThan(0);
    expect(screen.getAllByText(hotel!.labels.reviewee.one).length).toBeGreaterThan(0);
    expect(screen.queryByText(PRESET_VOCABULARIES[0]!.labels.unit.one)).toBeNull();
  });

  it('rewrites the headline into the chosen organisation\'s words', () => {
    reducedMotion(true);
    const { container } = mount();
    const hospital = PRESET_VOCABULARIES.find((entry) => entry.key === 'hospital');

    fireEvent.click(screen.getByRole('radio', { name: hospital!.displayName }));

    const title = container.querySelector('.landing-title')?.textContent ?? '';
    expect(title).toContain(hospital!.labels.respondent.one.toLowerCase());
    expect(title).toContain(hospital!.labels.subject.one.toLowerCase());
  });

  it('renders the row as the data says, in the data\'s order', () => {
    reducedMotion(true);
    const { container } = mount();
    const expected = (['unit', 'subject', 'respondent', 'reviewee'] as const)
      .map((key) => PRESET_VOCABULARIES[0]!.labels[key].one)
      .join(' · ');
    expect(container.querySelector('.landing-nouns')?.textContent).toBe(expected);
  });

  it('advances on its own until somebody takes hold of it', () => {
    reducedMotion(false);
    vi.useFakeTimers();
    mount();
    const second = PRESET_VOCABULARIES[1];

    act(() => { vi.advanceTimersByTime(3500); });
    expect(screen.getAllByText(second!.labels.unit.one).length).toBeGreaterThan(0);
  });

  it('stops advancing FOR GOOD once a segment is clicked', () => {
    reducedMotion(false);
    vi.useFakeTimers();
    mount();
    const hospital = PRESET_VOCABULARIES.find((entry) => entry.key === 'hospital');

    fireEvent.click(screen.getByRole('radio', { name: hospital!.displayName }));
    act(() => { vi.advanceTimersByTime(3500 * 4); });

    expect(screen.getAllByText(hospital!.labels.unit.one).length).toBeGreaterThan(0);
  });

  it('does not auto-advance at all under prefers-reduced-motion (WCAG 2.2.2)', () => {
    reducedMotion(true);
    vi.useFakeTimers();
    mount();
    const first = PRESET_VOCABULARIES[0];

    act(() => { vi.advanceTimersByTime(3500 * 3); });
    expect(screen.getAllByText(first!.labels.unit.one).length).toBeGreaterThan(0);
  });

  it('sends the primary action to /start and the secondary to /login', () => {
    reducedMotion(true);
    mount();
    const create = screen.getAllByRole('link', { name: 'Create your organization' });
    expect(create.length).toBe(2);
    for (const link of create) expect(link.getAttribute('href')).toBe('/start');

    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
  });

  it('announces the change, so the pitch is not silence for a screen reader', () => {
    reducedMotion(true);
    const { container } = mount();
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });
});
