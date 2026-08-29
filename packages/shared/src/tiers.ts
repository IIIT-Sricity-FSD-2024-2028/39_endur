// The revenue tiers, as DATA both apps can read. 16 §2, DEC-048, DEC-080.
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
// WHAT LIVES HERE AND WHAT DOES NOT. The names, the order, the one-line pitch and — since
// DEC-080 — the PRICE live here. The ENTITLEMENT MAP — which capability each tier includes —
// deliberately does not: it is derived from CAPABILITIES in
// `src/backend/billing/entitlements.ts` and it is the thing `requireEntitlement` decides with.
// Shipping it to the browser would invite a second implementation of the 402 decision, and
// INV-003's whole posture is that the client never decides. The server answers 402 with
// `requiredTier`; the client renders what it is told.
//
// THERE ARE PRICES AGAIN — DEC-080 supersedes DEC-035. A price is ADVERTISING COPY in exactly
// the way the pitch line is: the picker has to print it before anyone has a session. What it
// is NOT is an authorisation input. The amount a payment is recorded at is read from this
// table SERVER-SIDE, on both write paths, and never from a request body — a client that posts
// its own number is posting a number nothing reads.
//
// MONEY IS AN INTEGER IN MINOR UNITS (paise). 9900 is ₹99.00. No floats, no decimal strings,
// no per-currency special cases: `currency` is `'INR'` on every row, and widening that is a
// schema conversation rather than a formatting one.

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

/** The only currency the product prices in. DEC-080. */
export type Currency = 'INR';

/**
 * One tier, as the customer reads it. The first three fields are `16` §2's three columns, and
 * `src/backend/test/tiers.test.ts` asserts they still match that table — a picker promising
 * "Themes, sentiment, trends" for Silver while the entitlement map has moved is a lie told at
 * the moment of choosing, and drift here is otherwise invisible. The same test now guards the
 * prices, for the same reason and with more at stake.
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
  /**
   * MINOR UNITS, for one year. 9900 = ₹99.00. DEC-080.
   *
   * `0` on Enterprise, and that is NOT "free": `selectable: false` is what the picker reads,
   * and it prints "Arranged with us" where the other three print an amount. Nothing may
   * render ₹0 out of this field.
   */
  priceMinor: number;
  currency: Currency;
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
    priceMinor: 9900,
    currency: 'INR',
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
    // T-096. ANNOUNCEMENTS ARE NAMED HERE because they are gated here (`16` §3). A tier
    // that withholds a feature the plan page does not mention is a tier that looks
    // arbitrary — the customer meets it as a 402 with nothing on this page to explain it.
    adds: 'Themes, sentiment, trends, reliability, announcements',
    selectable: true,
    priceMinor: 49900,
    currency: 'INR',
    features: [
      'Everything in Bronze',
      'See why results moved',
      'Themes and sentiment analysis',
      'Trends and reliability reporting',
      'Announcements with read receipts',
      'Up to 50,000 responses'
    ],
  },
  {
    tier: 'gold',
    name: 'Gold — Improve',
    sells: 'Run the full loop',
    // T-096. Booking joins the Gold line for the reason announcements join Silver.
    adds: 'Reflection, gap analysis, plans, check-ins, booking',
    selectable: true,
    priceMinor: 99900,
    currency: 'INR',
    features: [
      'Everything in Silver',
      'Reflection and gap analysis',
      'Action plans and check-ins',
      'Booking and slot capacity',
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
    priceMinor: 0,
    currency: 'INR',
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

/**
 * What a tier costs. THE SERVER PRICES EVERY PAYMENT THROUGH THIS (DEC-080) — the client
 * sends a tier and a reference, never an amount.
 */
export const priceOf = (tier: Tier): number =>
  PLAN_OPTIONS.find((plan) => plan.tier === tier)?.priceMinor ?? 0;

/**
 * Money, as one string, from one place.
 *
 * WHOLE RUPEES WHEN THE PAISE ARE ZERO, which they always are today — "₹99" is what the
 * customer was told, and "₹99.00" is an accounting document impersonating a price tag. A
 * non-zero remainder prints both decimals rather than rounding, because a rounded amount on
 * a receipt is a wrong amount.
 */
export const formatMoney = (minor: number, currency: Currency = 'INR'): string => {
  const whole = minor % 100 === 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(minor / 100);
};

/**
 * Where a tier sits in the ladder. `TIERS` is ordered smallest-first and the entitlement
 * map is strictly cumulative (`src/backend/billing/entitlements.ts`), so the index IS the
 * ordering and nothing has to restate it.
 *
 * It exists because ONE screen needs the direction of a change rather than the tier: an
 * upgrade applies with no dialog, a downgrade confirms, because a downgrade takes surfaces
 * away (`49` § Interactions). This is a COPY decision — which sentence to show — and never
 * an authorisation one. The client still cannot decide a 402: the entitlement map does not
 * ship to the browser, and this says nothing about what a tier includes.
 */
export const tierRank = (tier: Tier): number => TIERS.indexOf(tier);
