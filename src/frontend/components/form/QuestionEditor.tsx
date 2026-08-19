// <QuestionEditor> × 6 — 24 §5, design_specs/design/05 §5.3, 37 § The six types.
//
// The authoring half of the form engine. Its mirror is `QuestionInput.tsx`, the six
// RESPONDENT controls, and the two files are deliberately laid out the same way — one
// dispatcher switching on `config.kind`, six named renderers beneath it — because the thing
// most likely to go wrong here is the two drifting apart. `24` §5 suggested six files so
// two people could take three each; one pair of parallel files is easier to keep in step
// than twelve, and nobody is splitting them three each.
//
// SIX. NOT SEVEN (DEC-010). The type select is where scope creep enters, which is why the
// kind map lives in `kinds.ts` with no default branch: a seventh kind fails to compile.
import type { QuestionConfig } from '@endur/shared';
import { Icon } from '../Icon.js';
import { Toggle } from './Toggle.js';
import type { QuestionDraft } from './kinds.js';

/** The DTO's own cap. Ten options is already a scroll on a phone (39). */
const MAX_OPTIONS = 10;
/** The DTO's own floor: a one-option choice is not a choice. */
const MIN_OPTIONS = 2;

type Props = {
  question: QuestionDraft;
  onChange: (question: QuestionDraft) => void;
  /** A template used by a launched campaign is read-only, with a banner rather than
   *  silently dead controls (37 § States). The banner is the builder's; this is the half
   *  that stops the controls accepting input. */
  readOnly?: boolean | undefined;
};

export function QuestionEditor({ question, onChange, readOnly = false }: Props): JSX.Element {
  // Switched on `config.kind` for the same reason the inputs are: only the config's own
  // discriminant narrows the union, and narrowing is what keeps each branch typed.
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

/* ══ the six ═══════════════════════════════════════════════════════════════ */

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

/**
 * Nothing to configure, and this says WHY rather than "no settings".
 *
 * NPS is a defined instrument: 0–10 with those two anchors is what makes a score
 * comparable to anybody else's. An editor that let you change them would be a rating scale
 * wearing the name, which is exactly the thing DEC-010 froze the list to prevent.
 */
export function NpsEditor(): JSX.Element {
  return (
    <p className="qe-none text-meta">
      Fixed 0 – 10, anchored “Not at all likely” to “Extremely likely”. Those are what make an
      NPS score comparable; use a rating scale if you want your own wording.
    </p>
  );
}

/** `24` §5 fixes this copy: an empty body reads as a control that failed to render. */
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
          // Dropping the key rather than setting it to 0 or null: the DTO says "optional
          // positive integer", and `maxSelections: 0` would mean "choose none".
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
            // Empty means ABSENT, not an empty string: the respondent input falls back to
            // "Your answer", and storing "" would silently remove that fallback.
            const { placeholder: _drop, ...rest } = config;
            onConfig(placeholder ? { ...rest, placeholder } : rest);
          }}
        />
      </label>
    </div>
  );
}

/* ══ shared internal ═══════════════════════════════════════════════════════ */

/**
 * The option list behind single and multi.
 *
 * One implementation, because `design_specs/design/05` §5.3 defines multi choice as
 * "identical to single choice with a square dot". Two implementations of a list that only
 * differs by a border radius is how they end up differing by more.
 *
 * "Add option" is a dashed-outline row rather than a button — straight from the mockup, and
 * right: it sits in the list where the new option will appear, so it reads as the next row
 * rather than as a command.
 */
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
        // Index as key, deliberately: the option's own text is the thing being edited, so
        // keying on it re-mounts the input on every keystroke and the caret jumps to the end.
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
            // Below two there is nothing to choose between, which is the DTO's own floor —
            // and a control that lets you build something the server rejects is a trap.
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
