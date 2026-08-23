// Person DTOs. 13 § People, 34, 14 §8.
import { z } from 'zod';
import { dto, Id, PageQuery, SearchQuery } from './common.js';

/**
 * **No create-person DTO accepts a role, a level or a capability** (`14` §8).
 *
 * Doc 34's data-contract table sketches `CreatePersonBody { name, email, positions[] }`,
 * and the paragraph directly beneath it says positions must be a separate, audited call.
 * The paragraph wins: granting somebody a position IS a permission change, and it has to
 * appear in the audit log as one rather than hiding inside a create. Bundling them would
 * also make "who gave them that?" unanswerable for the most common way people get access.
 */
export const CreatePersonBody = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
});
export type CreatePersonBody = z.infer<typeof CreatePersonBody>;

export const UpdatePersonBody = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(200).optional(),
  status: z.enum(['active', 'invited', 'disabled']).optional(),
});
export type UpdatePersonBody = z.infer<typeof UpdatePersonBody>;

/**
 * A position is a role AT a unit. The unit is the anchor, and the anchor is the whole of
 * INV-005: Director-of-Project-A gets nothing on Project B.
 */
export const CreateAssignmentBody = z.object({
  roleId: Id,
  unitId: Id,
  isPrimary: z.boolean().default(false),
  validFrom: z.coerce.date().optional(),
  /** An end date means access expires without anyone having to remember to revoke it. */
  validTo: z.coerce.date().optional(),
});
export type CreateAssignmentBody = z.infer<typeof CreateAssignmentBody>;

export const PersonListQuery = PageQuery.merge(SearchQuery).extend({
  unitId: Id.optional(),
  roleId: Id.optional(),
});
export type PersonListQuery = z.infer<typeof PersonListQuery>;

/** One CSV row, already mapped to fields by the client's column mapper. */
export const ImportRow = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  roleName: z.string().max(60).optional(),
  unitName: z.string().max(80).optional(),
});
export type ImportRow = z.infer<typeof ImportRow>;

export const ImportPeopleBody = z.object({
  rows: z.array(ImportRow).min(1).max(2000),
  /**
   * Names the CSV used that do not match a role in this organisation, resolved by the
   * operator in the preview step. Without this an import either invents roles — which
   * would be the user defining the vocabulary, and they never do (11 §3) — or silently
   * drops the people who had them.
   */
  roleMapping: z.record(z.string(), Id).default({}),
  unitMapping: z.record(z.string(), Id).default({}),
});
export type ImportPeopleBody = z.infer<typeof ImportPeopleBody>;

/**
 * ONE number for CSV size, and it is smaller than the JSON body limit on purpose — D-016.
 *
 * The import arrives as a STRING inside a JSON body, so two caps apply to it: this one, in
 * characters, and `express.json({ limit: '256kb' })`, in bytes. When the DTO's cap is the
 * larger of the two, the parser rejects the request before `validate()` ever runs and the
 * caller gets `PAYLOAD_TOO_LARGE` for a field problem — which is exactly what happened
 * between 256 kb and the old 1 MB.
 *
 * Setting it below the byte limit inverts that: anything a person plausibly pastes fails
 * with a readable field error naming the CSV, and the body parser is left as the outer
 * backstop for a body that is malicious rather than merely large.
 *
 * 150,000 characters is roughly 2,500 rows of `name,email,role,unit` — comfortably past
 * `ImportPeopleBody`'s 2,000-row commit limit, so the row cap is what a real import hits.
 */
export const CSV_MAX_CHARS = 150_000;

export const ImportPreviewBody = z.object({
  /** Raw CSV text. Parsed server-side so the preview and the commit read it identically. */
  csv: z
    .string()
    .min(1)
    .max(CSV_MAX_CHARS, 'That file is too large to import in one go. Split it and import in parts.'),
});
export type ImportPreviewBody = z.infer<typeof ImportPreviewBody>;

export const CreatePersonDto = dto({ body: CreatePersonBody });
export const UpdatePersonDto = dto({ body: UpdatePersonBody, params: z.object({ id: Id }) });
export const PersonIdDto = dto({ params: z.object({ id: Id }) });
export const PersonListDto = dto({ query: PersonListQuery });
export const CreateAssignmentDto = dto({
  body: CreateAssignmentBody,
  params: z.object({ id: Id }),
});
export const DeleteAssignmentDto = dto({ params: z.object({ id: Id, edgeId: Id }) });
export const ImportPeopleDto = dto({ body: ImportPeopleBody });
export const ImportPreviewDto = dto({ body: ImportPreviewBody });

/** Response shapes. */
export type PersonSummary = {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  status: string;
  positions: Array<{ edgeId: string; roleName: string; unitName: string; isPrimary: boolean }>;
  createdAt: string;
};

export type PersonDetail = PersonSummary & {
  /**
   * Effective powers, produced by the SHARED resolver — never a second implementation
   * (N-005). Grouped BY PLACE, because that is what proves INV-005 to somebody looking at
   * the screen: the same person, two units, different powers.
   */
  powersByPlace: Array<{
    unitId: string;
    unitName: string;
    roleName: string;
    capabilities: Array<{ capability: string; scope: string }>;
  }>;
};

export type ImportPreview = {
  columns: string[];
  sample: ImportRow[];
  rowCount: number;
  /** Role and unit names in the file that this organisation does not have. */
  unmatchedRoles: string[];
  unmatchedUnits: string[];
  /** Addresses already present. A re-run must update them, not duplicate them. */
  existingEmails: string[];
};
