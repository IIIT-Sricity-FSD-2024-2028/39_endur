// Campaign routes. 13 § Campaigns, 38.
import { Router } from 'express';
import { tenantChain } from '../../middleware/chains.js';
import {
  CampaignIdDto,
  CampaignListDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from '@endur/shared';
import type {
  CampaignListQuery,
  CreateCampaignBody,
  UpdateCampaignBody,
} from '@endur/shared';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { idempotent } from '../../middleware/idempotency.js';
import { authenticate } from '../../middleware/authenticate.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import {
  audiencePreview,
  closeCampaign,
  createCampaign,
  launchCampaign,
  listCampaigns,
  readCampaign,
  updateCampaign,
} from './service.js';

export const campaignsRouter: Router = Router();

// Links 6-8, router-level (12 §2). tenantResolver → authenticate → csrfProtection,
// applied to every route below without any of them having to ask.
campaignsRouter.use(tenantChain);

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

const version = (req: { ctx: { authzVersion?: number } }) => req.ctx.authzVersion ?? 0;

campaignsRouter.get(
  '/',
  authenticate,
  validate(CampaignListDto),
  requireCapability('campaign.read', { target: 'any' }),
  (req, res, next) => {
    const { query } = req.data as { query: CampaignListQuery };
    void Promise.resolve()
      .then(() => listCampaigns(req.ctx.orgId as string, userOf(req), version(req), query))
      .then((page) => res.json(page))
      .catch(next);
  },
);

campaignsRouter.get(
  '/:id',
  authenticate,
  validate(CampaignIdDto),
  requireCapability('campaign.read', { target: 'any' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void Promise.resolve()
      .then(() => readCampaign(req, req.ctx.orgId as string, userOf(req), version(req), params.id))
      .then((campaign) => res.json({ data: campaign }))
      .catch(next);
  },
);

campaignsRouter.post(
  '/',
  authenticate,
  validate(CreateCampaignDto),
  requireCapability('campaign.create', { target: 'any' }),
  (req, res, next) => {
    const { body } = req.data as { body: CreateCampaignBody };
    void Promise.resolve()
      .then(() => createCampaign(req, req.ctx.orgId as string, userOf(req), body))
      .then((campaign) => res.status(201).json({ data: campaign }))
      .catch(next);
  },
);

campaignsRouter.patch(
  '/:id',
  authenticate,
  validate(UpdateCampaignDto),
  requireCapability('campaign.update', { target: 'any' }),
  (req, res, next) => {
    const { body, params } = req.data as { body: UpdateCampaignBody; params: { id: string } };
    void Promise.resolve()
      .then(() =>
        updateCampaign(req, req.ctx.orgId as string, userOf(req), version(req), params.id, body),
      )
      .then((campaign) => res.json({ data: campaign }))
      .catch(next);
  },
);

// The highest-stakes button in the product. Idempotent by key AND by state: a double-click
// on stage must not mint a second token, because the QR already on screen would then point
// at the wrong campaign (38, 13 §7).
campaignsRouter.post(
  '/:id/launch',
  authenticate,
  validate(CampaignIdDto),
  requireCapability('campaign.launch', { target: 'any' }),
  idempotent('campaign.launch'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void Promise.resolve()
      .then(() => launchCampaign(req, req.ctx.orgId as string, userOf(req), version(req), params.id))
      .then((result) => res.json({ data: result }))
      .catch(next);
  },
);

campaignsRouter.post(
  '/:id/close',
  authenticate,
  validate(CampaignIdDto),
  requireCapability('campaign.close', { target: 'any' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void Promise.resolve()
      .then(() => closeCampaign(req, req.ctx.orgId as string, userOf(req), version(req), params.id))
      .then((campaign) => res.json({ data: campaign }))
      .catch(next);
  },
);

campaignsRouter.get(
  '/:id/audience',
  authenticate,
  validate(CampaignIdDto),
  requireCapability('campaign.read', { target: 'any' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void Promise.resolve()
      .then(() => audiencePreview(req, req.ctx.orgId as string, userOf(req), version(req), params.id))
      .then((preview) => res.json({ data: preview }))
      .catch(next);
  },
);
