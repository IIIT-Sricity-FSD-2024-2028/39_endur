// Staff sessions. DEC-014 — replaced JWT access+refresh.
//
// Why cookies rather than a bearer token: no silent-refresh dance, no token sitting in JS
// where XSS can read it, and revocation is a DELETE rather than a blocklist. The cost is
// that CSRF becomes a real concern — which is honest, and is why link 8 exists.
//
// The `sessions` table is owned by connect-pg-simple and created by a plain SQL migration.
// It is deliberately not a Prisma model (10 §5).
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import type { RequestHandler } from 'express';
import { config, isProd } from '../lib/config.js';

const PgStore = connectPgSimple(session);

export const SESSION_COOKIE = 'endur.sid';

export const sessionMiddleware: RequestHandler = session({
  name: SESSION_COOKIE,
  secret: config.SESSION_SECRET,
  store: new PgStore({
    conString: config.DATABASE_URL,
    tableName: 'sessions',
    createTableIfMissing: false, // the migration owns it
  }),
  resave: false,
  saveUninitialized: false,
  // Rolling: active use extends the window, so someone working all day is not logged out
  // mid-task, while an abandoned session still expires.
  rolling: true,
  cookie: {
    httpOnly: true, // JS cannot read it — this is what makes XSS unable to steal the session
    secure: config.COOKIE_SECURE || isProd,
    // Lax, not Strict: Strict would drop the cookie when arriving from an external link,
    // which is exactly how someone reaches the console from an email.
    sameSite: 'lax',
    maxAge: config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  },
});

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    orgId?: string;
  }
}

/**
 * Session fixation prevention. An attacker who can set a session id before login would
 * otherwise still hold a valid id AFTER it — regenerating on every successful login
 * discards whatever id was in play.
 */
export const regenerate = (req: Express.Request): Promise<void> =>
  new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()));
  });

/** Logout destroys the record SERVER-side. Clearing the cookie alone would leave a valid id. */
export const destroy = (req: Express.Request): Promise<void> =>
  new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()));
  });

export const save = (req: Express.Request): Promise<void> =>
  new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()));
  });
