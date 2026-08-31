// Environment variables are untrusted input, so they get one Zod schema, parsed once at boot.
// A missing SESSION_SECRET then fails at startup with a clear message instead of a 500 mid-demo.
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Walks up from this file to find the repo-root .env, so renaming a folder cannot break it.
{
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let up = 0; up < 6; up += 1) {
    const candidate = path.join(dir, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // No .env on disk is fine: in CI and production the variables come from the environment itself.
}

// The shape of every environment variable the server reads.
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url(),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Only needed once the public API exists.
  API_KEY_SECRET: z.string().min(32).optional(),

  PUBLIC_BASE_URL: z.string().url(),
  API_BASE_URL: z.string().url(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  K_ANON_THRESHOLD: z.coerce.number().int().min(1).default(5),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Optional here: their real defaults depend on where this file lives, so logger.ts resolves them.
  LOG_DIR: z.string().min(1).optional(),
  LOG_TO_FILE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
  LOG_MAX_SIZE_MB: z.coerce.number().positive().default(10),

  // Optional here too; lib/storage.ts works out the real default.
  STORAGE_DIR: z.string().min(1).optional(),
  UPLOAD_MAX_MB: z.coerce.number().positive().default(2),
});

export type Config = z.infer<typeof Env>;

// Parses the environment once, and throws a readable error listing whatever is wrong.
function load(): Config {
  // Treat an empty value as "not set", because .env.example ships blank lines such as SESSION_SECRET=.
  const present = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ''),
  );

  const parsed = Env.safeParse(present);
  if (parsed.success) return parsed.data;

  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
  throw new Error(
    ['Invalid environment. Fix .env (see .env.example):', ...lines].join('\n'),
  );
}

// The machine's LAN address, or null. A QR code saying localhost would point a phone at itself.
function lanAddress(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      // family is 'IPv4' on newer Node and 4 on some older builds, so both are accepted.
      const isV4 = address.family === 'IPv4' || (address.family as unknown as number) === 4;
      if (isV4 && !address.internal) return address.address;
    }
  }
  return null;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

// In development only, rewrites a localhost PUBLIC_BASE_URL to the LAN address so a phone can scan the QR.
function resolvePublicBaseUrl(parsed: Config): Config {
  if (parsed.NODE_ENV !== 'development') return parsed;
  let url: URL;
  try {
    url = new URL(parsed.PUBLIC_BASE_URL);
  } catch {
    return parsed;
  }
  if (!LOOPBACK.has(url.hostname)) return parsed;

  const lan = lanAddress();
  if (!lan) return parsed;

  url.hostname = lan;
  const resolved = url.toString().replace(/\/$/, '');
  // Printed at boot, because a URL the developer did not type must be visible to them.
  console.log(`PUBLIC_BASE_URL ${parsed.PUBLIC_BASE_URL} -> ${resolved} (LAN, so a phone can scan the QR)`);
  return { ...parsed, PUBLIC_BASE_URL: resolved };
}

export const config = resolvePublicBaseUrl(load());

export const isProd = config.NODE_ENV === 'production';
export const isDev = config.NODE_ENV === 'development';
export const isTest = config.NODE_ENV === 'test';
