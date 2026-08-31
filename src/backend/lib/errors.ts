// The typed errors used across the app. Every one leaves through errorFunnel, so replies always share one shape.
import type { ZodError } from 'zod';
import type { DecidedBy, ErrorCode, FieldError } from '@endur/shared';
import { statusForCode } from '@endur/shared';

// The base error: a code, a message, optional details, and the HTTP status that goes with the code.
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

// A failed schema check, carrying one entry per bad field.
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

// Denied a capability on something you CAN see, so the message says who decided. Something you cannot see returns 404 instead.
export class ForbiddenError extends AppError {
  constructor(message: string, decidedBy?: DecidedBy) {
    super('FORBIDDEN', message, decidedBy ? { decidedBy } : undefined);
  }
}

// Refused because the action would create somebody more powerful than the caller. It names the capability, so the rule is clear.
export class WouldEscalateError extends AppError {
  constructor(message: string, capability: string, unitName?: string) {
    super('WOULD_ESCALATE', message, {
      capability,
      ...(unitName ? { unitName } : {}),
    });
  }
}

// A members-only campaign reached without a staff session for that organisation. Carries the org name so the page can say where to sign in.
export class SignInRequiredError extends AppError {
  constructor(organizationName: string) {
    super('SIGN_IN_REQUIRED', `Only people in ${organizationName} can answer this one.`, {
      organizationName,
    });
  }
}

// Signed in, but to a different organisation than the campaign belongs to.
export class NotAMemberError extends AppError {
  constructor(organizationName: string) {
    super('NOT_A_MEMBER', 'This form belongs to a different organisation.', {
      organizationName,
    });
  }
}

// The resource does not exist, or the caller may not even know that it does.
export class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super('NOT_FOUND', message);
  }
}

// Nobody is signed in.
export class UnauthenticatedError extends AppError {
  constructor(message = 'Sign in to continue.') {
    super('UNAUTHENTICATED', message);
  }
}

// The request clashes with the current state, such as a duplicate name.
export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message);
  }
}

// Rewrites Zod's developer-facing messages into plain sentences a respondent can act on.
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

// Turns a field path like "body.questions.0.text" into a readable name like "Text".
function fieldName(path: (string | number)[]): string {
  const last = [...path].reverse().find((part) => typeof part === 'string' && part !== 'body');
  if (typeof last !== 'string') return 'This field';
  const spaced = last.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
