// Runs in every worker, before any test file is imported — which is what makes it work.
// lib/config.ts parses DATABASE_URL at module load, and `process.loadEnvFile()` does not
// overwrite a variable that is already set, so setting it here wins over the repo `.env`
// for the whole worker.
//
// globalSetup already does this in the parent. This is deliberate duplication: it is the
// line that has to be true, and depending on env inheritance through a worker boundary to
// carry it is a bet with the development database as the stake (D-004).
import os from 'node:os';
import path from 'node:path';
import { testDatabaseUrl } from './database.js';

process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';

// Uploads (48) write real bytes. Point them at a temp directory for the same reason the
// database is redirected: a test run must not leave anything behind in the tree, and a
// suite that writes into src/backend/storage/ would quietly accumulate every image every
// run has ever uploaded.
process.env.STORAGE_DIR ??= path.join(os.tmpdir(), 'endur-test-storage');
