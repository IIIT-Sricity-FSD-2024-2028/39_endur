// Avatar writes, kept here because BOTH the profile route and the people route mount them:
// one is somebody acting on themselves, the other an administrator acting on someone else.
// Same write, two different permission questions, and the router is where that difference belongs.
import type { Request } from 'express';
import { NotFoundError } from '../../lib/errors.js';
import { runInTransaction } from '../../db/tx.js';
import { discardFile, storeUpload, type FileView } from './service.js';

// Replaces whatever was there, in one transaction: new row, bytes, pointer, then the old file.
// A failure anywhere leaves the person with the avatar they already had.
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

// Removes somebody's avatar and deletes the stored file.
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
    // Recorded even when there was nothing to remove: "who tried to change this" is a question a log should answer.
    req.ctx.audit.push({ action: 'person.avatar.remove', targetType: 'user', targetId: target.id });
  });
}
