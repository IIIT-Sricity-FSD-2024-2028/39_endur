// How long a plan period lasts, in one place: one calendar month, worked out in UTC.
// One month. Named, so a future change is to a value and not to arithmetic.
export const BILLING_PERIOD_MONTHS = 1;

// End of the period that starts at 'start', clamped so 31 Jan plus a month is 28 Feb and not 3 March.
export function periodEndFrom(start: Date): Date {
  const end = new Date(start.getTime());
  const day = end.getUTCDate();
  end.setUTCMonth(end.getUTCMonth() + BILLING_PERIOD_MONTHS);
  if (end.getUTCDate() !== day) end.setUTCDate(0);
  return end;
}

// A fresh period starting now. Both dates come from one clock reading, so they cannot straddle midnight.
export function newPeriod(): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date();
  return { periodStart, periodEnd: periodEndFrom(periodStart) };
}

// Has the period finished? Its last day still counts as paid, and both sides are compared at UTC midnight.
export function periodHasEnded(periodEnd: Date, now: Date = new Date()): boolean {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return periodEnd.getTime() < today;
}
