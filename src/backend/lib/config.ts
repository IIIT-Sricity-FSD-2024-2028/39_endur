// process.env is untrusted input like any other, so it gets the same treatment as a
// request body: one Zod schema, parsed once, at boot (14 §5).
//
// The point of parsing here rather than reading process.env at each use site is that a
// missing SESSION_SECRET becomes a startup crash with a readable message, instead of a
// confusing 500 in the middle of a demo.
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Node 20+ reads the file natively; no dotenv dependency. Absent .env is fine —
// in CI and in production the variables come from the environment itself.
// Walk up for the repo-root .env rather than counting directories. A fixed `../../../..`
// silently breaks the moment a folder is renamed, and the failure looks like a missing
// variable rather than a wrong path.
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
  // No .env on disk is fine: in CI and production the variables come from the environment.
}

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

  // P3 only (45). Absent until the public API exists.
  API_KEY_SECRET: z.string().min(32).optional(),

  PUBLIC_BASE_URL: z.string().url(),
  API_BASE_URL: z.string().url(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  K_ANON_THRESHOLD: z.coerce.number().int().min(1).default(5),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // 18 §5. LOG_DIR and LOG_TO_FILE are deliberately optional rather than defaulted here:
  // their real defaults depend on where this file lives and on NODE_ENV, and a Zod
  // `.default()` cannot see either. logger.ts resolves both, once.
  LOG_DIR: z.string().min(1).optional(),
  LOG_TO_FILE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
  LOG_MAX_SIZE_MB: z.coerce.number().positive().default(10),

  // 48 § Storage. Same treatment as LOG_DIR: optional here, resolved in lib/storage.ts.
  STORAGE_DIR: z.string().min(1).optional(),
  UPLOAD_MAX_MB: z.coerce.number().positive().default(2),
});

export type Config = z.infer<typeof Env>;

function load(): Config {
  // .env.example ships required-but-blank lines (SESSION_SECRET=). An empty string is
  // "not set", not "set to nothing" — otherwise a blank optional var fails min-length
  // and a blank required one reports the wrong error.
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

/**
 * The machine's LAN address, or null when it has none — `DEC-086`, `OPEN-002`.
 *
 * A QR code encoding `localhost` resolves to THE PHONE THAT SCANNED IT, so the
 * scan-to-respond beat cannot run at all until the URL names something the room can
 * reach. The answer is the LAN address: a phone on the same wifi reaches it with no
 * tunnel, no account, no third-party service, and nothing to expire mid-demo.
 */
function lanAddress(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      // `family` is 'IPv4' on Node 18+ and 4 on some older builds; both are checked so
      // this cannot silently find nothing on a machine that has an address.
      const isV4 = address.family === 'IPv4' || (address.family as unknown as number) === 4;
      if (isV4 && !address.internal) return address.address;
    }
  }
  return null;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

/**
 * Rewrites a loopback `PUBLIC_BASE_URL` to the LAN address, in development only.
 *
 * **Development only, and never in production or test.** In production a wrong public URL
 * is a configuration error that should be fixed rather than guessed at, and in test a URL
 * that varies by machine makes assertions unrepeatable. `PUBLIC_BASE_URL` set to anything
 * that is not loopback is left exactly alone — an explicit value always wins.
 *
 * The port is preserved, so `http://localhost:5173` becomes `http://192.168.1.14:5173`
 * and the Vite dev server (which now listens on the LAN — see `vite.config.ts`) answers
 * it. `<ShareSheet>`'s `isUnscannable()` warning stays as the backstop for the case this
 * cannot fix: a machine with no LAN address at all.
 */
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
  // Said out loud at boot. A URL the developer did not type is a URL they must be able to
  // see, or the first confusing thing is a QR pointing somewhere they never configured.
  console.log(`PUBLIC_BASE_URL ${parsed.PUBLIC_BASE_URL} -> ${resolved} (LAN, so a phone can scan the QR)`);
  return { ...parsed, PUBLIC_BASE_URL: resolved };
}

export const config = resolvePublicBaseUrl(load());

export const isProd = config.NODE_ENV === 'production';
export const isDev = config.NODE_ENV === 'development';
export const isTest = config.NODE_ENV === 'test';
