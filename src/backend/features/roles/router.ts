// Role, grant and simulator routes.
// They share one file because they are one screen and one idea: the powers grid.
import { Router } from 'express';
import { tenantChain } from '../../middleware/chains.js';
import {
  CreateRoleDto,
  DeleteRoleDto,
  PutGrantsDto,
  ReorderRolesDto,
  SimulateDto,
  UpdateRoleDto,
} from '@endur/shared';
import type {
  CreateRoleBody,
  DeleteRoleBody,
  PutGrantsBody,
  ReorderRolesBody,
  SimulateBody,
  UpdateRoleBody,
} from '@endur/shared';
import { validate } from '../../middleware/validate.js';
import { nounsOf } from '../../lib/vocabulary.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { requireEntitlement } from '../../middleware/requireEntitlement.js';
import { requireNoGrantEscalation } from '../../middleware/requireNoGrantEscalation.js';
import { authenticate } from '../../middleware/authenticate.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import {
  capabilityCatalogue,
  createRole,
  deleteRole,
  grantWarnings,
  listRoles,
  readMatrix,
  reorderRoles,
  runSimulation,
  updateRole,
  writeMatrix,
} from './service.js';

export const rolesRouter: Router = Router();
export const grantsRouter: Router = Router();
export const authzRouter: Router = Router();

// Links 6 to 8 for every route below: resolve the org, attach the principal, check CSRF.
rolesRouter.use(tenantChain);
grantsRouter.use(tenantChain);
authzRouter.use(tenantChain);

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

// Roles.

// Every role, with how many people hold each.
rolesRouter.get('/', authenticate, requireCapability('role.read', { target: 'any' }), (req, res, next) => {
  void listRoles(req.ctx.orgId as string)
    .then((roles) => res.json({ data: roles }))
    .catch(next);
});

// Creates a role.
rolesRouter.post(
  '/',
  authenticate,
  validate(CreateRoleDto),
  requireCapability('role.create'),
  (req, res, next) => {
    const { body } = req.data as { body: CreateRoleBody };
    void createRole(req, req.ctx.orgId as string, body)
      .then((role) => res.status(201).json({ data: role }))
      .catch(next);
  },
);

// Registered BEFORE /:id, or Express would read "reorder" as a role id.
rolesRouter.post(
  '/reorder',
  authenticate,
  validate(ReorderRolesDto),
  requireCapability('role.update'),
  (req, res, next) => {
    const { body } = req.data as { body: ReorderRolesBody };
    void reorderRoles(req, req.ctx.orgId as string, body)
      .then((roles) => res.json({ data: roles }))
      .catch(next);
  },
);

// Renames a role.
rolesRouter.patch(
  '/:id',
  authenticate,
  validate(UpdateRoleDto),
  requireCapability('role.update'),
  (req, res, next) => {
    const { body, params } = req.data as { body: UpdateRoleBody; params: { id: string } };
    void updateRole(req, req.ctx.orgId as string, params.id, body)
      .then((role) => res.json({ data: role }))
      .catch(next);
  },
);

// Deletes a role, reassigning its holders if the body says where to.
rolesRouter.delete(
  '/:id',
  authenticate,
  validate(DeleteRoleDto),
  requireCapability('role.delete'),
  (req, res, next) => {
    const { body, params } = req.data as { body: DeleteRoleBody; params: { id: string } };
    void deleteRole(req, req.ctx.orgId as string, params.id, body)
      .then((result) => res.json({ data: result }))
      .catch(next);
  },
);

// Grants - the powers grid itself.

// The powers grid as it stands.
grantsRouter.get('/', authenticate, requireCapability('grant.read'), (req, res, next) => {
  void readMatrix(req.ctx.orgId as string)
    .then((cells) => res.json({ data: cells }))
    .catch(next);
});

// The grid's warnings, kept beside the save button they appear next to.
grantsRouter.get('/warnings', authenticate, requireCapability('grant.read'), (req, res, next) => {
  // The tenant's own nouns, because a warning is a sentence an administrator reads.
  void grantWarnings(req.ctx.orgId as string, nounsOf(req))
    .then((warnings) => res.json({ data: warnings }))
    .catch(next);
});

// Saves the grid.
grantsRouter.put(
  '/',
  authenticate,
  validate(PutGrantsDto),
  requireCapability('grant.update'),
  // Link 10b. grant.update says you may edit the grid; it does not say you may write in a power
  // you do not hold yourself. It runs after the capability check and can only refuse.
  requireNoGrantEscalation(),
  // The plan check asks a different question from the permission check. grant.update is in every tier,
  // so this always passes - it is here to keep the two checks visibly separate.
  requireEntitlement('grant.update'),
  (req, res, next) => {
    const { body } = req.data as { body: PutGrantsBody };
    void writeMatrix(req, req.ctx.orgId as string, userOf(req), body)
      .then((cells) => res.json({ data: cells }))
      .catch(next);
  },
);

// The capability catalogue and the simulator.

// The catalogue the grid builds its rows from, guarded by org.read, which every role holds.
authzRouter.get('/capabilities', authenticate, requireCapability('org.read'), (req, res) => {
  res.json({ data: capabilityCatalogue(nounsOf(req)) });
});

// The permission simulator. Guarded, because its answer describes the organisation's permission structure.
authzRouter.post(
  '/simulate',
  authenticate,
  validate(SimulateDto),
  requireCapability('simulator.run'),
  (req, res, next) => {
    const { body } = req.data as { body: SimulateBody };
    // The tenant's nouns again, because the errors this can raise are sentences an administrator reads.
    void runSimulation(req.ctx.orgId as string, req.ctx.authzVersion ?? 0, body, nounsOf(req))
      .then((decision) => res.json({ data: decision }))
      .catch(next);
  },
);
