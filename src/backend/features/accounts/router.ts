// Account routes, in two halves that share nothing but a token:
//   personAccountRouter  the console - a signed-in administrator acting on somebody else
//   activationRouter     the public link - somebody with no session, holding a token that IS the credential
// Both are mounted from app.ts, because the route test walks mounted routers and does not recurse into nested ones.
import { Router } from 'express';
import { AccountIdDto, ActivateAccountDto, ActivationTokenDto } from '@endur/shared';
import type { ActivateAccountBody } from '@endur/shared';
import { activationChain, tenantChain } from '../../middleware/chains.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { requireNoEscalation } from '../../middleware/requireNoEscalation.js';
import { scopedRateLimits } from '../../middleware/rateLimit.js';
import { issueCsrfToken } from '../../middleware/csrfProtection.js';
import { regenerate, save } from '../../auth/session.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import { pairsFromPerson } from '../people/positions.js';
import { requirePersonVisible } from '../people/visibility.js';
import { activateAccount, inspectInvite, provisionAccount, revokeAccount } from './service.js';

// mergeParams, because :id belongs to the mount path and validate() reads it from params.
export const personAccountRouter: Router = Router({ mergeParams: true });

personAccountRouter.use(tenantChain);

const refFrom = (req: {
  ctx: { orgId?: string; principal?: { kind: string; id?: string } };
  data: unknown;
}) => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return {
    orgId: req.ctx.orgId as string,
    personId: (req.data as { params: { id: string } }).params.id,
    callerId: principal.id,
  };
};

// The escalation bound, on both routes that mint a link.
// Provisioning creates no position, so it is checked against the positions the person would WAKE UP holding -
// otherwise the bound could be walked around in two legal calls: assign a senior role, then hand over the key.
const boundToTheirOwnReach = requireNoEscalation((req) =>
  pairsFromPerson(req.ctx.orgId as string, (req.data as { params: { id: string } }).params.id),
);

// Creates a sign-in for somebody and returns the one-time activation link.
personAccountRouter.post(
  '/',
  authenticate,
  validate(AccountIdDto),
  // 'any', because a person is not anchored to a unit in the request - their positions are.
  requireCapability('account.create', { target: 'any' }),
  // The row-level half, and it must come BEFORE the bound, or a refusal would reveal who outranks the caller.
  requirePersonVisible('account.create'),
  boundToTheirOwnReach,
  (req, res, next) => {
    void provisionAccount(req, refFrom(req), { capability: 'account.create' })
      .then((invite) => res.status(201).json({ data: invite }))
      .catch(next);
  },
);

// Re-issues a link for an existing account, which invalidates the previous one.
personAccountRouter.post(
  '/reset',
  authenticate,
  validate(AccountIdDto),
  requireCapability('account.reset', { target: 'any' }),
  requirePersonVisible('account.reset'),
  boundToTheirOwnReach,
  (req, res, next) => {
    void provisionAccount(req, refFrom(req), { capability: 'account.reset' })
      .then((invite) => res.status(201).json({ data: invite }))
      .catch(next);
  },
);

// Revokes an account: no new sign-in, no live sessions, no usable invite.
personAccountRouter.delete(
  '/',
  authenticate,
  validate(AccountIdDto),
  // No escalation bound here on purpose: revoking only ever removes access, and the bound is about handing power out.
  requireCapability('account.revoke', { target: 'any' }),
  requirePersonVisible('account.revoke'),
  (req, res, next) => {
    void revokeAccount(req, refFrom(req))
      .then(() => res.status(204).end())
      .catch(next);
  },
);

// The unauthenticated half: /api/v1/auth/activate/:token.
// There is no capability check and cannot be - the person has no account yet, which is the whole situation.
export const activationRouter: Router = Router();

activationRouter.use(activationChain);

// What the activation page shows before asking for a password: the person and the organisation.
activationRouter.get('/:token', validate(ActivationTokenDto), (req, res, next) => {
  const { params } = req.data as { params: { token: string } };
  void inspectInvite(params.token)
    .then((preview) => res.json({ data: preview }))
    .catch(next);
});

// Consumes the link, sets the password, and signs the person in.
activationRouter.post(
  '/:token',
  // Rate limited on IP and token together: a token is a credential, so an open activation route is an open password-set route.
  scopedRateLimits.activate,
  validate(ActivateAccountDto),
  (req, res, next) => {
    const { body, params } = req.data as {
      body: ActivateAccountBody;
      params: { token: string };
    };
    void (async () => {
      const activation = await activateAccount(req, params.token, body.password);

      // Signed in straight away, so nobody lands on a login form right after choosing a password.
      // The session id is regenerated first, since the old one may have been set by whoever sent the link.
      await regenerate(req);
      req.session.userId = activation.userId;
      req.session.orgId = activation.orgId;
      await save(req);
      issueCsrfToken(res);
      res.json({ ok: true });
    })().catch(next);
  },
);
