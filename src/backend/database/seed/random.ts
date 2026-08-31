// Predictable pseudo-random numbers for the seed, so the demo data is identical on every run and machine.
// mulberry32: four lines and 32 bits of state. Nothing in a seed is a secret, so nothing stronger is needed.

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  // A number from 0 up to but not including 1.
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

  // A few different picks with no repeats. Used for multi-select answers.
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    for (let i = 0; i < count && pool.length > 0; i += 1) {
      out.push(pool.splice(this.int(0, pool.length - 1), 1)[0] as T);
    }
    return out;
  }
}

// Ratings are not spread evenly: real feedback leans positive with a thin negative tail,
// and a flat spread is the clearest sign a results screen is fake. 'quality' shifts the whole curve.
export function skewedRating(rng: Rng, max: number, quality: number): number {
  // Taking the highest of a few draws puts the peak near the top with a thin tail; the lowest mirrors it for a poor subject.
  const strength = Math.round(Math.abs(quality - 0.5) * 6);
  const upward = quality >= 0.5;

  let u = rng.next();
  for (let i = 0; i < strength; i += 1) {
    const next = rng.next();
    u = upward ? Math.max(u, next) : Math.min(u, next);
  }

  return Math.min(max, Math.max(1, 1 + Math.round(u * (max - 1))));
}

// NPS: promoters cluster at 9 and 10, detractors spread across 0 to 6.
export function skewedNps(rng: Rng, quality: number): number {
  if (rng.chance(quality * 0.75)) return rng.int(9, 10);
  if (rng.chance(0.45)) return rng.int(7, 8);
  return rng.int(0, 6);
}

// Response times spread across the window, with a rush at the start and another before the close.
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
