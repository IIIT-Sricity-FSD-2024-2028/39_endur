// Results, and the gate that makes the anonymity promise real. 13, 40, 52 §2.
//
// The aggregation is the easy half. The half that matters is the k-anonymity gate: with
// three responses in a small department, an average plus one comment identifies the author,
// and an administrator who wants to find a critic will find them.
//
// Suppression is the promise being kept when it is inconvenient, which is the only time a
// privacy promise means anything.
import { resolveLabels } from '@endur/shared';
import type {
  LabelSet,
  QuestionConfig,
  QuestionKind,
  QuestionSummary,
  ResponseItem,
  ResponsesQuery,
  ResultsQuery,
  ResultsView,
} from '@endur/shared';
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { config } from '../../lib/config.js';
import { NotFoundError } from '../../lib/errors.js';
import { nounsOf } from '../../lib/vocabulary.js';
import { afterCursorOn, decodeCursor, orderOn, pageOf, type Paged } from '../../lib/paginate.js';
import { visibleUnits } from '../../authz/index.js';
import { unitSubtree } from '../../db/graph.js';
import { countAudience, ruleOf } from '../campaigns/audience.js';
import { campaignInScope } from '../campaigns/visibility.js';

export async function readResults(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
  query: ResultsQuery,
): Promise<ResultsView> {
  const campaign = await assertVisible(req, orgId, userId, authzVersion, campaignId, 'results.read');
  const subjectIds = await filterSubjects(req, orgId, campaign, query);

  const responseWhere = {
    campaignId,
    ...(subjectIds ? { subjectId: { in: subjectIds } } : {}),
  };

  const [responseCount, audienceEstimate, latest] = await Promise.all([
    prisma.response.count({ where: responseWhere }),
    // FROM THE AUDIENCE RULE, not from the subject count. Until T-040 this was
    // `campaign.subjects.length`, which made the response rate responses-per-SUBJECT and
    // rendered it as a percentage: every seeded demo campaign showed a rate between 1750%
    // and 4675%, on the screen the evaluator opens straight after scanning.
    // `anyone` has no denominator at all and now says so by returning null (40's DTO has
    // typed both fields `| null` since revision one, anticipating exactly this).
    countAudience(orgId, ruleOf(campaign.audienceRule)),
    prisma.response.findFirst({
      where: responseWhere,
      orderBy: { submittedAt: 'desc' },
      select: { submittedAt: true },
    }),
  ]);

  const threshold = config.K_ANON_THRESHOLD;

  // THE GATE. Below the threshold the body carries no per-question data at all — not
  // zeroed, not rounded, absent. A client cannot render what it was never sent, which is
  // the difference between a privacy guarantee and a UI convention (52 §2).
  if (responseCount < threshold) {
    return {
      responseCount,
      audienceEstimate,
      responseRate: null,
      suppressed: true,
      threshold,
      ...(latest ? { newSince: latest.submittedAt.toISOString() } : {}),
    };
  }

  const questions = await prisma.question.findMany({
    where: { templateId: campaign.templateId },
    orderBy: { position: 'asc' },
    select: { id: true, kind: true, text: true, config: true },
  });

  const summaries: QuestionSummary[] = [];
  for (const question of questions) {
    summaries.push(await summarise(question, responseWhere));
  }

  return {
    responseCount,
    audienceEstimate,
    responseRate:
      audienceEstimate && audienceEstimate > 0
        ? Math.round((responseCount / audienceEstimate) * 100) / 100
        : null,
    suppressed: false,
    threshold,
    ...(latest ? { newSince: latest.submittedAt.toISOString() } : {}),
    questions: summaries,
  };
}

/**
 * Individual comments. A SEPARATE capability from the aggregates, deliberately: seeing
 * that the average is 4.3 and reading what one person wrote are different levels of
 * access, and a head of department may reasonably have the first without the second (40).
 */
export async function readResponses(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
  query: ResponsesQuery,
): Promise<Paged<ResponseItem> & { suppressed: boolean }> {
  const campaign = await assertVisible(req, orgId, userId, authzVersion, campaignId, 'response.read');

  const total = await prisma.response.count({ where: { campaignId } });
  if (total < config.K_ANON_THRESHOLD) {
    // The same gate, on the surface where it matters most. Free-text answers are the most
    // identifying data in the product — people write in their own voice.
    return {
      data: [],
      page: { nextCursor: null, hasMore: false },
      meta: { total },
      suppressed: true,
    };
  }

  const where = { campaignId };
  const rows = await prisma.response.findMany({
    // A response has no created_at: for a submission those would be the same instant, and
    // a second column would be a second thing to get wrong (10 §4.4).
    where: { ...where, ...afterCursorOn('submittedAt', query.cursor) },
    take: query.limit + 1,
    orderBy: orderOn('submittedAt'),
    select: {
      id: true,
      submittedAt: true,
      subject: { select: { name: true } },
      answers: {
        where: {
          question: { kind: 'text' },
          ...(query.questionId ? { questionId: query.questionId } : {}),
        },
        select: { questionId: true, value: true, question: { select: { text: true } } },
      },
    },
  });

  void campaign;
  const page = pageOf(
    rows,
    query.limit,
    total,
    (row) => ({
      id: row.id,
      submittedAt: row.submittedAt.toISOString(),
      subjectName: row.subject?.name ?? null,
      answers: row.answers.map((answer) => ({
        questionId: answer.questionId,
        questionText: answer.question.text,
        text: (answer.value as { text?: string }).text ?? '',
      })),
    }),
    (row) => ({ createdAt: row.submittedAt, id: row.id }),
  );

  return { ...page, suppressed: false };
}

/** CSV, gated exactly as the aggregates are — an export is a results page you can email. */
export async function exportResults(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
): Promise<{ filename: string; csv: string }> {
  const campaign = await assertVisible(req, orgId, userId, authzVersion, campaignId, 'results.export');

  const total = await prisma.response.count({ where: { campaignId } });
  if (total < config.K_ANON_THRESHOLD) {
    return {
      filename: `${slug(campaign.name)}-results.csv`,
      csv: `Results appear once ${config.K_ANON_THRESHOLD} people have responded. ${total} so far.\n`,
    };
  }

  const questions = await prisma.question.findMany({
    where: { templateId: campaign.templateId },
    orderBy: { position: 'asc' },
    select: { id: true, text: true },
  });
  const responses = await prisma.response.findMany({
    where: { campaignId },
    orderBy: { submittedAt: 'asc' },
    select: {
      submittedAt: true,
      subject: { select: { name: true } },
      answers: { select: { questionId: true, value: true } },
    },
  });

  // THE ORG'S OWN NOUN, not the word "Subject" (22 §6, 40 § Acceptance). A CSV whose header
  // column says "Course" for a hotel is exactly the leak the manual vocabulary audit exists
  // for, and it is the one nobody thinks to check — audit-vocab only scans the frontend.
  const labels = resolveLabels(campaign.org.labels as LabelSet);
  const header = [
    'Submitted at',
    labels.subject.one,
    ...questions.map((question) => question.text),
  ];
  const lines = [header.map(csvCell).join(',')];

  for (const response of responses) {
    const byQuestion = new Map(response.answers.map((answer) => [answer.questionId, answer.value]));
    lines.push(
      [
        response.submittedAt.toISOString(),
        response.subject?.name ?? '',
        // No respondent column exists to export, which is the point (INV-006). A CSV that
        // could name people would undo the schema-level guarantee at the last step.
        ...questions.map((question) => renderAnswer(byQuestion.get(question.id))),
      ]
        .map(csvCell)
        .join(','),
    );
  }

  return { filename: `${slug(campaign.name)}-results.csv`, csv: `${lines.join('\n')}\n` };
}

/* ------------------------------------------------------------ aggregation */

type QuestionRow = { id: string; kind: string; text: string; config: unknown };

async function summarise(
  question: QuestionRow,
  responseWhere: Record<string, unknown>,
): Promise<QuestionSummary> {
  const where = { questionId: question.id, response: responseWhere };
  const answered = await prisma.answer.count({ where });

  const base: QuestionSummary = {
    questionId: question.id,
    kind: question.kind as QuestionKind,
    text: question.text,
    answered,
  };
  if (answered === 0) return base;

  const config_ = question.config as QuestionConfig;

  if (question.kind === 'rating') {
    // Aggregated on numeric_value, not by extracting (value->>'n')::numeric on every row.
    // That column is written alongside `value` at submit time precisely so this stays one
    // indexed aggregate (10 §4.4, 40 § Acceptance).
    const stats = await prisma.answer.aggregate({ where, _avg: { numericValue: true } });
    const buckets = await prisma.answer.groupBy({
      by: ['numericValue'],
      where,
      _count: true,
      orderBy: { numericValue: 'asc' },
    });
    const max = config_.kind === 'rating' ? config_.max : 5;
    return {
      ...base,
      average: round(Number(stats._avg.numericValue ?? 0)),
      distribution: Array.from({ length: max }, (_, index) => {
        const value = index + 1;
        const count = buckets.find((b) => Number(b.numericValue) === value)?._count ?? 0;
        return { label: String(value), count, percent: percent(count, answered) };
        // No valence. Whether a low rating is bad depends on the question, and inferring it
        // from the arithmetic is exactly what CONF-004 forbids.
      }),
    };
  }

  if (question.kind === 'nps') {
    const buckets = await prisma.answer.groupBy({
      by: ['numericValue'],
      where,
      _count: true,
    });
    const countIn = (from: number, to: number) =>
      buckets
        .filter((bucket) => {
          const value = Number(bucket.numericValue);
          return value >= from && value <= to;
        })
        .reduce((total, bucket) => total + bucket._count, 0);

    const detractors = countIn(0, 6);
    const passives = countIn(7, 8);
    const promoters = countIn(9, 10);

    return {
      ...base,
      npsMix: {
        promoters,
        passives,
        detractors,
        score: Math.round((promoters / answered) * 100 - (detractors / answered) * 100),
      },
      // Valence IS a definition here — the instrument names these groups. This is the one
      // place it is populated (CONF-004).
      distribution: [
        { label: 'Promoters', count: promoters, percent: percent(promoters, answered), valence: 'positive' },
        { label: 'Passives', count: passives, percent: percent(passives, answered), valence: 'neutral' },
        { label: 'Detractors', count: detractors, percent: percent(detractors, answered), valence: 'negative' },
      ],
    };
  }

  if (question.kind === 'yesno') {
    const rows = await prisma.answer.findMany({ where, select: { value: true } });
    const yes = rows.filter((row) => (row.value as { yes?: boolean }).yes === true).length;
    return {
      ...base,
      distribution: [
        { label: 'Yes', count: yes, percent: percent(yes, answered) },
        { label: 'No', count: answered - yes, percent: percent(answered - yes, answered) },
      ],
    };
  }

  if (question.kind === 'single' || question.kind === 'multi') {
    const options =
      config_.kind === 'single' || config_.kind === 'multi' ? config_.options : [];
    const rows = await prisma.answer.findMany({ where, select: { value: true } });
    const counts = new Map<string, number>(options.map((option) => [option, 0]));

    for (const row of rows) {
      const value = row.value as { option?: string; options?: string[] };
      for (const chosen of value.options ?? (value.option ? [value.option] : [])) {
        counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
      }
    }

    return {
      ...base,
      distribution: [...counts].map(([label, count]) => ({
        label,
        count,
        percent: percent(count, answered),
      })),
    };
  }

  // Free text has no distribution. The comments themselves live behind `response.read`,
  // which is a different capability on purpose.
  return base;
}

/* ---------------------------------------------------------------- helpers */

async function assertVisible(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
  capability: 'results.read' | 'response.read' | 'results.export',
) {
  // The org's own noun, on both branches, for the same reason as campaigns/service.ts.
  const missing = `That ${nounsOf(req).campaign.one.toLowerCase()} does not exist.`;
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, orgId },
    select: {
      id: true,
      name: true,
      templateId: true,
      audienceRule: true,
      org: { select: { labels: true } },
      subjects: { select: { subject: { select: { id: true, unitId: true, type: true } } } },
    },
  });
  if (!campaign) throw new NotFoundError(missing);

  const visibility = await visibleUnits({ orgId, userId, capability, authzVersion });
  // The SAME predicate the inbox's readableCampaigns uses, from one implementation. 58 §
  // Acceptance asks that the two match for the same caller; sharing the function is how
  // that is true by construction rather than by two people writing the same `some()`.
  if (campaignInScope(campaign.subjects, visibility)) return campaign;

  throw new NotFoundError(missing);
}

/**
 * The filters are themselves scope-filtered: a head of department's subject and unit
 * dropdowns contain only their own unit, so a filter cannot be used to reach past a scope
 * the list already applied (40, INV-003).
 */
async function filterSubjects(
  req: Request,
  orgId: string,
  campaign: { subjects: Array<{ subject: { id: string; unitId: string | null } }> },
  query: ResultsQuery,
): Promise<string[] | null> {
  if (query.subjectId) {
    const included = campaign.subjects.some(({ subject }) => subject.id === query.subjectId);
    if (!included) {
      throw new NotFoundError(
        `That one is not part of this ${nounsOf(req).campaign.one.toLowerCase()}.`,
      );
    }
    return [query.subjectId];
  }
  if (query.unitId) {
    const units = await unitSubtree(orgId, query.unitId);
    return campaign.subjects
      .filter(({ subject }) => subject.unitId && units.includes(subject.unitId))
      .map(({ subject }) => subject.id);
  }
  return null;
}

const round = (value: number) => Math.round(value * 100) / 100;
const percent = (count: number, total: number) =>
  total === 0 ? 0 : Math.round((count / total) * 1000) / 10;

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign';

function renderAnswer(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const answer = value as { n?: number; option?: string; options?: string[]; text?: string; yes?: boolean };
  if (typeof answer.n === 'number') return String(answer.n);
  if (typeof answer.yes === 'boolean') return answer.yes ? 'Yes' : 'No';
  if (answer.option) return answer.option;
  if (answer.options) return answer.options.join('; ');
  return answer.text ?? '';
}

/** RFC 4180: quote anything containing a comma, a quote or a newline, and double the quotes. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/* ------------------------------------------------- the inbox's read path (58) */

/**
 * ONE FREE-TEXT COMMENT, across campaigns. The inbox's entire source of content.
 *
 * This lives here rather than in `features/inbox/` because the k-anonymity gate lives here,
 * and `38` § "Not built" already refused a per-subject breakdown for exactly this reason:
 * *"a second ungated path to them is what INV-007 exists to prevent"*. The inbox is a far
 * more tempting version of the same mistake — it is a list of individual comments, which is
 * precisely what the gate exists to withhold. So `features/inbox/` touches `inbox_state`
 * and nothing else; every word it renders comes from this function.
 *
 * THE SUPPRESSION IS NOT UNDONE BY AGGREGATION. The threshold is applied per campaign
 * BEFORE the merge, which is the mistake a naive UNION across campaigns would make: two
 * campaigns of two responses each do not become a readable four.
 */
export type CommentRow = {
  responseId: string;
  questionId: string;
  submittedAt: Date;
  campaign: { id: string; name: string };
  subject: { id: string; name: string } | null;
  comment: string;
  questionText: string;
  score: number | null;
  scoreMax: number | null;
};

export type CommentFilter = {
  campaignId?: string | undefined;
  subjectId?: string | undefined;
  /** The inbox's per-caller state, expressed as ids. It never reaches into this query. */
  responseIds?: { in: string[] } | { notIn: string[] } | undefined;
  cursor?: string | undefined;
  limit: number;
};

export async function readComments(
  orgId: string,
  userId: string,
  authzVersion: number,
  filter: CommentFilter,
): Promise<Paged<CommentRow>> {
  const campaignIds = await readableCampaigns(orgId, userId, authzVersion, filter.campaignId);
  if (campaignIds.length === 0) {
    return { data: [], page: { nextCursor: null, hasMore: false }, meta: { total: 0 } };
  }

  const where = {
    question: { kind: 'text' as const },
    response: {
      campaignId: { in: campaignIds },
      ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
      ...(filter.responseIds ? { id: filter.responseIds } : {}),
    },
  };

  const total = await prisma.answer.count({ where });

  // Paged over ANSWERS ordered by their response's timestamp, which lib/paginate.ts's
  // afterCursorOn cannot express — it filters a column on the queried model, and this one
  // is a column on a relation. The cursor is the same encoding, so a client cannot tell.
  const point = filter.cursor ? decodeCursor(filter.cursor) : null;
  const rows = await prisma.answer.findMany({
    where: {
      ...where,
      ...(point
        ? {
            OR: [
              { response: { ...where.response, submittedAt: { lt: point.createdAt } } },
              { response: { ...where.response, submittedAt: point.createdAt }, id: { lt: point.id } },
            ],
          }
        : {}),
    },
    take: filter.limit + 1,
    orderBy: COMMENT_ORDER,
    select: COMMENT_SELECT,
  });

  return pageOf(rows, filter.limit, total, toCommentRow, (row) => ({
    createdAt: row.response.submittedAt,
    id: row.id,
  }));
}

/**
 * ONE selection and ONE mapper, shared by the inbox's page and the analysis corpus. Two
 * copies of this would be two answers to "what is a comment", and the second one would be
 * the one that quietly grew a respondent-shaped field.
 */
const COMMENT_SELECT = {
  id: true,
  value: true,
  questionId: true,
  question: { select: { text: true } },
  response: {
    select: {
      id: true,
      submittedAt: true,
      campaign: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
      // The rating on the SAME response. Not an average, not across responses — this is
      // what one person said alongside what they wrote.
      answers: {
        where: { question: { kind: 'rating' as const } },
        take: 1,
        orderBy: { question: { position: 'asc' as const } },
        select: { numericValue: true, question: { select: { config: true } } },
      },
    },
  },
} as const;

const COMMENT_ORDER = [
  { response: { submittedAt: 'desc' as const } },
  { id: 'desc' as const },
];

type CommentQueryRow = {
  id: string;
  value: unknown;
  questionId: string;
  question: { text: string };
  response: {
    id: string;
    submittedAt: Date;
    campaign: { id: string; name: string };
    subject: { id: string; name: string } | null;
    answers: Array<{ numericValue: unknown; question: { config: unknown } }>;
  };
};

function toCommentRow(row: CommentQueryRow): CommentRow {
  const rating = row.response.answers[0];
  const config_ = rating ? (rating.question.config as QuestionConfig) : undefined;
  return {
    responseId: row.response.id,
    questionId: row.questionId,
    submittedAt: row.response.submittedAt,
    campaign: row.response.campaign,
    subject: row.response.subject,
    comment: (row.value as { text?: string }).text ?? '',
    questionText: row.question.text,
    score: rating?.numericValue == null ? null : Number(rating.numericValue),
    scoreMax: config_?.kind === 'rating' ? config_.max : null,
  };
}

/**
 * The campaigns whose comments this caller may read: visible under `response.read`, AND at
 * or above the k-anonymity threshold. Both halves, in one place, so neither can be applied
 * without the other.
 */
export async function readableCampaigns(
  orgId: string,
  userId: string,
  authzVersion: number,
  onlyCampaignId?: string,
): Promise<string[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { orgId, ...(onlyCampaignId ? { id: onlyCampaignId } : {}) },
    select: {
      id: true,
      subjects: { select: { subject: { select: { unitId: true, type: true } } } },
    },
  });
  if (campaigns.length === 0) return [];

  // EXACTLY 40's scope test, from exactly one implementation of it (INV-003).
  const visibility = await visibleUnits({ orgId, userId, capability: 'response.read', authzVersion });
  const visible = campaigns.filter((campaign) => campaignInScope(campaign.subjects, visibility));
  if (visible.length === 0) return [];

  // PER CAMPAIGN, before anything is merged. A groupBy rather than a count each, but the
  // arithmetic is the same one 40 does — and it is the whole reason this list is short.
  const counts = await prisma.response.groupBy({
    by: ['campaignId'],
    where: { campaignId: { in: visible.map((campaign) => campaign.id) } },
    _count: true,
  });
  const above = new Set(
    counts
      .filter((row) => row._count >= config.K_ANON_THRESHOLD)
      .map((row) => row.campaignId),
  );
  return visible.filter((campaign) => above.has(campaign.id)).map((campaign) => campaign.id);
}

/* ------------------------------------------- the analysis corpus (43, T-081) */

export type CorpusFilter = {
  campaignId?: string | undefined;
  unitId?: string | undefined;
  subjectId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
};

/**
 * THE GATE IS THE TYPE. `comments` exists only on the `suppressed: false` branch, so a
 * caller cannot read a below-threshold corpus even by forgetting to check — the compiler
 * refuses. `40` and `58` both had to remember; this one cannot be forgotten.
 *
 * `features/analysis/` therefore holds no query at all, exactly as `features/inbox/` holds
 * none (DEC-058). It receives text, and everything it does to that text is arithmetic.
 */
export type Corpus = {
  responseCount: number;
  audienceEstimate: number | null;
  threshold: number;
} & ({ suppressed: true } | { suppressed: false; comments: CommentRow[] });

/**
 * A hard ceiling on what one request will analyse. Ordered newest first, so a very large
 * corpus analyses the most recent slice rather than an arbitrary one — and the ordering is
 * total (`submittedAt desc, id desc`), so the slice is the same slice twice, which is what
 * `43` § Acceptance means by determinism.
 */
const MAX_CORPUS = 5_000;

export async function readCorpus(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  filter: CorpusFilter,
): Promise<Corpus> {
  const threshold = config.K_ANON_THRESHOLD;
  // ONE named campaign is asked about by id, so it gets the same answer every other
  // by-id read gives: 404 when the caller may not see it (N-068). Without this, "you
  // may not read this" arrived as `responseCount: 0`, which reports an empty corpus as
  // a fact and hid D-042 for a whole demo run. A campaign the caller CAN see but which
  // sits below the threshold still falls through to the suppressed branch below — the
  // two answers must stay distinct for the reader and identical for the outsider.
  if (filter.campaignId) {
    await assertVisible(req, orgId, userId, authzVersion, filter.campaignId, 'response.read');
  }
  const campaignIds = await readableCampaigns(orgId, userId, authzVersion, filter.campaignId);
  if (campaignIds.length === 0) {
    return { suppressed: true, responseCount: 0, audienceEstimate: null, threshold };
  }

  const subjectWhere = filter.subjectId
    ? { subjectId: filter.subjectId }
    : filter.unitId
      ? { subject: { unitId: { in: await unitSubtree(orgId, filter.unitId) } } }
      : {};

  const responseWhere = {
    campaignId: { in: campaignIds },
    ...subjectWhere,
    ...(filter.from || filter.to
      ? {
          submittedAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lt: filter.to } : {}),
          },
        }
      : {}),
  };

  const responseCount = await prisma.response.count({ where: responseWhere });
  const audienceEstimate = await estimateAudience(orgId, campaignIds, subjectWhere, filter);

  // THE SECOND GATE, and it is the one the filters make necessary. `readableCampaigns`
  // decides which campaigns may be read at all; this decides whether the SLICE somebody
  // asked for is big enough to be safe. Without it, "analysis for this one subject" is a
  // per-subject breakdown of three people, which is the request `38` § "Not built" refused.
  //
  // It is the same arithmetic `readResults` does over its own filtered `responseWhere`.
  if (responseCount < threshold) {
    return { suppressed: true, responseCount, audienceEstimate, threshold };
  }

  const rows = await prisma.answer.findMany({
    where: { question: { kind: 'text' as const }, response: responseWhere },
    take: MAX_CORPUS,
    orderBy: COMMENT_ORDER,
    select: COMMENT_SELECT,
  });

  return {
    suppressed: false,
    responseCount,
    audienceEstimate,
    threshold,
    comments: rows.map(toCommentRow),
  };
}

/**
 * The denominator, or an honest `null`.
 *
 * `null` on three occasions, and each of them is a case where a number would be worse than
 * nothing: an `anyone` campaign has no audience to count; a subject or unit filter narrows
 * the numerator but not the rule, so the pair would no longer describe the same population;
 * and a date filter cuts the responses but not the invitations.
 *
 * This is `T-040`'s lesson (`N-044`) applied before it could happen again: a response rate
 * whose halves are measured differently is not a low rate, it is a wrong one.
 */
async function estimateAudience(
  orgId: string,
  campaignIds: string[],
  subjectWhere: Record<string, unknown>,
  filter: CorpusFilter,
): Promise<number | null> {
  if (Object.keys(subjectWhere).length > 0 || filter.from || filter.to) return null;

  const campaigns = await prisma.campaign.findMany({
    where: { id: { in: campaignIds } },
    select: { audienceRule: true },
  });

  let total = 0;
  for (const campaign of campaigns) {
    const count = await countAudience(orgId, ruleOf(campaign.audienceRule));
    if (count === null) return null;
    total += count;
  }
  return total;
}
