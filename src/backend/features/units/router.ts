// Unit routes. 13 § Structure, 32.
import { Router } from 'express';
import {
  CreateUnitDto,
  DeleteUnitDto,
  ReparentUnitDto,
  UnitIdDto,
  UpdateUnitDto,
} from '@endur/shared';
import type {
  CreateUnitBody,
  DeleteUnitBody,
  ReparentBody,
  UpdateUnitBody,
} from '@endur/shared';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { authenticate } from '../../middleware/authenticate.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import {
  createUnit,
  deleteUnit,
  readTree,
  reparentUnit,
  unitImpact,
  updateUnit,
} from './service.js';

export const unitsRouter: Router = Router();

/** Every handler here needs the signed-in user's id; a key or a respondent never reaches it. */
const userOf = (req: Parameters<Parameters<Router['get']>[1]>[0]) => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user') throw new UnauthenticatedError();
  return principal.id;
};

unitsRouter.get(
  '/',
  authenticate,
  // A list asks "do you hold this anywhere", not "may you act on the organisation". The
  // scope filtering inside readTree() is the authorisation (INV-003).
  requireCapability('unit.read', { target: 'any' }),
  (req, res, next) => {
    void Promise.resolve()
      .then(() => readTree(req.ctx.orgId as string, userOf(req), req.ctx.authzVersion ?? 0))
      .then((tree) => res.json({ data: tree }))
      .catch(next);
  },
);

unitsRouter.post(
  '/',
  authenticate,
  validate(CreateUnitDto),
  // The target is the PARENT: creating a unit is an act on the unit it goes inside, and
  // that is the unit the caller's scope has to cover.
  requireCapability('unit.create', { target: 'unit', from: 'body.parentId' }),
  (req, res, next) => {
    const { body } = req.data as { body: CreateUnitBody };
    void Promise.resolve()
      .then(() => createUnit(req, req.ctx.orgId as string, userOf(req), body))
      .then((units) => res.status(201).json({ data: units }))
      .catch(next);
  },
);

unitsRouter.patch(
  '/:id',
  authenticate,
  validate(UpdateUnitDto),
  requireCapability('unit.update', { target: 'unit', from: 'params.id' }),
  (req, res, next) => {
    const { body, params } = req.data as { body: UpdateUnitBody; params: { id: string } };
    void updateUnit(req, req.ctx.orgId as string, params.id, body)
      .then((unit) => res.json({ data: unit }))
      .catch(next);
  },
);

// A separate capability from update, deliberately: renaming a department is cosmetic,
// moving it changes the scope of everyone inside it (32).
unitsRouter.post(
  '/:id/reparent',
  authenticate,
  validate(ReparentUnitDto),
  requireCapability('unit.reparent', { target: 'unit', from: 'params.id' }),
  (req, res, next) => {
    const { body, params } = req.data as { body: ReparentBody; params: { id: string } };
    void reparentUnit(req, req.ctx.orgId as string, params.id, body)
      .then((result) => res.json({ data: result }))
      .catch(next);
  },
);

unitsRouter.delete(
  '/:id',
  authenticate,
  validate(DeleteUnitDto),
  requireCapability('unit.delete', { target: 'unit', from: 'params.id' }),
  (req, res, next) => {
    const { body, params } = req.data as { body: DeleteUnitBody; params: { id: string } };
    void deleteUnit(req, req.ctx.orgId as string, params.id, body)
      .then((result) => res.json({ data: result }))
      .catch(next);
  },
);

// Read-only, and the delete dialog is not actionable until it has answered. A confirmation
// that asks "are you sure?" without saying what changes is one nobody reads (32).
unitsRouter.get(
  '/:id/impact',
  authenticate,
  validate(UnitIdDto),
  requireCapability('unit.read', { target: 'unit', from: 'params.id' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    const newParentId = typeof req.query.newParentId === 'string' ? req.query.newParentId : undefined;
    void unitImpact(req.ctx.orgId as string, params.id, newParentId)
      .then((impact) => res.json({ data: impact }))
      .catch(next);
  },
);
