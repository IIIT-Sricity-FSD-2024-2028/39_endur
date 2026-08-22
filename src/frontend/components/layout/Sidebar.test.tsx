// The sidebar is where two invariants meet, and both are easy to break by accident:
// INV-001 (no hardcoded domain noun) and INV-003 (out of scope is absent, not greyed).
// The "Soon" items are a third, separate thing — nobody can reach them yet, which is not
// the same as "you may not".
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Sidebar } from './Sidebar.js';
import { NONSENSE_LABELS, renderWithProviders } from '../../test-utils.js';

const ALL = ['unit.read', 'role.read', 'person.read', 'subject.read',
             'template.read', 'campaign.read', 'org.read'] as const;

describe('vocabulary', () => {
  it('reads the domain nouns from the org rather than hardcoding them', () => {
    renderWithProviders(<Sidebar />, {
      capabilities: [...ALL], labels: NONSENSE_LABELS,
    });
    // If either of these fails, a noun was written into the component.
    expect(screen.getByText('Quaxels')).toBeTruthy();
    expect(screen.getByText('Plithes')).toBeTruthy();
  });

  it("leaves Endur's own furniture literal", () => {
    renderWithProviders(<Sidebar />, {
      capabilities: [...ALL], labels: NONSENSE_LABELS,
    });
    // Home, Structure, Roles, People, Templates, Settings describe the PRODUCT. A hotel
    // does not rename them, so routing them through the vocabulary would be wrong.
    for (const literal of ['Home', 'Structure', 'Roles', 'People', 'Templates', 'Settings']) {
      expect(screen.getByText(literal)).toBeTruthy();
    }
  });
});

describe('scope', () => {
  it('omits items the caller cannot use — absent, not greyed out', () => {
    renderWithProviders(<Sidebar />, { capabilities: ['campaign.read'] });
    expect(screen.getByText('Campaigns')).toBeTruthy();
    // A greyed-out list of everything you may not do is a permissions lecture, not
    // navigation (design_specs/design/02 §5).
    expect(screen.queryByText('Roles')).toBeNull();
    expect(screen.queryByText('People')).toBeNull();
  });
});

describe('roadmap items', () => {
  it('shows them, tagged, and refuses to navigate', () => {
    renderWithProviders(<Sidebar />, { capabilities: [...ALL] });
    const analysis = screen.getByText('Analysis').closest('.sidebar-item');

    expect(analysis).toBeTruthy();
    expect(analysis?.getAttribute('aria-disabled')).toBe('true');
    // Not an <a>: there is no href to follow and nothing to tab into, so the behaviour is
    // structural rather than styled-on.
    expect(analysis?.tagName).not.toBe('A');
    // Three P3 items and, since T-046, the two P2 pages that are still scaffold. The count
    // is the assertion: an item goes back to being a link when its page exists, and never
    // before (design_specs/design/02 §7).
    expect(screen.getAllByText('Soon').length).toBe(5);
  });

  it('does not navigate to a page that is only scaffold', () => {
    renderWithProviders(<Sidebar />, { capabilities: [...ALL] });
    for (const label of ['Roles', 'People']) {
      const item = screen.getByText(label).closest('.sidebar-item');
      expect(item?.getAttribute('aria-disabled')).toBe('true');
      expect(item?.tagName).not.toBe('A');
    }
  });

  it('explains itself on hover — a greyed item with no reason is a broken link', () => {
    renderWithProviders(<Sidebar />, { capabilities: [...ALL] });
    const hint = screen.getByText('Inbox').closest('.sidebar-item')?.getAttribute('title');
    expect(hint).toBeTruthy();
    expect(hint?.length).toBeGreaterThan(20);
  });
});
