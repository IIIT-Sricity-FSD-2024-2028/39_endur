// The sidebar is where two invariants meet, and both are easy to break by accident:
// INV-001 (no hardcoded domain noun) and INV-003 (out of scope is absent, not greyed).
// The "Soon" items are a third, separate thing — nobody can reach them yet, which is not
// the same as "you may not".
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Sidebar } from './Sidebar.js';
import { NONSENSE_LABELS, renderWithProviders } from '../../test-utils.js';

// `org.update` joined this list at T-087, when Settings moved off `org.read` — a fixture
// called ALL that omits the one capability an item needs is a fixture that lies.
const ALL = ['unit.read', 'role.read', 'person.read', 'subject.read',
             'template.read', 'campaign.read', 'org.read', 'org.update'] as const;

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

// T-087 — WHAT EACH ROLE LEVEL SEES. 55 § Stage 8, DEC-051, and OPEN-009 is what it closes.
//
// One test per level asserting the EXACT list, because "which of these five is missing" is
// not something a reviewer catches by eye, and the failure this whole task exists to fix was
// invisible for exactly that reason: People looked present and correct on every account.
//
// THESE FOUR MAPS ARE THE SEEDED MATRIX (50 §1) folded to the widest scope per capability,
// which is what /auth/me actually sends. They are written out rather than imported because
// the matrix is backend-owned (presets/grant-matrix.ts) and the frontend does not read it.
// `me.test.ts` asserts the backend half against real accounts, so drift shows up there.
describe('what each level sees', () => {
  const L1 = {
    'org.read': 'all', 'org.update': 'all', 'unit.read': 'subtree', 'role.read': 'all',
    'person.read': 'subtree', 'subject.read': 'subtree', 'template.read': 'all',
    'campaign.read': 'subtree',
  } as const;
  const L2 = { ...L1, 'org.update': undefined } as const;
  const L3 = {
    'org.read': 'all', 'unit.read': 'own_unit', 'role.read': 'all',
    'person.read': 'own_unit', 'subject.read': 'own_unit', 'template.read': 'all',
    'campaign.read': 'own_unit',
  } as const;
  const L4 = {
    'org.read': 'all', 'subject.read': 'own_unit',
    'person.read': 'self', 'person.update': 'self',
  } as const;

  /** Every item actually rendered, in order, disabled ones included. */
  const rendered = (): string[] =>
    [...document.querySelectorAll('.sidebar-item')].map(
      (node) => node.querySelector('span:not(.tag)')?.textContent ?? '',
    );

  const show = (capabilities: Record<string, string | undefined>) =>
    renderWithProviders(<Sidebar />, { capabilities, labels: NONSENSE_LABELS });

  it('L1 owner — everything, including Settings', () => {
    show(L1);
    // `system` is the FIRST group in the sidebar's order, so Home and Settings sit
    // together at the top — Settings is not a footer item (design_specs/design/02 §3).
    expect(rendered()).toEqual([
      'Home', 'Settings', 'Structure', 'Roles', 'People', 'Quaxels',
      'Templates', 'Plithes', 'Analysis', 'Inbox', 'Reflect',
    ]);
  });

  it('L2 section head — the same, minus Settings', () => {
    // The ONLY difference between L1 and L2 in the seeded matrix that a nav item reads.
    // Settings needs `org.update`, which is L1 alone — that is the whole of this test.
    show(L2);
    expect(rendered()).toEqual([
      'Home', 'Structure', 'Roles', 'People', 'Quaxels',
      'Templates', 'Plithes', 'Analysis', 'Inbox', 'Reflect',
    ]);
  });

  it('L3 reviewee-level — KEEPS People, because their roster is real', () => {
    // OPEN-009's one genuinely open cell, answered by the owner 24 Aug: an L3 holds
    // `person.read: own_unit` from the matrix, so their People page lists their actual
    // colleagues rather than themselves. The item stays; the grant stays (DEC-051).
    show(L3);
    expect(rendered()).toContain('People');
    expect(rendered()).toEqual([
      'Home', 'Structure', 'Roles', 'People', 'Quaxels',
      'Templates', 'Plithes', 'Analysis', 'Inbox', 'Reflect',
    ]);
  });

  it('L4 lowest — Subjects, and nothing else in `organize`', () => {
    // The owner's ask, translated out of the university preset (INV-002): "student /
    // lowest tier shouldn't see roles, people and department pages at all, even if they
    // see nothing actually in it. only courses list."
    show(L4);
    expect(rendered()).toEqual(['Home', 'Quaxels', 'Analysis', 'Inbox', 'Reflect']);
  });

  it('drops People for an account that can only reach itself — the whole of D-027', () => {
    // The single assertion this task exists for. `person.read: self` is seeded to EVERY
    // role so /app/profile opens, so before T-087 this item appeared for every account in
    // the product and then listed exactly one person: the reader.
    show(L4);
    expect(screen.queryByText('People')).toBeNull();
    // And it is a SCOPE decision, not a removal: give the same account `own_unit` and the
    // item comes back. Nothing about the capability changed.
    show({ ...L4, 'person.read': 'own_unit' });
    expect(screen.getAllByText('People').length).toBeGreaterThan(0);
  });

  it('drops Settings on the CAPABILITY, not the scope — org.read is `all` even at L4', () => {
    // Worth pinning because a scope minimum looks like it should work here and cannot:
    // `org.read: all` is seeded to all four levels so the vocabulary loads on first paint,
    // so `org.read` at ANY minimum still passes for the lowest account in the product.
    show(L4);
    expect(screen.queryByText('Settings')).toBeNull();
    // Widening org.read changes nothing — it is already as wide as scopes go.
    show({ ...L4, 'org.read': 'all' });
    expect(screen.queryByText('Settings')).toBeNull();
    // `org.update` is what actually opens it.
    show({ ...L4, 'org.update': 'all' });
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
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
    // Three P3 items, plus Roles — which is still scaffold. **People left this list at
    // T-050**, when its page was actually built. The count is the assertion: an item goes
    // back to being a link when its page exists, and never before
    // (design_specs/design/02 §7). If this number goes UP, something regressed; if it goes
    // down, check the page behind it is real before changing the number.
    expect(screen.getAllByText('Soon').length).toBe(4);
  });

  it('does not navigate to a page that is only scaffold', () => {
    renderWithProviders(<Sidebar />, { capabilities: [...ALL] });
    for (const label of ['Roles']) {
      const item = screen.getByText(label).closest('.sidebar-item');
      expect(item?.getAttribute('aria-disabled')).toBe('true');
      expect(item?.tagName).not.toBe('A');
    }
  });

  // The other half of the rule, and the half nothing asserted before T-050: a page that
  // EXISTS must be reachable. Without this, un-disabling an item could be forgotten
  // indefinitely and only the count above would notice — and only if somebody changed it.
  it('DOES navigate to People, whose page exists since T-050', () => {
    renderWithProviders(<Sidebar />, { capabilities: [...ALL] });
    const item = screen.getByText('People').closest('.sidebar-item');
    expect(item?.tagName).toBe('A');
    expect(item?.getAttribute('href')).toBe('/app/people');
    expect(item?.getAttribute('aria-disabled')).toBeNull();
  });

  it('explains itself on hover — a greyed item with no reason is a broken link', () => {
    renderWithProviders(<Sidebar />, { capabilities: [...ALL] });
    const hint = screen.getByText('Inbox').closest('.sidebar-item')?.getAttribute('title');
    expect(hint).toBeTruthy();
    expect(hint?.length).toBeGreaterThan(20);
  });
});
