// Storing and serving uploaded images. 48.
import { NotFoundError } from '../../lib/errors.js';
import { storage } from '../../lib/storage.js';
import { prisma } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import type { UploadedFile } from '../../middleware/upload.js';

export type FileView = {
  fileId: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  mime: string;
};

export type FileKind = 'logo' | 'avatar';

/**
 * Row and bytes are written INSIDE the caller's transaction (`db/tx.ts`), and the disk
 * write happens before the commit on purpose: if the disk fails, the transaction rolls
 * back and nothing ever referenced a file that is not there. The reverse order leaves an
 * orphan on disk that nothing will ever ask about again.
 */
export async function storeUpload(
  tx: Tx,
  orgId: string,
  actorId: string,
  kind: FileKind,
  file: UploadedFile,
): Promise<FileView> {
  const row = await tx.file.create({
    data: {
      orgId,
      kind,
      // The stored type, which is the sniffed one — never the type the client claimed.
      mime: file.facts.mime,
      bytes: file.bytes.length,
      width: file.facts.width,
      height: file.facts.height,
      createdById: actorId,
    },
    select: { id: true, mime: true, bytes: true, width: true, height: true },
  });

  await storage.put(orgId, row.id, file.facts.ext, file.bytes);

  return {
    fileId: row.id,
    url: urlFor(row.id),
    width: row.width ?? 0,
    height: row.height ?? 0,
    bytes: row.bytes,
    mime: row.mime,
  };
}

/**
 * Detach and delete — the row goes, and so do the bytes.
 *
 * A replaced avatar is not kept. An image nobody references is a copy of somebody's face
 * that nothing will ever ask about again; keeping it would be a quiet privacy debt with no
 * feature behind it.
 */
export async function discardFile(tx: Tx, orgId: string, fileId: string): Promise<void> {
  // Scoped by orgId as well as id: `tx` is the RAW client, not the tenant-stamped one, so
  // the scope has to be written here (10 §8, and the reason RLS is still owed as layer 2).
  const row = await tx.file.findFirst({ where: { id: fileId, orgId }, select: { id: true, mime: true } });
  if (!row) return;
  await tx.file.delete({ where: { id: row.id } });
  await storage.remove(orgId, row.id, extOf(row.mime));
}

export const urlFor = (fileId: string): string => `/api/v1/files/${fileId}`;

/**
 * Serving. NO session and NO tenant, and therefore the raw client rather than `req.db` —
 * the one place in the application that reads a tenant table without a tenant, which is
 * worth saying out loud. INV-010 forbids taking an orgId from a REQUEST; here the row
 * supplies its own and the caller never names one.
 *
 * What makes it safe is that the id IS the credential: the id is a random uuid, the only
 * two kinds of file that exist are logos and avatars, and both are shown to everyone who
 * can see the page they sit on — including a respondent with no account at all, which is
 * exactly why this cannot sit behind the console's chain.
 */
export async function readFile(fileId: string): Promise<{ bytes: Buffer; mime: string }> {
  const row = await prisma.file.findUnique({
    where: { id: fileId },
    select: { id: true, orgId: true, mime: true, kind: true },
  });
  if (!row || (row.kind !== 'logo' && row.kind !== 'avatar')) throw new NotFoundError();

  const bytes = await storage.read(row.orgId, row.id, extOf(row.mime));
  if (!bytes) throw new NotFoundError();
  return { bytes, mime: row.mime };
}

const extOf = (mime: string): string =>
  mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
