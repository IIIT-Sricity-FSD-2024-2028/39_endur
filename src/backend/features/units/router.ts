// Unit routes: the organisation's structure tree - read it, add to it, rename, move and delete.
import { Router } from 'express';
import { tenantChain } from '../../middleware/chains.js';
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
  unitComposition,
  unitImpact,
  updateUnit,
} from './service.js';

export const unitsRouter: Router = Router();

// Links 6 to 8 for every route below: resolve the org, attach the principal, check CSRF.
unitsRouter.use(tenantChain);

// Every handler here needs the signed-in user's id, so an API key or a respondent never reaches one.
const userOf = (req: Parameters<Parameters<Router['get']>[1]>[0]) => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user') throw new UnauthenticatedError();
  return principal.id;
};

unitsRouter.get(
  '/',
  authenticate,
  // A list asks "do you hold this anywhere": the scope filtering inside readTree() IS the authorisation.
  requireCapability('unit.read', { target: 'any' }),
  (req, res, next) => {
    void Promise.resolve()
      .then(() => readTree(req.ctx.orgId as string, userOf(req), req.ctx.authzVersion ?? 0))
      // meta carries the totals for the whole forest, because summing the roots on the client would double-count
      // a person placed under two of them.
      .then(({ tree, totals }) => res.json({ data: tree, meta: totals }))
      .catch(next);
  },
);

unitsRouter.post(
  '/',
  authenticate,
  validate(CreateUnitDto),
  // The target is the PARENT: creating a unit is an act on the unit it goes inside.
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

// Moving is a separate capability from renaming: a rename is cosmetic, a move changes the scope of everyone inside.
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

// What the branch's people ARE, not just how many. Asked one unit at a time, because the panel shows one unit.
unitsRouter.get(
  '/:id/composition',
  authenticate,
  validate(UnitIdDto),
  requireCapability('unit.read', { target: 'unit', from: 'params.id' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void unitComposition(req.ctx.orgId as string, userOf(req), req.ctx.authzVersion ?? 0, params.id)
      .then((composition) => res.json({ data: composition }))
      .catch(next);
  },
);

// Read-only preview of what a delete or a move would change; the confirm dialog waits for it.
unitsRouter.get(
  '/:id/impact',
  authenticate,
  validate(UnitIdDto),
  requireCapability('unit.read', { target: 'unit', from: 'params.id' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    const newParentId = typeof req.query.newParentId === 'string' ? req.query.newParentId : undefined;
    void unitImpact(req, req.ctx.orgId as string, params.id, newParentId)
      .then((impact) => res.json({ data: impact }))
      .catch(next);
  },
);
