// The signed-in user's own account. 13 § Uploads, 47.
//
// Separate from `/people/:id` on purpose: this is somebody acting on themselves, and it is
// the cleanest demonstration of the `self` scope in `11` §4 — the target is built from the
// PRINCIPAL, so there is no id in the request for a caller to point somewhere else.
import { Router } from 'express';
import { tenantChain } from '../../middleware/chains.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { imageUpload } from '../../middleware/upload.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import { config } from '../../lib/config.js';
import { removeAvatar, setAvatar } from '../files/avatar.js';

export const profileRouter: Router = Router();

// Links 6-8, router-level (12 §2).
profileRouter.use(tenantChain);

const upload = imageUpload({ field: 'file', maxBytes: config.UPLOAD_MAX_MB * 1024 * 1024 });

/**
 * `upload` sits in link 9's slot — it IS the validation for this route — so it runs before
 * requireCapability, exactly as `validate()` does (12 §5). Parsing before authorising is
 * also what keeps the refusal clean: rejecting mid-upload would reset the connection and
 * the caller would see a network error rather than a 403.
 */
profileRouter.post('/avatar', authenticate, upload, requireCapability('person.update', { target: 'self' }), (req, res, next) => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user') return next(new UnauthenticatedError());
  void setAvatar(req, req.ctx.orgId as string, principal.id, principal.id)
    .then((file) => res.status(201).json({ data: file }))
    .catch(next);
});

profileRouter.delete('/avatar', authenticate, requireCapability('person.update', { target: 'self' }), (req, res, next) => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user') return next(new UnauthenticatedError());
  void removeAvatar(req, req.ctx.orgId as string, principal.id)
    .then(() => res.status(204).end())
    .catch(next);
});
