// The one Prisma client for the whole app.
// Request code does not use it directly - it uses ctx.db, which adds the orgId filter for you.
import { PrismaClient } from '@prisma/client';
import { config, isDev } from '../lib/config.js';

// Kept on globalThis so the dev watcher does not leak a new connection pool on every save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.LOG_LEVEL === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (isDev) globalForPrisma.prisma = prisma;
