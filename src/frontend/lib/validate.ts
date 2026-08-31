// Client-side field validation, from the SAME schema the server validates with. 14 §1.
//
// WHY THIS EXISTS. `/start` let a person type digits into every field, press Continue, choose
// a plan, run the checkout, and only THEN meet a 422 telling them to go back and fix a name.
// The registration and the capture are one transaction so nothing was actually charged and
// nothing was actually created — but the reader had no way to know that, and the product had
// just taken them through a payment screen to reject them.
//
// IT RUNS THE DTO, NOT A COPY OF IT. `packages/shared` exists so there is one source of truth
// across client and server, and a second set of rules written in React is how that stops being
// true: the copy drifts, the server stays right, and the difference shows up as a field the UI
// swears is fine and the API refuses. Everything here takes a Zod schema and gives back the
// same `path -> message` shape `ApiError.fieldError` already produces, so a form renders one
// kind of error whether it came from here or from a 422.
//
// IT IS NOT THE RULE. The server validates every request regardless (`middleware/validate.ts`),
// which is what INV-003 requires — this only decides when to bother the person. A caller that
// skipped it would be refused exactly as before.
import { useCallback, useState } from 'react';
import type { z } from 'zod';

/** `path -> message`, flattened the way `ApiError.fields` already is. */
export type FieldErrors = Record<string, string>;

/**
 * Run a schema and collect the first message per field.
 *
 * FIRST, NOT ALL. Zod reports every failing rule on a field — `"This cannot be empty."` and
 * `"…needs at least one letter."` for the same empty box — and stacking two sentences under one
 * input tells the reader they made two mistakes when they made none yet.
 *
 * The path is joined with `.` so a nested field reads `roles.0.name`, which is what the
 * server's own 422 says about the same value.
 */
export function fieldErrorsOf(schema: z.ZodTypeAny, value: unknown): FieldErrors {
  const result = schema.safeParse(value);
  if (result.success) return {};

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    if (!(path in errors)) errors[path] = issue.message;
  }
  return errors;
}

/** `true` when the value satisfies the schema. For a submit button, not for a decision. */
export const isValid = (schema: z.ZodTypeAny, value: unknown): boolean =>
  schema.safeParse(value).success;

export type FormValidation = {
  /** What to render under each input. Empty until the form has been submitted once. */
  errors: FieldErrors;
  /**
   * Validate, store the messages, and say whether to proceed.
   *
   * ON SUBMIT, NOT ON EVERY KEYSTROKE, and that is the decision this hook encodes. A name is
   * invalid for as long as it takes to type the first letter of it; telling somebody so while
   * their finger is still on the `S` of `Sanjay` is the product shouting at them for doing the
   * thing it asked. `26` § Forms says an error appears when a person has finished with a field
   * — pressing the button is the clearest possible signal that they have.
   */
  check: (value: unknown) => boolean;
  /**
   * Drop the message for one field. Called on change, so an error the reader is visibly
   * fixing disappears as they fix it rather than sitting there contradicting the screen.
   */
  clear: (path: string) => void;
  reset: () => void;
};

export function useFormValidation(schema: z.ZodTypeAny): FormValidation {
  const [errors, setErrors] = useState<FieldErrors>({});

  const check = useCallback(
    (value: unknown): boolean => {
      const next = fieldErrorsOf(schema, value);
      setErrors(next);
      return Object.keys(next).length === 0;
    },
    [schema],
  );

  const clear = useCallback((path: string) => {
    setErrors((current) => {
      if (!(path in current)) return current;
      const next = { ...current };
      delete next[path];
      return next;
    });
  }, []);

  const reset = useCallback(() => setErrors({}), []);

  return { errors, check, clear, reset };
}
