import type { QuestionConfig } from '@endur/shared';
import { Icon } from '../Icon.js';
import { Toggle } from './Toggle.js';
import type { QuestionDraft } from './kinds.js';

const MAX_OPTIONS = 10;
const MIN_OPTIONS = 2;

type Props = {
  question: QuestionDraft;
  onChange: (question: QuestionDraft) => void;
  readOnly?: boolean | undefined;
};

export function QuestionEditor({ question, onChange, readOnly = false }: Props): JSX.Element {
  const config = question.config;
  const set = (next: QuestionConfig): void => onChange({ ...question, config: next });

  switch (config.kind) {
    case 'rating':
      return <RatingEditor config={config} onConfig={set} readOnly={readOnly} />;
    case 'nps':
      return <NpsEditor />;
    case 'single':
      return <SingleChoiceEditor config={config} onConfig={set} readOnly={readOnly} />;
    case 'multi':
      return <MultiChoiceEditor config={config} onConfig={set} readOnly={readOnly} />;
    case 'yesno':
      return <YesNoEditor />;
    case 'text':
      return <TextEditor config={config} onConfig={set} readOnly={readOnly} />;
  }
}

type Sub<K extends QuestionConfig['kind']> = {
  config: Extract<QuestionConfig, { kind: K }>;
  onConfig: (config: QuestionConfig) => void;
  readOnly: boolean;
};

export function RatingEditor({ config, onConfig, readOnly }: Sub<'rating'>): JSX.Element {
  return (
    <div className="qe">
      <label className="qe-field">
        <span>Scale</span>
        <select
          className="input"
          value={config.max}
          disabled={readOnly}
          onChange={(event) => onConfig({ ...config, max: event.target.value === '10' ? 10 : 5 })}
        >
          <option value="5">1 – 5</option>
          <option value="10">1 – 10</option>
        </select>
      </label>

      {/* Both anchors, always. A scale with one end labelled is a scale nobody can read
          the middle of. */}
      <label className="qe-field">
        <span>Low label</span>
        <input
          className="input"
          value={config.lowLabel}
          maxLength={40}
          disabled={readOnly}
          onChange={(event) => onConfig({ ...config, lowLabel: event.target.value })}
        />
      </label>

      <label className="qe-field">
        <span>High label</span>
        <input
          className="input"
          value={config.highLabel}
          maxLength={40}
          disabled={readOnly}
          onChange={(event) => onConfig({ ...config, highLabel: event.target.value })}
        />
      </label>
    </div>
  );
}

export function NpsEditor(): JSX.Element {
  return (
    <p className="qe-none text-meta">
      Fixed 0 – 10, anchored “Not at all likely” to “Extremely likely”. Those are what make an
      NPS score comparable; use a rating scale if you want your own wording.
    </p>
  );
}

export function YesNoEditor(): JSX.Element {
  return <p className="qe-none text-meta">No settings for this type.</p>;
}

export function SingleChoiceEditor({ config, onConfig, readOnly }: Sub<'single'>): JSX.Element {
  return (
    <div className="qe">
      <Options
        options={config.options}
        readOnly={readOnly}
        onOptions={(options) => onConfig({ ...config, options })}
      />
      <Toggle
        checked={config.allowOther}
        disabled={readOnly}
        onChange={(allowOther) => onConfig({ ...config, allowOther })}
        label="Allow “Other”"
        hint="Adds a row somebody can type into. Their words are the answer, not the word “Other”."
      />
    </div>
  );
}

export function MultiChoiceEditor({ config, onConfig, readOnly }: Sub<'multi'>): JSX.Element {
  const limited = config.maxSelections !== undefined;
  return (
    <div className="qe">
      <Options
        options={config.options}
        square
        readOnly={readOnly}
        onOptions={(options) => onConfig({ ...config, options })}
      />
      <Toggle
        checked={limited}
        disabled={readOnly}
        onChange={(on) => {
          const { maxSelections: _drop, ...rest } = config;
          onConfig(on ? { ...rest, maxSelections: 2 } : rest);
        }}
        label="Limit how many can be chosen"
      />
      {limited && (
        <label className="qe-field">
          <span>At most</span>
          <input
            className="input qe-number"
            type="number"
            min={1}
            max={config.options.length}
            value={config.maxSelections}
            disabled={readOnly}
            onChange={(event) =>
              onConfig({ ...config, maxSelections: Math.max(1, Number(event.target.value) || 1) })
            }
          />
        </label>
      )}
    </div>
  );
}

export function TextEditor({ config, onConfig, readOnly }: Sub<'text'>): JSX.Element {
  return (
    <div className="qe">
      <div className="segmented" role="radiogroup" aria-label="Answer length">
        {[
          { key: false, label: 'Short answer' },
          { key: true, label: 'Paragraph' },
        ].map((option) => (
          <label className={`segment${config.multiline === option.key ? ' is-active' : ''}`} key={option.label}>
            <input
              type="radio"
              name="text-length"
              checked={config.multiline === option.key}
              disabled={readOnly}
              onChange={() => onConfig({ ...config, multiline: option.key })}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>

      <label className="qe-field">
        <span>Placeholder (optional)</span>
        <input
          className="input"
          value={config.placeholder ?? ''}
          maxLength={80}
          placeholder="Your answer"
          disabled={readOnly}
          onChange={(event) => {
            const placeholder = event.target.value;
            const { placeholder: _drop, ...rest } = config;
            onConfig(placeholder ? { ...rest, placeholder } : rest);
          }}
        />
      </label>
    </div>
  );
}

function Options({
  options,
  onOptions,
  readOnly,
  square = false,
}: {
  options: string[];
  onOptions: (options: string[]) => void;
  readOnly: boolean;
  square?: boolean;
}): JSX.Element {
  const replace = (index: number, value: string): void =>
    onOptions(options.map((option, at) => (at === index ? value : option)));

  return (
    <div className="qe-options">
      {options.map((option, index) => (
        <div className="qe-option" key={index}>
          <span className={`q-dot${square ? ' q-dot-square' : ''}`} aria-hidden="true" />
          <input
            className="input"
            value={option}
            maxLength={120}
            aria-label={`Option ${index + 1}`}
            disabled={readOnly}
            onChange={(event) => replace(index, event.target.value)}
          />
          <button
            type="button"
            className="btn btn-icon"
            disabled={readOnly || options.length <= MIN_OPTIONS}
            onClick={() => onOptions(options.filter((_, at) => at !== index))}
          >
            <Icon name="delete" size={16} label={`Remove option ${index + 1}`} />
          </button>
        </div>
      ))}

      {options.length < MAX_OPTIONS && !readOnly && (
        <button
          type="button"
          className="qe-add"
          onClick={() => onOptions([...options, ''])}
        >
          <span className={`q-dot${square ? ' q-dot-square' : ''}`} aria-hidden="true" />
          Add option
        </button>
      )}
      {options.length >= MAX_OPTIONS && (
        <p className="qe-none text-meta">
          Ten is the most. Past that a choice question is a reading exercise.
        </p>
      )}
    </div>
  );
}
