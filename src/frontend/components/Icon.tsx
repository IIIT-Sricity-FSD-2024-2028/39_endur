import {
  Archive, ArchiveRestore, ArrowLeft, ArrowRight, BarChart3, Building2, Check, ChevronDown, ChevronRight,
  Copy, Eye, EyeOff, History, Mail,
  GripVertical, Home,
  Inbox, LayoutTemplate, Maximize2, Monitor as MonitorSmartphone, Moon, Pencil, Play,
  Link2, ListChecks, Menu, Network, Plus, QrCode, Send, Settings2, Shield, Sparkles, Sun,
  Target, Trash2, TrendingDown, TrendingUp, User, Users, X,
  GraduationCap, Building, HeartPulse, Layers,
  Rocket, Megaphone, CalendarClock, Timer,
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
  university: GraduationCap,
  hospital: HeartPulse,
  hotel: Building,
  home: Home,
  inbox: Inbox,
  reflect: Sparkles,
  chevron: ChevronDown,
  menu: Menu,
  close: X,
  show: Eye,
  hide: EyeOff,
  edit: Pencil,
  check: Check,
  disclosure: ChevronRight,
  light: Sun,
  dark: Moon,
  'theme-system': MonitorSmartphone,
  arrow: ArrowRight,
  back: ArrowLeft,
  play: Play,
  preview: Maximize2,
  archive: Archive,
  restore: ArchiveRestore,
  unread: Mail,
  log: History,
  plan: Layers,
  start: Rocket,
  announcement: Megaphone,
  booking: CalendarClock,
  countdown: Timer,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

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
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      focusable="false"
    />
  );
}
