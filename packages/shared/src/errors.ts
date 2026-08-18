// Error codes and the one response envelope. Authoritative: architecture/13 §5.
// Only errorFunnel (12 §4.16) ever produces this shape — a handler that writes its own
// error body is a bug, because the client would then have two shapes to parse.

export const ERROR_CODES = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  UNRESOLVED_TENANT: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  CSRF_FAILED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export const statusForCode = (code: ErrorCode): number => ERROR_CODES[code];

/** 422 detail — the path addresses a real form field so the UI renders it inline (14 §6). */
export type FieldError = {
  /** Dotted, with array indices: "body.questions.0.text" */
  path: string;
  message: string;
};

/** 403 FORBIDDEN detail — the decision trace, which is what makes a denial actionable. */
export type DecidedBy = {
  via: 'role' | 'position' | 'group' | 'person' | 'delegation' | 'default';
  subjectName?: string;
  scope?: string;
};

export type ErrorEnvelope = {
  error: {
    code: ErrorCode;
    message: string;
    details?: {
      fields?: FieldError[];
      decidedBy?: DecidedBy;
      requiredTier?: string;
      [key: string]: unknown;
    };
    requestId: string;
  };
};

/**
 * 404 vs 403, decided deliberately (13 §5):
 *   - a resource that exists but is OUT OF SCOPE returns 404. A 403 would confirm it
 *     exists, leaking org structure to someone who cannot see it.
 *   - a capability denied on a resource you CAN see returns 403 with the trace, because
 *     that is actionable — it tells you whom to ask.
 */
export const OUT_OF_SCOPE_CODE = 'NOT_FOUND' satisfies ErrorCode;
