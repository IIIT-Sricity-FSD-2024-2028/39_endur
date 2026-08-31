// The platform route tree. 19 §11.
//
// ONE PREFIX, and every route under it is platform-only. That is what makes the surface
// greppable and what lets the route-enumeration test assert that no `platform.` capability
// appears anywhere else in the app — and that no route here carries `requireCapability`.
//
// THE CHAIN IS DELIBERATELY DIFFERENT FROM EVERY OTHER ROUTER, and each difference is a
// requirement rather than a saving (19 §9):
//
//   NO tenantResolver   — a platform request resolves no organisation. Reaching the
//                         resolver with none produces a confusing 400 where 401 is the truth
//   NO authenticate     — that link reads `req.session` and would attach a `user`. The
//                         operator principal comes from `endur.ops` and nowhere else
//   NO csrfProtection   — replaced by the cookie's own `sameSite: 'lax'` plus the fact that
//                         every mutating route here is a POST/PATCH from an operator's own
//                         console on the same origin. See the note on the login route
//   requirePlatformAuth — instead of all three
import { Router } from 'express';
import {
  AnalyticsListDto,
  EarningsListDto,
  CreateOperatorDto,
  EnterpriseQueueDto,
  EnterpriseUpdateDto,
  EstateListDto,
  LogExportDto,
  LogListDto,
  LogReadDto,
  OrgMessageDto,
  OverridePlanDto,
  PlatformAuditListDto,
  PlatformLoginDto,
  PlatformOrgDto,
  SuspendDto,
  UpdateOperatorDto,
  capabilitiesForRole,
  type EnterpriseQueueQuery,
  type EnterpriseStatus,
  type LogExportQuery,
  type LogReadQuery,
  type PlatformLoginBody,
  type PlatformMeResponse,
  type PlatformRole,
} from '@endur/shared';
import { prisma } from '../../db/client.js';
import { verifyPassword } from '../../auth/password.js';
import { verifyCode } from '../../platform/totp.js';
import { endSession, loadOperator, startSession } from '../../platform/session.js';
import { requirePlatform, requirePlatformAuth } from '../../middleware/requirePlatform.js';
import { validate } from '../../middleware/validate.js';
import { scopedRateLimits } from '../../middleware/rateLimit.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import {
  analytics,
  earnings,
  createOperator,
  estate,
  exportOperatorLogFile,
  approveEnterpriseRequest,
  readEnterpriseQueue,
  updateEnterpriseRequest,
  listOperators,
  listOperatorLogFiles,
  logStoreMeta,
  messageAdministrators,
  orgDetail,
  overridePlan,
  readOperatorLogFile,
  readPlatformAudit,
  setSuspended,
  stats,
  updateOperator,
} from './service.js';

export const platformRouter: Router = Router();

/**
 * ONE MESSAGE FOR EVERY FAILURE, and it does not say which half was wrong.
 *
 * The org login makes the same choice for user enumeration (15 §2). Here it matters more:
 * an attacker who learns that a password is right but the code is wrong has learned that
 * the password is right, and this is the account that reaches every customer's plan data.
 */
const REFUSED = 'That email, password or code is not right.';

platformRouter.post(
  '/auth/login',
  scopedRateLimits.platformLogin,
  validate(PlatformLoginDto),
  (req, res, next) => {
    const { body } = req.data as { body: PlatformLoginBody };
    void (async () => {
      const operator = await prisma.platformUser.findUnique({
        where: { email: body.email },
        select: { id: true, passwordHash: true, status: true, mfaSecret: true },
      });

      // The dummy verification for an unknown address, same as the org side: returning
      // instantly is a free oracle for which addresses are real.
      const passwordOk = await verifyPassword(operator?.passwordHash ?? null, body.password);
      if (!operator || operator.status !== 'active' || !passwordOk) {
        throw new UnauthenticatedError(REFUSED);
      }
      if (!verifyCode(operator.mfaSecret, body.code)) throw new UnauthenticatedError(REFUSED);

      await startSession(res, operator.id);
      await prisma.platformUser.update({
        where: { id: operator.id },
        data: { lastLoginAt: new Date() },
      });
      res.json({ ok: true });
    })().catch(next);
  },
);

platformRouter.post('/auth/logout', (req, res, next) => {
  void endSession(req, res)
    .then(() => res.json({ ok: true }))
    .catch(next);
});

/**
 * NO CAPABILITY, and it is the platform twin of `/auth/me`: the question "who am I" cannot
 * be gated on a permission held by the person asking it. `requirePlatformAuth` is the
 * whole check, and without the cookie this 401s.
 */
platformRouter.get('/me', requirePlatformAuth(), (req, res, next) => {
  void (async () => {
    const operator = await loadOperator(req);
    if (!operator) throw new UnauthenticatedError();
    const role = operator.role as PlatformRole;
    const body: PlatformMeResponse = {
      operator: { id: operator.id, name: operator.name, email: operator.email, role },
      capabilities: capabilitiesForRole(role),
    };
    res.json(body);
  })().catch(next);
});

// Everything below needs an operator. Mounted once rather than repeated per route, so a
// route added later cannot be added unauthenticated by omission.
platformRouter.use(requirePlatformAuth());

platformRouter.get(
  '/orgs',
  validate(EstateListDto),
  requirePlatform('platform.org.read'),
  (req, res, next) => {
    const { query } = req.data as { query: Parameters<typeof estate>[0] };
    void estate(query).then((page) => res.json(page)).catch(next);
  },
);

platformRouter.get(
  '/orgs/:id',
  validate(PlatformOrgDto),
  requirePlatform('platform.org.read'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void orgDetail(params.id).then((detail) => res.json({ data: detail })).catch(next);
  },
);

platformRouter.get('/stats', requirePlatform('platform.usage.read'), (_req, res, next) => {
  void stats().then((data) => res.json({ data })).catch(next);
});

/**
 * `71` § Route & access — OWNER ONLY, and the reason survives DEC-035's removal of money:
 * this is the estate-wide shape of the business's own position, and `platform.org.read`
 * (both roles) is what support needs one organisation at a time.
 */
platformRouter.get(
  '/analytics',
  validate(AnalyticsListDto),
  requirePlatform('platform.analytics.read'),
  (req, res, next) => {
    const { query } = req.data as { query: Parameters<typeof analytics>[0] };
    void analytics(query).then((data) => res.json({ data })).catch(next);
  },
);

/**
 * `/ops/earnings` — the money. DEC-080, `71` § Revenue.
 *
 * OWNER ONLY, behind its OWN capability rather than `platform.analytics.read`. The two were
 * one capability while DEC-035 stood and there was no revenue to separate; DEC-080 splits
 * them because the questions separated: support reads adoption to help a customer, and
 * nobody needs a revenue total to do that.
 */
platformRouter.get(
  '/earnings',
  validate(EarningsListDto),
  requirePlatform('platform.revenue.read'),
  (req, res, next) => {
    const { query } = req.data as { query: Parameters<typeof earnings>[0] };
    void earnings(query).then((data) => res.json({ data })).catch(next);
  },
);

platformRouter.post(
  '/orgs/:id/plan',
  validate(OverridePlanDto),
  requirePlatform('platform.plan.override'),
  (req, res, next) => {
    const { params, body } = req.data as {
      params: { id: string };
      body: { tier: 'bronze' | 'silver' | 'gold' | 'enterprise'; reason?: string };
    };
    void overridePlan(req, params.id, body.tier, body.reason)
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

platformRouter.post(
  '/orgs/:id/suspend',
  validate(SuspendDto),
  requirePlatform('platform.org.suspend'),
  (req, res, next) => {
    const { params, body } = req.data as {
      params: { id: string };
      body: { suspended: boolean; reason?: string };
    };
    void setSuspended(req, params.id, body.suspended, body.reason)
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

platformRouter.post(
  '/orgs/:id/message',
  validate(OrgMessageDto),
  requirePlatform('platform.message.send'),
  (req, res, next) => {
    const { params, body } = req.data as {
      params: { id: string };
      body: { subject: string; body: string };
    };
    void messageAdministrators(req, params.id, body.subject, body.body)
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

platformRouter.get(
  '/audit',
  validate(PlatformAuditListDto),
  requirePlatform('platform.audit.read'),
  (req, res, next) => {
    const { query } = req.data as { query: Parameters<typeof readPlatformAudit>[0] };
    void readPlatformAudit(query).then((page) => res.json(page)).catch(next);
  },
);

/**
 * `72` § "The file name is the whole attack surface" — the client picks a name from THIS
 * list; it never supplies a pattern the server turns into a directory scan.
 */
platformRouter.get('/logs', validate(LogListDto), requirePlatform('platform.logs.read'), (_req, res) => {
  // `meta` carries WHERE the files are and how long they last (`18` §2). It rides on the list
  // rather than a route of its own because it is the same question — "what is on disk" — and
  // a second call to answer half of it is a second thing to authorise.
  res.json({ data: listOperatorLogFiles(), meta: logStoreMeta() });
});

/**
 * `72` § Acceptance — both roles hold `platform.logs.read` (unlike analytics): the person
 * who needs a stack trace at 2am is support, and an on-call tool the on-call person cannot
 * open is not a tool.
 */
platformRouter.get(
  '/logs/:file',
  validate(LogReadDto),
  requirePlatform('platform.logs.read'),
  (req, res, next) => {
    const { params, query } = req.data as { params: { file: string }; query: LogReadQuery };
    void readOperatorLogFile(req, params.file, query)
      .then((result) => res.json(result))
      .catch(next);
  },
);

/**
 * `DEC-074` — the export. Mounted BEFORE `/logs/:file` would be a concern if `:file` could
 * ever match `x/export`, and it cannot: a path segment does not contain a slash and the name
 * allowlist rejects anything that is not `app|error-<date>[.n].log` anyway.
 *
 * `platform.logs.export`, not `platform.logs.read`: a read is a page on a screen, an export
 * is a file that outlives the session and the retention window (`19` §4).
 */
platformRouter.get(
  '/logs/:file/export',
  validate(LogExportDto),
  requirePlatform('platform.logs.export'),
  (req, res, next) => {
    const { params, query } = req.data as { params: { file: string }; query: LogExportQuery };
    void exportOperatorLogFile(req, params.file, query)
      .then((result) => {
        res.setHeader('Content-Type', result.contentType);
        // The filename is server-built from an already-allowlisted name plus a timestamp, so
        // there is nothing user-supplied left in this header to escape.
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
        res.setHeader('X-Log-Lines', String(result.lines));
        if (result.truncated) res.setHeader('X-Log-Truncated', 'true');
        res.send(result.body);
      })
      .catch(next);
  },
);

platformRouter.get('/operators', requirePlatform('platform.operator.manage'), (_req, res, next) => {
  void listOperators().then((data) => res.json({ data })).catch(next);
});

platformRouter.post(
  '/operators',
  validate(CreateOperatorDto),
  requirePlatform('platform.operator.manage'),
  (req, res, next) => {
    const { body } = req.data as {
      body: { email: string; name: string; password: string; role: 'owner' | 'staff' };
    };
    void createOperator(req, body).then((data) => res.status(201).json({ data })).catch(next);
  },
);

platformRouter.patch(
  '/operators/:id',
  validate(UpdateOperatorDto),
  requirePlatform('platform.operator.manage'),
  (req, res, next) => {
    const { params, body } = req.data as {
      params: { id: string };
      body: { role?: 'owner' | 'staff'; status?: 'active' | 'disabled' };
    };
    void updateOperator(req, params.id, body).then((data) => res.json({ data })).catch(next);
  },
);

/**
 * THE ENTERPRISE QUEUE — DEC-100, T-100, 70 § The Enterprise queue.
 *
 * TWO OWNER-ONLY CAPABILITIES, split the way every other pair on this surface is: reading the
 * queue changes nothing, and working it is the action that has to be attributable. Staff hold
 * neither — this is a REVENUE queue, and `19` §4's argument is that support helps one customer
 * at a time while the owner is the one who sells.
 */
platformRouter.get(
  '/enterprise-requests',
  validate(EnterpriseQueueDto),
  requirePlatform('platform.enterprise.read'),
  (req, res, next) => {
    const { query } = req.data as { query: EnterpriseQueueQuery };
    void readEnterpriseQueue(query)
      .then((rows) => res.json({ data: rows }))
      .catch(next);
  },
);

// PATCH, as `13` § platform specifies it: this modifies one field of an existing row
// rather than creating anything, and the catalogue is the contract.
platformRouter.patch(
  '/enterprise-requests/:id',
  validate(EnterpriseUpdateDto),
  requirePlatform('platform.enterprise.update'),
  (req, res, next) => {
    const { params, body } = req.data as {
      params: { id: string };
      body: { status: EnterpriseStatus };
    };
    void updateEnterpriseRequest(req, params.id, body.status)
      .then((row) => res.json({ data: row }))
      .catch(next);
  },
);

/**
 * APPROVE — grant Enterprise and record the sale in one transaction. DEC-111, T-106.
 *
 * `platform.enterprise.update`, not `platform.plan.override`: this is the queue's own verb, and
 * the two are deliberately different actions. An override is a support action that takes no
 * money; an approval is a sale at the catalogue price. Holding one should not imply the other.
 */
platformRouter.post(
  '/enterprise-requests/:id/approve',
  validate(PlatformOrgDto),
  requirePlatform('platform.enterprise.update'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void approveEnterpriseRequest(req, params.id)
      .then((row) => res.json({ data: row }))
      .catch(next);
  },
);

