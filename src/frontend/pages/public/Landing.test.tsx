// T-031 — the landing page's vocabulary switcher. 30 § Landing, INV-001.
//
// The switcher is the only thing on `/` that is not filler, and it is the one place in the
// product where domain nouns appear without an organisation behind them. These tests exist
// to prove that is still DATA and not a hardcoded row of English words.
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
      expect(screen.getByText(first!.labels[key].one)).toBeTruthy();
    }
  });

  it('swaps the whole row when another industry is picked — the entire pitch', () => {
    reducedMotion(true);
    mount();
    const hotel = PRESET_VOCABULARIES.find((entry) => entry.key === 'hotel');
    expect(hotel).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: hotel!.displayName }));

    expect(screen.getByText(hotel!.labels.unit.one)).toBeTruthy();
    expect(screen.getByText(hotel!.labels.reviewee.one)).toBeTruthy();
    // And the previous vocabulary is gone, not merely covered.
    expect(screen.queryByText(PRESET_VOCABULARIES[0]!.labels.unit.one)).toBeNull();
  });

  it('renders the row as the data says, in the data\'s order', () => {
    reducedMotion(true);
    const { container } = mount();
    // If somebody hardcodes a row, this fails the moment a preset is renamed — which is
    // otherwise the only way the landing page can start lying without anyone noticing.
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
    expect(screen.getByText(second!.labels.unit.one)).toBeTruthy();
  });

  it('stops advancing FOR GOOD once a segment is clicked', () => {
    reducedMotion(false);
    vi.useFakeTimers();
    mount();
    const hospital = PRESET_VOCABULARIES.find((entry) => entry.key === 'hospital');

    fireEvent.click(screen.getByRole('radio', { name: hospital!.displayName }));
    act(() => { vi.advanceTimersByTime(3500 * 4); });

    // Still on the one they chose. A control that moves after you have used it reads as
    // a bug on a projector.
    expect(screen.getByText(hospital!.labels.unit.one)).toBeTruthy();
  });

  it('does not auto-advance at all under prefers-reduced-motion (WCAG 2.2.2)', () => {
    reducedMotion(true);
    vi.useFakeTimers();
    mount();
    const first = PRESET_VOCABULARIES[0];

    act(() => { vi.advanceTimersByTime(3500 * 3); });
    expect(screen.getByText(first!.labels.unit.one)).toBeTruthy();
  });

  it('sends the primary action to /start and the secondary to /login', () => {
    reducedMotion(true);
    mount();
    expect(
      screen.getByRole('link', { name: 'Create your organization' }).getAttribute('href'),
    ).toBe('/start');
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
  });

  it('announces the change, so the pitch is not silence for a screen reader', () => {
    reducedMotion(true);
    const { container } = mount();
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });
});
