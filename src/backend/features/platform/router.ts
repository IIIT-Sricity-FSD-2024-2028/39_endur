// The platform route tree - Endur's own operator console.
// One prefix, and every route under it is platform-only, which is what lets a test assert that no
// platform capability appears anywhere else and that no route here uses the tenant capability check.
// The chain is deliberately different from every other router: no tenant resolver (there is no
// organisation), no tenant authenticate (the principal comes from the endur.ops cookie), and no CSRF
// middleware - requirePlatformAuth stands in for all three.
import { Router } from 'express';
import {
  AnalyticsListDto,
  EarningsListDto,
  CreateOperatorDto,
  EnterpriseQueueDto,
  EnterpriseUpdateDto,
  EnterSupportDto,
  SupportSessionListDto,
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
  enterSupport,
  leaveSupport,
  listSupportSessions,
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

// One message for every kind of login failure, which does not say which half was wrong.
// Learning that the password was right but the code was wrong is learning the password, and this
// account reaches every customer's plan data.
const REFUSED = 'That email, password or code is not right.';

// Operator login: email, password and a two-factor code.
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

      // A dummy verification for an unknown address, as on the org side: an instant answer is a free
      // way to find out which addresses are real.
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

// Operator logout.
platformRouter.post('/auth/logout', (req, res, next) => {
  void endSession(req, res)
    .then(() => res.json({ ok: true }))
    .catch(next);
});

// No capability: "who am I" cannot be gated on a permission held by the person asking.
// Without the cookie this answers 401.
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

// Everything below needs an operator. Mounted once rather than repeated, so a route added later
// cannot end up unauthenticated by omission.
platformRouter.use(requirePlatformAuth());

// The estate: every customer organisation, with counts only.
platformRouter.get(
  '/orgs',
  validate(EstateListDto),
  requirePlatform('platform.org.read'),
  (req, res, next) => {
    const { query } = req.data as { query: Parameters<typeof estate>[0] };
    void estate(query).then((page) => res.json(page)).catch(next);
  },
);

// One organisation's detail.
platformRouter.get(
  '/orgs/:id',
  validate(PlatformOrgDto),
  requirePlatform('platform.org.read'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void orgDetail(params.id).then((detail) => res.json({ data: detail })).catch(next);
  },
);

// Estate-wide usage numbers.
platformRouter.get('/stats', requirePlatform('platform.usage.read'), (_req, res, next) => {
  void stats().then((data) => res.json({ data })).catch(next);
});

// Owner only: this is the estate-wide shape of the business. Support reads one organisation at a time.
platformRouter.get(
  '/analytics',
  validate(AnalyticsListDto),
  requirePlatform('platform.analytics.read'),
  (req, res, next) => {
    const { query } = req.data as { query: Parameters<typeof analytics>[0] };
    void analytics(query).then((data) => res.json({ data })).catch(next);
  },
);

// The money, owner only and behind its own capability: support reads adoption to help a customer,
// and nobody needs a revenue total to do that.
platformRouter.get(
  '/earnings',
  validate(EarningsListDto),
  requirePlatform('platform.revenue.read'),
  (req, res, next) => {
    const { query } = req.data as { query: Parameters<typeof earnings>[0] };
    void earnings(query).then((data) => res.json({ data })).catch(next);
  },
);

// Suspends or restores an organisation.
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

// Overrides an organisation's plan.
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

// Sends a message to an organisation's administrators.
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

// Endur's own audit trail.
platformRouter.get(
  '/audit',
  validate(PlatformAuditListDto),
  requirePlatform('platform.audit.read'),
  (req, res, next) => {
    const { query } = req.data as { query: Parameters<typeof readPlatformAudit>[0] };
    void readPlatformAudit(query).then((page) => res.json(page)).catch(next);
  },
);

// The client picks a file name from THIS list; it never supplies a pattern the server turns into a scan.
platformRouter.get('/logs', validate(LogListDto), requirePlatform('platform.logs.read'), (_req, res) => {
  // The meta says where the files are and how long they last. It rides on the list because it is the
  // same question - what is on disk - and a second route would be a second thing to authorise.
  res.json({ data: listOperatorLogFiles(), meta: logStoreMeta() });
});

// Both operator roles hold the log capability, unlike analytics: the person who needs a stack trace at
// 2am is support, and an on-call tool the on-call person cannot open is not a tool.
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

// The export gets its own capability: a read is a page on a screen, an export is a file that outlives
// the session and the retention window.
platformRouter.get(
  '/logs/:file/export',
  validate(LogExportDto),
  requirePlatform('platform.logs.export'),
  (req, res, next) => {
    const { params, query } = req.data as { params: { file: string }; query: LogExportQuery };
    void exportOperatorLogFile(req, params.file, query)
      .then((result) => {
        res.setHeader('Content-Type', result.contentType);
        // The filename is built by the server from an already-allowlisted name, so nothing user-supplied
        // remains in this header.
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
        res.setHeader('X-Log-Lines', String(result.lines));
        if (result.truncated) res.setHeader('X-Log-Truncated', 'true');
        res.send(result.body);
      })
      .catch(next);
  },
);

// The operator accounts.
platformRouter.get('/operators', requirePlatform('platform.operator.manage'), (_req, res, next) => {
  void listOperators().then((data) => res.json({ data })).catch(next);
});

// Creates an operator.
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

// Edits an operator's role or status.
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

// The Enterprise queue: two owner-only capabilities, split as every other pair here is - reading the
// queue changes nothing, and working it is the action that has to be attributable.
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

// PATCH, because this changes one field of an existing row rather than creating anything.
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

// Approve: grants Enterprise and records the sale in one transaction.
// Its own capability, not the plan override: an override is a support action that takes no money,
// while an approval is a sale at the catalogue price.
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


// Support access: an operator works inside a customer's console as a limited member of it.
// Three properties make it acceptable, and this route enforces them at the door:
//   the operator acts as THEMSELVES, under a synthetic account in their own name, and is denied
//   the capabilities that would let them read feedback;
//   the customer is told, by a banner on every console page that cannot be turned off;
//   it stops by itself after an hour, checked on every request rather than relying on Leave.
// It carries the platform guard and never the tenant one, so a route is still either one or the other.
platformRouter.post(
  '/orgs/:id/support-session',
  validate(EnterSupportDto),
  requirePlatform('platform.support.enter'),
  (req, res, next) => {
    const { params, body } = req.data as { params: { id: string }; body: { reason: string } };
    void enterSupport(req, res, params.id, body.reason)
      .then((data) => res.status(201).json({ data }))
      .catch(next);
  },
);

// Leave. No capability: giving up access can never be the thing somebody is not permitted to do,
// and an operator whose role changed mid-session must still be able to close the session it opened.
platformRouter.post('/support-session/leave', (req, res, next) => {
  void leaveSupport(req, res)
    .then((data) => res.json({ data }))
    .catch(next);
});

// The register of support visits. Reading it is split from entering, as every other pair here is.
platformRouter.get(
  '/support-sessions',
  validate(SupportSessionListDto),
  requirePlatform('platform.support.read'),
  (req, res, next) => {
    const { query } = req.data as { query: Parameters<typeof listSupportSessions>[0] };
    void listSupportSessions(query)
      .then((data) => res.json({ data }))
      .catch(next);
  },
);
