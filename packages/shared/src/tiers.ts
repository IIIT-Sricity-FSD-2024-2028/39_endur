// The revenue tiers, as DATA both apps can read. 16 §2, DEC-048.
//
// WHY THIS IS IN `shared` AND NOT IN `src/backend/billing/`.
//
// The tier is chosen at SIGN-UP (DEC-048), and `/start` has no session, no organisation and
// therefore no authenticated route to ask. `GET /billing/plans` — the route 24's <PlanPicker>
// was designed around — sits behind `billing.read`, which nobody registering an organisation
// holds yet. So the three options have to be a shape the client already has, and the only
// place both apps can read from is here.
//
// The same argument `vocabularies.ts` makes: this is ADVERTISING COPY ABOUT THE TIERS, and it
// is one of the few things the frontend is allowed to know without asking.
//
// WHAT LIVES HERE AND WHAT DOES NOT. The names, the order and the one-line pitch live here.
// The ENTITLEMENT MAP — which capability each tier includes — deliberately does not: it is
// derived from CAPABILITIES in `src/backend/billing/entitlements.ts` and it is the thing
// `requireEntitlement` decides with. Shipping it to the browser would invite a second
// implementation of the 402 decision, and INV-003's whole posture is that the client never
// decides. The server answers 402 with `requiredTier`; the client renders what it is told.
//
// THERE ARE NO PRICES, and there never will be — DEC-035. `PlanOption` carries no amount and
// no currency in any phase.

/** Every tier the product has. `subscriptions.tier` is one of these. 16 §2. */
export const TIERS = ['bronze', 'silver', 'gold', 'enterprise'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * The three an organisation may CHOOSE, at sign-up or later from settings.
 *
 * ENTERPRISE IS NOT ON THE LIST, and its absence is `DEC-048`. `16` §4 prices it individually
 * as *"a base platform plus chosen services"* — a sales conversation, not a button. It stays
 * operator-assigned through `platform.plan.override` (`19` §4), a route the spec already has
 * for exactly this. A tier nobody can self-serve is still a real tier: `TIER_ENTITLEMENTS`
 * carries it, `requireEntitlement` honours it, and an operator can set it.
 */
export const SIGNUP_TIERS = ['bronze', 'silver', 'gold'] as const;
export type SignupTier = (typeof SIGNUP_TIERS)[number];

export const isSignupTier = (value: string): value is SignupTier =>
  (SIGNUP_TIERS as readonly string[]).includes(value);

/**
 * One tier, as the customer reads it. The three fields are `16` §2's three columns, and
 * `src/backend/test/tiers.test.ts` asserts they still match that table — a picker promising
 * "Themes, sentiment, trends" for Silver while the entitlement map has moved is a lie told at
 * the moment of choosing, and drift here is otherwise invisible.
 *
 * NO `price`, NO `amount`, NO `currency` — DEC-035.
 */
export type PlanOption = {
  tier: Tier;
  /** "Bronze — Measure". The tier and the promise, which is how `16` §2 names them. */
  name: string;
  /** What it sells, in the customer's words. */
  sells: string;
  /** What it adds over the tier below. Empty for the lowest — bronze adds nothing to nothing. */
  adds: string;
  /** False for Enterprise: shown for completeness, never selectable. */
  selectable: boolean;
  /** Marketing bullet points for the plan picker UI */
  features?: string[];
};

export const PLAN_OPTIONS: readonly PlanOption[] = [
  {
    tier: 'bronze',
    name: 'Bronze — Measure',
    sells: 'Run campaigns and get results',
    adds: 'The collection engine',
    selectable: true,
    features: [
      'Run unlimited campaigns',
      'The collection engine',
      'Shared brand assets',
      'Up to 10,000 responses'
    ],
  },
  {
    tier: 'silver',
    name: 'Silver — Understand',
    sells: 'See why results moved',
    adds: 'Themes, sentiment, trends, reliability',
    selectable: true,
    features: [
      'Everything in Bronze',
      'See why results moved',
      'Themes and sentiment analysis',
      'Trends and reliability reporting',
      'Up to 50,000 responses'
    ],
  },
  {
    tier: 'gold',
    name: 'Gold — Improve',
    sells: 'Run the full loop',
    adds: 'Reflection, gap analysis, plans, check-ins',
    selectable: true,
    features: [
      'Everything in Silver',
      'Reflection and gap analysis',
      'Action plans and check-ins',
      'Full cycle improvement loop',
      'Unlimited responses'
    ],
  },
  {
    tier: 'enterprise',
    name: 'Enterprise — Decide',
    sells: 'Use output as formal evidence',
    adds: '360°, full audit, appeals, SSO, API access',
    selectable: false,
    features: [
      'Everything in Gold',
      '360° reviews and full audit',
      'Appeals and HR workflows',
      'SSO and API access',
      'Custom response limits'
    ],
  },
];

/** The three buttons at sign-up, in order. 49 § Interactions. */
export const SIGNUP_PLAN_OPTIONS: readonly PlanOption[] = PLAN_OPTIONS.filter(
  (plan) => plan.selectable,
);
