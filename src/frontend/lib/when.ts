// `<input type="datetime-local">` values: wall-clock times in the browser's own time zone,
// written `2026-11-06T21:10`, with no zone attached.

/** The input's value for an instant: what the person would type to mean it. */
export function toLocalInput(value: string | Date | number): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Whether an input's value names a moment that has already gone. Empty is not past: an empty
 * closing time means "until somebody closes it".
 */
export function isPast(local: string, now: number = Date.now()): boolean {
  if (!local) return false;
  const at = new Date(local).getTime();
  return !Number.isNaN(at) && at <= now;
}

/** Said under a closing time that has gone, in every form that asks for one. */
export const PAST_CLOSE = 'That time has already passed. Pick a later one, or leave it empty.';
