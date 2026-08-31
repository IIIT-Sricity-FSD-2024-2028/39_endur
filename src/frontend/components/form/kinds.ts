// Changing a question's type. 37 § Interactions, design_specs/design/05 §5.3.
//
// A pure module, and for the same reason `Structure/consequence.ts` is one: the rule here is
// "preserve what can be preserved, warn ONCE about what cannot", and a rule assembled inside
// a select's onChange is one nobody can check without rendering a builder.
//
// The six kinds are FROZEN (DEC-010). A seventh means superseding that decision in
// `_MEMORY.md`, not adding a line to the map below — and the map is deliberately exhaustive
// so a seventh kind fails to compile rather than falling through to a default.
import type { QuestionConfig, QuestionKind, QuestionInput as QuestionDraft } from '@endur/shared';

export type { QuestionDraft };

/** What the select shows. Structural words: a hotel does not rename "Rating scale". */
export const KIND_LABELS: Record<QuestionKind, string> = {
  rating: 'Rating scale',
  nps: 'NPS',
  single: 'Single choice',
  multi: 'Multi choice',
  yesno: 'Yes / No',
  text: 'Free text',
};

/**
 * Grouped, because six ungrouped options read as a list of unrelated things (37). The
 * groups are also the honest taxonomy: two ways to ask for a number, three ways to ask for
 * a choice, one way to ask for words.
 */
export const KIND_GROUPS: Array<{ group: string; kinds: QuestionKind[] }> = [
  { group: 'Scales', kinds: ['rating', 'nps'] },
  { group: 'Choice', kinds: ['single', 'multi', 'yesno'] },
  { group: 'Text', kinds: ['text'] },
];

/** Two options, because the DTO's minimum is two — a one-option choice is not a choice. */
const STARTER_OPTIONS = ['Option 1', 'Option 2'];

/** The options a kind carries, or null when it carries none. The only lossy axis. */
export function optionsOf(config: QuestionConfig): string[] | null {
  return config.kind === 'single' || config.kind === 'multi' ? config.options : null;
}

/** Custom anchor labels, or null. Lossy in one direction only: rating → anything. */
const anchorsOf = (config: QuestionConfig): [string, string] | null =>
  config.kind === 'rating' ? [config.lowLabel, config.highLabel] : null;

export function defaultConfig(kind: QuestionKind, options?: string[] | null): QuestionConfig {
  switch (kind) {
    // 1-5 rather than 1-10 by default: a five-point scale is answerable at a glance, and
    // the ten-point one exists for the people who ask for it rather than as the norm.
    case 'rating':
      return { kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Excellent' };
    case 'nps':
      return { kind: 'nps' };
    case 'single':
      return { kind: 'single', options: options ?? [...STARTER_OPTIONS], allowOther: false };
    case 'multi':
      return { kind: 'multi', options: options ?? [...STARTER_OPTIONS] };
    case 'yesno':
      return { kind: 'yesno' };
    case 'text':
      return { kind: 'text', multiline: false };
  }
}

export type KindChange = {
  question: QuestionDraft;
  /**
   * One sentence, or absent. Shown ONCE, before the change is applied — after it, the
   * options are gone and an apology is not a warning.
   */
  warning?: string;
};

/**
 * Change a question's type, keeping everything the new type can hold.
 *
 * The text always survives — it is the part somebody typed and thought about, and losing it
 * because they picked the wrong control first would make the select a thing people avoid.
 * Options survive across single ↔ multi, which is the switch people actually make.
 */
export function changeKind(question: QuestionDraft, kind: QuestionKind): KindChange {
  if (kind === question.kind) return { question };

  const options = optionsOf(question.config);
  const anchors = anchorsOf(question.config);
  const keepsOptions = kind === 'single' || kind === 'multi';

  const next: QuestionDraft = {
    ...question,
    kind,
    config: defaultConfig(kind, keepsOptions ? options : null),
  };

  if (options && !keepsOptions) {
    return {
      question: next,
      warning: `Changing to ${KIND_LABELS[kind]} removes the ${options.length} option${options.length === 1 ? '' : 's'}.`,
    };
  }

  // Not in 37's letter, which names only options — but it is the same class of loss, and
  // hand-written anchors are hand-written work. NPS's anchors are fixed by definition; a
  // rating's are not, and silently replacing them is the kind of thing found later.
  if (anchors && (anchors[0] !== 'Poor' || anchors[1] !== 'Excellent')) {
    return {
      question: next,
      warning: `Changing to ${KIND_LABELS[kind]} replaces your labels "${anchors[0]}" and "${anchors[1]}".`,
    };
  }

  return { question: next };
}
