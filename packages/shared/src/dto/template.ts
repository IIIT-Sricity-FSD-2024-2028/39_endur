// Template and question DTOs. 14 §4, 36, 37.
//
// The six kinds are FROZEN (DEC-010). A poll is a one-question template; there is no poll
// entity and there never will be. Adding a seventh kind means touching both unions below
// plus six editors and six inputs — which is exactly the friction DEC-010 intends.
import { z } from 'zod';
import { Id, PageQuery, SearchQuery, dto, nameField, textField } from './common.js';

export const QuestionKind = z.enum(['rating', 'single', 'multi', 'text', 'yesno', 'nps']);
export type QuestionKind = z.infer<typeof QuestionKind>;

/**
 * A discriminated union, not a bag. This is what stops `questions.config` — a JSONB column
 * — from becoming untyped, and it makes a config that does not match its kind a compile
 * error rather than a runtime surprise.
 */
export const QuestionConfig = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('rating'),
    max: z.union([z.literal(5), z.literal(10)]),
    lowLabel: z.string().max(40),
    highLabel: z.string().max(40),
  }),
  z.object({
    kind: z.literal('single'),
    options: z.array(textField(120).min(1)).min(2).max(10),
    allowOther: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal('multi'),
    options: z.array(textField(120).min(1)).min(2).max(10),
    maxSelections: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal('text'),
    multiline: z.boolean().default(false),
    placeholder: z.string().max(80).optional(),
  }),
  z.object({ kind: z.literal('yesno') }),
  // Fixed 0-10 with fixed anchors. NPS is a defined instrument; a configurable one is a
  // rating scale wearing its name.
  z.object({ kind: z.literal('nps') }),
]);
export type QuestionConfig = z.infer<typeof QuestionConfig>;

/**
 * `position` is absent on purpose. It is derived from array order on save (37) — a
 * client-supplied position and a client-supplied order can disagree, and then one of them
 * is silently wrong.
 */
export const QuestionInput = z.object({
  id: Id.optional(),
  kind: QuestionKind,
  text: nameField(300),
  config: QuestionConfig,
  required: z.boolean().default(false),
});
export type QuestionInput = z.infer<typeof QuestionInput>;

export const CreateTemplateBody = z.object({
  name: nameField(120),
  category: nameField(60),
  description: z.string().max(400).optional(),
});
export type CreateTemplateBody = z.infer<typeof CreateTemplateBody>;

export const UpdateTemplateBody = z.object({
  name: z.string().min(1).max(120).optional(),
  category: z.string().min(1).max(60).optional(),
  description: z.string().max(400).optional(),
});
export type UpdateTemplateBody = z.infer<typeof UpdateTemplateBody>;

/** Bulk, and the whole set. The builder autosaves a document, not a stream of edits (37). */
export const PutQuestionsBody = z.object({
  questions: z.array(QuestionInput).max(50),
});
export type PutQuestionsBody = z.infer<typeof PutQuestionsBody>;

export const CloneTemplateBody = z.object({
  name: z.string().min(1).max(120).optional(),
});

export const TemplateListQuery = PageQuery.merge(SearchQuery);
export const LibraryQuery = z.object({
  industry: z.string().max(40).optional(),
  category: z.string().max(60).optional(),
});

export const CreateTemplateDto = dto({ body: CreateTemplateBody });
export const UpdateTemplateDto = dto({ body: UpdateTemplateBody, params: z.object({ id: Id }) });
export const PutQuestionsDto = dto({ body: PutQuestionsBody, params: z.object({ id: Id }) });
export const CloneTemplateDto = dto({ body: CloneTemplateBody, params: z.object({ id: Id }) });
export const TemplateListDto = dto({ query: TemplateListQuery });
export const LibraryDto = dto({ query: LibraryQuery });
export const TemplateIdDto = dto({ params: z.object({ id: Id }) });

/** Response shapes. Documentation, not enforcement (14 §2). */
export type TemplateSummary = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  industry: string | null;
  /** Both DERIVED, never entered by hand — a template cannot claim to be shorter than it is. */
  questionCount: number;
  estimatedSeconds: number;
  /**
   * How many campaigns use this template. Derived too, and it does two jobs: the library
   * card says "Used in 2 campaigns" rather than "Never used" (design_specs/design/05
   * §5.1), and the delete dialog can state a real consequence BEFORE the button is pressed
   * instead of the reader discovering the 409 afterwards. Always 0 on a library template —
   * nothing campaigns against `orgId IS NULL`.
   */
  campaignCount: number;
  isLibrary: boolean;
  clonedFromId: string | null;
  createdAt: string;
};

export type TemplateDetail = TemplateSummary & {
  questions: Array<{
    id: string;
    kind: QuestionKind;
    text: string;
    config: QuestionConfig;
    required: boolean;
    position: number;
  }>;
  /** True once a launched campaign uses it: the builder goes read-only with a duplicate path (37). */
  readOnly: boolean;
};

/**
 * Completion time is derived from the kinds, in one place, so the library card and the
 * builder's live estimate cannot disagree. The numbers are deliberately coarse — this is
 * an honest order of magnitude, not a measurement.
 */
export const SECONDS_PER_KIND: Record<QuestionKind, number> = {
  rating: 4,
  single: 6,
  multi: 9,
  text: 25,
  yesno: 3,
  nps: 5,
};

export const estimateSeconds = (kinds: QuestionKind[]): number =>
  kinds.reduce((total, kind) => total + SECONDS_PER_KIND[kind], 0);
