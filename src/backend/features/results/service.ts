// Results, and the anonymity gate that makes the promise real.
// The aggregation is the easy half. The gate is the half that matters: with three responses in a small
// team, an average plus one comment identifies the author.
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

// The aggregated results for one campaign, or a suppressed reply when there are too few responses.
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
    // The denominator comes from the AUDIENCE RULE, not the subject count - otherwise the response rate
    // becomes responses-per-subject and reads as 1750%. An open link has no denominator and says so with null.
    countAudience(orgId, ruleOf(campaign.audienceRule)),
    prisma.response.findFirst({
      where: responseWhere,
      orderBy: { submittedAt: 'desc' },
      select: { submittedAt: true },
    }),
  ]);

  const threshold = config.K_ANON_THRESHOLD;

  // THE GATE. Below the threshold the reply carries no per-question data at all - not zeroed, absent.
  // A client cannot render what it was never sent.
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

// The individual comments, behind a separate capability from the aggregates on purpose.
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
    // The same gate, on the surface where it matters most: people write free text in their own voice.
    return {
      data: [],
      page: { nextCursor: null, hasMore: false },
      meta: { total },
      suppressed: true,
    };
  }

  const where = { campaignId };
  const rows = await prisma.response.findMany({
    // A response has no created_at: for a submission that would be the same instant as submitted_at.
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

// The CSV export, gated exactly as the aggregates are: an export is a results page you can email.
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

  // The organisation's own noun in the header, never the literal word "Subject".
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
        // There is no respondent column to export, which is the point: the CSV cannot undo the schema's guarantee.
        ...questions.map((question) => renderAnswer(byQuestion.get(question.id))),
      ]
        .map(csvCell)
        .join(','),
    );
  }

  return { filename: `${slug(campaign.name)}-results.csv`, csv: `${lines.join('\n')}\n` };
}

// Aggregation.

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
    // Aggregated on the stored numeric column, which is why it is written at submit time: it keeps this one indexed query.
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
        // No good/bad label: whether a low rating is bad depends on the question, and guessing is forbidden.
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
      // Here the labels ARE part of the instrument, so this is the one place they are set.
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

  // Free text has no distribution. The comments themselves sit behind a different capability.
  return base;
}

// Helpers.

async function assertVisible(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
  capability: 'results.read' | 'response.read' | 'results.export',
) {
  // The organisation's own noun on both branches, as in the campaigns service.
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
  // The same visibility rule the inbox uses, from one implementation, so the two always agree.
  if (campaignInScope(campaign.subjects, visibility)) return campaign;

  throw new NotFoundError(missing);
}

// The filters are themselves scope-filtered, so a filter can never reach past the scope the list already applied.
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

// Quotes a CSV cell when it contains a comma, a quote or a newline, and doubles any inner quote.
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// The inbox's read path.

// One free-text comment at a time, across campaigns - the inbox's entire source of content.
// It lives here because the anonymity gate lives here: the inbox is a list of individual comments,
// which is exactly what that gate exists to withhold. The threshold is applied PER CAMPAIGN before
// anything is merged, so two campaigns of two responses each never become a readable four.
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
  // The inbox's per-caller state, as ids. It never reaches into this query.
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

  // Paged over answers ordered by their response's timestamp, which the shared paginator cannot express,
  // because that column lives on a related table. The cursor encoding is the same, so a client cannot tell.
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

// One selection and one mapper, shared by the inbox page and the analysis corpus,
// so there is only ever one answer to "what is a comment".
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
      // The rating from the SAME response: what one person said alongside what they wrote.
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

// The campaigns whose comments this caller may read: visible to them AND at or above the anonymity
// threshold. Both halves in one place, so neither can be applied without the other.
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

  // Exactly the results page's scope test, from one implementation of it.
  const visibility = await visibleUnits({ orgId, userId, capability: 'response.read', authzVersion });
  const visible = campaigns.filter((campaign) => campaignInScope(campaign.subjects, visibility));
  if (visible.length === 0) return [];

  // Counted per campaign, before anything is merged, which is what keeps this list short.
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

// The corpus the analysis feature reads.

export type CorpusFilter = {
  campaignId?: string | undefined;
  unitId?: string | undefined;
  subjectId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
};

// The gate is the TYPE here: the comments field exists only on the not-suppressed branch, so a caller
// cannot read a below-threshold corpus even by forgetting to check - the compiler refuses.
// That is also why the analysis feature holds no query at all: it receives text and does arithmetic.
export type Corpus = {
  responseCount: number;
  audienceEstimate: number | null;
  threshold: number;
} & ({ suppressed: true } | { suppressed: false; comments: CommentRow[] });

// A hard ceiling on what one request will analyse, newest first and totally ordered,
// so the same request analyses the same slice every time.
const MAX_CORPUS = 5_000;

export async function readCorpus(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  filter: CorpusFilter,
): Promise<Corpus> {
  const threshold = config.K_ANON_THRESHOLD;
  // A campaign asked about by id gets the same answer every other by-id read gives: 404 when the caller
  // may not see it. Reporting "0 responses" instead would state an empty corpus as a fact.
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

  // The second gate, and the filters are what make it necessary: the first decides which campaigns may be
  // read at all, this decides whether the SLICE somebody asked for is big enough to be safe.
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

// The denominator, or an honest null.
// Null in three cases where a number would be worse than nothing: an open link has no audience to count,
// a subject or unit filter narrows the responses but not the rule, and a date filter cuts responses but not invitations.
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
