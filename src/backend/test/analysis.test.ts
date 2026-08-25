// T-081 — the analysis backend. 43, DEC-042.
//
// Three things are being tested and they are not the same thing.
//
//   1. THE DECISION, asserted by absence. DEC-042 says no comment text leaves the process,
//      and `43` § Acceptance says to prove that by there being no outbound client in the
//      feature rather than by reading the code. That is the first describe, and it is the
//      only test here that would still matter if the engine were replaced tomorrow.
//   2. THE ENGINE, which is a pure function and needs no database. Determinism is the load-
//      bearing property: the drill-through recomputes rather than storing, so a theme that
//      moved between two identical requests would 404 on a card the page is displaying.
//   3. THE GATES, of which there are three — capability, entitlement, and k-anonymity.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  addStaff,
  app,
  denyPerson,
  setUpOrg,
  unitIdByName,
  withCsrf,
  type Session,
} from './helpers.js';
import { config } from '../lib/config.js';
import { analyse, stem, tokenise, type Document } from '../features/analysis/engine.js';

/* ------------------------------------------------------------- 1. DEC-042 */

describe('DEC-042 — no comment text leaves the process, asserted by absence', () => {
  // Resolved from THIS FILE, not from the working directory. The repo runs vitest twice —
  // once at the root and once inside `src/backend` — and a cwd-relative path passes in one
  // and fails to collect in the other, which is how this test spent its first run not
  // running at all.
  const dir = fileURLToPath(new URL('../features/analysis', import.meta.url));
  const files = readdirSync(dir).filter((name) => name.endsWith('.ts'));

  /**
   * Comments are stripped before the scan. A check that its own explanatory comment can
   * trip is a check somebody deletes the comment to satisfy, and then it stops catching
   * the real thing — the same lesson `audit-vocab.mjs` learned twice (`N-023`).
   */
  const code = (name: string): string =>
    readFileSync(`${dir}/${name}`, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('has files to scan at all', () => {
    expect(files.sort()).toEqual(['engine.ts', 'lexicon.ts', 'router.ts', 'service.ts']);
  });

  it.each(['engine.ts', 'lexicon.ts', 'router.ts', 'service.ts'])(
    '%s contains no outbound http client',
    (name) => {
      const source = code(name);
      for (const pattern of [
        /\bfetch\s*\(/,
        /\baxios\b/,
        /\bnode-fetch\b/,
        /\bundici\b/,
        /\bXMLHttpRequest\b/,
        /from\s+'node:https?'/,
        /from\s+'https?'/,
        /require\(\s*'https?'/,
      ]) {
        expect(pattern.test(source), `${name} matched ${pattern}`).toBe(false);
      }
    },
  );

  it('the engine imports NOTHING but its own lexicon — no db, no express, no node builtin', () => {
    const imports = [...code('engine.ts').matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['./lexicon.js']);
  });

  it('the service holds no query — the corpus arrives already gated (DEC-058, D-034)', () => {
    const source = code('service.ts');
    expect(source).not.toMatch(/\bprisma\b/);
    expect(source).toMatch(/readCorpus/);
  });
});

/* -------------------------------------------------------------- 2. engine */

const doc = (i: number, text: string, rating: number | null, day = (i % 27) + 1): Document => ({
  responseId: `r${i}`,
  key: `r${i}:q1`,
  text,
  at: new Date(Date.UTC(2026, 0, day)),
  rating,
});

/** Twelve comments about four things, with ratings that agree with the words. */
const HOTEL: Document[] = [
  ['The valet parking was excellent and the staff were friendly', 1],
  ['valet parking is always a nightmare, we waited forty minutes', 0],
  ['Parking is terrible. Never enough spaces.', 0],
  ['The rooms were clean and the beds comfortable', 1],
  ['room was not clean, the bathroom was dirty', 0.25],
  ['Rooms are spacious but the wifi keeps dropping', 0.75],
  ['wifi is broken in the west wing', 0.25],
  ['The wifi never works', 0],
  ['breakfast was delicious, best I have had', 1],
  ['breakfast is cold and the coffee is awful', 0.25],
  ['parking again, the barrier was broken', 0],
  ['clean rooms, friendly staff, great breakfast', 1],
].map(([text, rating], i) => doc(i, text as string, rating as number));

describe('the engine — rule-based, and deterministic because 43 § Acceptance needs it', () => {
  it('produces byte-identical output when the SAME comments arrive in a different order', () => {
    const shuffled = [...HOTEL];
    // A fixed permutation, not Math.random — a flaky determinism test is worse than none.
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = (i * 7 + 3) % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j] as Document, shuffled[i] as Document];
    }
    expect(shuffled.map((d) => d.key)).not.toEqual(HOTEL.map((d) => d.key));

    const one = analyse({ documents: HOTEL });
    const two = analyse({ documents: shuffled });
    expect(two.themes.map((t) => ({ ...t, members: [...t.members].sort() }))).toEqual(
      one.themes.map((t) => ({ ...t, members: [...t.members].sort() })),
    );
    expect(two.drivers).toEqual(one.drivers);
    expect(two.sentiment).toEqual(one.sentiment);
  });

  it('finds the four things people wrote about, and nothing else', () => {
    const { themes } = analyse({ documents: HOTEL });
    expect(themes.map((theme) => theme.id).sort()).toEqual([
      'breakfast',
      'park',
      'room',
      'wifi',
    ]);
  });

  it('absorbs "valet parking" INTO "parking" rather than listing both', () => {
    const { themes } = analyse({ documents: HOTEL });
    // The bigram co-occurs with the unigram in every document it appears in, so it is a
    // facet of it, not a rival theme. Two rows saying the same thing is what MERGE_CONTAINMENT
    // exists to prevent, and it is the difference between twelve themes and twelve synonyms.
    expect(themes.some((theme) => theme.id === 'valet-park')).toBe(false);
    expect(themes.find((theme) => theme.id === 'park')?.mentions).toBe(4);
  });

  it('reads parking as negative and rooms as positive — the SERVER says which, not the client', () => {
    const { themes } = analyse({ documents: HOTEL });
    const of = (id: string) => themes.find((theme) => theme.id === id);
    expect(of('park')?.valence).toBe('negative');
    expect(of('room')?.valence).toBe('positive');
    // CONF-004: every charted value carries an explicit valence, and none is inferable
    // from the score alone by a client that does not know where the bands are.
    for (const theme of themes) expect(theme.valence).toBeTruthy();
  });

  it('handles negation, which is the half a lexicon usually gets backwards', () => {
    const yes = analyse({ documents: [doc(0, 'the room was clean', null)] });
    const no = analyse({ documents: [doc(0, 'the room was not clean', null)] });
    expect(yes.sentiment).toEqual({ positive: 1, neutral: 0, negative: 0 });
    expect(no.sentiment).toEqual({ positive: 0, neutral: 0, negative: 1 });
  });

  it('stems the comment and the lexicon with ONE function, so the two cannot drift', () => {
    // The first version hand-stemmed the lexicon and `delayed` scored while `delay` did not.
    expect(stem('parking')).toBe(stem('parked'));
    expect(stem('delays')).toBe(stem('delayed'));
    expect(stem('friendly')).toBe(stem('friends'));
    // And `staff` keeps both its f's: the double-consonant rule only runs after a suffix
    // actually came off, or every word ending in a doubled letter would lose one.
    expect(stem('staff')).toBe('staff');
  });

  it('drops stop-words in whatever form they were written', () => {
    const kept = tokenise('The things we were going to take were really very good').kept;
    expect(kept.map((token) => token.surface)).toEqual(['good']);
  });

  it('names no theme fewer than three people mentioned', () => {
    const themes = analyse({
      documents: [
        doc(0, 'the lift is broken', null),
        doc(1, 'the lift is broken again', null),
        doc(2, 'everything else was fine', null),
      ],
    }).themes;
    // Two is one person with a bugbear and a second who agreed. Printing it as a finding
    // in a list headed "themes" is the lie 43 § Reliability exists to refuse.
    expect(themes).toEqual([]);
  });

  it('signs the drivers by correlation, not by the theme’s own sentiment', () => {
    const { drivers } = analyse({ documents: HOTEL });
    const of = (id: string) => drivers.find((driver) => driver.id === id);
    expect(of('room')?.impact).toBeGreaterThan(0);
    expect(of('room')?.valence).toBe('positive');
    expect(of('park')?.impact).toBeLessThan(0);
    expect(of('park')?.valence).toBe('negative');
  });

  it('reports NO driver at all when every rating is identical', () => {
    const flat = HOTEL.map((document) => ({ ...document, rating: 0.5 }));
    // There is no correlation to report, and a 0 would say there was one and that it was
    // zero. `43` would then render "no impact" for a theme nothing is known about.
    expect(analyse({ documents: flat }).drivers).toEqual([]);
  });

  it('leaves delta NULL with no comparison window, and a real number with one', () => {
    const now = analyse({ documents: HOTEL });
    expect(now.themes.every((theme) => theme.delta === null)).toBe(true);

    const earlier = HOTEL.slice(0, 3).map((document, i) => doc(100 + i, document.text, null));
    const then = analyse({ documents: HOTEL, previous: earlier });
    // Parking was in all three earlier comments and in four now: it grew by one.
    expect(then.themes.find((theme) => theme.id === 'park')?.delta).toBe(1);
    expect(then.themes.find((theme) => theme.id === 'room')?.delta).toBe(4);
  });

  it('buckets the trend by day, and by week once the span passes three months', () => {
    const daily = analyse({ documents: HOTEL }).trend;
    expect(daily[0]?.date).toBe('2026-01-01');

    const spread = HOTEL.map((document, i) => ({
      ...document,
      at: new Date(Date.UTC(2026, 0, 1 + i * 30)),
    }));
    const weekly = analyse({ documents: spread }).trend;
    // Every bucket label is a Monday. A year of daily points is not a line chart.
    for (const point of weekly) {
      expect(new Date(`${point.date}T00:00:00Z`).getUTCDay()).toBe(1);
    }
  });

  /* --- the three fixes the SEEDED corpora found that twelve fixtures did not --- */

  it('does not swallow a small theme into a big one that overlaps it BY CHANCE', () => {
    // Ten of twenty comments mention the rooms, so any term overlaps `room` about half the
    // time for free. `lift` appears in six comments, three of them also about rooms — a
    // containment of exactly 0.5, which is precisely what coincidence produces here.
    const documents = [
      ...Array.from({ length: 7 }, (_, i) => doc(i, 'the room was fine', null)),
      ...Array.from({ length: 3 }, (_, i) => doc(10 + i, 'the room is near the lift', null)),
      ...Array.from({ length: 3 }, (_, i) => doc(20 + i, 'the lift took forever', null)),
      ...Array.from({ length: 7 }, (_, i) => doc(30 + i, 'reception was busy', null)),
    ];
    const ids = analyse({ documents }).themes.map((theme) => theme.id);
    // A flat 50% bar merged this away and returned FOUR themes from The Grand Palace's 229
    // comments while looking confident about it. The bar has to beat chance, not meet it.
    expect(ids).toContain('lift');
    expect(ids).toContain('room');
  });

  it('never heads a theme with an opinion word — a theme is WHAT, not how it felt', () => {
    const documents = Array.from({ length: 8 }, (_, i) =>
      doc(i, 'the bed was comfortable and the pillows were comfortable', null),
    );
    const ids = analyse({ documents }).themes.map((theme) => theme.id);
    // `Comfortable` came back from real data sitting beside `Checkout` and `Breakfast`,
    // reading as a finding when it is an adjective.
    expect(ids).not.toContain('comfort');
    expect(ids).toContain('bed');
  });

  it('keeps a phrase that has a noun in it, so only PURE opinion is excluded', () => {
    const documents = Array.from({ length: 8 }, (_, i) =>
      doc(i, 'great location, and the great location again', null),
    );
    const ids = analyse({ documents }).themes.map((theme) => theme.id);
    expect(ids).toEqual(['location']);
    // The unigram heads it and the bigram folds in, because the general word is the better
    // name for the group. Two rows saying `Location` and `Great location` is the bug the
    // merge-bar CEILING exists for — without it, a theme covering the whole corpus demands
    // a containment of 2 and nothing can ever be a facet of it.
  });

  it('stems words ending -ll, -ff and -ss without eating a letter', () => {
    // `called` used to stem to `cal` while `call` stemmed to `call`, so the two never met.
    expect(stem('called')).toBe(stem('call'));
    expect(stem('staff')).toBe('staff');
    expect(stem('passes')).toBe(stem('pass'));
    // And the rule still does its job where the doubling really is a suffix artefact.
    expect(stem('running')).toBe('run');
    expect(stem('dropped')).toBe(stem('drop'));
  });

  it('survives an empty corpus without inventing anything', () => {
    expect(analyse({ documents: [] })).toMatchObject({
      sentiment: { positive: 0, neutral: 0, negative: 0 },
      trend: [],
      themes: [],
      drivers: [],
    });
  });
});

/* --------------------------------------------------------------- 3. gates */

const stranger = () => request(app);

/** A launched campaign whose written answers are the exact texts given. */
async function campaignWith(
  founder: Session,
  opts: {
    unitName: string;
    subject: string;
    name: string;
    entries: Array<[string, number]>;
    /** A second subject on the SAME campaign, taking the last `n` entries. */
    also?: { subject: string; take: number };
  },
): Promise<{ campaignId: string; subjectId: string; alsoId: string | null }> {
  const unitId = await unitIdByName(founder.orgId, opts.unitName);
  const subject = await withCsrf(founder, 'post', '/api/v1/subjects').send({
    name: opts.subject,
    unitId,
  });
  const second = opts.also
    ? await withCsrf(founder, 'post', '/api/v1/subjects').send({ name: opts.also.subject, unitId })
    : null;
  const templates = await founder.agent.get('/api/v1/templates');
  const templateId = (templates.body.data as Array<{ id: string; name: string }>).find(
    (template) => template.name === 'Course feedback',
  )?.id as string;

  const campaign = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
    name: opts.name,
    templateId,
    subjectIds: second
      ? [subject.body.data.id, second.body.data.id]
      : [subject.body.data.id],
    audience: { kind: 'anyone' },
  });
  const campaignId = campaign.body.data.id as string;
  const launch = await withCsrf(founder, 'post', `/api/v1/campaigns/${campaignId}/launch`).send({});
  const token = launch.body.data.publicToken as string;

  const form = await stranger().get(`/api/v1/public/campaigns/${token}`);
  const questions = form.body.data.questions as Array<{
    id: string;
    kind: string;
    config: { options?: string[] };
  }>;

  const split = opts.also ? opts.entries.length - opts.also.take : opts.entries.length;
  for (const [index, [text, rating]] of opts.entries.entries()) {
    const answers = questions.map((question) => {
      switch (question.kind) {
        case 'rating':
          return { questionId: question.id, value: { kind: 'rating', n: rating } };
        case 'nps':
          return { questionId: question.id, value: { kind: 'nps', n: 8 } };
        case 'yesno':
          return { questionId: question.id, value: { kind: 'yesno', yes: true } };
        case 'single':
          return {
            questionId: question.id,
            value: { kind: 'single', option: question.config.options?.[0] ?? '' },
          };
        case 'multi':
          return {
            questionId: question.id,
            value: { kind: 'multi', options: [question.config.options?.[0] ?? ''] },
          };
        default:
          return { questionId: question.id, value: { kind: 'text', text } };
      }
    });
    const subjectId =
      second && index >= split ? (second.body.data.id as string) : (subject.body.data.id as string);
    const res = await stranger()
      .post(`/api/v1/public/campaigns/${token}/responses`)
      .send({ answers, subjectId });
    expect(res.status).toBe(201);
  }

  return {
    campaignId,
    subjectId: subject.body.data.id as string,
    alsoId: (second?.body.data.id as string) ?? null,
  };
}

const ENTRIES: Array<[string, number]> = [
  ['The valet parking was excellent and the staff were friendly', 5],
  ['valet parking is always a nightmare, we waited forty minutes', 1],
  ['Parking is terrible, never enough spaces', 1],
  ['The rooms were clean and the beds comfortable', 5],
  ['room was not clean, the bathroom was dirty', 2],
  ['Rooms are spacious but the wifi keeps dropping', 4],
  ['wifi is broken in the west wing', 2],
  ['clean rooms, friendly staff, great breakfast', 5],
];

type View = {
  suppressed: boolean;
  threshold: number;
  reliability: { responseCount: number; confidence: string; responseRate: number | null };
  themes?: Array<{ id: string; label: string; mentions: number; valence: string }>;
  drivers?: Array<{ id: string; impact: number; valence: string }>;
  sentiment?: { positive: number; neutral: number; negative: number };
  commentCount?: number;
};

const view = (session: Session, qs = '') =>
  session.agent.get(`/api/v1/analysis${qs}`).then((res) => ({
    status: res.status,
    body: res.body.data as View | undefined,
    error: res.body.error as { code?: string; details?: Record<string, unknown> } | undefined,
  }));

describe('the two gates 43 exists to demonstrate — 402 and 403, never confused', () => {
  it('403s for somebody without the capability, on an org that HAS paid', async () => {
    const founder = await setUpOrg('university', 'gold');
    const learner = await addStaff(founder.orgId, {
      name: 'Level four',
      level: 4,
      unitName: 'Section A',
    });
    const res = await view(learner);
    expect(res.status).toBe(403);
  });

  it('402s for somebody WITH the capability on an org that has not', async () => {
    const founder = await setUpOrg('university', 'bronze');
    const res = await view(founder);
    expect(res.status).toBe(402);
    // The remedy is an upgrade, and the body says which one. A 403 here would tell a paying
    // administrator to go and ask themselves for permission (DEC-011).
    expect(res.error?.details).toMatchObject({ requiredTier: 'silver', currentTier: 'bronze' });
  });

  it('403 BEATS 402 — no one is invited to buy something they still could not open', async () => {
    const founder = await setUpOrg('university', 'bronze');
    const learner = await addStaff(founder.orgId, {
      name: 'Level four',
      level: 4,
      unitName: 'Section A',
    });
    const res = await view(learner);
    expect(res.status).toBe(403);
  });

  it('opens on Silver, which is the tier 16 §3 sells it at', async () => {
    const founder = await setUpOrg('university', 'silver');
    expect((await view(founder)).status).toBe(200);
  });
});

describe('the k-anonymity gate applies here exactly as it does on 40', () => {
  it('returns NO analysis for a campaign below the threshold — the fields are absent', async () => {
    const founder = await setUpOrg('university', 'silver');
    await campaignWith(founder, {
      unitName: 'Section A',
      subject: 'Data Structures',
      name: 'Quiet round',
      entries: ENTRIES.slice(0, config.K_ANON_THRESHOLD - 1),
    });

    const res = await view(founder);
    expect(res.status).toBe(200);
    expect(res.body?.suppressed).toBe(true);
    // Not zeroed, not empty arrays. ABSENT — a client cannot render what it never received.
    expect(res.body).not.toHaveProperty('themes');
    expect(res.body).not.toHaveProperty('sentiment');
    expect(res.body).not.toHaveProperty('trend');
    expect(JSON.stringify(res.body)).not.toMatch(/parking/i);
  });

  it('suppresses a FILTER that narrows below the threshold INSIDE a readable campaign', async () => {
    const founder = await setUpOrg('university', 'silver');
    // ONE campaign, eight responses, split five and three across two subjects. The campaign
    // is comfortably over the threshold, so `readableCampaigns` — the first gate — lets it
    // straight through. Only the second gate can refuse the smaller subject.
    const thin = ENTRIES.length - config.K_ANON_THRESHOLD;
    expect(thin).toBeLessThan(config.K_ANON_THRESHOLD);
    const campaign = await campaignWith(founder, {
      unitName: 'Section A',
      subject: 'Big module',
      name: 'Loud round',
      entries: ENTRIES,
      also: { subject: 'Small module', take: thin },
    });

    const whole = await view(founder);
    expect(whole.body?.suppressed).toBe(false);
    expect(whole.body?.reliability.responseCount).toBe(ENTRIES.length);

    // `40` counts its threshold over the FILTERED set, and so does this. Without it,
    // "analysis for this one subject" is a per-subject breakdown of three people — the exact
    // request `38` § "Not built" refused, arrived at through a query parameter instead of a
    // route. The campaign gate cannot see this one: the campaign is fine, the slice is not.
    const narrow = await view(founder, `?subjectId=${campaign.alsoId as string}`);
    expect(narrow.status).toBe(200);
    expect(narrow.body?.suppressed).toBe(true);
    expect(narrow.body?.reliability.responseCount).toBe(thin);
    expect(narrow.body).not.toHaveProperty('themes');

    // And the larger subject in the same campaign still analyses, so the refusal above is
    // the threshold doing its job rather than the filter simply being broken.
    const wide = await view(founder, `?subjectId=${campaign.subjectId}`);
    expect(wide.body?.suppressed).toBe(false);
    expect(wide.body?.reliability.responseCount).toBe(config.K_ANON_THRESHOLD);
  });
});

describe('the analysis itself, over real submitted responses', () => {
  let founder: Session;

  beforeAll(async () => {
    founder = await setUpOrg('university', 'silver');
    await campaignWith(founder, {
      unitName: 'Section A',
      subject: 'Data Structures',
      name: 'Autumn round',
      entries: ENTRIES,
    });
  });

  it('returns themes drawn from what people actually wrote', async () => {
    const res = await view(founder);
    expect(res.status).toBe(200);
    expect(res.body?.suppressed).toBe(false);
    const ids = res.body?.themes?.map((theme) => theme.id) ?? [];
    expect(ids).toContain('park');
    expect(ids).toContain('room');
    expect(res.body?.themes?.length).toBeLessThanOrEqual(12);
  });

  it('carries reliability alongside the numbers, and says the sample is thin', async () => {
    const res = await view(founder);
    expect(res.body?.reliability.responseCount).toBe(ENTRIES.length);
    // Eight responses. `43` § Reliability: presenting eight the way you present eight
    // hundred is the most common way a feedback dashboard lies.
    expect(res.body?.reliability.confidence).toBe('low');
    // `anyone` has no denominator, and a rate needs one. T-040's lesson (N-044).
    expect(res.body?.reliability.responseRate).toBeNull();
  });

  it('drills a theme through to the comments it came from', async () => {
    const overview = await view(founder);
    const parking = overview.body?.themes?.find((theme) => theme.id === 'park');
    expect(parking).toBeTruthy();

    const detail = await founder.agent.get('/api/v1/analysis/themes/park');
    expect(detail.status).toBe(200);
    const comments = detail.body.data.comments as Array<{ comment: string; valence: string }>;
    expect(comments.length).toBe(parking?.mentions);
    // Every one of them genuinely contains the word. A theme whose sources do not mention it
    // is an unfalsifiable label, which is `43` § Interactions' whole argument for this route.
    for (const comment of comments) expect(comment.comment.toLowerCase()).toMatch(/park/);
    expect(detail.body.data.id).toBe('park');
  });

  it('404s on a theme that is not in the current analysis', async () => {
    const res = await founder.agent.get('/api/v1/analysis/themes/aardvark');
    expect(res.status).toBe(404);
  });

  it('gives the SAME analysis twice — the drill-through recomputes and must land twice', async () => {
    const one = await view(founder);
    const two = await view(founder);
    expect(two.body).toEqual(one.body);
  });

  it('reads a theme detail as response.read CONTENT, not as analysis (40’s split)', async () => {
    const reader = await addStaff(founder.orgId, {
      name: 'Analyst',
      level: 2,
      unitName: 'Root',
    });
    expect((await view(reader)).status).toBe(200);
    expect((await reader.agent.get('/api/v1/analysis/themes/park')).status).toBe(200);

    // Take away the right to read what one person wrote, and the drill-through goes with it
    // even though `analysis.read` is untouched. `40`: "a head of department may reasonably
    // have the first without the second."
    await denyPerson(founder.orgId, reader.userId, 'response.read', 'all');
    expect((await reader.agent.get('/api/v1/analysis/themes/park')).status).toBe(403);

    // And the overview now analyses nothing, because the CORPUS is scoped by response.read.
    // It does not 403 — there is simply nothing this person may read (INV-003, INV-004).
    const after = await view(reader);
    expect(after.status).toBe(200);
    expect(after.body?.suppressed).toBe(true);
  });
});
