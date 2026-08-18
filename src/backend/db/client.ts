// The Prisma singleton. Everything that touches the database goes through this instance.
//
// IMPORTANT: services never call this client directly with a bare `findMany()`. Every
// request-scoped read goes through the tenant-bound wrapper (T-006, 10 §8) which injects
// `where: { orgId }`, because org_id comes from tenantResolver and NEVER from a request
// body — a body-supplied orgId is an attack, not an input (INV-010).
import { PrismaClient } from '@prisma/client';
import { config, isDev } from '../lib/config.js';

// tsx watch re-imports this module on every save; without the global the dev server
// leaks a connection pool per reload until Postgres refuses new connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.LOG_LEVEL === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (isDev) globalForPrisma.prisma = prisma;
