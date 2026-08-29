// The icon vocabulary, closed. design_specs/design/01 §5, 24 §1.
//
// Two rules live here so that eighteen components do not each have to remember them:
//
//   1. stroke-width 2.1 — heavy enough not to look thin against the rounded shapes, light
//      enough to sit with Outfit. It was 2.75 to match Caprasimo, which was a much darker
//      face; carrying that weight over to Outfit made every icon read as a bold accent
//      next to its own label (DEC-027).
//   2. ONE icon per concept, always. `IconName` is the agreed vocabulary as a union, so a
//      concept nobody has picked an icon for does not compile.
//
// Never emoji. The mockups use them as placeholders; they render differently on the
// projector machine and read as unfinished. audit-drift greps for them in JSX.
import {
  Archive, ArchiveRestore, ArrowLeft, ArrowRight, BarChart3, Building2, Check, ChevronDown, ChevronRight,
  Copy, Eye, EyeOff, History, Mail,
  GripVertical, Home,
  Inbox, LayoutTemplate, Maximize2, Monitor as MonitorSmartphone, Moon, Pencil, Play,
  Link2, ListChecks, Menu, Network, Plus, QrCode, Send, Settings2, Shield, Sparkles, Sun,
  Target, Trash2, TrendingDown, TrendingUp, User, Users, X,
  GraduationCap, Building, HeartPulse, Layers,
  Rocket, Megaphone, CalendarClock,
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
  // Industry Preset Icons
  university: GraduationCap,
  hospital: HeartPulse,
  hotel: Building,
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
  // Theme (DEC-028). Three, because the choice is three-valued: following the OS is a
  // state of its own and needs a glyph that is neither sun nor moon.
  light: Sun,
  dark: Moon,
  'theme-system': MonitorSmartphone,
  // Landing and empty states.
  arrow: ArrowRight,
  // The way back out of a flow. NOT `disclosure` rotated: a chevron is the twist on a
  // tree row and the ">" in a breadcrumb, and giving it a second meaning is how a row
  // starts looking like it can be collapsed. One icon per concept (rule 2 above).
  back: ArrowLeft,
  play: Play,
  preview: Maximize2,
  // T-080. The inbox's two toggles. `unread` is the envelope you put a comment BACK into,
  // named for the action like `show`/`hide` above and not for the state it is in.
  archive: Archive,
  restore: ArchiveRestore,
  unread: Mail,
  // T-076. The activity log. NOT `settings`, even though the item sits beside Settings in
  // the same group: rule 2 above is one icon per concept, and two items in one group
  // sharing a glyph is how a sidebar starts looking like a mistake.
  log: History,
  // The plan (49). `Layers` and not a card, coin or banknote: there is no money in this
  // product (DEC-035), and a payment glyph would promise a checkout that does not exist.
  // What a tier actually is here is a stack — each one carries everything under it.
  plan: Layers,
  // T-093. The start gallery, and the two surfaces it advertises before they exist. One
  // icon per concept (rule 2): `start` is NOT `add` — the gallery is a place to choose
  // from, not a button that creates a row — and `announcement` is NOT `unread`, which is
  // the inbox's envelope-it-again action.
  start: Rocket,
  announcement: Megaphone,
  booking: CalendarClock,
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
      strokeWidth={2.1}
      className={className}
      // Decorative unless it is the only thing carrying the meaning. An icon beside its own
      // label announced twice is worse than one not announced at all.
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      focusable="false"
    />
  );
}
