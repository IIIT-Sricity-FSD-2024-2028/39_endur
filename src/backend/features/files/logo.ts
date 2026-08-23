// The organisation logo. 41, 48.
import type { Request } from 'express';
import { NotFoundError } from '../../lib/errors.js';
import { runInTransaction } from '../../db/tx.js';
import { discardFile, storeUpload, type FileView } from './service.js';

export async function setLogo(req: Request, orgId: string, actorId: string): Promise<FileView> {
  const file = req.file;
  if (!file) throw new NotFoundError();

  return runInTransaction(req, async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { id: true, logoFileId: true },
    });
    if (!org) throw new NotFoundError();

    const stored = await storeUpload(tx, orgId, actorId, 'logo', file);
    await tx.organization.update({ where: { id: orgId }, data: { logoFileId: stored.fileId } });
    if (org.logoFileId) await discardFile(tx, orgId, org.logoFileId);

    req.ctx.audit.push({ action: 'org.logo.set', targetType: 'organization', targetId: orgId });
    return stored;
  });
}

export async function removeLogo(req: Request, orgId: string): Promise<void> {
  return runInTransaction(req, async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { id: true, logoFileId: true },
    });
    if (!org) throw new NotFoundError();

    if (org.logoFileId) {
      await tx.organization.update({ where: { id: orgId }, data: { logoFileId: null } });
      await discardFile(tx, orgId, org.logoFileId);
    }
    req.ctx.audit.push({ action: 'org.logo.remove', targetType: 'organization', targetId: orgId });
  });
}
