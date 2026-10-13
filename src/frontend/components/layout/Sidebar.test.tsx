import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Sidebar } from './Sidebar.js';
import { NONSENSE_LABELS, renderWithProviders } from '../../test-utils.js';

const ALL = ['unit.read', 'role.read', 'person.read', 'subject.read',
             'template.read', 'campaign.read', 'response.read',
             'analysis.read', 'reflection.read',
             'audit.read',
             'org.read', 'org.update'] as const;

describe('vocabulary', () => {
  it('reads the domain nouns from the org rather than hardcoding them', () => {
    renderWithProviders(<Sidebar />, {
      capabilities: [...ALL], labels: NONSENSE_LABELS,
    });
    expect(screen.getByText('Quaxels')).toBeTruthy();
    expect(screen.getByText('Plithes')).toBeTruthy();
  });

  it("leaves Endur's own furniture literal", () => {
    renderWithProviders(<Sidebar />, {
      capabilities: [...ALL], labels: NONSENSE_LABELS,
    });
    for (const literal of ['Home', 'Structure', 'Roles', 'People', 'Templates', 'Settings']) {
      expect(screen.getByText(literal)).toBeTruthy();
    }
  });
});

describe('scope', () => {
  it('omits items the caller cannot use — absent, not greyed out', () => {
    renderWithProviders(<Sidebar />, { capabilities: ['campaign.read'] });
    expect(screen.getByText('Campaigns')).toBeTruthy();
    expect(screen.queryByText('Roles')).toBeNull();
    expect(screen.queryByText('People')).toBeNull();
  });

});

describe('what each level sees', () => {
  const L1 = {
    'org.read': 'all', 'org.update': 'all', 'unit.read': 'subtree', 'role.read': 'all',
    'person.read': 'subtree', 'subject.read': 'subtree', 'template.read': 'all',
    'campaign.read': 'subtree', 'response.read': 'subtree',
    'analysis.read': 'subtree',
    'reflection.read': 'self',
    'audit.read': 'all',
    'announcement.read': 'all',
    'booking.read': 'all',
  } as const;
  const L2 = { ...L1, 'org.update': undefined, 'audit.read': undefined } as const;
  const L3 = {
    'org.read': 'all', 'unit.read': 'own_unit', 'role.read': 'all',
    'person.read': 'own_unit', 'subject.read': 'own_unit', 'template.read': 'all',
    'campaign.read': 'own_unit', 'response.read': 'own_unit',
    'analysis.read': 'own_unit',
    'reflection.read': 'self',
    'announcement.read': 'all',
    'booking.read': 'all',
  } as const;
  const L4 = {
    'org.read': 'all', 'subject.read': 'own_unit',
    'person.read': 'self', 'person.update': 'self',
    'announcement.read': 'all',
  } as const;

  const rendered = (): string[] =>
    [...document.querySelectorAll('.sidebar-item')].map(
      (node) => node.querySelector('span:not(.tag)')?.textContent ?? '',
    );

  const show = (capabilities: Record<string, string | undefined>) =>
    renderWithProviders(<Sidebar />, { capabilities, labels: NONSENSE_LABELS });

  it('L1 owner — everything, including Settings', () => {
    show(L1);
    expect(rendered()).toEqual([
      'Home', 'Settings', 'Activity log', 'Structure', 'Roles', 'People', 'Quaxels',
      'Start', 'Templates', 'Plithes', 'Announcements', 'Booking',
      'Analysis', 'Inbox', 'Reflect',
    ]);
  });

  it('L2 section head — the same, minus Settings', () => {
    show(L2);
    expect(rendered()).toEqual([
      'Home', 'Structure', 'Roles', 'People', 'Quaxels',
      'Start', 'Templates', 'Plithes', 'Announcements', 'Booking',
      'Analysis', 'Inbox', 'Reflect',
    ]);
  });

  it('L3 reviewee-level — KEEPS People, because their roster is real', () => {
    show(L3);
    expect(rendered()).toContain('People');
    expect(rendered()).toEqual([
      'Home', 'Structure', 'Roles', 'People', 'Quaxels',
      'Start', 'Templates', 'Plithes', 'Announcements', 'Booking',
      'Analysis', 'Inbox', 'Reflect',
    ]);
  });

  it('L4 lowest — Subjects, and nothing else in `organize`', () => {
    show(L4);
    expect(rendered()).toEqual(['Home', 'Quaxels', 'Start', 'Announcements']);
  });

  it('drops People for an account that can only reach itself — the whole of D-027', () => {
    show(L4);
    expect(screen.queryByText('People')).toBeNull();
    show({ ...L4, 'person.read': 'own_unit' });
    expect(screen.getAllByText('People').length).toBeGreaterThan(0);
  });

  it('drops Settings on the CAPABILITY, not the scope — org.read is `all` even at L4', () => {
    show(L4);
    expect(screen.queryByText('Settings')).toBeNull();
    show({ ...L4, 'org.read': 'all' });
    expect(screen.queryByText('Settings')).toBeNull();
    show({ ...L4, 'org.update': 'all' });
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
  });
});

describe('roadmap items — there are none left', () => {
  it('has none left — every item in the sidebar goes somewhere real', () => {
    renderWithProviders(<Sidebar />, { capabilities: [...ALL] });
    expect(screen.queryAllByText('Soon').length).toBe(0);
    for (const item of document.querySelectorAll('.sidebar-item')) {
      expect(item.getAttribute('aria-disabled')).toBeNull();
    }
  });

  it.each([
    ['People', '/app/people'],
    ['Roles', '/app/roles'],
    ['Inbox', '/app/inbox'],
    ['Analysis', '/app/analysis'],
    ['Reflect', '/app/reflect'],
    ['Activity log', '/app/logs'],
  ])('DOES navigate to %s, whose page exists', (label, href) => {
    renderWithProviders(<Sidebar />, { capabilities: [...ALL] });
    const item = screen.getByText(label).closest('.sidebar-item');
    expect(item?.tagName).toBe('A');
    expect(item?.getAttribute('href')).toBe(href);
    expect(item?.getAttribute('aria-disabled')).toBeNull();
  });
});
