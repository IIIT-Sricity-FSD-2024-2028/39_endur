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
//
// THE PRICES ARE PER MONTH — DEC-096, and the numbers did not move when the period did. The
// owner asked for monthly billing and confirmed the figures stay at ₹99 / ₹499 / ₹999
// (OPEN-015, answered 31 Aug): ₹99 a YEAR for an organisation running unlimited campaigns is
// not a price anybody would defend, and ₹99 a month is. Dividing by twelve was the other
// reading and it gives three numbers no customer recognises, printed with decimals that
// `formatMoney` below correctly calls an accounting document impersonating a price tag.
//
// ALL FOUR TIERS CARRY A PRICE — DEC-099. Enterprise's was `0`, and `0` was a SENTINEL rather
// than an amount: it meant "ask us", it read as "free" to anything that did not know, and it
// forced `selectable: false` to be checked before the price could be printed. That special
// case leaked out of this file as copy — "Priced with you", "Arranged with us". A real number
// deletes the sentinel, the branch and the copy together, and `selectable` goes back to
// meaning only what it says: the customer cannot assign this to themselves.

/** Every tier the product has. `subscriptions.tier` is one of these. 16 §2. */
export const TIERS = ['bronze', 'silver', 'gold', 'enterprise'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * The three an organisation may CHOOSE, at sign-up or later from settings.
 *
 * ENTERPRISE IS NOT ON THE LIST, and its absence is `DEC-048`. It now carries a real price —
 * ₹4,999 a month, `DEC-099` — and a price is still not a checkout: the tier stays
 * operator-assigned through `platform.plan.override` (`19` §4), a route the spec already has
 * for exactly this, and the customer's own verb is REQUEST rather than Join (`DEC-100`). A
 * tier nobody can self-serve is still a real tier: `TIER_ENTITLEMENTS` carries it,
 * `requireEntitlement` honours it, and an operator can set it.
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
  /**
   * False for Enterprise, and since `DEC-099` it means EXACTLY ONE THING: the customer cannot
   * assign this tier to themselves. Not "it has no price", not "it is not real" — it has both.
   * The card prints its amount like every other, the customer can request it, and an operator
   * can set it. Every reader that keys off this flag should be asking about ASSIGNMENT.
   */
  selectable: boolean;
  /**
   * MINOR UNITS, for ONE CALENDAR MONTH. 9900 = ₹99.00. DEC-080, and the period is DEC-096.
   *
   * EVERY TIER HAS ONE SINCE `DEC-099`. Enterprise used to carry `0` as a sentinel meaning
   * "ask us", which was never free and was read as free by anything that did not know — so it
   * forced a special case into every reader and the special case leaked out as copy. It is
   * ₹4,999 now, it prints, and the branch that guarded the sentinel is deleted WITH it: a
   * guard left standing after the thing it defended is gone is an invitation to restore the
   * branch.
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
    // DEC-099 — the customer cannot assign this to themselves, and that is now ALL this flag
    // says. `SIGNUP_PLAN_OPTIONS` still filters on it, `joinTier` still refuses it, and the
    // card's verb is Request.
    selectable: false,
    // ₹4,999 a month, by owner directive (DEC-099). It was `0`, which was a sentinel and not
    // a price, and the sentinel cost more than it saved.
    priceMinor: 499900,
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
 * What a tier costs for one month. THE SERVER PRICES EVERY PAYMENT THROUGH THIS (DEC-080) —
 * the client sends a tier and a reference, never an amount.
 */
export const priceOf = (tier: Tier): number =>
  PLAN_OPTIONS.find((plan) => plan.tier === tier)?.priceMinor ?? 0;

/**
 * WHAT A MOVE COSTS — the one formula, in the one place `priceOf` already lives. DEC-097.
 *
 * A SIGN-UP (`from === null`) COSTS THE FULL PRICE; there was no plan before it. AN UPGRADE
 * COSTS THE DIFFERENCE, because the customer has already paid for this period and charging
 * the full new price bills the overlap twice — the same objection DEC-096 makes about
 * downgrades, pointed the other way.
 *
 * IT ALSO CORRECTS A NUMBER NOBODY HAD NOTICED. `/ops/earnings` sums `payments`. Under the
 * old rule an organisation that walked Bronze -> Silver -> Gold inside one period contributed
 * 9900 + 49900 + 99900 = ₹1,597 to estate revenue for a customer holding one ₹999 plan — the
 * ledger overstated, and it overstated MOST for the customers who upgrade most. This sums to
 * ₹999.
 *
 * NOT PRORATED BY DAYS REMAINING, and that is a decision rather than an omission (DEC-097):
 * with a one-month period the largest possible overcharge is one month of one step, and
 * proration buys that back at the cost of a SECOND money formula and a rounding rule in a
 * module whose opening comment is that there are no floats. Revisit when renewal exists.
 *
 * CLAMPED AT ZERO, and the clamp should be unreachable. `POST /billing/tier` refuses a lower
 * or equal rank before anything is written (DEC-096), so a negative here means a caller got
 * past that check — and a negative row in an append-only ledger is a REFUND, which is the one
 * thing this product has never had. Clamping turns a silent accounting lie into a ₹0 row
 * somebody will ask about.
 */
export const changeCostMinor = (from: Tier | null, to: Tier): number =>
  from === null ? priceOf(to) : Math.max(0, priceOf(to) - priceOf(from));

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
