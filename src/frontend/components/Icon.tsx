// The icon vocabulary, closed. design_specs/design/01 §5, 24 §1.
//
// Two rules live here so that eighteen components do not each have to remember them:
//
//   1. stroke-width 2.75 — deliberately heavy, to match Caprasimo's weight and to stop
//      icons looking thin against the rounded shapes.
//   2. ONE icon per concept, always. `IconName` is the agreed vocabulary as a union, so a
//      concept nobody has picked an icon for does not compile.
//
// Never emoji. The mockups use them as placeholders; they render differently on the
// projector machine and read as unfinished. audit-drift greps for them in JSX.
import {
  BarChart3, Building2, Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, GripVertical, Home,
  Inbox, LayoutTemplate, Pencil,
  Link2, ListChecks, Menu, Network, Plus, QrCode, Send, Settings2, Shield, Sparkles,
  Target, Trash2, TrendingDown, TrendingUp, User, Users, X,
  type LucideIcon,
} from 'lucide-react';

const ICONS = {
  organization: Building2,
  structure: Network,
  role: Shield,
  person: User,
  people: Users,
  subject: Target,
  template: LayoutTemplate,
  form: ListChecks,
  campaign: Send,
  share: Link2,
  qr: QrCode,
  results: BarChart3,
  settings: Settings2,
  add: Plus,
  drag: GripVertical,
  duplicate: Copy,
  delete: Trash2,
  'trend-up': TrendingUp,
  'trend-down': TrendingDown,
  // Chrome — not in §5's table, because §5 lists concepts in the customer's world. These
  // are Endur's own furniture and cannot be renamed by a preset.
  home: Home,
  inbox: Inbox,
  reflect: Sparkles,
  chevron: ChevronDown,
  menu: Menu,
  close: X,
  // The password reveal (design_specs/design/03 §3.2 draws it as 👁, which §5's "never
  // emoji" rule turns into these two). Named for the ACTION the button performs, not for
  // the state it is in — `show` when the password is hidden — because that is what the
  // button's accessible name has to say.
  show: Eye,
  hide: EyeOff,
  // T-032. `edit` is the pencil that jumps back to a wizard step and the one that opens a
  // plural override — one concept, "change this", so one icon. `check` marks a chosen
  // card. `disclosure` is the collapsed twist in a tree; `chevron` stays the DOWN one used
  // by menus, because a tree row that points down when collapsed is backwards.
  edit: Pencil,
  check: Check,
  disclosure: ChevronRight,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** 16 inline in text and tags · 18 in buttons · 20 in nav and the tool dock · 24 in empty
 *  states. No other size — a one-off breaks the optical rhythm of a row of icons. */
export type IconSize = 16 | 18 | 20 | 24;

export function Icon({
  name,
  size = 18,
  className,
  label,
}: {
  name: IconName;
  size?: IconSize;
  className?: string;
  label?: string;
}): JSX.Element {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      strokeWidth={2.75}
      className={className}
      // Decorative unless it is the only thing carrying the meaning. An icon beside its own
      // label announced twice is worse than one not announced at all.
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      focusable="false"
    />
  );
}
