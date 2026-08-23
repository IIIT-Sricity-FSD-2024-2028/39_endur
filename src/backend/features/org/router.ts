// Organisation routes. 13 § Organisation.
//
// The shape every feature router in Stage 2 follows:
//
//   validate(Dto) -> requireCapability(...) -> handler reading req.data
//
// The order is not decoration. requireCapability reads its target from req.data, the
// VALIDATED request (12 §5) — reading raw input there would let a caller point the
// permission check at one resource and the handler at another.
import { Router } from 'express';
import { tenantChain } from '../../middleware/chains.js';
import { SetupOrgDto, UpdateLabelsDto, UpdateOrgDto } from '@endur/shared';
import type { SetupOrgBody, UpdateLabelsBody, UpdateOrgBody } from '@endur/shared';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { authenticate } from '../../middleware/authenticate.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import { PRESET_LIST, presetView } from '../../presets/index.js';
import { imageUpload } from '../../middleware/upload.js';
import { config } from '../../lib/config.js';
import { removeLogo, setLogo } from '../files/logo.js';
import { readOrg, setupOrg, updateLabels, updateOrg } from './service.js';

export const orgRouter: Router = Router();

// Links 6-8, router-level (12 §2). tenantResolver → authenticate → csrfProtection,
// applied to every route below without any of them having to ask.
orgRouter.use(tenantChain);

orgRouter.get('/', authenticate, requireCapability('org.read'), (req, res, next) => {
  void readOrg(req.ctx.orgId as string)
    .then((org) => res.json({ data: org }))
    .catch(next);
});

/**
 * The preset catalogue. Guarded by `org.read` rather than left open (DEC-018): `org.read`
 * is seeded to every role including the most junior, so everyone who can sign in can read
 * it, and the route-enumeration allowlist stays as small as it was built to be.
 */
orgRouter.get('/presets', authenticate, requireCapability('org.read'), (_req, res) => {
  res.json({ data: PRESET_LIST.map(presetView) });
});

orgRouter.patch(
  '/',
  authenticate,
  validate(UpdateOrgDto),
  requireCapability('org.update'),
  (req, res, next) => {
    const { body } = req.data as { body: UpdateOrgBody };
    void updateOrg(req, req.ctx.orgId as string, body)
      .then((org) => res.json({ data: org }))
      .catch(next);
  },
);

orgRouter.patch(
  '/labels',
  authenticate,
  validate(UpdateLabelsDto),
  requireCapability('org.update'),
  (req, res, next) => {
    const { body } = req.data as { body: UpdateLabelsBody };
    void updateLabels(req, req.ctx.orgId as string, body.labels)
      .then((org) => res.json({ data: org }))
      .catch(next);
  },
);

orgRouter.post(
  '/setup',
  authenticate,
  validate(SetupOrgDto),
  requireCapability('org.update'),
  (req, res, next) => {
    const { body } = req.data as { body: SetupOrgBody };
    const principal = req.ctx.principal;
    if (principal?.kind !== 'user') return next(new UnauthenticatedError());
    void setupOrg(req, req.ctx.orgId as string, principal.id, body)
      .then((org) => res.status(201).json({ data: org }))
      .catch(next);
  },
);

/**
 * The organisation logo (48). `imageUpload` sits in link 9's slot — it IS the validation
 * for this route — so it runs before requireCapability exactly as `validate()` does
 * (12 §5). It is also the ONE middleware in the application that reads a request body
 * outside express.json, and it is mounted per route rather than per router so that
 * exception cannot spread by accident.
 */
const uploadLogo = imageUpload({ field: 'file', maxBytes: config.UPLOAD_MAX_MB * 1024 * 1024 });

orgRouter.post('/logo', authenticate, uploadLogo, requireCapability('org.update'), (req, res, next) => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user') return next(new UnauthenticatedError());
  void setLogo(req, req.ctx.orgId as string, principal.id)
    .then((file) => res.status(201).json({ data: file }))
    .catch(next);
});

orgRouter.delete('/logo', authenticate, requireCapability('org.update'), (req, res, next) => {
  void removeLogo(req, req.ctx.orgId as string)
    .then(() => res.status(204).end())
    .catch(next);
});
