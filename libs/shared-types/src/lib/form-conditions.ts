import type { FormField } from './form-fields';

/**
 * Which fields of a form are showing, given the answers so far — the one
 * rule the public form, the submission check and the editor all read.
 *
 * A field with a `showWhen` shows only while the field it names has the
 * answer it asks for: `equals` for a select's option, or `null` for "any
 * answer" (a ticked box, a non-empty value). A field that is not showing
 * is never required and its value is never kept: someone cannot be asked
 * for, or be held to, an answer to a question they were never shown.
 *
 * The field a condition names must come earlier in the form (see
 * `formConditionProblems`), so one pass in order settles everything,
 * chains included: a field that depends on a hidden field is hidden too,
 * because a hidden field counts as unanswered.
 *
 * No zod here, on purpose: the public site runs this in the browser from
 * `@kometio/shared-types/form-conditions`, and the schemas it would drag in
 * weigh more than every form on a page together.
 */
export type ConditionalFormField = Pick<FormField, 'id' | 'showWhen'>;

export function visibleFormFieldIds(
  fields: readonly ConditionalFormField[],
  values: Readonly<Record<string, unknown>>,
): Set<string> {
  const visible = new Set<string>();
  for (const field of fields) {
    const condition = field.showWhen;
    if (!condition) {
      visible.add(field.id);
      continue;
    }
    if (!visible.has(condition.fieldId)) continue;
    const answer = values[condition.fieldId];
    const met =
      condition.equals === null
        ? isAnswered(answer)
        : answer === condition.equals;
    if (met) visible.add(field.id);
  }
  return visible;
}

/** A ticked box, a non-blank string, an uploaded file (`{ url, filename }`). */
function isAnswered(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'boolean') return value;
  return value !== null && value !== undefined;
}

export type FormConditionProblem =
  | 'unknown-field'
  | 'not-earlier'
  | 'self'
  | 'unknown-option'
  | 'equals-needs-select';

/**
 * What is wrong with each condition in a form, if anything — keyed by the
 * id of the field that carries it. Refused on save by the API and shown in
 * the editor, rather than tolerated at render time: a condition naming a
 * field that is not there hides its field for good, and nobody would know
 * why.
 */
export function formConditionProblems(
  fields: readonly Pick<FormField, 'id' | 'type' | 'options' | 'showWhen'>[],
): Map<string, FormConditionProblem> {
  const problems = new Map<string, FormConditionProblem>();
  fields.forEach((field, index) => {
    const condition = field.showWhen;
    if (!condition) return;
    if (condition.fieldId === field.id) {
      problems.set(field.id, 'self');
      return;
    }
    const controllerIndex = fields.findIndex(
      (candidate) => candidate.id === condition.fieldId,
    );
    // -1, no field with that id, reads as no field at all.
    const controller = fields[controllerIndex];
    if (controller === undefined) {
      problems.set(field.id, 'unknown-field');
      return;
    }
    if (controllerIndex > index) {
      problems.set(field.id, 'not-earlier');
      return;
    }
    if (condition.equals === null) return;
    if (controller.type !== 'select') {
      problems.set(field.id, 'equals-needs-select');
      return;
    }
    if (!(controller.options ?? []).includes(condition.equals)) {
      problems.set(field.id, 'unknown-option');
    }
  });
  return problems;
}
