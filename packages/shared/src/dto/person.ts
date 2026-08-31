// Person DTOs. 13 § People, 34, 14 §8.
import { z } from 'zod';
import type { AccountStatus } from './account.js';
import { Id, PageQuery, SearchQuery, dto, nameField } from './common.js';

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
  name: nameField(120),
  email: z.string().email().max(200),
});
export type CreatePersonBody = z.infer<typeof CreatePersonBody>;

/**
 * NO `status`, AND ITS REMOVAL CLOSED A REAL HOLE (D-024, 57 § Revocation).
 *
 * This DTO accepted `status: 'disabled'` from T-033 until 2026-08-24, behind `person.update`
 * alone. That was a second way to disable an account, and it was the WORSE one in three
 * separate respects:
 *
 *   · it needed `person.update` (seeded to L2 subtree), not `account.revoke` (L1) — the
 *     split 57 makes precisely so revocation can be withheld from a coordinator;
 *   · it left `sessions` rows alone, and `authenticate` never reads `users.status`, so the
 *     target's open browser kept working until the session expired on its own. The
 *     administrator saw "disabled" and believed access had ended;
 *   · it left `password_hash` in place, so flipping the status back restored their OLD
 *     password — the thing 57 says cannot exist, because there is no old password to
 *     restore once an account is properly revoked.
 *
 * An account's lifecycle belongs to `account.*` and to `DELETE /people/:id/account`, which
 * does all four things at once. A person's NAME and EMAIL are still edited here: those are
 * facts about the person, not about the key.
 */
export const UpdatePersonBody = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(200).optional(),
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
  name: nameField(120),
  email: z.string().email().max(200),
  roleName: z.string().max(60).optional(),
  unitName: z.string().max(80).optional(),
  /**
   * A SECOND place the same person sits, imported as a non-primary position (N-071).
   *
   * The model has always allowed one person in two branches of the tree — it is what makes
   * a student who lives in a hostel reachable by both the department's and the warden's
   * audiences — and nothing led anybody there: the importer had one unit column, so the
   * natural first pass at a college produced hostel and mess audiences of one person, the
   * warden. Written by hand afterwards, the same three students took the hostel
   * announcement from 1 recipient to 4.
   *
   * The role is the row's role. A second unit with a DIFFERENT role is a real thing and it
   * is not this: it is two rows, or the assignments screen, and inventing a second role
   * column would make the commonest case pay for the rarest.
   */
  alsoUnitName: z.string().max(80).optional(),
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

/**
 * A position is a role AT a unit, and this is the only shape it is ever returned in — the
 * list, the detail page and `ProfileView` all read it, so there is one answer to "what does
 * the client know about a position".
 *
 * `unitId`, `roleLevel` and `validTo` were added by `T-051`, each for a named reader:
 *
 * · `unitId` because `powersByPlace` used to re-find the unit BY NAME (`readPerson`, before
 *   T-051) and nothing stops two units sharing one. Two positions at two same-named units
 *   collapsed onto whichever row the lookup happened to return first — INV-005 broken by a
 *   query, on the one screen built to demonstrate INV-005. It is also what makes a position
 *   chip a link to the unit it names.
 * · `roleLevel` because `47` § Interactions renders a position "with the level", and `24`'s
 *   `<PersonChip>` says the level is always visible. It is ORDERING ONLY (DEC-002) and
 *   nothing anywhere compares two of them to decide anything.
 * · `validTo` because an expiring position is the difference between "they have this" and
 *   "they have this until March", and `47` asks for the expiry date by name. `null` is open
 *   ended, exactly as the column is.
 *
 * `unitId` is nullable because the schema's is: a position node's `unit_id` is optional even
 * though `addAssignment` always sets it. Better a null the client handles than an empty
 * string it might put in a URL.
 */
export type Position = {
  edgeId: string;
  /**
   * ADDED BY T-052, for one named reader — the powers grid's self-lockout prompt.
   *
   * `33` requires that removing `grant.update` from your OWN role warn you before saving,
   * and the grid has role IDs while the caller's positions had only role NAMES. Matching
   * them by name is `N-057` exactly: `nodes` has no unique on `(org_id, kind, name)`, so a
   * name lookup is a lookup by something the database does not enforce is unique — and
   * getting it wrong here means either a warning that never fires or one that fires on the
   * wrong role, before the one save in the product that has no undo.
   */
  roleId: string | null;
  roleName: string;
  roleLevel: number | null;
  unitId: string | null;
  unitName: string;
  isPrimary: boolean;
  /** `null` = open ended. Access expires without anyone having to remember to revoke it. */
  validTo: string | null;
};

/**
 * NO `status`, AND THAT IS THE FIX FOR A BUG PEOPLE REPORTED FROM THE SCREEN.
 *
 * It used to carry `users.status` raw, and the list printed it beside the name whenever it
 * was not `active`. `POST /people` writes `invited` — the state that says the hash is null
 * and this account cannot open the door (`10` §2) — so EVERY person added on `/app/people`
 * appeared already tagged "invited" while the Account column in the same row still offered
 * the `Invite` button. One row, two answers, and the wrong one first.
 *
 * The column is a database state about a password hash. It was being read as a sentence
 * about an email, and it cannot be one: a person awaiting activation and a person nobody
 * has asked are BOTH `users.status = 'invited'` with a null hash, and only an unaccepted
 * `account_invites` row tells them apart. `account` below is that question answered
 * properly, server-side, in one place — so a second field that answers it approximately is
 * not a convenience, it is a contradiction waiting to be rendered.
 */
export type PersonSummary = {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  positions: Position[];
  createdAt: string;
  /**
   * ON THE SUMMARY, not only the detail, and that placement is forced by `57` § States:
   * the LIST shows `Invite` on anybody with no account and `Pending` on anybody with a
   * live one. `status` alone cannot tell those two apart — a person awaiting activation and
   * a person nobody has invited are both `users.status = 'invited'` with a null password
   * hash. The difference is whether an unaccepted `account_invites` row exists, so the
   * server answers it rather than leaving the row to guess.
   */
  account: AccountStatus;
};

/**
 * Effective powers, produced by the SHARED resolver — never a second implementation
 * (N-005). Grouped BY PLACE, because that is what proves INV-005 to somebody looking at
 * the screen: the same person, two units, different powers.
 *
 * NAMED, and not inlined into `PersonDetail`, since `T-051`: `ProfileView` returns the very
 * same thing about the caller themselves, and `<PowersByPlace>` renders both. Two shapes
 * would mean two renderers, which is the second implementation N-005 forbids arriving one
 * layer higher up than the doc was watching.
 *
 * The SCOPE travels with each capability and is not decoration: "you hold `results.read`
 * here" and "you hold it over everything below here" are different answers, and `47`'s whole
 * reason for existing is a person answering "why can I not see that?" for themselves.
 */
export type PowersAtPlace = {
  unitId: string;
  unitName: string;
  roleName: string;
  capabilities: Array<{ capability: string; scope: string }>;
};

export type PersonDetail = PersonSummary & {
  powersByPlace: PowersAtPlace[];
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
