// Home dashboard DTO. 13 § Home, 46.
import { z } from 'zod';
import { dto } from './common.js';

/**
 * The period every number on the dashboard is measured over — DEC-031.
 *
 * The page shipped with an all-time response count and a "today" card beside it, and an
 * all-time total is the one number on a hub that nobody acts on: it only ever goes up, it
 * says nothing about whether the thing you launched on Monday is working, and by month
 * three it is large enough to look like a decoration. A range makes the same number answer
 * a question somebody actually has.
 *
 * FOUR VALUES AND NOT SEVEN. "This week" and "this month" (calendar-aligned) were dropped
 * in favour of rolling `7d`/`30d`, because a calendar month read on the 2nd shows two days
 * of data under a label that promises a month — the shape people misread most.
 */
export const StatWindows = ['today', '7d', '30d', 'all'] as const;
export type StatWindow = (typeof StatWindows)[number];

/**
 * `30d` is the default, deliberately, and it is the whole point of DEC-031: the first thing
 * anybody sees after signing in should be recent activity, not a lifetime total.
 */
export const HomeQuery = z.object({
  // `.catch` as well as `.default`, and that is a departure from every other DTO here: a
  // range is a DISPLAY preference, so an absent one and a junk one should both land on 30
  // days rather than 400 the first screen after sign-in. Nothing is written from it and
  // nothing is authorised by it — the capability check upstream is untouched.
  window: z.enum(StatWindows).default('30d').catch('30d'),
});
export type HomeQuery = z.infer<typeof HomeQuery>;

export const HomeDto = dto({ query: HomeQuery });

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
    /** Echoed back so the page renders the range it was actually given, not the one it asked for. */
    window: StatWindow;
    /** Responses submitted inside the window. */
    responses: number;
    /**
     * Distinct subjects that got at least one response inside the window.
     *
     * The count that answers "is the feedback spread out, or is it four people shouting
     * about one thing" — which an undivided response count cannot.
     */
    subjectsCovered: number;
    /**
     * Campaigns collecting RIGHT NOW. Deliberately not windowed: it is a statement about
     * the present, and "campaigns that were open at some point in the last 30 days" is a
     * different and much less useful fact. The card says "right now" out loud so the two
     * are never confused.
     */
    activeCampaigns: number;
    /**
     * Responses in the window over the people asked, across the campaigns that were
     * actually collecting during it.
     *
     * Null when no campaign has a denominator that exists — see 46 § Data contract and
     * `N-043`. This field summed subject counts until T-041 and rendered 2610-4675% on the
     * first screen after sign-in.
     */
    responseRate: number | null;
    /**
     * All-time, and NEVER RENDERED AS A CARD. It exists for one decision: whether this org
     * has ever collected anything, which is what separates the "you are new here" empty
     * state from "nothing arrived in the last 30 days". Reading `responses` for that would
     * show a two-year-old organisation the welcome screen every quiet month.
     */
    responsesEver: number;
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
