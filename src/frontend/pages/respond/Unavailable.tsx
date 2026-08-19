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
// The icons are inline SVG rather than <Icon>. That component imports thirty glyphs from
// lucide-react, and pulling the icon library into the respondent chunk to draw two shapes
// is exactly what 20 §8 rules out — this page loads on a phone, on a venue network, for
// someone with no patience. `bundle.test.ts` holds that line.

type Variant = 'unavailable' | 'responded' | 'error';

const COPY: Record<Variant, { title: string; body: string }> = {
  unavailable: {
    title: "This link isn't active",
    // Not "this link doesn't work", which is a lie in two of the three cases it covers —
    // and the reader's next move differs between them. Naming all three is the only
    // honest sentence available, and it is also the actionable one.
    body: 'It may have closed, it may not have opened yet, or the code may be wrong. Check the link, or scan the code again.',
  },
  responded: {
    title: "You've already responded",
    body: 'Thanks — one response per person on this cycle.',
  },
  error: {
    title: "We couldn't load this",
    body: 'Check your connection and try again.',
  },
};

export function Unavailable({
  variant,
  onRetry,
}: {
  variant: Variant;
  /** Only the transient failure gets an action. There is nothing to retry about a 404. */
  onRetry?: (() => void) | undefined;
}): JSX.Element {
  const { title, body } = COPY[variant];

  return (
    <div className="rf-end">
      <span className="rf-end-mark" aria-hidden="true">
        {variant === 'responded' ? <CheckGlyph /> : <QuietGlyph />}
      </span>
      <h1 className="rf-end-title">{title}</h1>
      <p className="rf-end-body">{body}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
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
