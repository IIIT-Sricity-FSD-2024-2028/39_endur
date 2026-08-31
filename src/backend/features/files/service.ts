// Storing and serving uploaded images.
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

// The row and the bytes are written inside the caller's transaction, with the disk write first:
// if the disk fails, the transaction rolls back and nothing ever pointed at a missing file.
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
      // The type sniffed from the bytes, never the type the client claimed.
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

// Detach and delete: the row goes and so do the bytes. A replaced avatar is not kept, because an
// unreferenced image is a copy of somebody's face that nothing will ever ask for again.
export async function discardFile(tx: Tx, orgId: string, fileId: string): Promise<void> {
  // Scoped by organisation as well as id, because this uses the raw client rather than the tenant-bound one.
  const row = await tx.file.findFirst({ where: { id: fileId, orgId }, select: { id: true, mime: true } });
  if (!row) return;
  await tx.file.delete({ where: { id: row.id } });
  await storage.remove(orgId, row.id, extOf(row.mime));
}

// The public URL for a stored file.
export const urlFor = (fileId: string): string => `/api/v1/files/${fileId}`;

// Serving: no session and no organisation, so it uses the raw client - the one place a tenant table is
// read without a tenant. What makes it safe is that the id IS the credential: it is a random uuid, and
// the only files that exist are logos and avatars, shown to everyone who can see the page they sit on.
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

// The file extension for a stored image type.
const extOf = (mime: string): string =>
  mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
