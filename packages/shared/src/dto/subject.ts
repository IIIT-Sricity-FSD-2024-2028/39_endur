// Subject DTOs. 13 § Subjects, 35.
//
// The subject is the single biggest unlock in the model: a course, a restaurant, a ward, a
// bus route. `linkedUserId` turns "review the thing" into "review the person" with no
// second code path — which is why there is no separate reviewee entity anywhere.
import { z } from 'zod';
import { dto, Id, PageQuery, SearchQuery } from './common.js';

export const CreateSubjectBody = z.object({
  name: z.string().min(1).max(120),
  unitId: Id,
  type: z.string().max(40).default('general'),
  /** Set it and the subject IS a person, for review purposes. Nothing else changes. */
  linkedUserId: Id.optional(),
});
export type CreateSubjectBody = z.infer<typeof CreateSubjectBody>;

export const UpdateSubjectBody = z.object({
  name: z.string().min(1).max(120).optional(),
  unitId: Id.optional(),
  linkedUserId: Id.nullable().optional(),
});
export type UpdateSubjectBody = z.infer<typeof UpdateSubjectBody>;

export const SubjectListQuery = PageQuery.merge(SearchQuery).extend({
  unitId: Id.optional(),
  // Left as the literal query string rather than transformed to a boolean: `dto()`
  // composes one schema for body, query and params, and a transform makes a schema's input
  // and output types differ — which that composition cannot express. Interpreting it is one
  // line in the service and costs nothing.
  archived: z.enum(['true', 'false']).default('false'),
});
export type SubjectListQuery = z.infer<typeof SubjectListQuery>;

export const CreateSubjectDto = dto({ body: CreateSubjectBody });
export const UpdateSubjectDto = dto({ body: UpdateSubjectBody, params: z.object({ id: Id }) });
export const SubjectIdDto = dto({ params: z.object({ id: Id }) });
export const SubjectListDto = dto({ query: SubjectListQuery });

/**
 * The counts are computed SERVER-SIDE in the list query (35). Fetching them per row from
 * the client would turn an 18-row list into 19 requests, and on venue wifi each request is
 * another chance to fail.
 */
export type SubjectSummary = {
  id: string;
  name: string;
  type: string;
  unitId: string | null;
  unitName: string | null;
  linkedUserId: string | null;
  linkedUserName: string | null;
  activeCampaigns: number;
  totalResponses: number;
  lastResponseAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};
