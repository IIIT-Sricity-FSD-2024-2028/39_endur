// Home dashboard DTO. 13 § Home, 46.
import { dto } from './common.js';

export const HomeDto = dto({});

/**
 * The whole dashboard, in ONE round trip (46).
 *
 * Every section is OPTIONAL, and that is load-bearing rather than defensive typing: a
 * section the caller cannot read is ABSENT, not empty and not greyed (INV-003). A
 * faculty-level user sees a much smaller home than a dean, and that is the correct
 * behaviour rather than a degraded one.
 */
export type HomeView = {
  stats: {
    responsesTotal: number;
    responsesToday: number;
    activeCampaigns: number;
    responseRate: number | null;
  };
  activeCampaigns?: Array<{
    id: string;
    name: string;
    subjectCount: number;
    responseCount: number;
    endsAt: string | null;
  }>;
  recentComments?: Array<{ text: string; subjectName: string | null; submittedAt: string }>;
  /**
   * At most TWO at a time, in priority order. A dashboard that nags with six banners is a
   * dashboard people stop reading (46).
   */
  prompts: Array<{
    kind: 'no_subjects' | 'no_campaigns' | 'setup_incomplete' | 'seats_over';
    href: string;
  }>;
  /** False for a brand-new org, so the console can redirect to the wizard (46). */
  configured: boolean;
};
