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
    /**
     * Null when no campaign has a denominator that exists — see 46 § Data contract and
     * `N-043`. This field summed subject counts until T-041 and rendered 2610-4675% on the
     * first screen after sign-in.
     */
    responseRate: number | null;
  };
  activeCampaigns?: Array<{
    id: string;
    name: string;
    subjectCount: number;
    responseCount: number;
    endsAt: string | null;
    /**
     * The `/r/:token` link, so the card's Share opens a QR without a second request.
     *
     * The most common thing anybody wants from this screen during a demo is the code
     * (46 § Interactions), and fetching it on the click puts venue wifi between somebody
     * holding a phone up and the thing they are pointing it at. Null only for a campaign
     * that is open but has never been launched, which cannot happen — status is derived
     * from the token (DEC-016) — and is typed anyway rather than asserted.
     */
    url: string | null;
    /** <ShareSheet> says whether responses are anonymous; the promise is per campaign. */
    anonymous: boolean;
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
