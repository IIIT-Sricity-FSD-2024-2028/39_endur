// Typed errors. Every one of these leaves through errorFunnel and nowhere else, which is
// what makes "no route can produce a body outside the envelope" (12 §8) checkable.
import type { ZodError } from 'zod';
import type { DecidedBy, ErrorCode, FieldError } from '@endur/shared';
import { statusForCode } from '@endur/shared';

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    this.status = statusForCode(code);
  }
}

export class ValidationError extends AppError {
  constructor(zodError: ZodError) {
    super('VALIDATION_FAILED', 'Some fields need attention.', {
      fields: zodError.issues.map(
        (issue): FieldError => ({
          path: issue.path.join('.'),
          message: humanise(issue.message, issue.path),
        }),
      ),
    });
  }
}

/**
 * Denied a capability on something you CAN see: actionable, so it says who decided.
 * Something out of scope returns NotFoundError instead — a 403 there would confirm the
 * resource exists and leak org structure (13 §5).
 */
export class ForbiddenError extends AppError {
  constructor(message: string, decidedBy?: DecidedBy) {
    super('FORBIDDEN', message, decidedBy ? { decidedBy } : undefined);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super('NOT_FOUND', message);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Sign in to continue.') {
    super('UNAUTHENTICATED', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message);
  }
}

/**
 * Zod's defaults are developer-facing. "String must contain at least 1 character(s)" is
 * not what a respondent should read. Rules from design_specs/design/10 §4: say what is
 * wrong and what to do, sentence case, no exclamation marks, never blame the user.
 */
function humanise(message: string, path: (string | number)[]): string {
  const field = fieldName(path);
  if (/^Required$/i.test(message)) return `${field} is required.`;
  if (/at least 1 character/i.test(message)) return `${field} is required.`;
  if (/at least (\d+) character/i.test(message))
    return `${field} must be at least ${/at least (\d+)/i.exec(message)?.[1] ?? ''} characters.`;
  if (/at most (\d+) character/i.test(message))
    return `${field} must be ${/at most (\d+)/i.exec(message)?.[1] ?? ''} characters or fewer.`;
  if (/Invalid email/i.test(message)) return 'Enter a valid email address.';
  if (/Invalid uuid/i.test(message)) return `${field} is not a valid id.`;
  return message.endsWith('.') ? message : `${message}.`;
}

/** "body.questions.0.text" -> "Text". The path still addresses the field for the UI. */
function fieldName(path: (string | number)[]): string {
  const last = [...path].reverse().find((part) => typeof part === 'string' && part !== 'body');
  if (typeof last !== 'string') return 'This field';
  const spaced = last.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
