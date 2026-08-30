// How long a plan runs for, in ONE place. DEC-096, 16 §7c.
//
// THE PERIOD IS ONE CALENDAR MONTH. It was a year, and it was a year in FOUR separate
// expressions — `features/auth/service.ts` (registration), `features/billing/service.ts`
// (the D-012 repair on read), `features/platform/service.ts` (an operator override), and
// `database/seed/demo.ts`. The doc that ordered this change said three; the fourth was found
// by grepping for the column rather than for the number, which is the only way to find the
// copy nobody remembered writing.
//
// AND THEY ALREADY DISAGREED. Two used `+ 365 * DAY` and two used `setFullYear(+1)`, so in a
// leap year an organisation that registered got a period one day longer than an organisation
// the operator repaired. Nothing read the difference, which is exactly why it survived: a
// constant duplicated four ways is not wrong until something starts depending on it, and
// `DEC-098` is about to make `period_end` the date a downgrade fires on.
//
// A CALENDAR MONTH, NEVER 30 DAYS. A customer renews on the date they joined; a 30-day period
// walks backwards through the calendar and by the sixth renewal it is nowhere near the day
// anybody has in their head.
//
// COMPUTED IN UTC, because `subscriptions.period_start` / `period_end` are `@db.Date` — a
// column with no time and no zone. Mixing local-time arithmetic with a date column is how the
// two old expressions came to differ; doing all of it in UTC means the date stored is the date
// computed, wherever the server runs.
/** One month. Named rather than inlined so the next change is to a value, not to arithmetic. */
export const BILLING_PERIOD_MONTHS = 1;

/**
 * The end of the period that starts at `start`.
 *
 * CLAMPED TO THE LAST DAY OF THE TARGET MONTH. JavaScript rolls 31 January + 1 month forward
 * to 3 March rather than refusing, so an organisation joining on the 31st would silently get
 * three extra days — and, once `DEC-098` lands, a scheduled downgrade that fires in the wrong
 * month. `setUTCDate(0)` steps back to the last day of the previous month, which is the
 * clamp: 31 Jan -> 28 Feb (29 in a leap year), 31 Mar -> 30 Apr.
 */
export function periodEndFrom(start: Date): Date {
  const end = new Date(start.getTime());
  const day = end.getUTCDate();
  end.setUTCMonth(end.getUTCMonth() + BILLING_PERIOD_MONTHS);
  if (end.getUTCDate() !== day) end.setUTCDate(0);
  return end;
}

/**
 * A fresh period starting now. The two dates are derived from ONE `Date` rather than two
 * `new Date()` calls — a pair taken either side of midnight would store a period that starts
 * the day after it ends, and it would happen once a month at 00:00 for whoever is awake.
 */
export function newPeriod(): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date();
  return { periodStart, periodEnd: periodEndFrom(periodStart) };
}

/**
 * Has the period that ends on `periodEnd` finished? `DEC-098`, `16` §7b.
 *
 * INCLUSIVE OF ITS LAST DAY. `/app/plan` prints *"when this period ends on 30 September"*, so
 * the 30th is a day the customer still holds the plan they paid for and the 1st is the first
 * day they do not. `periodEnd < today` says exactly that; `<=` would take the plan away on
 * the date the page promised it would last until.
 *
 * COMPARED AT UTC MIDNIGHT ON BOTH SIDES. `period_end` is `@db.Date`, which Prisma hands back
 * as midnight UTC, and `new Date()` is a moment with a time on it — comparing the two directly
 * would make a period end at whatever o'clock the server was started in.
 */
export function periodHasEnded(periodEnd: Date, now: Date = new Date()): boolean {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return periodEnd.getTime() < today;
}
