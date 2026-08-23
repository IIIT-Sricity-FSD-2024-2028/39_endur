// Where uploaded bytes live. 48 § Storage.
//
// Local disk, behind an interface, so an object store is a swap rather than a rewrite. No
// S3 yet: one more service to run and explain, for no marks (18 § Out of scope).
//
// Files are TENANT-PARTITIONED on disk — `<storage>/<orgId>/<fileId>.<ext>`. That makes
// deleting an organisation a directory delete, and it makes a cross-tenant path bug visible
// as a wrong directory rather than silent as a wrong row.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const defaultRoot = path.resolve(fileURLToPath(import.meta.url), '../../storage');
export const storageRoot = config.STORAGE_DIR ? path.resolve(config.STORAGE_DIR) : defaultRoot;

/**
 * Every path component is checked against this, and the check is not defensive noise: the
 * only reason a client filename can never escape the org directory is that no part of a
 * client filename is ever used to build one (48). Ids are ours; extensions come from a
 * closed set decided by `sniff()`.
 */
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;

function objectPath(orgId: string, fileId: string, ext: string): string {
  if (!SAFE.test(orgId) || !SAFE.test(fileId) || !SAFE.test(ext)) {
    throw new Error('unsafe storage key');
  }
  return path.join(storageRoot, orgId, `${fileId}.${ext}`);
}

export const storage = {
  async put(orgId: string, fileId: string, ext: string, bytes: Buffer): Promise<void> {
    const full = objectPath(orgId, fileId, ext);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, bytes);
  },

  async read(orgId: string, fileId: string, ext: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(objectPath(orgId, fileId, ext));
    } catch {
      // A row with no bytes behind it is a 404, not a 500. The row is the record; the file
      // is a cache of it that a restore or a stray `rm` can legitimately have removed.
      return null;
    }
  },

  async remove(orgId: string, fileId: string, ext: string): Promise<void> {
    await fs.rm(objectPath(orgId, fileId, ext), { force: true });
  },

  /** Used when an organisation is deleted. One directory, one call. */
  async removeOrg(orgId: string): Promise<void> {
    if (!SAFE.test(orgId)) throw new Error('unsafe storage key');
    await fs.rm(path.join(storageRoot, orgId), { recursive: true, force: true });
  },
};
