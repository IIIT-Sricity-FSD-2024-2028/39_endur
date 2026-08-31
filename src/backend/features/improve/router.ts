// The improve loop: reflect, see the gap, write a plan, and check in on it.
// Every route is Gold-only, and the capability check always runs before the plan check,
// so nobody is invited to buy something they still could not open.
import { Router } from 'express';
import {
  CheckinCreateDto,
  CheckinPatchDto,
  CyclesDto,
  FinaliseDto,
  GapDto,
  PlanDto,
  ReflectDto,
} from '@endur/shared';
import type {
  CheckinBody,
  CheckinPatchBody,
  CreatePlanBody,
  SubmitReflectionBody,
} from '@endur/shared';
import { tenantChain } from '../../middleware/chains.js';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { requireEntitlement } from '../../middleware/requireEntitlement.js';
import { authenticate } from '../../middleware/authenticate.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import {
  createCheckin,
  createPlan,
  finalisePlan,
  patchCheckin,
  readCycles,
  readForm,
  readGap,
  submitReflection,
} from './service.js';

export const reflectRouter: Router = Router();
export const checkinsRouter: Router = Router();

reflectRouter.use(tenantChain);
checkinsRouter.use(tenantChain);

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};
const version = (req: { ctx: { authzVersion?: number } }) => req.ctx.authzVersion ?? 0;
const org = (req: { ctx: { orgId?: string } }) => req.ctx.orgId as string;

const send = <T>(res: { json: (b: unknown) => unknown }, next: (e?: unknown) => void, work: () => Promise<T>) => {
  void Promise.resolve().then(work).then((data) => res.json({ data })).catch(next);
};

// The cycles this person is a reviewee in, and where each one stands.
reflectRouter.get(
  '/',
  authenticate,
  validate(CyclesDto),
  requireCapability('reflection.read', { target: 'any' }),
  requireEntitlement('reflection.read'),
  (req, res, next) => send(res, next, () => readCycles(org(req), userOf(req))),
);

// The self-assessment form for one cycle: the campaign's own questions.
reflectRouter.get(
  '/:campaignId',
  authenticate,
  validate(GapDto),
  requireCapability('reflection.read', { target: 'any' }),
  requireEntitlement('reflection.read'),
  (req, res, next) => {
    const { params } = req.data as { params: { campaignId: string } };
    send(res, next, () => readForm(org(req), userOf(req), params.campaignId));
  },
);

// Records the person's own assessment. Once only.
reflectRouter.post(
  '/:campaignId',
  authenticate,
  validate(ReflectDto),
  requireCapability('reflection.create', { target: 'any' }),
  requireEntitlement('reflection.create'),
  (req, res, next) => {
    const { params, body } = req.data as {
      params: { campaignId: string }; body: SubmitReflectionBody;
    };
    send(res, next, () => submitReflection(org(req), userOf(req), params.campaignId, body));
  },
);

// The gap route 404s until the reflection exists. There is deliberately no route that returns the
// received scores on their own, and that absence IS the enforcement.
reflectRouter.get(
  '/:campaignId/gap',
  authenticate,
  validate(GapDto),
  requireCapability('reflection.read', { target: 'any' }),
  requireEntitlement('reflection.read'),
  (req, res, next) => {
    const { params } = req.data as { params: { campaignId: string } };
    send(res, next, () => readGap(org(req), userOf(req), params.campaignId));
  },
);

// Writes or updates the action plan for a cycle.
reflectRouter.post(
  '/:campaignId/plan',
  authenticate,
  validate(PlanDto),
  requireCapability('actionplan.create', { target: 'any' }),
  requireEntitlement('actionplan.create'),
  (req, res, next) => {
    const { params, body } = req.data as {
      params: { campaignId: string }; body: CreatePlanBody;
    };
    send(res, next, () => createPlan(org(req), userOf(req), params.campaignId, body));
  },
);

// Marks a plan as final.
reflectRouter.post(
  '/plans/:id/finalise',
  authenticate,
  validate(FinaliseDto),
  requireCapability('actionplan.create', { target: 'any' }),
  requireEntitlement('actionplan.create'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    send(res, next, () => finalisePlan(org(req), userOf(req), params.id));
  },
);

// A supervisor records a check-in against somebody's plan.
checkinsRouter.post(
  '/',
  authenticate,
  validate(CheckinCreateDto),
  requireCapability('checkin.create', { target: 'any' }),
  requireEntitlement('checkin.create'),
  (req, res, next) => {
    const { body } = req.data as { body: CheckinBody };
    send(res, next, () => createCheckin(org(req), userOf(req), version(req), body));
  },
);

// Edits or finalises a check-in.
checkinsRouter.patch(
  '/:id',
  authenticate,
  validate(CheckinPatchDto),
  requireCapability('checkin.create', { target: 'any' }),
  requireEntitlement('checkin.create'),
  (req, res, next) => {
    const { params, body } = req.data as {
      params: { id: string }; body: CheckinPatchBody;
    };
    send(res, next, () => patchCheckin(org(req), userOf(req), version(req), params.id, body));
  },
);
