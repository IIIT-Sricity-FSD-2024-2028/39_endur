// Subject routes: the things feedback is collected about.
import { Router } from 'express';
import { tenantChain } from '../../middleware/chains.js';
import {
  CreateSubjectDto,
  SubjectIdDto,
  SubjectListDto,
  UpdateSubjectDto,
} from '@endur/shared';
import type { CreateSubjectBody, SubjectListQuery, UpdateSubjectBody } from '@endur/shared';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { authenticate } from '../../middleware/authenticate.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import {
  archiveSubject,
  createSubject,
  listSubjects,
  readSubject,
  updateSubject,
} from './service.js';

export const subjectsRouter: Router = Router();

// Links 6 to 8 for every route below: resolve the org, attach the principal, check CSRF.
subjectsRouter.use(tenantChain);

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

// The subject list, filtered to the units the caller may see.
subjectsRouter.get(
  '/',
  authenticate,
  validate(SubjectListDto),
  requireCapability('subject.read', { target: 'any' }),
  (req, res, next) => {
    const { query } = req.data as { query: SubjectListQuery };
    void Promise.resolve()
      .then(() =>
        listSubjects(req.ctx.orgId as string, userOf(req), req.ctx.authzVersion ?? 0, query),
      )
      .then((page) => res.json(page))
      .catch(next);
  },
);

// One subject, with its history of feedback cycles.
subjectsRouter.get(
  '/:id',
  authenticate,
  validate(SubjectIdDto),
  requireCapability('subject.read', { target: 'any' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void Promise.resolve()
      .then(() =>
        readSubject(req.ctx.orgId as string, userOf(req), req.ctx.authzVersion ?? 0, params.id),
      )
      .then((subject) => res.json({ data: subject }))
      .catch(next);
  },
);

// Creates a subject inside a unit.
subjectsRouter.post(
  '/',
  authenticate,
  validate(CreateSubjectDto),
  // A subject IS anchored to a unit, so the guard can name the target directly, unlike a person.
  requireCapability('subject.create', { target: 'unit', from: 'body.unitId' }),
  (req, res, next) => {
    const { body } = req.data as { body: CreateSubjectBody };
    void createSubject(req, req.ctx.orgId as string, body)
      .then((subject) => res.status(201).json({ data: subject }))
      .catch(next);
  },
);

// Renames a subject, or moves it to another unit.
subjectsRouter.patch(
  '/:id',
  authenticate,
  validate(UpdateSubjectDto),
  requireCapability('subject.update', { target: 'any' }),
  (req, res, next) => {
    const { body, params } = req.data as { body: UpdateSubjectBody; params: { id: string } };
    void Promise.resolve()
      .then(() =>
        updateSubject(
          req,
          req.ctx.orgId as string,
          userOf(req),
          req.ctx.authzVersion ?? 0,
          params.id,
          body,
        ),
      )
      .then((subject) => res.json({ data: subject }))
      .catch(next);
  },
);

// Archive, never delete: a subject with responses must survive for the history to mean anything.
subjectsRouter.post(
  '/:id/archive',
  authenticate,
  validate(SubjectIdDto),
  requireCapability('subject.archive', { target: 'any' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void Promise.resolve()
      .then(() =>
        archiveSubject(
          req,
          req.ctx.orgId as string,
          userOf(req),
          req.ctx.authzVersion ?? 0,
          params.id,
        ),
      )
      .then((subject) => res.json({ data: subject }))
      .catch(next);
  },
);
