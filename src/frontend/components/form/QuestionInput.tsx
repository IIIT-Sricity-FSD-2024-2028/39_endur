// <QuestionInput> × 6 — 24 §5, design_specs/design/05 §5.3, 39 § Input specifications.
//
// THE ONE SET (INV-008). The template preview, the builder preview and the live respondent
// form all render through this file. Two implementations means the preview eventually lies
// about what respondents see, and the first time anyone finds out is on stage.
//
// Built at T-035 rather than T-036 because the template preview is the first caller and
// INV-008 forbids a stand-in. The six EDITORS have no caller yet and stay at T-036 (N-031).
//
// Phone first (39). Every control is a real `<input>` — radios for the single-answer kinds,
// checkboxes for multi — so a rating is a `radiogroup` with arrow keys and an announced
// group name without one line of ARIA plumbing. Buttons with `role="radio"` would be a
// hand-rolled version of what the platform already does correctly.
import type { AnswerValue, QuestionConfig, QuestionKind } from '@endur/shared';

/** The shape both `TemplateDetail.questions` and `PublicCampaign.questions` already have. */
export type Question = {
  id: string;
  kind: QuestionKind;
  text: string;
  config: QuestionConfig;
  required: boolean;
  position: number;
};

type Props = {
  question: Question;
  value?: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  error?: string | undefined;
  /** The preview. Controls render and announce exactly as they will; nothing accepts input. */
  readOnly?: boolean | undefined;
};

export function QuestionInput({ question, value, onChange, error, readOnly = false }: Props): JSX.Element {
  // Switched on `config.kind`, not `question.kind`. They are guaranteed equal — the server
  // rejects a mismatch on write (14 §4) — but only the config's own discriminant narrows
  // the union, and narrowing is what keeps every branch below reading typed fields.
  const config = question.config;
  const control = ((): JSX.Element => {
    switch (config.kind) {
      case 'rating':
        return <RatingInput question={question} config={config} value={value} onChange={onChange} readOnly={readOnly} />;
      case 'nps':
        return <NpsInput question={question} value={value} onChange={onChange} readOnly={readOnly} />;
      case 'single':
        return <SingleChoiceInput question={question} config={config} value={value} onChange={onChange} readOnly={readOnly} />;
      case 'multi':
        return <MultiChoiceInput question={question} config={config} value={value} onChange={onChange} readOnly={readOnly} />;
      case 'yesno':
        return <YesNoInput question={question} value={value} onChange={onChange} readOnly={readOnly} />;
      case 'text':
        return <TextInput question={question} config={config} value={value} onChange={onChange} readOnly={readOnly} />;
    }
  })();

  // Free text is one control and takes a <label>. Everything else is a set of controls and
  // takes a <fieldset>, which is what makes the question text the group's accessible name.
  const grouped = config.kind !== 'text';
  const className = `q-card${error ? ' is-invalid' : ''}`;
  const legend = (
    <>
      {question.text}
      {question.required && (
        <>
          {/* Accent asterisk, never a red badge — nothing on a respondent screen is red
              until something is actually wrong (39, rule 4). */}
          <span className="q-star" aria-hidden="true">*</span>
          <span className="sr-only">(required)</span>
        </>
      )}
    </>
  );

  return grouped ? (
    <fieldset className={className}>
      <legend className="q-text">{legend}</legend>
      {control}
      {error && <p className="q-error" role="alert">{error}</p>}
    </fieldset>
  ) : (
    <div className={className}>
      <label className="q-text" htmlFor={`q-${question.id}`}>{legend}</label>
      {control}
      {error && <p className="q-error" role="alert">{error}</p>}
    </div>
  );
}

/* ══ the six ═══════════════════════════════════════════════════════════════
   Two internals are shared below, and each pair earns it: design_specs/design/05 §5.3
   defines rating/NPS and single/multi as the SAME control with one difference. Written
   twice, that one difference quietly becomes three.                                    */

export function RatingInput({
  question, config, value, onChange, readOnly,
}: Sub<Extract<QuestionConfig, { kind: 'rating' }>>): JSX.Element {
  return (
    <Scale
      name={question.id}
      from={1}
      to={config.max}
      lowLabel={config.lowLabel}
      highLabel={config.highLabel}
      selected={value?.kind === 'rating' ? value.n : undefined}
      readOnly={readOnly}
      onPick={(n) => onChange({ kind: 'rating', n })}
    />
  );
}

/**
 * Fixed 0–10 with fixed anchors. NPS is a defined instrument; a configurable one is a
 * rating scale wearing its name (DEC-010), which is why this takes no config at all.
 */
export function NpsInput({ question, value, onChange, readOnly }: Sub<never>): JSX.Element {
  return (
    <Scale
      name={question.id}
      from={0}
      to={10}
      lowLabel="Not at all likely"
      highLabel="Extremely likely"
      selected={value?.kind === 'nps' ? value.n : undefined}
      readOnly={readOnly}
      banded
      onPick={(n) => onChange({ kind: 'nps', n })}
    />
  );
}

export function SingleChoiceInput({
  question, config, value, onChange, readOnly,
}: Sub<Extract<QuestionConfig, { kind: 'single' }>>): JSX.Element {
  const picked = value?.kind === 'single' ? value.option : undefined;
  const known = config.options.includes(picked ?? '');
  // "Other" holds whatever was typed, so the answer is the text itself rather than the
  // literal word "Other" — a results screen full of "Other" tells nobody anything.
  const other = !known && picked !== undefined ? picked : '';

  return (
    <div className="q-options">
      {config.options.map((option) => (
        <label className="q-option" key={option}>
          <input
            type="radio"
            name={`q-${question.id}`}
            checked={picked === option}
            disabled={readOnly}
            onChange={() => onChange({ kind: 'single', option })}
          />
          <span className="q-dot" aria-hidden="true" />
          <span>{option}</span>
        </label>
      ))}

      {config.allowOther && (
        <label className="q-option q-option-other">
          <input
            type="radio"
            name={`q-${question.id}`}
            checked={!known && picked !== undefined}
            disabled={readOnly}
            onChange={() => onChange({ kind: 'single', option: other })}
          />
          <span className="q-dot" aria-hidden="true" />
          <span className="sr-only">Other</span>
          <input
            type="text"
            className="input q-other-text"
            placeholder="Other"
            value={other}
            disabled={readOnly}
            onChange={(event) => onChange({ kind: 'single', option: event.target.value })}
          />
        </label>
      )}
    </div>
  );
}

export function MultiChoiceInput({
  question, config, value, onChange, readOnly,
}: Sub<Extract<QuestionConfig, { kind: 'multi' }>>): JSX.Element {
  const selected = value?.kind === 'multi' ? value.options : [];
  const max = config.maxSelections;
  const full = max !== undefined && selected.length >= max;

  return (
    <div className="q-options">
      {config.options.map((option) => {
        const checked = selected.includes(option);
        return (
          <label className="q-option" key={option}>
            <input
              type="checkbox"
              name={`q-${question.id}`}
              checked={checked}
              // Once the cap is reached the UNPICKED rows stop responding, and the line
              // below says why. Silently ignoring the tap would read as a broken control.
              disabled={readOnly || (full && !checked)}
              onChange={() =>
                onChange({
                  kind: 'multi',
                  options: checked ? selected.filter((o) => o !== option) : [...selected, option],
                })
              }
            />
            <span className="q-dot q-dot-square" aria-hidden="true" />
            <span>{option}</span>
          </label>
        );
      })}
      {max !== undefined && (
        <p className="q-help text-meta">
          Choose up to {max}.{full ? ' That is all of them.' : ''}
        </p>
      )}
    </div>
  );
}

export function YesNoInput({ question, value, onChange, readOnly }: Sub<never>): JSX.Element {
  const picked = value?.kind === 'yesno' ? value.yes : undefined;
  return (
    <div className="q-yesno">
      {[true, false].map((yes) => (
        <label className={`q-pill${picked === yes ? ' is-picked' : ''}`} key={String(yes)}>
          <input
            type="radio"
            name={`q-${question.id}`}
            checked={picked === yes}
            disabled={readOnly}
            onChange={() => onChange({ kind: 'yesno', yes })}
          />
          <span>{yes ? 'Yes' : 'No'}</span>
        </label>
      ))}
    </div>
  );
}

/** Past 200 characters a counter appears. Before that it is a distraction (05 §5.3). */
const COUNTER_AT = 200;
const TEXT_MAX = 2000;

export function TextInput({
  question, config, value, onChange, readOnly,
}: Sub<Extract<QuestionConfig, { kind: 'text' }>>): JSX.Element {
  const text = value?.kind === 'text' ? value.text : '';
  const shared = {
    id: `q-${question.id}`,
    className: 'input q-text-input',
    // Not decoration: anything under 16px makes iOS Safari zoom on focus, which visibly
    // breaks the layout in front of the room (39). The class carries it; this is the note.
    placeholder: config.placeholder ?? 'Your answer',
    value: text,
    maxLength: TEXT_MAX,
    disabled: readOnly,
    onChange: (event: { target: { value: string } }) =>
      onChange({ kind: 'text', text: event.target.value }),
  };

  return (
    <>
      {config.multiline ? <textarea {...shared} rows={3} /> : <input type="text" {...shared} />}
      {text.length > COUNTER_AT && (
        <p className="q-help text-meta">{text.length} / {TEXT_MAX}</p>
      )}
    </>
  );
}

/* ══ shared internals ══════════════════════════════════════════════════════ */

type Sub<C> = {
  question: Question;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  readOnly: boolean;
} & ([C] extends [never] ? { config?: undefined } : { config: C });

/**
 * The circle row behind rating and NPS.
 *
 * NOT a slider on any width. 39 is explicit: a slider is unusable one-handed and makes an
 * exact answer impossible, and the numbers are the thing being asked for.
 *
 * The anchors are announced through the END radios' own labels rather than a `describedby`
 * on the group, because that is where they mean something — "1, Poor" is what the person
 * choosing 1 needs to hear, and repeating both anchors on all ten is noise.
 */
function Scale({
  name, from, to, lowLabel, highLabel, selected, readOnly, banded = false, onPick,
}: {
  name: string;
  from: number;
  to: number;
  lowLabel: string;
  highLabel: string;
  selected: number | undefined;
  readOnly: boolean;
  /** NPS only: a quiet hint at how the score is read, without pre-judging the answer. */
  banded?: boolean;
  onPick: (n: number) => void;
}): JSX.Element {
  const points = Array.from({ length: to - from + 1 }, (_, index) => from + index);
  return (
    <div className={`q-scale${banded ? ' is-banded' : ''}${points.length > 6 ? ' is-wide' : ''}`}>
      <div className="q-scale-row">
        {points.map((n) => (
          <label
            className={`q-point${selected === n ? ' is-picked' : ''}${banded ? ` band-${band(n)}` : ''}`}
            key={n}
          >
            <input
              type="radio"
              name={`q-${name}`}
              checked={selected === n}
              disabled={readOnly}
              onChange={() => onPick(n)}
              aria-label={n === from ? `${n} — ${lowLabel}` : n === to ? `${n} — ${highLabel}` : String(n)}
            />
            <span aria-hidden="true">{n}</span>
          </label>
        ))}
      </div>
      <div className="q-anchors" aria-hidden="true">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

/** NPS bands, as the score is actually read: detractor · passive · promoter. */
const band = (n: number): string => (n <= 6 ? 'bad' : n <= 8 ? 'mid' : 'good');
