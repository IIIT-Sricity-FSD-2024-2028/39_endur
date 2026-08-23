// Avatar writes. 47, 48.
//
// Lives with the file feature rather than with `profile` or `people` because BOTH mount it:
// `/profile/avatar` is somebody acting on themselves (`self` scope) and
// `/people/:id/avatar` is an administrator acting on someone else (`subtree`). Same write,
// two authorisation questions — and the authorisation is decided in the router, which is
// exactly where the difference belongs (INV-003).
import type { Request } from 'express';
import { NotFoundError } from '../../lib/errors.js';
import { runInTransaction } from '../../db/tx.js';
import { discardFile, storeUpload, type FileView } from './service.js';

/**
 * Replaces whatever was there, in one transaction: new row, bytes, the user's pointer, and
 * only then the old file. A failure anywhere leaves the user with the avatar they had.
 */
export async function setAvatar(
  req: Request,
  orgId: string,
  targetUserId: string,
  actorId: string,
): Promise<FileView> {
  const file = req.file;
  if (!file) throw new NotFoundError();

  return runInTransaction(req, async (tx) => {
    const target = await tx.user.findFirst({
      where: { id: targetUserId, orgId },
      select: { id: true, avatarFileId: true },
    });
    if (!target) throw new NotFoundError();

    const stored = await storeUpload(tx, orgId, actorId, 'avatar', file);
    await tx.user.update({ where: { id: target.id }, data: { avatarFileId: stored.fileId } });
    if (target.avatarFileId) await discardFile(tx, orgId, target.avatarFileId);

    req.ctx.audit.push({ action: 'person.avatar.set', targetType: 'user', targetId: target.id });
    return stored;
  });
}

export async function removeAvatar(
  req: Request,
  orgId: string,
  targetUserId: string,
): Promise<void> {
  return runInTransaction(req, async (tx) => {
    const target = await tx.user.findFirst({
      where: { id: targetUserId, orgId },
      select: { id: true, avatarFileId: true },
    });
    if (!target) throw new NotFoundError();

    if (target.avatarFileId) {
      await tx.user.update({ where: { id: target.id }, data: { avatarFileId: null } });
      await discardFile(tx, orgId, target.avatarFileId);
    }
    // Pushed even when there was nothing to remove: the audit row records that somebody
    // ASKED, and "who tried to change this" is a question an audit log should answer.
    req.ctx.audit.push({ action: 'person.avatar.remove', targetType: 'user', targetId: target.id });
  });
}
