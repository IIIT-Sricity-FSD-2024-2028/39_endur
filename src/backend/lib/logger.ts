// Structured JSON logs. One logger, configured once.
import { pino } from 'pino';
import { config, isDev } from './config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  // Pretty output in dev would need a transport dependency; JSON is readable enough and
  // is what any real log pipeline wants. Keep one format so dev and prod behave alike.
  base: { env: config.NODE_ENV },
  redact: {
    // Belt and braces. requestLogger already never passes a body, but a future call site
    // that logs an object with one of these keys must not leak it either.
    paths: ['req.headers.cookie', 'req.headers.authorization', 'password', 'passwordHash'],
    remove: true,
  },
  ...(isDev ? {} : {}),
});
