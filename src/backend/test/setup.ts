// Runs in every worker, before any test file is imported — which is what makes it work.
// lib/config.ts parses DATABASE_URL at module load, and `process.loadEnvFile()` does not
// overwrite a variable that is already set, so setting it here wins over the repo `.env`
// for the whole worker.
//
// globalSetup already does this in the parent. This is deliberate duplication: it is the
// line that has to be true, and depending on env inheritance through a worker boundary to
// carry it is a bet with the development database as the stake (D-004).
import { testDatabaseUrl } from './database.js';

process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = 'test';
