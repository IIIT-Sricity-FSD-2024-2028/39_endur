// Announcement routes.
// Four capabilities rather than one, and the split that matters is create from publish: drafting is not
// broadcasting, so a coordinator can write a notice without being able to send it to everybody.
// The plan check always runs after the permission check, and the read routes carry none at all, because
// a downgraded organisation must still read what it was already sent.
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

// Links 6 to 8 for every route below, like every other console router.
announcementsRouter.use(tenantChain);

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

const version = (req: { ctx: { authzVersion?: number } }) => req.ctx.authzVersion ?? 0;

// Does this caller WRITE announcements, or only receive them?
// It decides what the list contains - drafts included, or only what was sent to them. It is a read
// shape, not an authorisation: every write is guarded by its own capability check.
// It asks the same capability map the console reads, so the two cannot disagree about who can draft.
async function isWriter(req: { ctx: { orgId?: string } }, userId: string): Promise<boolean> {
  const held = await heldCapabilities(
    req.ctx.orgId as string,
    userId,
    new Date(),
    version(req as { ctx: { authzVersion?: number } }),
  );
  return held['announcement.create'] !== undefined;
}

// The announcements this caller may see.
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

// Before /:id, or Express would read "preview" as an announcement id.
// Gated on create rather than read: "how many people would this reach" is a composer's question.
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

// One announcement, with its counts and the reader's own receipt.
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

// Creates a draft.
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

// Draft only - the service answers 409 once published, because words people have already read must not
// change under them while their receipts still say they read them.
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

// The irreversible one, and idempotent like launch: a double-click writes one set of receipts, not two.
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

// Deletes an announcement and its receipts.
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

// Read capability and no plan gate: dismissing a banner is part of reading it, and a bronze organisation
// that could see a notice but never mark it read would be shown the same banner forever.
announcementsRouter.post(
  '/:id/read',
  authenticate,
  validate(AnnouncementIdDto),
  requireCapability('announcement.read', { target: 'any' }),
  (req, res, next) => {
    const { params } = req.data as { params: { id: string } };
    void Promise.resolve()
      .then(() => markRead(req.ctx.orgId as string, userOf(req), params.id))
      // 204: the client marked it read optimistically before the request left, exactly as the inbox does.
      .then(() => res.status(204).end())
      .catch(next);
  },
);
