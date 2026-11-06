// The one Prisma client for the whole app.
// Request code does not use it directly - it uses ctx.db, which adds the orgId filter for you.
import { PrismaClient } from '@prisma/client';
import { config, isDev, isTest } from '../lib/config.js';

// Kept on globalThis so the dev watcher does not leak a new connection pool on every save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.LOG_LEVEL === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    // TESTS ONLY. The 5s default stays in production, where it is a guard against a
    // transaction holding locks. In the integration suite a dozen workers register
    // organisations at once, and on a loaded machine (or a 2-core CI runner) registration
    // crossed 5s and failed as a 500 — a timing failure, not a wrong answer.
    ...(isTest ? { transactionOptions: { maxWait: 10_000, timeout: 20_000 } } : {}),
  });

if (isDev) globalForPrisma.prisma = prisma;
