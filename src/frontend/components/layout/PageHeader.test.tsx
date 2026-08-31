// Two things worth locking down. The chip row is the demo's ten-second proof (N-003), and
// the scope chip has to make a CONSTRAINT legible — a disabled dropdown would imply the
// choice exists and is being withheld, which is the opposite of what it must say.
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { PageHeader } from './PageHeader.js';
import { VocabularyChips } from './VocabularyChips.js';
import { NONSENSE_LABELS, renderWithProviders } from '../../test-utils.js';

describe('VocabularyChips', () => {
  it('renders the org\'s own nouns, four of them', () => {
    renderWithProviders(<VocabularyChips />, { labels: NONSENSE_LABELS });
    for (const word of ['Zblorn', 'Quaxel', 'Frimble', 'Vandor']) {
      expect(screen.getByText(word)).toBeTruthy();
    }
  });

  it('falls back to generic words rather than rendering nothing', () => {
    // A brand-new org has no labels at all. It must still read as a product.
    renderWithProviders(<VocabularyChips />, {});
    expect(screen.getByText('Unit')).toBeTruthy();
    expect(screen.getByText('Subject')).toBeTruthy();
  });

  it('hides Edit from someone who cannot edit, rather than disabling it', () => {
    renderWithProviders(<VocabularyChips />, { capabilities: [] });
    expect(screen.queryByText('Edit')).toBeNull();

    renderWithProviders(<VocabularyChips />, { capabilities: ['org.update'] });
    expect(screen.getByText('Edit')).toBeTruthy();
  });
});

describe('PageHeader', () => {
  it('opens every page the same way — title, then the chip row', () => {
    renderWithProviders(<PageHeader title="Campaigns" subtitle="Two open" />, {
      labels: NONSENSE_LABELS,
    });
    expect(screen.getByRole('heading', { name: 'Campaigns' })).toBeTruthy();
    expect(screen.getByText('Two open')).toBeTruthy();
    expect(screen.getByText('Quaxel')).toBeTruthy();
  });

  it('renders a FIXED scope as a tag, visibly not a control', () => {
    const { container } = renderWithProviders(
      <PageHeader title="People" scope={{ label: 'School of Engineering' }} />,
    );
    expect(screen.getByText('Scope: School of Engineering')).toBeTruthy();
    expect(container.querySelector('select')).toBeNull();
  });

  it('renders a CHOOSABLE scope as a real select', () => {
    const { container } = renderWithProviders(
      <PageHeader
        title="People"
        scope={{
          label: 'All', value: 'all',
          options: [{ id: 'all', label: 'All' }, { id: 'eng', label: 'Engineering' }],
        }}
      />,
    );
    expect(container.querySelector('select')).toBeTruthy();
  });

  it('can drop the chip row where it would be noise', () => {
    renderWithProviders(<PageHeader title="Set up" vocabulary={false} />, {
      labels: NONSENSE_LABELS,
    });
    expect(screen.queryByText('Quaxel')).toBeNull();
  });
});
