// The signed-in user's own account. 13 § Uploads, 47.
//
// Separate from `/people/:id` on purpose: this is somebody acting on themselves, and it is
// the cleanest demonstration of the `self` scope in `11` §4 — the target is built from the
// PRINCIPAL, so there is no id in the request for a caller to point somewhere else.
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

// Links 6-8, router-level (12 §2).
profileRouter.use(tenantChain);

/** Principal or nothing. Every handler below is about the caller and takes no id. */
const me = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

profileRouter.get(
  '/',
  authenticate,
  // `self`, and it is reachable by EVERY role because `person.read: self` is seeded to all
  // of them (50 §1). A profile page somebody cannot open is the bug a default-deny model
  // produces when `self` is forgotten, and 47 § States says a 403 here means a broken seed.
  requireCapability('person.read', { target: 'self' }),
  (req, res, next) => {
    void readProfile(req.ctx.orgId as string, me(req), req.ctx.authzVersion ?? 0)
      .then((profile) => res.json({ data: profile }))
      .catch(next);
  },
);

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

/**
 * NO `requireCapability`, AND THAT IS THE SPECIFICATION (13 § Profile, 47 § Capabilities).
 *
 * Holding the session IS the authorisation, and no capability could stand in for it:
 * `person.update` is held over other people's subtrees, and an administrator must not be
 * able to set somebody else's password (`57` § "Why an administrator still cannot set a
 * password"). Gating this on a capability would make the route look safer while being
 * strictly wider than the session check it replaced.
 *
 * `authenticate` is therefore the whole guard, plus the current password inside the
 * service. INV-003 is not bent by this: the decision is still made in the chain, by the
 * middleware whose job it is.
 */
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

      // 15 § Session hygiene — regenerate on a credential change. AFTER the write and
      // outside its transaction: a new session id must never outlive a change that rolled
      // back. The two ids are re-set by hand because regenerate() empties the session, and
      // forgetting that is how a password change silently signs the caller out.
      await regenerate(req);
      req.session.userId = userId;
      req.session.orgId = orgId;
      await save(req);

      res.json({ ok: true });
    })().catch(next);
  },
);

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
