// The dead ends. 39 § States, design_specs/design/07 §7.6.
//
// "A dead white screen after a scan is the worst possible outcome on stage", and the
// bad-token case is the likeliest one — somebody mistypes the URL from the back of the
// room. Every path out of `/r/:token` that is not a form lands here.
//
// THREE variants, not the four both sources draw, and the reason is CONF-015: the server
// returns one 404 for "wrong token", "not open yet" and "closed", because a difference
// between them is an existence oracle. The client cannot render a distinction it was
// deliberately not told, so the three share one screen that names all three possibilities.
//
// FIVE NOW, and the two new ones do NOT weaken that argument (DEC-037, 39 § States). They
// are reachable only with a WORKING token: the server resolves the token first and gates
// second, so every invalid, unlaunched, not-yet-open and closed token still produces the one
// identical 404 before `access` is ever consulted. Somebody holding a working token learning
// that it is restricted has learned nothing the token did not already tell them.
//
// The icons are inline SVG rather than <Icon>. That component imports thirty glyphs from
// lucide-react, and pulling the icon library into the respondent chunk to draw two shapes
// is exactly what 20 §8 rules out — this page loads on a phone, on a venue network, for
// someone with no patience. `bundle.test.ts` holds that line.

type Variant = 'unavailable' | 'responded' | 'error' | 'signIn' | 'notMember';

const COPY: Record<Variant, { title: string; body: (org: string) => string }> = {
  unavailable: {
    title: "This link isn't active",
    // Not "this link doesn't work", which is a lie in two of the three cases it covers —
    // and the reader's next move differs between them. Naming all three is the only
    // honest sentence available, and it is also the actionable one.
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
    // The organisation's own name, from the 401's body. "Sign in" with no `which` is not an
    // instruction anybody can follow, and the person scanned a code they were handed — they
    // should be told whose it is rather than left to guess.
    body: (org) => `Only people in ${org} can answer this one.`,
  },
  notMember: {
    title: "This isn't your organization's link",
    // 39 § States drafts this as "You're signed in to {your org}" — WHICH THIS SCREEN CANNOT
    // SAY. The respond world mounts no store and holds no session concept (39 § State), so
    // it does not know the reader's own organisation, and the 403 carries the CAMPAIGN's
    // name and nothing else on purpose (13 §5). Fetching /auth/me to fill in one word would
    // put a session call on a dead-end screen for a phone that may have no session at all.
    //
    // Same fact, said from the side the page actually knows. Recorded in 39.
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
  /** Only the transient failure gets an action. There is nothing to retry about a 404. */
  onRetry?: (() => void) | undefined;
  /** The CAMPAIGN's organisation, from the gate's error body. Empty for the other three. */
  organizationName?: string | undefined;
  /**
   * `/login?next=/r/{token}`, and the `next` is the whole point: a respondent sent to a bare
   * login screen has been sent AWAY from the form somebody asked them to fill in.
   */
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

/* Two shapes, drawn here. stroke-width 2.75 is the design system's, copied because the
   respond world cannot import the component that owns it (design_specs/design/01 §5). */

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
