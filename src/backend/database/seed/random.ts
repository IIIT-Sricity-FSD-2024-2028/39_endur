// Deterministic pseudo-randomness for the seed. 50 §8.
//
// DETERMINISTIC, never randomised: the demo must be identical every run. A seed that
// produces different numbers each time makes "the ratings look wrong today" impossible to
// investigate, and turns a rehearsal into no evidence at all.
//
// mulberry32 — 32 bits of state, four lines, and the same sequence on every machine. There
// is no need for anything stronger here: nothing in a seed is a secret.

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)] as T;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** A few distinct picks, without repeats. Used for multi-select answers. */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    for (let i = 0; i < count && pool.length > 0; i += 1) {
      out.push(pool.splice(this.int(0, pool.length - 1), 1)[0] as T);
    }
    return out;
  }
}

/**
 * Ratings are NOT uniform (50 §3). Real feedback skews positive with a long negative tail,
 * and a flat distribution is the single most obvious tell that a results screen is fake.
 *
 * `quality` moves the whole curve: 0.9 is a well-liked subject, 0.3 is the one that
 * deliberately scores badly so the results screen has something to show.
 */
export function skewedRating(rng: Rng, max: number, quality: number): number {
  // Order statistics rather than arithmetic on a single uniform. Taking the HIGHEST of a
  // few draws produces a mode near the top with a thin tail running down — which is the
  // actual shape of collected ratings. Taking the LOWEST produces its mirror, which is what
  // a genuinely disliked subject looks like.
  //
  // Blending a uniform toward the top instead (the obvious first attempt) pulls the mean to
  // the middle and gives every subject an average near 2.5, so nothing stands out and the
  // results screen has nothing to show.
  const strength = Math.round(Math.abs(quality - 0.5) * 6);
  const upward = quality >= 0.5;

  let u = rng.next();
  for (let i = 0; i < strength; i += 1) {
    const next = rng.next();
    u = upward ? Math.max(u, next) : Math.min(u, next);
  }

  return Math.min(max, Math.max(1, 1 + Math.round(u * (max - 1))));
}

/** NPS: promoters cluster at 9-10, detractors spread across 0-6. */
export function skewedNps(rng: Rng, quality: number): number {
  if (rng.chance(quality * 0.75)) return rng.int(9, 10);
  if (rng.chance(0.45)) return rng.int(7, 8);
  return rng.int(0, 6);
}

/**
 * Response times spread across the window, with a spike at the start and another before
 * the close (50 §3). Uniform timestamps read as generated the moment anyone sorts by date.
 */
export function skewedTimestamp(rng: Rng, startsAt: Date, endsAt: Date): Date {
  const span = endsAt.getTime() - startsAt.getTime();
  const roll = rng.next();
  const position =
    roll < 0.35
      ? rng.next() * 0.15 // the opening rush
      : roll > 0.75
        ? 0.85 + rng.next() * 0.15 // the deadline rush
        : 0.15 + rng.next() * 0.7; // the long quiet middle
  return new Date(startsAt.getTime() + span * position);
}
