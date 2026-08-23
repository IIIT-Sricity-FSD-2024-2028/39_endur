// Account routes. 13 § Accounts, 57.
//
// TWO ROUTERS, because the feature genuinely has two halves that share nothing but a token:
//
//   personAccountRouter  the console. A signed-in administrator acting on somebody else.
//                        Full tenant chain, capability, escalation bound.
//   activationRouter     the public world. Somebody with no session, no organisation and
//                        no account, holding a link. The token IS the credential.
//
// Both are mounted with `mount()` from app.ts rather than with `router.use()` from inside
// people/router.ts. That is not a style preference: the route-enumeration test (routes.test.ts,
// INV-003) walks `mountedRouters()` and does NOT recurse into nested routers, so a sub-router
// mounted on another router would be a set of routes the test could not see — which is the
// one thing that test exists to prevent.
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

/** `mergeParams` — `:id` belongs to the mount path, and validate() reads it from params. */
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

/**
 * THE ESCALATION BOUND, on both minting routes. 11 §5b, INV-012.
 *
 * Provisioning creates no position, so the pairs come from the ones the person already
 * holds — the bound is checked against what they would WAKE UP HOLDING. Without it the
 * guard on `POST /people/:id/assignments` is composable into an escalation in two legal
 * calls: find the Registrar the founder created, hand them a key, ask them for a favour.
 *
 * `account.reset` carries it too, and 57's table names only `account.create`. Re-issuing
 * mints an equally working link for the same account, so a bound on one and not the other
 * would be a bound with a second door — the same reasoning that put it on `POST
 * /people/import` when it was written for `/:id/assignments` alone.
 */
const boundToTheirOwnReach = requireNoEscalation((req) =>
  pairsFromPerson(req.ctx.orgId as string, (req.data as { params: { id: string } }).params.id),
);

personAccountRouter.post(
  '/',
  authenticate,
  validate(AccountIdDto),
  // `any`, because a person is not anchored to a unit in the request — their POSITIONS
  // are, and those are only known once the row is read. The next line asks the other half.
  requireCapability('account.create', { target: 'any' }),
  // THE ROW-LEVEL HALF, and it must precede the bound below. Reversed, `WOULD_ESCALATE`
  // becomes an oracle: a coordinator could walk person ids they cannot see and learn from
  // which ones refuse exactly who outranks them (features/people/visibility.ts).
  requirePersonVisible('account.create'),
  boundToTheirOwnReach,
  (req, res, next) => {
    void provisionAccount(req, refFrom(req), { capability: 'account.create' })
      .then((invite) => res.status(201).json({ data: invite }))
      .catch(next);
  },
);

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

personAccountRouter.delete(
  '/',
  authenticate,
  validate(AccountIdDto),
  // NO escalation bound, and its absence is deliberate: revocation only ever removes
  // access. INV-012 bounds handing power OUT; nothing here hands anything out.
  requireCapability('account.revoke', { target: 'any' }),
  requirePersonVisible('account.revoke'),
  (req, res, next) => {
    void revokeAccount(req, refFrom(req))
      .then(() => res.status(204).end())
      .catch(next);
  },
);

/**
 * The unauthenticated half. `/api/v1/auth/activate/:token`.
 *
 * There is NO `requireCapability` here and there cannot be: the person has no account yet,
 * which is the entire situation. `routes.test.ts` allows it under the `/api/v1/auth/`
 * entry — authentication itself cannot require a principal.
 */
export const activationRouter: Router = Router();

activationRouter.use(activationChain);

activationRouter.get('/:token', validate(ActivationTokenDto), (req, res, next) => {
  const { params } = req.data as { params: { token: string } };
  void inspectInvite(params.token)
    .then((preview) => res.json({ data: preview }))
    .catch(next);
});

activationRouter.post(
  '/:token',
  // Link 12, scoped. A token is a credential and an unlimited activation endpoint is an
  // unlimited password-set endpoint — keyed on the PAIR so one link cannot be hammered and
  // a shared NAT cannot lock out a building (57, 12 §4.12).
  scopedRateLimits.activate,
  validate(ActivateAccountDto),
  (req, res, next) => {
    const { body, params } = req.data as {
      body: ActivateAccountBody;
      params: { token: string };
    };
    void (async () => {
      const activation = await activateAccount(req, params.token, body.password);

      // Signed in ALREADY — no second trip through /login. Landing on a login form after
      // setting a password is the most pointless screen in software (57 § Interactions).
      //
      // Regenerate first: session fixation prevention (15 §2), and it matters more here
      // than on /login, because the id in play may have been set by whoever sent the link.
      await regenerate(req);
      req.session.userId = activation.userId;
      req.session.orgId = activation.orgId;
      await save(req);
      issueCsrfToken(res);
      res.json({ ok: true });
    })().catch(next);
  },
);
