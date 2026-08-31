// The analysis engine. It imports nothing but its own word lists: no database, no network, no HTTP.
// That is how the promise that respondents' words never leave the process is enforced rather than remembered,
// and a test asserts the absence over the whole folder.
// Everything here is arithmetic a person could do by hand with a dictionary:
//   split into words, drop stop-words, stem, count which words appear together, merge into at most
//   12 themes, score each comment against the lexicon, then correlate a theme with the rating given.
import { NEGATION_WINDOW, NEGATORS, SENTIMENT, STOP_WORDS } from './lexicon.js';

export type Valence = 'positive' | 'neutral' | 'negative';

export type Document = {
  // The response. Two written answers on one response share it, so drivers can count a person once.
  responseId: string;
  // Unique per comment. The drill-through looks comments up by this.
  key: string;
  text: string;
  at: Date;
  // The response's own rating, scaled to 0..1, or null when it had none.
  rating: number | null;
};

export type Theme = {
  id: string;
  label: string;
  mentions: number;
  score: number;
  valence: Valence;
  delta: number | null;
  // The keys of the comments in this theme, in input order.
  members: string[];
};

export type EngineResult = {
  sentiment: { positive: number; neutral: number; negative: number };
  trend: Array<{ date: string; positive: number; neutral: number; negative: number }>;
  themes: Theme[];
  drivers: Array<{ id: string; label: string; impact: number; valence: Valence }>;
  // The lexicon reading for each comment.
  valenceOf: Map<string, Valence>;
};

/* ----------------------------------------------------------------- constants
 *
 * Every threshold the engine has, in one place, because every one of them is a judgement
 * and a reader is entitled to see them all before deciding whether to believe the output.
 */

// At most twelve themes: a list nobody scrolls is a list nobody reads.
const MAX_THEMES = 12;
// Below this, a "theme" is one person with a bugbear, and naming it as a finding would be a lie.
const MIN_MENTIONS = 3;
// How many terms are considered for clustering, by how many comments they appear in.
const CANDIDATE_POOL = 40;
// A candidate this far inside an existing theme is a facet of it, not a rival: "valet parking" inside "parking".
const MERGE_CONTAINMENT = 0.5;
// ...and the containment has to beat CHANCE by this much.
// A word appearing in half the comments would otherwise swallow anything that overlapped it by luck,
// which once turned 229 comments into four confident themes.
const MERGE_LIFT = 2;
// A word in more than this share of all comments describes the CORPUS, not a theme - every hotel comment
// says "hotel". Only applied once there are enough comments for the ratio to mean anything.
const UBIQUITY_CEILING = 0.6;
const UBIQUITY_MIN_CORPUS = 20;
const MAX_DRIVERS = 6;
// A correlation over two points is not a correlation.
const MIN_RATED_FOR_DRIVER = 5;
// A correlation weaker than this is noise, and the server says neutral rather than picking a side.
const DRIVER_DEADBAND = 0.1;
// Above this span the trend is bucketed by week: a year of daily points is not a line chart.
const WEEKLY_ABOVE_DAYS = 90;
// The score bands, stated once, so themes and drivers cannot disagree about what good means.
const POSITIVE_AT = 60;
const NEGATIVE_AT = 40;

// Text handling.

// A light stemmer: plurals, -ing, -ed, -ly and a trailing e. It does not need to be a good one,
// because it is applied to both the comments and the word lists - it only has to be consistent.
export function stem(word: string): string {
  if (word.length <= 3) return word;
  let out = word;

  if (out.endsWith('ies') && out.length > 4) out = `${out.slice(0, -3)}y`;
  else if (out.endsWith('sses')) out = out.slice(0, -2);
  else if (out.endsWith('ss')) {
    /* keep: less, class and success are not plurals */
  } else if (out.endsWith('s') && !out.endsWith('us') && !out.endsWith('is') && out.length > 3) {
    out = out.slice(0, -1);
  }

  if (out.endsWith('ing') && out.length > 5) out = strip(out.slice(0, -3));
  else if (out.endsWith('ed') && out.length > 4) out = strip(out.slice(0, -2));
  else if (out.endsWith('ly') && out.length > 4) out = out.slice(0, -2);

  return out.endsWith('e') && out.length > 4 ? out.slice(0, -1) : out;
}

// running -> runn -> run, and only after a suffix came off, so staff keeps both f's.
// l, f and s are deliberately excluded: call, staff and pass are real words ending that way.
const strip = (word: string): string =>
  /([bdgmnprt])\1$/.test(word) ? word.slice(0, -1) : word;

// The stop list, run through the stemmer too, or "times" would survive as a theme candidate.
const STEMMED_STOP: ReadonlySet<string> = new Set([...STOP_WORDS].map(stem));

type Tokens = {
  // Every word in order, including stop-words. Negation is measured on this.
  raw: string[];
  // The content words that survived, with the position each came from.
  kept: Array<{ stem: string; surface: string; at: number }>;
};

// Splits text into words, keeping both the raw stream and the content words.
export function tokenise(text: string): Tokens {
  const raw = text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const kept: Tokens['kept'] = [];
  raw.forEach((word, at) => {
    if (word.length < 3 || STOP_WORDS.has(word)) return;
    const stemmed = stem(word);
    if (STEMMED_STOP.has(stemmed)) return;
    kept.push({ stem: stemmed, surface: word, at });
  });
  return { raw, kept };
}

/* --------------------------------------------------------------- sentiment */

/** The lexicon, put through the same stemmer the comments go through. See `stem()`. */
const STEMMED: ReadonlyMap<string, number> = (() => {
  const out = new Map<string, number>();
  for (const [word, weight] of SENTIMENT) {
    const key = stem(word);
    const held = out.get(key);
    // Two words that stem alike keep the stronger reading, so the map does not depend on
    // the order the lexicon happens to list them in.
    if (held === undefined || Math.abs(weight) > Math.abs(held)) out.set(key, weight);
  }
  return out;
})();

/**
 * One comment's lexicon reading. Clamped, because a comment that stacks eight complaints
 * is one unhappy person, and letting it weigh eight times as much in a mean would let one
 * reviewer decide a theme.
 */
// The sentiment score for one comment, with negation applied.
export function scoreText(tokens: Tokens): number {
  let total = 0;
  for (const token of tokens.kept) {
    const weight = STEMMED.get(token.stem);
    if (weight === undefined) continue;
    total += negatedAt(tokens.raw, token.at) ? -weight : weight;
  }
  return Math.max(-3, Math.min(3, total));
}

const negatedAt = (raw: string[], at: number): boolean => {
  for (let back = 1; back <= NEGATION_WINDOW; back += 1) {
    const word = raw[at - back];
    if (word !== undefined && NEGATORS.has(word)) return true;
  }
  return false;
};

const valenceOfScore = (score: number): Valence =>
  score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';

/* ------------------------------------------------------------------ themes */

// term -> which comments it appears in, as indexes into the document list.
function termIndex(documents: Document[]): {
  frequency: Map<string, Set<number>>;
  surfaces: Map<string, Map<string, number>>;
} {
  const frequency = new Map<string, Set<number>>();
  const surfaces = new Map<string, Map<string, number>>();

  const note = (term: string, index: number) => {
    const seen = frequency.get(term) ?? new Set<number>();
    seen.add(index);
    frequency.set(term, seen);
  };
  const noteSurface = (term: string, surface: string) => {
    const forms = surfaces.get(term) ?? new Map<string, number>();
    forms.set(surface, (forms.get(surface) ?? 0) + 1);
    surfaces.set(term, forms);
  };

  documents.forEach((document, index) => {
    const { kept } = tokenise(document.text);
    for (let i = 0; i < kept.length; i += 1) {
      const token = kept[i] as { stem: string; surface: string; at: number };
      note(token.stem, index);
      noteSurface(token.stem, token.surface);

      // Two-word phrases only from words next to each other in the sentence: "valet parking" is a phrase,
      // "parking was awful" is not.
      const next = kept[i + 1];
      if (next && next.at === token.at + 1) {
        const bigram = `${token.stem}-${next.stem}`;
        note(bigram, index);
        noteSurface(bigram, `${token.surface} ${next.surface}`);
      }
    }
  });

  return { frequency, surfaces };
}

// The most-written form of a term, ties broken alphabetically, so a theme's label is stable.
function labelFor(term: string, surfaces: Map<string, Map<string, number>>): string {
  const forms = [...(surfaces.get(term) ?? new Map<string, number>())];
  forms.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const best = forms[0]?.[0] ?? term.replace(/-/g, ' ');
  return best.charAt(0).toUpperCase() + best.slice(1);
}

// The main entry point.

export type EngineInput = {
  documents: Document[];
  // The equally long window immediately before this one. Absent means there is no change figure.
  previous?: Document[] | undefined;
};

export function analyse(input: EngineInput): EngineResult {
  const { documents } = input;

  const valenceOf = new Map<string, Valence>();
  const scores = documents.map((document) => {
    const score = scoreText(tokenise(document.text));
    valenceOf.set(document.key, valenceOfScore(score));
    return score;
  });

  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  for (const score of scores) sentiment[valenceOfScore(score)] += 1;

  const themes = themesOf(input, valenceOf);

  return {
    sentiment,
    trend: trendOf(documents, scores),
    themes,
    drivers: driversOf(themes, documents),
    valenceOf,
  };
}

// The sentiment trend over time, bucketed by day or by week.
function trendOf(
  documents: Document[],
  scores: number[],
): EngineResult['trend'] {
  if (documents.length === 0) return [];

  const times = documents.map((document) => document.at.getTime());
  const spanDays = (Math.max(...times) - Math.min(...times)) / 86_400_000;
  const weekly = spanDays > WEEKLY_ABOVE_DAYS;

  const buckets = new Map<string, { positive: number; neutral: number; negative: number }>();
  documents.forEach((document, index) => {
    const key = weekly ? weekStart(document.at) : day(document.at);
    const bucket = buckets.get(key) ?? { positive: 0, neutral: 0, negative: 0 };
    bucket[valenceOfScore(scores[index] as number)] += 1;
    buckets.set(key, bucket);
  });

  // Only buckets that actually have comments: a zeroed day is a day nobody wrote, and drawing it
  // as a point on the floor reads as a collapse in sentiment rather than a quiet Tuesday.
  return [...buckets]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, counts]) => ({ date, ...counts }));
}

const day = (at: Date): string => at.toISOString().slice(0, 10);

// An ISO week, labelled by its Monday, so the reply carries dates of one type.
function weekStart(at: Date): string {
  const utc = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const shift = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - shift);
  return utc.toISOString().slice(0, 10);
}

// Finds the themes: frequent terms, merged where one is a facet of another.
function themesOf(input: EngineInput, valenceOf: Map<string, Valence>): Theme[] {
  const { documents, previous } = input;
  if (documents.length === 0) return [];

  const { frequency, surfaces } = termIndex(documents);
  const ceiling =
    documents.length >= UBIQUITY_MIN_CORPUS ? documents.length * UBIQUITY_CEILING : Infinity;

  const candidates = [...frequency]
    .filter(([term, seen]) => !isOpinion(term) && seen.size >= MIN_MENTIONS && seen.size <= ceiling)
    .sort(
      (a, b) =>
        // Most comments first.
        b[1].size - a[1].size ||
        // Then the shorter term, so "Location" heads the group and "great location" folds into it.
        a[0].split('-').length - b[0].split('-').length ||
        // Then the term itself, so a tie never depends on insertion order.
        a[0].localeCompare(b[0]),
    )
    .slice(0, CANDIDATE_POOL);

  const chosen: Array<{ key: string; terms: string[]; docs: Set<number> }> = [];
  for (const [term, seen] of candidates) {
    const host = chosen.find(
      (theme) => contained(seen, theme.docs) >= mergeBar(theme.docs.size, documents.length),
    );
    if (host) {
      host.terms.push(term);
      for (const index of seen) host.docs.add(index);
      continue;
    }
    if (chosen.length >= MAX_THEMES) continue;
    chosen.push({ key: term, terms: [term], docs: new Set(seen) });
  }

  const before = previous ? termIndex(previous).frequency : null;

  return chosen
    .map((theme) => {
      const members = [...theme.docs]
        .sort((a, b) => a - b)
        .map((index) => (documents[index] as Document).key);

      let positive = 0;
      let negative = 0;
      for (const key of members) {
        const valence = valenceOf.get(key);
        if (valence === 'positive') positive += 1;
        else if (valence === 'negative') negative += 1;
      }
      // The share of opinionated comments that were positive, smoothed, so "one positive out of three"
      // does not read as a perfect 100. A share rather than an average of the hand-written weights.
      const score = Math.round(((positive + 1) / (positive + negative + 2)) * 100);

      return {
        id: theme.key,
        label: labelFor(theme.key, surfaces),
        mentions: theme.docs.size,
        score,
        valence: score >= POSITIVE_AT ? 'positive' : score <= NEGATIVE_AT ? 'negative' : 'neutral',
        delta: before ? theme.docs.size - mentionsIn(before, theme.terms) : null,
        members,
      } satisfies Theme;
    })
    .sort((a, b) => b.mentions - a.mentions || a.id.localeCompare(b.id));
}

// A theme is what people talked ABOUT; the lexicon is how they felt. So a term made only of opinion
// words is never a theme on its own - "comfortable" is not a topic anybody would click through to,
// but "comfortable bed" is, because it has a noun in it.
const isOpinion = (term: string): boolean =>
  term.split('-').every((part) => STEMMED.has(part));

// How contained a candidate must be to count as a facet rather than a rival, capped at 1,
// because nothing can be more than entirely inside something.
const mergeBar = (hostSize: number, corpusSize: number): number =>
  Math.min(1, Math.max(MERGE_CONTAINMENT, (MERGE_LIFT * hostSize) / corpusSize));

// How much of the candidate already sits inside the theme.
function contained(candidate: Set<number>, theme: Set<number>): number {
  if (candidate.size === 0) return 0;
  let shared = 0;
  for (const index of candidate) if (theme.has(index)) shared += 1;
  return shared / candidate.size;
}

// The same theme's comment count in another window.
function mentionsIn(frequency: Map<string, Set<number>>, terms: string[]): number {
  const union = new Set<number>();
  for (const term of terms) for (const index of frequency.get(term) ?? []) union.add(index);
  return union.size;
}

// Drivers: the correlation between a theme being mentioned and the rating that response gave.
// Counted per RESPONSE, not per comment, so somebody who wrote two answers is not two people who agree.
function driversOf(themes: Theme[], documents: Document[]): EngineResult['drivers'] {
  const ratingOf = new Map<string, number>();
  const responseOfComment = new Map<string, string>();
  for (const document of documents) {
    responseOfComment.set(document.key, document.responseId);
    if (document.rating !== null) ratingOf.set(document.responseId, document.rating);
  }
  const rated = [...ratingOf.keys()].sort();
  if (rated.length < MIN_RATED_FOR_DRIVER) return [];

  const ratings = rated.map((id) => ratingOf.get(id) as number);

  return themes
    .flatMap((theme): EngineResult['drivers'] => {
      const mentioning = new Set(
        theme.members.map((key) => responseOfComment.get(key)).filter((id) => id !== undefined),
      );
      const presence = rated.map((id) => (mentioning.has(id) ? 1 : 0));
      const impact = pearson(presence, ratings);
      if (impact === null) return [];
      return [
        {
          id: theme.id,
          label: theme.label,
          impact,
          // The server decides which way is good: a correlation on its own does not say whether a theme is bad news.
          valence:
            impact > DRIVER_DEADBAND
              ? 'positive'
              : impact < -DRIVER_DEADBAND
                ? 'negative'
                : 'neutral',
        },
      ];
    })
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact) || a.id.localeCompare(b.id))
    .slice(0, MAX_DRIVERS);
}

// Pearson correlation, rounded to two places. Null when either side has no variance - which happens
// when every response mentions a theme, or every rating is a 4. Reporting 0 would claim there was no link.
// Pearson correlation of two equal-length series.
function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n === 0) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let top = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] as number) - meanX;
    const dy = (ys[i] as number) - meanY;
    top += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return Math.round((top / Math.sqrt(varX * varY)) * 100) / 100;
}
