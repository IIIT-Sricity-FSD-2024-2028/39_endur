// THE ENGINE. 43 § The engine, DEC-042.
//
// This file has no imports beyond its own lexicon. No Prisma, no Express, no `fetch`, no
// `http`. That is not tidiness — it is DEC-042 being enforced instead of remembered:
// `52` promises respondents anonymity, and the way to be sure their words never left the
// process is for the code that reads them to have nothing to send them WITH.
//
// `analysis.test.ts` asserts that absence over the whole feature folder, so adding an
// outbound client here fails a test rather than passing review.
//
// Everything below is arithmetic a person could do by hand with a dictionary:
//   tokenise -> stop-words -> stem -> document frequency of unigrams and bigrams
//            -> greedy co-occurrence merge into <= 12 themes
//            -> a sentiment lexicon per comment, aggregated per theme
//            -> Pearson r between a theme's presence and the response's own rating.
//
// It is deterministic, which is what makes `43` § Acceptance testable at all.
import { NEGATION_WINDOW, NEGATORS, SENTIMENT, STOP_WORDS } from './lexicon.js';

export type Valence = 'positive' | 'neutral' | 'negative';

export type Document = {
  /** The RESPONSE. Two written answers on one response share it, and drivers dedupe on it. */
  responseId: string;
  /** Unique per comment — `responseId:questionId`. The drill-through indexes on this. */
  key: string;
  text: string;
  at: Date;
  /** The response's own rating, normalised by its own scale to 0..1. `null` if it had none. */
  rating: number | null;
};

export type Theme = {
  id: string;
  label: string;
  mentions: number;
  score: number;
  valence: Valence;
  delta: number | null;
  /** Comment keys, in the input's own order. The drill-through's whole content. */
  members: string[];
};

export type EngineResult = {
  sentiment: { positive: number; neutral: number; negative: number };
  trend: Array<{ date: string; positive: number; neutral: number; negative: number }>;
  themes: Theme[];
  drivers: Array<{ id: string; label: string; impact: number; valence: Valence }>;
  /** Per-comment lexicon reading, keyed by `Document.key`. */
  valenceOf: Map<string, Valence>;
};

/* ----------------------------------------------------------------- constants
 *
 * Every threshold the engine has, in one place, because every one of them is a judgement
 * and a reader is entitled to see them all before deciding whether to believe the output.
 */

/** DEC-042 says at most twelve. A themes list nobody scrolls is a themes list nobody reads. */
const MAX_THEMES = 12;
/** Below this a "theme" is one person with a bugbear, and naming it as a finding is a lie. */
const MIN_MENTIONS = 3;
/** Terms considered for clustering, by document frequency. Beyond this it is all noise. */
const CANDIDATE_POOL = 40;
/**
 * A candidate whose documents are this far contained inside an existing theme's is a facet
 * of it, not a rival: `valet parking` inside `parking`. It is merged as an alias.
 */
const MERGE_CONTAINMENT = 0.5;
/**
 * ...AND that containment has to beat CHANCE by this much, which the first version missed
 * and only real data showed.
 *
 * On The Grand Palace's 229 comments, `room` appears in 113 of them — 49% of the corpus. A
 * flat 50% bar then merges almost anything into it, because a term in ten documents
 * overlaps a theme covering half the corpus about five times by coincidence. Four themes
 * came back from 229 comments and the engine looked confident about it.
 *
 * So the bar is `max(MERGE_CONTAINMENT, MERGE_LIFT × the host's share of the corpus)`: a
 * facet of `room` must be *inside* `room` far more often than a coin would put it there.
 * Small themes are unaffected — their share is low, so the flat 50% still governs.
 */
const MERGE_LIFT = 2;
/**
 * A word in more than this share of every comment describes the CORPUS, not a theme — the
 * hotel's comments all say "hotel". Applied only once there are enough comments for the
 * ratio to mean anything; on nine comments, six of them is not evidence of ubiquity.
 */
const UBIQUITY_CEILING = 0.6;
const UBIQUITY_MIN_CORPUS = 20;
const MAX_DRIVERS = 6;
/** A correlation over two points is not a correlation. */
const MIN_RATED_FOR_DRIVER = 5;
/** |r| below this is noise, and the server says `neutral` rather than picking a side. */
const DRIVER_DEADBAND = 0.1;
/** Above this span, trend buckets are weeks. A year of daily points is not a line chart. */
const WEEKLY_ABOVE_DAYS = 90;
/** Score bands. Stated once, so `themes` and `drivers` cannot disagree about what good is. */
const POSITIVE_AT = 60;
const NEGATIVE_AT = 40;

/* -------------------------------------------------------------------- text */

/**
 * A light stemmer — plurals, `-ing`, `-ed`, `-ly` and a trailing `e`. Not Porter, and it
 * does not need to be: it is applied to BOTH the comment and the lexicon, so the only
 * property required of it is that it maps the same word to the same thing twice.
 *
 * That is why the lexicon is written in plain English rather than in stems. Hand-stemmed
 * entries drift away from whatever the stemmer actually does, silently, and the failure
 * shows up as a word that simply never scores.
 */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  let out = word;

  if (out.endsWith('ies') && out.length > 4) out = `${out.slice(0, -3)}y`;
  else if (out.endsWith('sses')) out = out.slice(0, -2);
  else if (out.endsWith('ss')) {
    /* keep: `less`, `class`, `success` are not plurals */
  } else if (out.endsWith('s') && !out.endsWith('us') && !out.endsWith('is') && out.length > 3) {
    out = out.slice(0, -1);
  }

  if (out.endsWith('ing') && out.length > 5) out = strip(out.slice(0, -3));
  else if (out.endsWith('ed') && out.length > 4) out = strip(out.slice(0, -2));
  else if (out.endsWith('ly') && out.length > 4) out = out.slice(0, -2);

  return out.endsWith('e') && out.length > 4 ? out.slice(0, -1) : out;
}

/**
 * `running` -> `runn` -> `run`. Only after a suffix came off, so `staff` keeps both f's.
 *
 * `l`, `f` and `s` are DELIBERATELY NOT in the class. English has plenty of real words
 * ending `-ll`, `-ff` and `-ss` — `call`, `staff`, `pass` — and doubling them here made
 * `called` stem to `cal` while `call` stemmed to `call`, so the two never met. Doubled
 * `bb dd gg mm nn pp rr tt` at the end of a base word is rare enough that the trade is
 * one-directional.
 */
const strip = (word: string): string =>
  /([bdgmnprt])\1$/.test(word) ? word.slice(0, -1) : word;

/**
 * The stop list, put through `stem()` — the same trick the sentiment lexicon gets, and for
 * the same reason. Without it `times` stems to `time`, which IS a stop-word, and survives
 * as a theme candidate because only the raw form was ever checked.
 */
const STEMMED_STOP: ReadonlySet<string> = new Set([...STOP_WORDS].map(stem));

type Tokens = {
  /** Every word, in order, including stop-words. Negation is measured on this. */
  raw: string[];
  /** The content words that survived, as `{ stem, at }` where `at` indexes into `raw`. */
  kept: Array<{ stem: string; surface: string; at: number }>;
};

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

/** `term -> the documents it appears in`, as indices into the document list. */
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

      // Bigrams only from words ADJACENT IN THE ORIGINAL SENTENCE. "valet parking" is a
      // phrase; "parking was awful" is not one, and joining `park` to `aw` across the
      // stop-word between them would invent a theme nobody wrote.
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

/** The most-written form of a term, ties alphabetical — so the label is stable. */
function labelFor(term: string, surfaces: Map<string, Map<string, number>>): string {
  const forms = [...(surfaces.get(term) ?? new Map<string, number>())];
  forms.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const best = forms[0]?.[0] ?? term.replace(/-/g, ' ');
  return best.charAt(0).toUpperCase() + best.slice(1);
}

/* -------------------------------------------------------------------- main */

export type EngineInput = {
  documents: Document[];
  /** The equally-long window immediately before this one. Absent means `delta` is `null`. */
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

  // Only buckets that HAVE comments. A zeroed day is a day nobody wrote, and drawing it as
  // a point on the floor reads as a collapse in sentiment rather than as a quiet Tuesday.
  return [...buckets]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, counts]) => ({ date, ...counts }));
}

const day = (at: Date): string => at.toISOString().slice(0, 10);

/** ISO week, labelled by its Monday — a date, so the DTO's `date` field stays one type. */
function weekStart(at: Date): string {
  const utc = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const shift = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - shift);
  return utc.toISOString().slice(0, 10);
}

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
        // Frequency first.
        b[1].size - a[1].size ||
        // Then the SHORTER term, so a unigram outranks a bigram it ties with and the theme
        // comes out as `Location` with `great location` folded in, rather than the reverse.
        // The general word is the better name for the group it heads.
        a[0].split('-').length - b[0].split('-').length ||
        // Then the term itself, so a tie can never depend on Map insertion order.
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
      // Laplace-smoothed share of the OPINIONATED comments that were positive. A share
      // rather than a mean of weights, because the weights are -2..2 hand-written guesses
      // and averaging them would present them as a measurement. The +1/+2 is what stops
      // "one positive comment out of three" reading as a perfect 100.
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

/**
 * A THEME IS WHAT PEOPLE TALKED ABOUT. The lexicon is how they felt about it, and the two
 * are different columns of the same screen — so a word that only appears in the lexicon is
 * never a theme in its own right.
 *
 * The Grand Palace's real comments produced `Comfortable` sitting in the themes table
 * beside `Room` and `Checkout`, reading as a finding when it is an adjective. `43` says a
 * theme drills through to its source comments; "the comments mentioning comfortable" is not
 * a topic anybody would click.
 *
 * EVERY part has to be an opinion word, so `comfortable` goes and `comfortable-bed` stays —
 * a phrase with a noun in it is still about the noun. The cost is that `delay` and `noise`
 * cannot head a theme on their own, and that is accepted: they still colour the theme they
 * appear alongside, through exactly the sentiment scoring they are in the lexicon for.
 */
const isOpinion = (term: string): boolean =>
  term.split('-').every((part) => STEMMED.has(part));

/**
 * How contained a candidate must be before it counts as a facet rather than a rival.
 *
 * CAPPED AT 1, which is not a formality: a theme covering the whole corpus would otherwise
 * demand a containment of 2, and nothing can be more than entirely inside something. A real
 * facet of a ubiquitous theme would then split off as its own row — `great location` beside
 * `location`, which is the bug in the opposite direction from the one MERGE_LIFT fixes.
 */
const mergeBar = (hostSize: number, corpusSize: number): number =>
  Math.min(1, Math.max(MERGE_CONTAINMENT, (MERGE_LIFT * hostSize) / corpusSize));

/** |A ∩ B| / |A| — how much of the candidate already sits inside the theme. */
function contained(candidate: Set<number>, theme: Set<number>): number {
  if (candidate.size === 0) return 0;
  let shared = 0;
  for (const index of candidate) if (theme.has(index)) shared += 1;
  return shared / candidate.size;
}

/** The same theme's document count in another window — the union, as here, not a sum. */
function mentionsIn(frequency: Map<string, Set<number>>, terms: string[]): number {
  const union = new Set<number>();
  for (const term of terms) for (const index of frequency.get(term) ?? []) union.add(index);
  return union.size;
}

/**
 * Drivers. `43` and DEC-042 both define this as the correlation between a theme's presence
 * and the response's own rating — arithmetic over `numeric_value` (10 §4.4), not inference.
 *
 * PER RESPONSE, not per comment: a response answering two written questions would otherwise
 * contribute its single rating twice and count as two people who agree with themselves.
 */
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
          // The SERVER says which way is good (CONF-004). `impact` is a correlation, and a
          // client deciding that a negative one is bad news would be inferring exactly the
          // thing that is not safe to infer — a theme correlating with LOW ratings is bad
          // for the organisation, and one correlating with low ratings on a question about
          // problems reported is not.
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

/**
 * Pearson r, rounded to two places. `null` when either side has no variance — which is not
 * an edge case here: it is what happens when every response mentions a theme, or when every
 * rating is a 4. There is no correlation to report, and reporting 0 would say there was.
 */
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
