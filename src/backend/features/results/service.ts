// Results, and the gate that makes the anonymity promise real. 13, 40, 52 §2.
//
// The aggregation is the easy half. The half that matters is the k-anonymity gate: with
// three responses in a small department, an average plus one comment identifies the author,
// and an administrator who wants to find a critic will find them.
//
// Suppression is the promise being kept when it is inconvenient, which is the only time a
// privacy promise means anything.
import type {
  QuestionConfig,
  QuestionKind,
  QuestionSummary,
  ResponseItem,
  ResponsesQuery,
  ResultsQuery,
  ResultsView,
} from '@endur/shared';
import { prisma } from '../../db/client.js';
import { config } from '../../lib/config.js';
import { NotFoundError } from '../../lib/errors.js';
import { afterCursorOn, orderOn, pageOf, type Paged } from '../../lib/paginate.js';
import { visibleUnits } from '../../authz/index.js';
import { unitSubtree } from '../../db/graph.js';

export async function readResults(
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
  query: ResultsQuery,
): Promise<ResultsView> {
  const campaign = await assertVisible(orgId, userId, authzVersion, campaignId, 'results.read');
  const subjectIds = await filterSubjects(orgId, campaign, query);

  const responseWhere = {
    campaignId,
    ...(subjectIds ? { subjectId: { in: subjectIds } } : {}),
  };

  const [responseCount, audienceEstimate, latest] = await Promise.all([
    prisma.response.count({ where: responseWhere }),
    Promise.resolve(campaign.subjects.length || null),
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
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
  query: ResponsesQuery,
): Promise<Paged<ResponseItem> & { suppressed: boolean }> {
  const campaign = await assertVisible(orgId, userId, authzVersion, campaignId, 'response.read');

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
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
): Promise<{ filename: string; csv: string }> {
  const campaign = await assertVisible(orgId, userId, authzVersion, campaignId, 'results.export');

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

  const header = ['Submitted at', 'Subject', ...questions.map((question) => question.text)];
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
  orgId: string,
  userId: string,
  authzVersion: number,
  campaignId: string,
  capability: 'results.read' | 'response.read' | 'results.export',
) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, orgId },
    select: {
      id: true,
      name: true,
      templateId: true,
      subjects: { select: { subject: { select: { id: true, unitId: true } } } },
    },
  });
  if (!campaign) throw new NotFoundError('That campaign does not exist.');

  const visibility = await visibleUnits({ orgId, userId, capability, authzVersion });
  if (visibility.all) return campaign;

  const units = campaign.subjects
    .map(({ subject }) => subject.unitId)
    .filter((unitId): unitId is string => Boolean(unitId));
  if (units.some((unitId) => visibility.unitIds.includes(unitId))) return campaign;

  throw new NotFoundError('That campaign does not exist.');
}

/**
 * The filters are themselves scope-filtered: a head of department's subject and unit
 * dropdowns contain only their own unit, so a filter cannot be used to reach past a scope
 * the list already applied (40, INV-003).
 */
async function filterSubjects(
  orgId: string,
  campaign: { subjects: Array<{ subject: { id: string; unitId: string | null } }> },
  query: ResultsQuery,
): Promise<string[] | null> {
  if (query.subjectId) {
    const included = campaign.subjects.some(({ subject }) => subject.id === query.subjectId);
    if (!included) throw new NotFoundError('That one is not part of this campaign.');
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
