// Staff login sessions: a cookie in the browser, the real session row kept in Postgres.
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import type { RequestHandler } from 'express';
import { config, isProd } from '../lib/config.js';

const PgStore = connectPgSimple(session);

export const SESSION_COOKIE = 'endur.sid';

// The middleware that loads the session on every request and saves it back at the end.
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
  // Rolling: each request extends the window, so an active user is never logged out mid-task.
  rolling: true,
  cookie: {
    httpOnly: true, // JS cannot read it — this is what makes XSS unable to steal the session
    secure: config.COOKIE_SECURE || isProd,
    // Lax, not Strict, so the cookie still arrives when the console is opened from an email link.
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

// Gives the user a brand new session id at login, which stops session-fixation attacks.
export const regenerate = (req: Express.Request): Promise<void> =>
  new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()));
  });

// Logout: deletes the session row on the server, not just the cookie in the browser.
export const destroy = (req: Express.Request): Promise<void> =>
  new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()));
  });

// Writes the session to the store and waits until it is really saved.
export const save = (req: Express.Request): Promise<void> =>
  new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()));
  });
