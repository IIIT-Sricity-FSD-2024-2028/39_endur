// The sidebar's items. design_specs/design/02 §3 for the grouping and the order.
//
// The labels are a FUNCTION of the vocabulary, not constants — a hotel's sidebar reads
// "Restaurants", not "Subjects" (INV-001). Only Endur's own furniture stays literal:
// Home, Structure, Roles, People, Templates, Settings describe the product, not the
// customer's world (22 §1).
import type { ResolvedLabels } from '@endur/shared';
import type { Capability } from '@endur/shared';
import type { IconName } from '../Icon.js';

export type NavGroup = 'organize' | 'collect' | 'understand' | 'system';

export type NavItem = {
  to: string;
  label: string;
  icon: IconName;
  group: NavGroup;
  /** Renders greyed with a "Soon" tag and never navigates. Set it for anything not built
   *  yet, P3 or P2 — an item that navigates to "Not built yet" is a worse answer than one
   *  that visibly does not navigate (design_specs/design/02 §7). */
  disabled?: boolean;
  /** One line of what the screen will do, shown on hover. Required when disabled — a
   *  greyed item with no explanation is just a broken link. */
  soonHint?: string;
  /** Hides the item when the caller does not hold it. Usability, never enforcement. */
  needs?: Capability;
};

export const GROUP_LABELS: Record<NavGroup, string | null> = {
  organize: 'Organize',
  collect: 'Collect',
  understand: 'Understand',
  // System items sit below the groups with no heading — Settings does not need one.
  system: null,
};

export function navItems(labels: ResolvedLabels): NavItem[] {
  return [
    { to: '/app', label: 'Home', icon: 'home', group: 'system' },

    { to: '/app/structure', label: 'Structure', icon: 'structure', group: 'organize',
      needs: 'unit.read' },
    // P2, after M0. Disabled for the same reason the P3 items are: the route exists as a
    // contract with 20 §2, but the page behind it is scaffold, and a sidebar that
    // navigates to "Not built yet" is the one thing 02 §7 tells us not to build.
    { to: '/app/roles', label: 'Roles', icon: 'role', group: 'organize', needs: 'role.read',
      disabled: true,
      soonHint: 'Roles, and the grid of what each one is allowed to do.' },
    // Un-disabled by T-050. It is the LAST edit of that task and not a task of its own:
    // an item that navigates to a half-built page is the one thing 02 §7 forbids.
    { to: '/app/people', label: 'People', icon: 'people', group: 'organize',
      needs: 'person.read' },
    { to: '/app/subjects', label: labels.subject.many, icon: 'subject', group: 'organize',
      needs: 'subject.read' },

    { to: '/app/templates', label: 'Templates', icon: 'template', group: 'collect',
      needs: 'template.read' },
    { to: '/app/campaigns', label: labels.campaign.many, icon: 'campaign', group: 'collect',
      needs: 'campaign.read' },

    // P3 — visible, disabled, and honest about it. Showing the roadmap costs an hour and
    // turns "what's next?" into something an evaluator can see (design_specs/design/02 §7).
    // Same treatment as Roles and People above; only the phase differs.
    { to: '/app/analysis', label: 'Analysis', icon: 'results', group: 'understand',
      disabled: true,
      soonHint: 'Themes, sentiment and key drivers across every response.' },
    { to: '/app/inbox', label: 'Inbox', icon: 'inbox', group: 'understand',
      disabled: true,
      soonHint: 'Every response as it arrives, in one reviewable stream.' },
    { to: '/app/reflect', label: 'Reflect', icon: 'reflect', group: 'understand',
      disabled: true,
      soonHint: 'Compare how you rate yourself against how others rate you.' },

    { to: '/app/settings', label: 'Settings', icon: 'settings', group: 'system',
      needs: 'org.read' },
  ];
}
