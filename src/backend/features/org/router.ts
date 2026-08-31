// Organisation routes, and the shape every feature router follows:
//   validate(Dto) -> requireCapability(...) -> handler reading req.data
// The order matters: the permission check reads its target from the VALIDATED request,
// so a caller cannot point the check at one thing and the handler at another.
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

// Links 6 to 8 for every route below: resolve the org, attach the principal, check CSRF.
orgRouter.use(tenantChain);

// The organisation itself.
orgRouter.get('/', authenticate, requireCapability('org.read'), (req, res, next) => {
  void readOrg(req.ctx.orgId as string)
    .then((org) => res.json({ data: org }))
    .catch(next);
});

// The preset catalogue, guarded by org.read, which every role holds, so everyone who can sign in can read it.
orgRouter.get('/presets', authenticate, requireCapability('org.read'), (_req, res) => {
  res.json({ data: PRESET_LIST.map(presetView) });
});

// Rename the organisation or change its industry.
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

// Change the organisation's vocabulary - what it calls units, subjects, people.
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

// The setup wizard's single commit: structure, roles, grants and starter templates in one request.
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

// The logo upload. imageUpload does this route's validation, so it runs before the permission check,
// and it is mounted per route because it is the one place a body is read outside express.json.
const uploadLogo = imageUpload({ field: 'file', maxBytes: config.UPLOAD_MAX_MB * 1024 * 1024 });

// Upload a new logo.
orgRouter.post('/logo', authenticate, uploadLogo, requireCapability('org.update'), (req, res, next) => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user') return next(new UnauthenticatedError());
  void setLogo(req, req.ctx.orgId as string, principal.id)
    .then((file) => res.status(201).json({ data: file }))
    .catch(next);
});

// Remove the logo.
orgRouter.delete('/logo', authenticate, requireCapability('org.update'), (req, res, next) => {
  void removeLogo(req, req.ctx.orgId as string)
    .then(() => res.status(204).end())
    .catch(next);
});
