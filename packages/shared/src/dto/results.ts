// Results DTOs. 13, 40, 52 §2.
import { z } from 'zod';
import { dto, Id, PageQuery } from './common.js';
import type { QuestionKind } from './template.js';

/**
 * Explicit in the DTO, never inferred by the client (CONF-004).
 *
 * It is populated ONLY where valence is a definition rather than a judgement — an NPS
 * detractor is a detractor by the instrument's own rules. A 2-out-of-5 rating is a low
 * number, and whether that is bad depends on the question; the client must not paint it
 * red because the arithmetic went down.
 */
export const Valence = z.enum(['positive', 'neutral', 'negative']);
export type Valence = z.infer<typeof Valence>;

export const ResultsQuery = z.object({
  subjectId: Id.optional(),
  unitId: Id.optional(),
});
export type ResultsQuery = z.infer<typeof ResultsQuery>;

export const ResponsesQuery = PageQuery.extend({ questionId: Id.optional() });
export type ResponsesQuery = z.infer<typeof ResponsesQuery>;

export const ResultsDto = dto({ query: ResultsQuery, params: z.object({ id: Id }) });
export const ResponsesDto = dto({ query: ResponsesQuery, params: z.object({ id: Id }) });
export const ExportDto = dto({ params: z.object({ id: Id }) });

export type QuestionSummary = {
  questionId: string;
  kind: QuestionKind;
  text: string;
  answered: number;
  average?: number;
  distribution?: Array<{ label: string; count: number; percent: number; valence?: Valence }>;
  npsMix?: { promoters: number; passives: number; detractors: number; score: number };
};

/**
 * `suppressed: true` arrives with NO `questions` array at all — not an empty one, not one
 * full of zeroes. The k-anonymity gate is enforced by absence, in the response body, so a
 * client cannot render what it was never sent (52 §2).
 */
export type ResultsView = {
  responseCount: number;
  audienceEstimate: number | null;
  responseRate: number | null;
  newSince?: string;
  suppressed: boolean;
  /** What the UI explains to the reader instead of showing an error (40). */
  threshold: number;
  questions?: QuestionSummary[];
};

export type ResponseItem = {
  id: string;
  submittedAt: string;
  subjectName: string | null;
  answers: Array<{ questionId: string; questionText: string; text: string }>;
};
