// T-031 — the landing page. 30 § Landing, design_specs/design/03 §3.1.
//
// Thin on purpose, and FIRST on the M0 cut-list (02 §2): if the week runs out, `/` becomes
// a redirect to `/login` and nothing of value is lost. Half a day, no more.
//
// The one thing here that is not filler is the vocabulary switcher. It is the entire
// product claim made visible in four clicks — same screens, same code, four different
// organisations — and it is why the nouns below come from `PRESET_VOCABULARIES` (data,
// shared with the presets and drift-tested against them) rather than from JSX.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PITCH_KEYS, PRESET_VOCABULARIES } from '@endur/shared';

/** Long enough to read four words, short enough that nobody waits for it. */
const DWELL_MS = 3500;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Landing(): JSX.Element {
  const [index, setIndex] = useState(0);
  // Auto-advance stops FOR GOOD at the first click, not for one cycle. Someone who has
  // taken hold of a control and then watches it move on its own has been overruled by a
  // timer, and on a projector that reads as a bug in the demo.
  const [engaged, setEngaged] = useState(false);

  useEffect(() => {
    // Content that changes on a timer is a WCAG 2.2.2 concern before it is a taste
    // question, so reduced-motion does not get a slower carousel — it gets none.
    if (engaged || prefersReducedMotion()) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % PRESET_VOCABULARIES.length),
      DWELL_MS,
    );
    return () => window.clearInterval(timer);
  }, [engaged]);

  const active = PRESET_VOCABULARIES[index] ?? PRESET_VOCABULARIES[0];
  if (!active) return <></>;

  const pick = (next: number): void => {
    setEngaged(true);
    setIndex(next);
  };

  return (
    <div className="landing">
      <section className="landing-hero">
        <h1 className="landing-title">
          Feedback that fits
          <br />
          your organization.
        </h1>
        <p className="landing-lede">
          Endur configures itself to how your organization is actually structured — then
          collects feedback from the people inside it.
        </p>
        <div className="landing-actions">
          <Link className="btn btn-primary" to="/start">Create your organization</Link>
          <Link className="btn btn-secondary" to="/login">Sign in</Link>
        </div>
      </section>

      <section className="landing-switch card elev-md" aria-labelledby="switch-heading">
        <p className="utility" id="switch-heading">The same product, four vocabularies</p>

        <div className="seg" role="radiogroup" aria-labelledby="switch-heading">
          {PRESET_VOCABULARIES.map((entry, position) => (
            <label className="seg-opt" key={entry.key}>
              <input
                type="radio"
                name="vocabulary"
                value={entry.key}
                checked={position === index}
                onChange={() => pick(position)}
              />
              {entry.displayName}
            </label>
          ))}
        </div>

        {/*
          `key` remounts the row so the cross-fade replays on every change — a CSS
          transition on unchanged nodes would not, because only the text differs.
          `aria-live` announces it for a screen reader, which otherwise experiences the
          whole pitch as silence.
        */}
        <p className="landing-nouns" key={active.key} aria-live="polite">
          {PITCH_KEYS.map((key, position) => (
            <span key={key}>
              {position > 0 && <span className="landing-dot" aria-hidden="true"> · </span>}
              {active.labels[key].one}
            </span>
          ))}
        </p>

        <p className="text-meta">
          Nothing above is a setting buried in an admin screen. It is the organization&rsquo;s
          own vocabulary, and every screen in Endur uses it.
        </p>
      </section>

      <section className="landing-steps">
        <div>
          <p className="utility">Configure</p>
          <p className="text-muted">Describe your organization once. Roles, structure, words.</p>
        </div>
        <div>
          <p className="utility">Collect</p>
          <p className="text-muted">Share a link or a QR code. No account needed to answer.</p>
        </div>
        <div>
          <p className="utility">See results</p>
          <p className="text-muted">Everyone sees their own part of it, and only that.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <p className="text-meta">Endur · feedback and performance, for whatever you run.</p>
      </footer>
    </div>
  );
}
