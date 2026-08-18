// process.env is untrusted input like any other, so it gets the same treatment as a
// request body: one Zod schema, parsed once, at boot (14 §5).
//
// The point of parsing here rather than reading process.env at each use site is that a
// missing SESSION_SECRET becomes a startup crash with a readable message, instead of a
// confusing 500 in the middle of a demo.
import { z } from 'zod';

// Node 20+ reads the file natively; no dotenv dependency. Absent .env is fine —
// in CI and in production the variables come from the environment itself.
try {
  process.loadEnvFile(new URL('../../../../.env', import.meta.url).pathname);
} catch {
  /* no .env on disk — fall through to the real environment */
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

export const config = load();

export const isProd = config.NODE_ENV === 'production';
export const isDev = config.NODE_ENV === 'development';
