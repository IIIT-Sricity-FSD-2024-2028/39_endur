// Announcement routes. 13 § Announcements, T-094.
//
// FOUR CAPABILITIES AND NOT ONE `announcement.manage`, and the split that matters is
// `create` from `publish`: drafting is not broadcasting. An organisation should be able to
// let a coordinator write a notice without letting them reach everybody with it, and a
// single verb makes that impossible to express (11 §3).
//
// `requireEntitlement` sits AFTER `requireCapability` on every write, which is the chain's
// own order (app.ts links 10-11): 403 outranks 402, because telling somebody to buy an
// upgrade for something they would not be allowed to use anyway is the wrong answer twice.
// The read routes carry no entitlement at all — `announcement.read` is Bronze, so a
// downgraded organisation still reads what it was already sent (16 §7).
import { Router } from 'express';
import {
  AnnouncementIdDto,
  AnnouncementListDto,
  AnnouncementPreviewDto,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from '@endur/shared';
import type {
  AnnouncementPreviewBody,
  CreateAnnouncementBody,
  UpdateAnnouncementBody,
} from '@endur/shared';
import { tenantChain } from '../../middleware/chains.js';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { requireEntitlement } from '../../middleware/requireEntitlement.js';
import { idempotent } from '../../middleware/idempotency.js';
import { authenticate } from '../../middleware/authenticate.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import { heldCapabilities } from '../../authz/index.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  markRead,
  previewAudience,
  publishAnnouncement,
  readAnnouncement,
  updateAnnouncement,
} from './service.js';

export const announcementsRouter: Router = Router();

// Links 6-8, router-level (12 §2), like every other console router.
announcementsRouter.use(tenantChain);

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

const version = (req: { ctx: { authzVersion?: number } }) => req.ctx.authzVersion ?? 0;

/**
 * Does this caller WRITE announcements, or only receive them?
 *
 * It decides what the list contains — drafts included, or only what was sent to them — and
 * it is a READ SHAPE, not an authorisation. The authorisation for every write is the
 * `requireCapability` on that route; this only answers "which rows are worth returning",
 * which is the same question `visibleUnits()` answers for every other list (INV-003).
 *
 * Through `heldCapabilities`, which is the map `useCan()` reads, so the console's own idea
 * of who can draft and the server's cannot drift.
 */
async function isWriter(req: { ctx: { orgId?: string } }, userId: string): Promise<boolean> {
  const held = await heldCapabilities(
    req.ctx.orgId as string,
    userId,
    new Date(),
    version(req as { ctx: { authzVersion?: number } }),
  );
  return held['announcement.create'] !== undefined;
}

announcementsRouter.get(
  '/',
  authenticate,
  validate(AnnouncementListDto),
  requireCapability('announcement.read', { target: 'any' }),
  (req, res, next) => {
    void Promise.resolve()
      .then(async () => {
        const userId = userOf(req);
        return listAnnouncements(req.ctx.orgId as string, userId, await isWriter(req, userId));
      })
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

// BEFORE `/:id`, because Express matches in order and `preview` would otherwise be read as
// an announcement id — the same ordering `campaignsRouter` applies to `/quick`.
//
// Gated on `announcement.create` rather than on `read`: it answers "how many people would
// this reach", which is a composer's question and a fact about the org graph. Somebody who
// cannot draft has no reason to be able to ask it about an arbitrary rule.
announcementsRouter.post(
  '/preview',
  authenticate,
  validate(AnnouncementPreviewDto),
  requireCapability('announcement.create', { target: 'any' }),
  requireEntitlement('announcement.create'),
  (req, res, next) => {
    const { body } = req.data as { body: AnnouncementPreviewBody };
    void Promise.resolve()
      .then(() => previewAudience(req.ctx.orgId as string, body.audience))
      .then((preview) => res.json({ data: preview }))
      .catch(next);
  },
);

announcementsRouter.get(
  '/:id',
  authenticate,
  validate(AnnouncementIdDto),
  requireCapability('announcement.read', { target: 'any' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void Promise.resolve()
      .then(async () => {
        const userId = userOf(req);
        return readAnnouncement(
          req.ctx.orgId as string,
          userId,
          await isWriter(req, userId),
          params.id,
        );
      })
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

announcementsRouter.post(
  '/',
  authenticate,
  validate(CreateAnnouncementDto),
  requireCapability('announcement.create', { target: 'any' }),
  requireEntitlement('announcement.create'),
  (req, res, next) => {
    const { body } = req.data as { body: CreateAnnouncementBody };
    void Promise.resolve()
      .then(() => createAnnouncement(req, req.ctx.orgId as string, userOf(req), body))
      .then((data) => res.status(201).json({ data }))
      .catch(next);
  },
);

// Draft only — 409 once published, from the service. The words people have already read
// must not change under them while their receipts still say they read them.
announcementsRouter.patch(
  '/:id',
  authenticate,
  validate(UpdateAnnouncementDto),
  requireCapability('announcement.create', { target: 'any' }),
  requireEntitlement('announcement.create'),
  (req, res, next) => {
    const { body, params } = req.data as {
      body: UpdateAnnouncementBody;
      params: { id: string };
    };
    void Promise.resolve()
      .then(() => updateAnnouncement(req, req.ctx.orgId as string, userOf(req), params.id, body))
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

// The irreversible one, and idempotent for the reason launch is: a double-click writes one
// set of receipts, not two. The service is idempotent by state as well, so a repeat with a
// fresh key still resolves the audience only once.
announcementsRouter.post(
  '/:id/publish',
  authenticate,
  validate(AnnouncementIdDto),
  requireCapability('announcement.publish', { target: 'any' }),
  requireEntitlement('announcement.publish'),
  idempotent('announcement.publish'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void Promise.resolve()
      .then(() => publishAnnouncement(req, req.ctx.orgId as string, userOf(req), params.id))
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

announcementsRouter.delete(
  '/:id',
  authenticate,
  validate(AnnouncementIdDto),
  requireCapability('announcement.delete', { target: 'any' }),
  requireEntitlement('announcement.delete'),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void Promise.resolve()
      .then(() => deleteAnnouncement(req, req.ctx.orgId as string, params.id))
      .then(() => res.status(204).end())
      .catch(next);
  },
);

// `announcement.read` and NO entitlement. Dismissing a banner is part of reading it, and a
// bronze organisation that could see a notice but not mark it read would be shown the same
// banner forever.
announcementsRouter.post(
  '/:id/read',
  authenticate,
  validate(AnnouncementIdDto),
  requireCapability('announcement.read', { target: 'any' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void Promise.resolve()
      .then(() => markRead(req.ctx.orgId as string, userOf(req), params.id))
      // 204: the client marked it read optimistically before the request left, exactly as
      // the inbox does.
      .then(() => res.status(204).end())
      .catch(next);
  },
);
