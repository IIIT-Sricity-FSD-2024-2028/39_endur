
type Variant = 'unavailable' | 'responded' | 'error' | 'signIn' | 'notMember';

const COPY: Record<Variant, { title: string; body: (org: string) => string }> = {
  unavailable: {
    title: "This link isn't active",
    body: () =>
      'It may have closed, it may not have opened yet, or the code may be wrong. Check the link, or scan the code again.',
  },
  responded: {
    title: "You've already responded",
    body: () => 'Thanks — one response per person on this cycle.',
  },
  error: {
    title: "We couldn't load this",
    body: () => 'Check your connection and try again.',
  },
  signIn: {
    title: 'Sign in to answer',
    body: (org) => `Only people in ${org} can answer this one.`,
  },
  notMember: {
    title: "This isn't your organization's link",
    body: (org) => `This form belongs to ${org}. You're signed in to a different organisation.`,
  },
};

export function Unavailable({
  variant,
  onRetry,
  organizationName = '',
  signInHref,
}: {
  variant: Variant;
  onRetry?: (() => void) | undefined;
  organizationName?: string | undefined;
  signInHref?: string | undefined;
}): JSX.Element {
  const { title, body } = COPY[variant];

  return (
    <div className="rf-end">
      <span className="rf-end-mark" aria-hidden="true">
        {variant === 'responded' ? <CheckGlyph /> : <QuietGlyph />}
      </span>
      <h1 className="rf-end-title">{title}</h1>
      <p className="rf-end-body">{body(organizationName)}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
      {/* A PLAIN NAVIGATION, not a router <Link>. The console lives behind a different
          entry point, and importing its router here is what 20 §8 and bundle.test.ts
          forbid — the respondent chunk must not learn about the console to draw one
          button. It is also correct behaviour: signing in is a full page load. */}
      {variant === 'signIn' && signInHref && (
        <a className="btn btn-primary" href={signInHref}>Sign in</a>
      )}
      {/* `notMember` deliberately has NO action. 39 § States: suggesting they sign out and
          try again is a worse suggestion than asking whoever sent them the link. */}
    </div>
  );
}

const QuietGlyph = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor"
    strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5" />
    <path d="M12 16.5h.01" />
  </svg>
);

const CheckGlyph = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor"
    strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export { CheckGlyph };
