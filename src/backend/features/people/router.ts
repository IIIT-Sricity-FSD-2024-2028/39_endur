// People and assignment routes. 13 § People, 34.
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

// Links 6-8, router-level (12 §2). tenantResolver → authenticate → csrfProtection,
// applied to every route below without any of them having to ask.
peopleRouter.use(tenantChain);

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

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

// Registered before /:id, or "import" and "import/preview" are read as person ids.
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

peopleRouter.post(
  '/import',
  authenticate,
  validate(ImportPeopleDto),
  requireCapability('person.import', { target: 'any' }),
  // A retried import must not duplicate people (13 §7). The service is idempotent by email
  // as well; this layer means the retry does not even re-run.
  idempotent('people.import'),
  (req, res, next) => {
    const { body } = req.data as { body: ImportPeopleBody };
    void commitImport(req, req.ctx.orgId as string, body)
      .then((result) => res.json({ data: result }))
      .catch(next);
  },
);

peopleRouter.get(
  '/:id',
  authenticate,
  validate(PersonIdDto),
  // `any` plus a row-level check inside readPerson(). A person is not anchored to a unit
  // in the request — their positions are — so the scope question can only be answered
  // after the row is read, and answering it there keeps INV-003 mechanical.
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

peopleRouter.post(
  '/',
  authenticate,
  validate(CreatePersonDto),
  // Creating a person grants nobody anything: a person with no position has no access at
  // all. The permission weight is in the assignment call, which IS unit-targeted.
  requireCapability('person.create', { target: 'any' }),
  (req, res, next) => {
    const { body } = req.data as { body: CreatePersonBody };
    void createPerson(req, req.ctx.orgId as string, body)
      .then((person) => res.status(201).json({ data: person }))
      .catch(next);
  },
);

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

// Its own endpoint, its own capability, its own audit row. Granting somebody a position IS
// a permission change, and it has to look like one in the log (34, 14 §8).
peopleRouter.post(
  '/:id/assignments',
  authenticate,
  validate(CreateAssignmentDto),
  // The target is the UNIT the position sits in: giving someone a role at Section A is an
  // act on Section A, and that is what the caller's scope has to cover (INV-005).
  requireCapability('assignment.create', { target: 'unit', from: 'body.unitId' }),
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

/**
 * Somebody else's avatar (48). The same write as `/profile/avatar`, asked as a different
 * question: `target: 'person'` builds the target from the id in the path, so a caller whose
 * `person.update` is scoped to their own unit cannot reach somebody in another one — where
 * the profile route's `target: 'self'` has no id for anyone to point anywhere.
 *
 * `imageUpload` sits in link 9's slot, before requireCapability, exactly as validate does.
 */
const uploadAvatar = imageUpload({ field: 'file', maxBytes: config.UPLOAD_MAX_MB * 1024 * 1024 });

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
