// Runs in every test worker before any test file is imported, which is what makes it work:
// config.ts reads DATABASE_URL at import time, and a variable already set wins over the repo .env.
// globalSetup does this too - the duplication is deliberate, because the stake is the development database.
import os from 'node:os';
import path from 'node:path';
import { testDatabaseUrl } from './database.js';

process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';

// Uploads write real bytes, so they are pointed at a temp folder: a test run must leave nothing behind.
process.env.STORAGE_DIR ??= path.join(os.tmpdir(), 'endur-test-storage');
