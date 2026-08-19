// Presentation-only helpers. Nothing here makes a decision; nothing here knows a
// domain noun — those come from useLabels().
const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

const iso = (value: string | Date): Date => (value instanceof Date ? value : new Date(value));

export const formatDate = (value: string | Date): string => DATE.format(iso(value));
export const formatDateTime = (value: string | Date): string => DATE_TIME.format(iso(value));

/** "3 minutes ago". Relative time is the right unit for a response feed; absolute time
 *  is the right unit for a campaign window. Both exist deliberately. */
export function formatRelative(value: string | Date): string {
  const seconds = Math.round((Date.now() - iso(value).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35],
    ['month', 12], ['year', Number.POSITIVE_INFINITY],
  ];
  let amount = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(amount) < size) return rtf.format(-Math.round(amount), unit);
    amount /= size;
  }
  return DATE.format(iso(value));
}

/** Counts next to a label, using the vocabulary's own plural rather than adding an "s". */
export const pluralise = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** Minutes, for the respondent's "about 3 minutes" estimate (39). Rounds UP: promising
 *  less time than it takes is the one direction that annoys someone mid-form. */
export const minutes = (seconds: number): string => {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return `${m} minute${m === 1 ? '' : 's'}`;
};
