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
  /**
   * INV-012. The request would create a position or account holding a power the caller
   * does not hold at that unit (11 §5b). Its own code rather than a plain FORBIDDEN
   * because it is the one refusal the UI shows as an error rather than by hiding the
   * action: the caller CAN do this on most rows, so an absent button would read as a
   * rendering bug. `details.capability` names the power that would have been handed out.
   */
  WOULD_ESCALATE: 403,
  /**
   * DEC-037. An `organization`-access campaign, reached with no staff session for that
   * organisation. Its own code rather than UNAUTHENTICATED because the respond world must
   * offer a sign-in LINK rather than route to the console's login — a respondent who lands
   * on `/login` with no `next` has been sent away from the form they were asked to fill in.
   * `details.organizationName` is the only thing in the body, so the prompt can say which.
   */
  SIGN_IN_REQUIRED: 401,
  /** DEC-037. Signed in, but to a different organisation than the campaign's. */
  NOT_A_MEMBER: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  /**
   * DEC-049. The email and password are RIGHT, and they are right for more than one
   * organisation — `users` is unique on `(org_id, email)` (`10`), so one address can hold
   * an activated account in several. Login therefore cannot name the account on its own.
   *
   * Its own code rather than a plain CONFLICT because it is the only 409 that is not a
   * failure: the caller has authenticated successfully and is being asked ONE more
   * question. `details.organizations` carries `{ id, name }` for each — safe to disclose
   * precisely because it is only ever sent to somebody who has just proved the password
   * for every organisation in the list. The client re-posts `/auth/login` with `orgId`.
   */
  ACCOUNT_AMBIGUOUS: 409,
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
      /** 409 ACCOUNT_AMBIGUOUS — which organisations this address and password open. */
      organizations?: Array<{ id: string; name: string }>;
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
