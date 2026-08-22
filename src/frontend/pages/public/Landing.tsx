// T-031 — the landing page. 30 § Landing.
//
// The one thing here that is not decoration is the vocabulary switcher, and this version
// promotes it from a card halfway down the page to the mechanism the whole hero runs on:
// pick the kind of organisation you run and the HEADLINE changes into your words. The
// product's entire claim is "the organisation is data, not code", and a sentence in 62px
// type that rewrites itself is that claim demonstrated rather than asserted.
//
// Every domain noun below comes from `PRESET_VOCABULARIES` (INV-001). There is no
// organisation on `/`, so `useLabels()` has nothing to resolve; the presets are the only
// place these words may live, and `audit:vocab` fails the build if one is typed into JSX.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PITCH_KEYS, PRESET_VOCABULARIES } from '@endur/shared';
import { Icon } from '../../components/Icon.js';
import { Illustration } from '../../components/illustrations/Illustration.js';

/** Long enough to read four words, short enough that nobody waits for it. */
const DWELL_MS = 3500;

/** The generic name of each role, which is what the schema actually calls it. Shown beside
 *  the organisation's own word so the substitution is legible rather than magic. */
const ROLE_CAPTION = {
  unit: 'Unit',
  subject: 'Subject',
  respondent: 'Respondent',
  reviewee: 'Reviewee',
} as const;

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
        <p className="landing-eyebrow utility">Feedback management · performance analysis</p>

        {/*
          The two nouns are keyed on the vocabulary so React replaces the nodes rather than
          patching their text. A CSS transition cannot animate a text change on a node it
          considers unchanged, and without the remount the swap is instantaneous and
          therefore invisible — which loses the only thing the headline is for.
        */}
        <h1 className="landing-title">
          Ask every{' '}
          <span className="landing-swap" key={`${active.key}-r`}>
            {active.labels.respondent.one.toLowerCase()}
          </span>
          <br />
          about every{' '}
          <span className="landing-swap" key={`${active.key}-s`}>
            {active.labels.subject.one.toLowerCase()}
          </span>
          .
        </h1>

        <p className="landing-lede">
          Endur takes the shape of your organization — its structure, its roles, the words it
          already uses — and collects honest feedback from the people inside it. You describe
          it once.
        </p>

        <div className="landing-switcher">
          <p className="utility" id="switch-heading">I run a</p>
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
        </div>

        <div className="landing-actions">
          <Link className="btn btn-primary btn-lg" to="/start">
            Create your organization
            <Icon name="arrow" size={18} />
          </Link>
          <Link className="btn btn-secondary btn-lg" to="/login">Sign in</Link>
        </div>
      </section>

      {/* Wide, and given its own band rather than squeezed beside the copy. It is a scene
          with four things happening in it and it needs the width to be read at all. */}
      <section className="landing-scene" aria-hidden="true">
        <Illustration name="hero-organisation" className="illus-hero" />
      </section>

      {/*
        The substitution, laid out. Each tile pairs the schema's generic name with this
        organisation's word for it — which is precisely what the `organizations.labels`
        column holds. `aria-live` announces it; a screen reader otherwise experiences the
        entire pitch as silence.
      */}
      <section className="landing-proof" aria-labelledby="proof-heading">
        <h2 className="landing-section-title" id="proof-heading">
          The same product, in your words
        </h2>
        <p className="landing-section-lede">
          Nothing below is a setting buried in an admin screen, and nothing below is a
          different build of Endur. It is one column in one table, and every screen in the
          product reads it.
        </p>

        <p className="landing-nouns" key={active.key} aria-live="polite">
          {PITCH_KEYS.map((key, position) => (
            <span key={key}>
              {position > 0 && <span className="landing-dot" aria-hidden="true"> · </span>}
              {active.labels[key].one}
            </span>
          ))}
        </p>

        <ul className="landing-grid" key={`${active.key}-grid`}>
          {PITCH_KEYS.map((key) => (
            <li className="landing-tile card" key={key}>
              <span className="utility">{ROLE_CAPTION[key]}</span>
              <span className="landing-tile-word">{active.labels[key].one}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* A real sequence — you cannot collect before you have described the organization,
          and you cannot read results before anyone has answered — so it is numbered. */}
      <section className="landing-steps" aria-labelledby="steps-heading">
        <h2 className="landing-section-title" id="steps-heading">Three steps, once</h2>

        <ol className="landing-step-list">
          <li className="landing-step">
            <span className="landing-step-num" aria-hidden="true">01</span>
            <h3 className="landing-step-title">Describe your organization</h3>
            <p className="landing-step-body">
              Its structure, who does what, and the words you already use for them. A wizard
              walks it, and a preset fills most of it in.
            </p>
          </li>
          <li className="landing-step">
            <span className="landing-step-num" aria-hidden="true">02</span>
            <h3 className="landing-step-title">Share a link or a code</h3>
            <p className="landing-step-body">
              Answering needs no account, no app and no password — a link, or a printed QR
              code on a table or a noticeboard.
            </p>
          </li>
          <li className="landing-step">
            <span className="landing-step-num" aria-hidden="true">03</span>
            <h3 className="landing-step-title">Read what came back</h3>
            <p className="landing-step-body">
              Everyone sees their own part of it and only that, because the server decides
              what to send rather than the screen deciding what to hide.
            </p>
          </li>
        </ol>
      </section>

      <section className="landing-claims" aria-labelledby="claims-heading">
        <h2 className="landing-section-title" id="claims-heading">
          Two things most feedback tools get wrong
        </h2>

        <div className="landing-claim-pair">
          <article className="landing-claim card elev-md">
            {/* EyeOff, not a padlock: the claim is not that the data is locked away, it is
                that there is nothing there to look at in the first place. */}
            <span className="landing-claim-mark" aria-hidden="true">
              <Icon name="hide" size={24} />
            </span>
            <h3 className="landing-claim-title">Anonymity is in the schema</h3>
            <p className="landing-claim-body">
              An anonymous answer is not an answer with a name hidden from the report. The
              table that stores responses has no column that could identify who wrote one,
              and it never will. A separate table records that an invitation was used;
              nothing joins the two.
            </p>
            <p className="landing-claim-note text-meta">
              So Endur can tell you 312 of 400 answered, and still not know whose answer is
              whose.
            </p>
          </article>

          <article className="landing-claim card elev-md">
            <span className="landing-claim-mark" aria-hidden="true">
              <Icon name="role" size={24} />
            </span>
            <h3 className="landing-claim-title">Permissions are grants, not levels</h3>
            <p className="landing-claim-body">
              Admin, editor, viewer cannot express the situations real organizations
              actually contain. Endur grants a specific capability over a specific part of
              the structure, and a denial always beats a grant — no seniority, no group and
              no delegation overrides it.
            </p>
            <p className="landing-claim-note text-meta">
              Every authorized request is checked on the server. The interface only ever
              draws what came back.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-cta glass glass-lit">
        <h2 className="landing-cta-title">Start with the shape you already have</h2>
        <p className="landing-cta-body">
          Pick the closest preset, change what does not fit, and send the first round of
          questions the same day.
        </p>
        <div className="landing-actions">
          <Link className="btn btn-primary btn-lg" to="/start">
            Create your organization
            <Icon name="arrow" size={18} />
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <p className="text-meta">Endur · feedback and performance, for whatever you run.</p>
      </footer>
    </div>
  );
}
