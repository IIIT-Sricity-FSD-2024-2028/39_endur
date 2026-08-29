// Role, grant and capability routes. 13 § Roles and powers, 33.
//
// Roles and grants are mounted separately (`/roles`, `/grants`, `/authz`) but share one
// router file, because they are one screen and one mental model: the powers grid.
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

// Links 6-8, router-level (12 §2). tenantResolver → authenticate → csrfProtection,
// applied to every route below without any of them having to ask.
rolesRouter.use(tenantChain);
grantsRouter.use(tenantChain);
authzRouter.use(tenantChain);

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

/* ------------------------------------------------------------------ roles */

rolesRouter.get('/', authenticate, requireCapability('role.read', { target: 'any' }), (req, res, next) => {
  void listRoles(req.ctx.orgId as string)
    .then((roles) => res.json({ data: roles }))
    .catch(next);
});

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

// Reorder is registered BEFORE /:id so that "reorder" is never read as a role id. Express
// matches in registration order, and this is the classic way to lose an hour.
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

/* ----------------------------------------------------------------- grants */

grantsRouter.get('/', authenticate, requireCapability('grant.read'), (req, res, next) => {
  void readMatrix(req.ctx.orgId as string)
    .then((cells) => res.json({ data: cells }))
    .catch(next);
});

// Registered before nothing in particular, but kept above the bulk PUT so the two are read
// together: the warnings are what the grid shows next to the save button.
grantsRouter.get('/warnings', authenticate, requireCapability('grant.read'), (req, res, next) => {
  // The tenant's nouns, because a warning is a SENTENCE shown to an administrator — the
  // same INV-001 rule as the grid's row labels, and the same one implementation (D-008).
  void grantWarnings(req.ctx.orgId as string, nounsOf(req))
    .then((warnings) => res.json({ data: warnings }))
    .catch(next);
});

grantsRouter.put(
  '/',
  authenticate,
  validate(PutGrantsDto),
  requireCapability('grant.update'),
  // Link 10b — INV-012 on the grid, T-052. `grant.update` says you may EDIT the matrix; it
  // does not say you may write a row more powerful than yourself into it. Until this line
  // the route asked only the first question, which is `D-018`'s shape one screen along.
  // AFTER requireCapability and never instead of it: it can only ever refuse.
  requireNoGrantEscalation(),
  // Entitlements answer a different question from capabilities: "has this org paid for
  // it", not "may this person" (DEC-011). grant.update is Bronze — correct handling of
  // who-can-see-what is never an upgrade (01 §6) — so this passes for every tier, and it
  // is here to keep the two checks visibly separate.
  requireEntitlement('grant.update'),
  (req, res, next) => {
    const { body } = req.data as { body: PutGrantsBody };
    void writeMatrix(req, req.ctx.orgId as string, userOf(req), body)
      .then((cells) => res.json({ data: cells }))
      .catch(next);
  },
);

/* ------------------------------------------------------------------ authz */

// The catalogue the grid renders its rows from. Guarded by org.read rather than left open
// (DEC-018): org.read is seeded to every role, so everyone who can sign in can read it,
// and the route-enumeration allowlist stays as small as it was built to be.
authzRouter.get('/capabilities', authenticate, requireCapability('org.read'), (req, res) => {
  res.json({ data: capabilityCatalogue(nounsOf(req)) });
});

// 42 — the simulator. Guarded by simulator.run rather than left open: it reveals the org's
// permission structure (`considered` included), so it is not a default-for-everyone read.
authzRouter.post(
  '/simulate',
  authenticate,
  validate(SimulateDto),
  requireCapability('simulator.run'),
  (req, res, next) => {
    const { body } = req.data as { body: SimulateBody };
    // The tenant's nouns, because the 404s this can raise are sentences an administrator
    // reads — the same INV-001 rule as the warnings above (`D-008`).
    void runSimulation(req.ctx.orgId as string, req.ctx.authzVersion ?? 0, body, nounsOf(req))
      .then((decision) => res.json({ data: decision }))
      .catch(next);
  },
);
