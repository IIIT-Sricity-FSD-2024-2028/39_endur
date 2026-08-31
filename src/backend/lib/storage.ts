// Where uploaded files live: local disk, behind a small interface, so an object store is a swap later.
// Files are stored per organisation - <storage>/<orgId>/<fileId>.<ext> - so deleting an org is a directory delete.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const defaultRoot = path.resolve(fileURLToPath(import.meta.url), '../../storage');
export const storageRoot = config.STORAGE_DIR ? path.resolve(config.STORAGE_DIR) : defaultRoot;

// Every path piece must match this. No part of a client filename is ever used to build a path.
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;

// Builds the on-disk path for one file, refusing anything that is not a safe key.
function objectPath(orgId: string, fileId: string, ext: string): string {
  if (!SAFE.test(orgId) || !SAFE.test(fileId) || !SAFE.test(ext)) {
    throw new Error('unsafe storage key');
  }
  return path.join(storageRoot, orgId, `${fileId}.${ext}`);
}

export const storage = {
  // Writes the bytes, creating the organisation's folder if needed.
  async put(orgId: string, fileId: string, ext: string, bytes: Buffer): Promise<void> {
    const full = objectPath(orgId, fileId, ext);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, bytes);
  },

  // Reads the bytes back, or null when the file is missing.
  async read(orgId: string, fileId: string, ext: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(objectPath(orgId, fileId, ext));
    } catch {
      // A row with no file behind it is a 404, not a 500.
      return null;
    }
  },

  // Deletes one file.
  async remove(orgId: string, fileId: string, ext: string): Promise<void> {
    await fs.rm(objectPath(orgId, fileId, ext), { force: true });
  },

  // Used when an organisation is deleted: one directory, one call.
  async removeOrg(orgId: string): Promise<void> {
    if (!SAFE.test(orgId)) throw new Error('unsafe storage key');
    await fs.rm(path.join(storageRoot, orgId), { recursive: true, force: true });
  },
};
