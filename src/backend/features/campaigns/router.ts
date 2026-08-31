// Campaign routes: create, launch, close and share a round of feedback.
import { Router } from 'express';
import { tenantChain } from '../../middleware/chains.js';
import {
  CampaignIdDto,
  CampaignListDto,
  CreateCampaignDto,
  QuickCampaignDto,
  UpdateCampaignDto,
} from '@endur/shared';
import type {
  CampaignListQuery,
  CreateCampaignBody,
  QuickCampaignBody,
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
  quickCreate,
  readCampaign,
  updateCampaign,
} from './service.js';

export const campaignsRouter: Router = Router();

// Links 6 to 8 for every route below: resolve the org, attach the principal, check CSRF.
campaignsRouter.use(tenantChain);

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

const version = (req: { ctx: { authzVersion?: number } }) => req.ctx.authzVersion ?? 0;

// The campaign list, filtered to what the caller may see.
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

// Quick create - a poll or suggestion box: template, question, campaign and public token in ONE transaction.
// Registered before /:id, or Express would read "quick" as a campaign id.
// Gated on campaign.launch, the strongest of the four things it does, so it cannot become a way around that check.
campaignsRouter.post(
  '/quick',
  authenticate,
  validate(QuickCampaignDto),
  requireCapability('campaign.launch', { target: 'any' }),
  // It mints a public link, so the same rule as launch: a double-click must not produce two links.
  idempotent('campaign.quick'),
  (req, res, next) => {
    const { body } = req.data as { body: QuickCampaignBody };
    void Promise.resolve()
      .then(() => quickCreate(req, req.ctx.orgId as string, userOf(req), body))
      .then((campaign) => res.status(201).json({ data: campaign }))
      .catch(next);
  },
);

// One campaign, with its subjects and counts.
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

// Creates a draft campaign.
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

// Edits a draft: its name, window, audience or subjects.
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

// The highest-stakes button in the product. Idempotent by key and by state: a double-click must not mint
// a second token, because the QR code already on screen would then point at the wrong campaign.
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

// Closes a campaign, so it stops accepting answers.
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

// The share sheet: the public link and QR code for a launched campaign.
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
