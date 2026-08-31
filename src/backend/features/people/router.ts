// People and assignment routes.
import { Router } from 'express';
import { tenantChain } from '../../middleware/chains.js';
import { imageUpload } from '../../middleware/upload.js';
import { config } from '../../lib/config.js';
import { removeAvatar, setAvatar } from '../files/avatar.js';
import {
  CreateAssignmentDto,
  CreatePersonDto,
  DeleteAssignmentDto,
  ImportPeopleDto,
  ImportPreviewDto,
  PersonIdDto,
  PersonListDto,
  UpdatePersonDto,
} from '@endur/shared';
import type {
  CreateAssignmentBody,
  CreatePersonBody,
  ImportPeopleBody,
  ImportPreviewBody,
  PersonListQuery,
  UpdatePersonBody,
} from '@endur/shared';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { requireNoEscalation } from '../../middleware/requireNoEscalation.js';
import { pairsFromImport } from './positions.js';
import { idempotent } from '../../middleware/idempotency.js';
import { authenticate } from '../../middleware/authenticate.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import {
  addAssignment,
  commitImport,
  createPerson,
  deletePerson,
  listPeople,
  previewImport,
  readPerson,
  removeAssignment,
  updatePerson,
} from './service.js';

export const peopleRouter: Router = Router();

// Links 6 to 8 for every route below: resolve the org, attach the principal, check CSRF.
peopleRouter.use(tenantChain);

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

// The people list, already filtered to what the caller may see.
peopleRouter.get(
  '/',
  authenticate,
  validate(PersonListDto),
  requireCapability('person.read', { target: 'any' }),
  (req, res, next) => {
    const { query } = req.data as { query: PersonListQuery };
    void Promise.resolve()
      .then(() =>
        listPeople(req.ctx.orgId as string, userOf(req), req.ctx.authzVersion ?? 0, query),
      )
      .then((page) => res.json(page))
      .catch(next);
  },
);

// Registered before /:id, or "import" would be read as a person id.
// Reads a CSV and reports what it found, without writing anything.
peopleRouter.post(
  '/import/preview',
  authenticate,
  validate(ImportPreviewDto),
  requireCapability('person.import', { target: 'any' }),
  (req, res, next) => {
    const { body } = req.data as { body: ImportPreviewBody };
    void previewImport(req.ctx.orgId as string, body.csv)
      .then((preview) => res.json({ data: preview }))
      .catch(next);
  },
);

// Commits an import: creates or updates people and gives them their positions.
peopleRouter.post(
  '/import',
  authenticate,
  validate(ImportPeopleDto),
  requireCapability('person.import', { target: 'any' }),
  // The import creates positions too, so it carries the same escalation bound - and this is the
  // bulk half of it: without this, a one-row CSV naming the Owner role would bypass the guard below.
  requireNoEscalation((req) =>
    pairsFromImport(req.ctx.orgId as string, (req.data as { body: ImportPeopleBody }).body),
  ),
  // A retried import must not create people twice. The service is idempotent by email as well.
  idempotent('people.import'),
  (req, res, next) => {
    const { body } = req.data as { body: ImportPeopleBody };
    void commitImport(req, req.ctx.orgId as string, body)
      .then((result) => res.json({ data: result }))
      .catch(next);
  },
);

// One person, with their positions and what those positions let them do.
peopleRouter.get(
  '/:id',
  authenticate,
  validate(PersonIdDto),
  // 'any' plus a row-level check inside readPerson(): a person is not anchored to a unit in the request,
  // their positions are, so the scope question can only be answered once the row has been read.
  requireCapability('person.read', { target: 'any' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void Promise.resolve()
      .then(() =>
        readPerson(req.ctx.orgId as string, params.id, userOf(req), req.ctx.authzVersion ?? 0),
      )
      .then((person) => res.json({ data: person }))
      .catch(next);
  },
);

// Creates a person, and an invited account when an email is given.
peopleRouter.post(
  '/',
  authenticate,
  validate(CreatePersonDto),
  // Creating a person grants nothing: someone with no position has no access. The weight is in the assignment call.
  requireCapability('person.create', { target: 'any' }),
  (req, res, next) => {
    const { body } = req.data as { body: CreatePersonBody };
    void createPerson(req, req.ctx.orgId as string, body)
      .then((person) => res.status(201).json({ data: person }))
      .catch(next);
  },
);

// Renames a person or changes their email.
peopleRouter.patch(
  '/:id',
  authenticate,
  validate(UpdatePersonDto),
  requireCapability('person.update', { target: 'any' }),
  (req, res, next) => {
    const { body, params } = req.data as { body: UpdatePersonBody; params: { id: string } };
    void updatePerson(req, req.ctx.orgId as string, params.id, userOf(req), req.ctx.authzVersion ?? 0, body)
      .then((person) => res.json({ data: person }))
      .catch(next);
  },
);

// Removes a person from the organisation.
peopleRouter.delete(
  '/:id',
  authenticate,
  validate(PersonIdDto),
  requireCapability('person.delete', { target: 'any' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void deletePerson(req, req.ctx.orgId as string, params.id, userOf(req), req.ctx.authzVersion ?? 0)
      .then((result) => res.json({ data: result }))
      .catch(next);
  },
);

// Its own route, capability and audit row, because giving somebody a position IS a permission change.
peopleRouter.post(
  '/:id/assignments',
  authenticate,
  validate(CreateAssignmentDto),
  // The target is the UNIT: giving someone a role at Section A is an act on Section A.
  requireCapability('assignment.create', { target: 'unit', from: 'body.unitId' }),
  // Link 10b: the check above asks "may you assign at Section A", this one asks "may you hand out THIS role".
  requireNoEscalation({ role: 'body.roleId', unit: 'body.unitId' }),
  (req, res, next) => {
    const { body, params } = req.data as {
      body: CreateAssignmentBody;
      params: { id: string };
    };
    void addAssignment(req, req.ctx.orgId as string, params.id, body)
      .then((person) => res.status(201).json({ data: person }))
      .catch(next);
  },
);

// Removes one assignment, which takes the powers that came with it.
peopleRouter.delete(
  '/:id/assignments/:edgeId',
  authenticate,
  validate(DeleteAssignmentDto),
  requireCapability('assignment.delete', { target: 'any' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string; edgeId: string } };
    void removeAssignment(req, req.ctx.orgId as string, params.id, params.edgeId, userOf(req), req.ctx.authzVersion ?? 0)
      .then((result) => res.json({ data: result }))
      .catch(next);
  },
);

// Somebody else's avatar. The same write as the profile route, asked as a different question:
// the target is built from the id in the path, so a caller scoped to one unit cannot reach another.
// imageUpload does this route's validation, so it runs before the permission check.
const uploadAvatar = imageUpload({ field: 'file', maxBytes: config.UPLOAD_MAX_MB * 1024 * 1024 });

// Uploads an avatar for somebody else.
peopleRouter.post(
  '/:id/avatar',
  authenticate,
  validate(PersonIdDto),
  uploadAvatar,
  requireCapability('person.update', { target: 'person', from: 'params.id' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void setAvatar(req, req.ctx.orgId as string, params.id, userOf(req))
      .then((file) => res.status(201).json({ data: file }))
      .catch(next);
  },
);

// Removes somebody else's avatar.
peopleRouter.delete(
  '/:id/avatar',
  authenticate,
  validate(PersonIdDto),
  requireCapability('person.update', { target: 'person', from: 'params.id' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void removeAvatar(req, req.ctx.orgId as string, params.id)
      .then(() => res.status(204).end())
      .catch(next);
  },
);
