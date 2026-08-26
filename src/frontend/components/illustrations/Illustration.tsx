// The illustration set (DEC-030). 24 §1.
//
// Every drawing here is line art: a dark outline with flat fills, animated by drawing its
// own strokes on. That is one house style, applied everywhere, so a person who has seen the
// landing page recognises the empty states as the same hand.
//
// THE SVGs ARE INLINED, not loaded through <img> or <object>, and that is the whole reason
// this component exists rather than a plain tag:
//
//   · Inlined, the markup is part of the document, so `var(--illus-ink)` and the rest
//     resolve against tokens.css and the artwork follows the theme. Through <img> the SVG
//     is a separate document with no access to the page's custom properties, and the
//     drawing would stay in its light-mode colours on a dark page.
//   · The animation is CSS keyframes, not the JS player SVGator also offers. CSS runs on
//     injected markup where an injected <script> would not, it costs no runtime, and the
//     global prefers-reduced-motion rule in endur.css neutralises it for free — a person
//     who has asked for less motion gets the finished drawing immediately, which is the
//     correct still, not a broken one.
//
// `?raw` gives Vite the file as a string at build time; it is not a network request.
import heroUniversity from './hero-university.svg?raw';
import heroHotel from './hero-hotel.svg?raw';
import heroHospital from './hero-hospital.svg?raw';
import heroCompany from './hero-company.svg?raw';
import claimAnonymity from './claim-anonymity.svg?raw';
import claimGrants from './claim-grants.svg?raw';

const SOURCES = {
  /** Landing hero, one per preset vocabulary (INV-001) — the drawing follows the org type the
   *  switcher just picked, the same way the headline and the ambient vibe colour do. */
  'hero-university': heroUniversity,
  'hero-hotel': heroHotel,
  'hero-hospital': heroHospital,
  'hero-company': heroCompany,
  /** The two claims further down the landing page. Not vocab-flavoured — colour-matched to
   *  their own card instead (rose for the anonymity claim, blue/teal for the grants claim). */
  'claim-anonymity': claimAnonymity,
  'claim-grants': claimGrants,
} satisfies Record<string, string>;

export type IllustrationName = keyof typeof SOURCES;

export function Illustration({
  name,
  className,
  label,
}: {
  name: IllustrationName;
  className?: string;
  /**
   * Only pass this when the drawing carries meaning the surrounding copy does not already
   * state. Beside a headline that says the same thing, it is a second announcement of the
   * same sentence, so the default is decorative and silent.
   */
  label?: string;
}): JSX.Element {
  return (
    <div
      className={className ? `illus ${className}` : 'illus'}
      // Trusted at build time: these strings come from files in this repository, never from
      // the API, a user, or the network.
      dangerouslySetInnerHTML={{ __html: SOURCES[name] }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  );
}
