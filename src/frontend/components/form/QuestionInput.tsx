import type { AnswerValue, QuestionConfig, QuestionKind } from '@endur/shared';

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
  readOnly?: boolean | undefined;
};

export function QuestionInput({ question, value, onChange, error, readOnly = false }: Props): JSX.Element {
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

const COUNTER_AT = 200;
const TEXT_MAX = 2000;

export function TextInput({
  question, config, value, onChange, readOnly,
}: Sub<Extract<QuestionConfig, { kind: 'text' }>>): JSX.Element {
  const text = value?.kind === 'text' ? value.text : '';
  const shared = {
    id: `q-${question.id}`,
    className: 'input q-text-input',
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

type Sub<C> = {
  question: Question;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  readOnly: boolean;
} & ([C] extends [never] ? { config?: undefined } : { config: C });

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

const band = (n: number): string => (n <= 6 ? 'bad' : n <= 8 ? 'mid' : 'good');
