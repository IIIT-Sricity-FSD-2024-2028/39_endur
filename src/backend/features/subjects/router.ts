// Subject routes. 13 § Subjects, 35.
import { Router } from 'express';
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

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

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

subjectsRouter.post(
  '/',
  authenticate,
  validate(CreateSubjectDto),
  // A subject IS anchored to a unit, so unlike a person the guard can name the target
  // directly and the scope check happens before the handler runs.
  requireCapability('subject.create', { target: 'unit', from: 'body.unitId' }),
  (req, res, next) => {
    const { body } = req.data as { body: CreateSubjectBody };
    void createSubject(req, req.ctx.orgId as string, body)
      .then((subject) => res.status(201).json({ data: subject }))
      .catch(next);
  },
);

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

// Archive, never delete: a subject with responses attached has to survive for the history
// to mean anything (10 §9).
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
