// The signed-in user's own account.
// Separate from /people/:id on purpose: here the target is built from the PRINCIPAL, so there is no
// id in the request that a caller could point at somebody else.
import { Router } from 'express';
import { ChangePasswordDto, UpdateProfileDto } from '@endur/shared';
import type { ChangePasswordBody, UpdateProfileBody } from '@endur/shared';
import { tenantChain } from '../../middleware/chains.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { validate } from '../../middleware/validate.js';
import { imageUpload } from '../../middleware/upload.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import { config } from '../../lib/config.js';
import { regenerate, save } from '../../auth/session.js';
import { removeAvatar, setAvatar } from '../files/avatar.js';
import { changePassword, readProfile, updateProfile } from './service.js';

export const profileRouter: Router = Router();

// Links 6 to 8 for every route below.
profileRouter.use(tenantChain);

// The caller, or nothing. Every handler here is about them and takes no id.
const me = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

// The caller's own profile.
profileRouter.get(
  '/',
  authenticate,
  // 'self' scope, reachable by every role, because person.read at self scope is seeded to all of them.
  // A 403 on this route means a broken seed, not a permission decision.
  requireCapability('person.read', { target: 'self' }),
  (req, res, next) => {
    void readProfile(req.ctx.orgId as string, me(req), req.ctx.authzVersion ?? 0)
      .then((profile) => res.json({ data: profile }))
      .catch(next);
  },
);

// Renames the caller.
profileRouter.patch(
  '/',
  authenticate,
  validate(UpdateProfileDto),
  requireCapability('person.update', { target: 'self' }),
  (req, res, next) => {
    const { body } = req.data as { body: UpdateProfileBody };
    void updateProfile(req, req.ctx.orgId as string, me(req), req.ctx.authzVersion ?? 0, body)
      .then((profile) => res.json({ data: profile }))
      .catch(next);
  },
);

// No capability check here, and that is the specification: holding the session IS the authorisation.
// person.update is held over OTHER people's units, and an administrator must never be able to set
// somebody else's password - gating on it would make this route look safer while being wider.
profileRouter.post(
  '/password',
  authenticate,
  validate(ChangePasswordDto),
  (req, res, next) => {
    const { body } = req.data as { body: ChangePasswordBody };
    const orgId = req.ctx.orgId as string;
    const userId = me(req);
    void (async () => {
      await changePassword(req, orgId, userId, body);

      // A credential changed, so the session id is regenerated - after the write and outside its transaction,
      // and both ids are re-set by hand, because regenerating empties the session.
      await regenerate(req);
      req.session.userId = userId;
      req.session.orgId = orgId;
      await save(req);

      res.json({ ok: true });
    })().catch(next);
  },
);

const upload = imageUpload({ field: 'file', maxBytes: config.UPLOAD_MAX_MB * 1024 * 1024 });

// The upload middleware is this route's validation, so it runs before the permission check.
// Parsing first also keeps a refusal clean: rejecting mid-upload would look like a network error.
profileRouter.post('/avatar', authenticate, upload, requireCapability('person.update', { target: 'self' }), (req, res, next) => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user') return next(new UnauthenticatedError());
  void setAvatar(req, req.ctx.orgId as string, principal.id, principal.id)
    .then((file) => res.status(201).json({ data: file }))
    .catch(next);
});

// Removes the caller's avatar.
profileRouter.delete('/avatar', authenticate, requireCapability('person.update', { target: 'self' }), (req, res, next) => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user') return next(new UnauthenticatedError());
  void removeAvatar(req, req.ctx.orgId as string, principal.id)
    .then(() => res.status(204).end())
    .catch(next);
});
