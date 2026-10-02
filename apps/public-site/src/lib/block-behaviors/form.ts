import {
  type ConditionalFormField,
  visibleFormFieldIds,
} from '@kometio/shared-types/form-conditions';
import type { BlockBehavior } from './types';

// Idempotency guard: re-running this would attach a second set of
// prev/next/submit listeners to the same form. See
// run-block-behaviors.ts.
const INITIALIZED_ATTR = 'data-kometio-form-initialized';

// One step's <div> visible at a time via the hidden attribute,
// Indietro/Avanti walk the index. Every step's markup stays in the DOM the
// whole time (all fields submit together in one POST at the end, unchanged
// from a flat form); only the currently-visible one is ever validated/
// interactive.
//
// A no-op for a plain single-step form: querySelectorAll('.kometio-form__step')
// finds nothing, the early return below skips the rest for that form.
function wireMultiStepForm(form: HTMLElement): void {
  if (
    !(form instanceof HTMLFormElement) ||
    form.hasAttribute(INITIALIZED_ATTR)
  ) {
    return;
  }

  const steps = Array.from(
    form.querySelectorAll<HTMLElement>('.kometio-form__step'),
  );
  if (steps.length === 0) return;
  form.setAttribute(INITIALIZED_ATTR, '');

  const prevButton = form.querySelector<HTMLButtonElement>('[data-step-prev]');
  const nextButton = form.querySelector<HTMLButtonElement>('[data-step-next]');
  const submitButton =
    form.querySelector<HTMLButtonElement>('[data-step-submit]');
  const indicator = form.querySelector<HTMLElement>('[data-step-indicator]');
  let current = 0;

  function render() {
    steps.forEach((step, index) => {
      step.hidden = index !== current;
    });
    if (prevButton) prevButton.hidden = current === 0;
    if (nextButton) nextButton.hidden = current === steps.length - 1;
    if (submitButton) submitButton.hidden = current !== steps.length - 1;
    if (indicator) {
      const template = indicator.dataset.stepIndicatorTemplate ?? '';
      indicator.textContent = template
        .replace('{current}', String(current + 1))
        .replace('{total}', String(steps.length));
    }
  }

  // Runs the browser's own constraint validation (required, type=email,
  // etc.) on just the step being left, reporting the first failure with
  // the native bubble UI — a required field in an earlier, now-hidden
  // step would otherwise never be checked at all, since browsers skip
  // validating anything inside a hidden element on the final submit.
  function currentStepIsValid(): boolean {
    const fields =
      steps[current]?.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >('input, textarea, select') ?? [];
    for (const field of fields) {
      if (!field.reportValidity()) return false;
    }
    return true;
  }

  function goToNextStep() {
    if (!currentStepIsValid()) return;
    current = Math.min(current + 1, steps.length - 1);
    render();
  }

  nextButton?.addEventListener('click', goToNextStep);
  prevButton?.addEventListener('click', () => {
    current = Math.max(current - 1, 0);
    render();
  });

  // Pressing Enter in a text field fires a real `submit` event — same as
  // clicking the (possibly hidden) submit button — regardless of which
  // field triggered it and regardless of the submit button's own hidden
  // state; confirmed empirically, not assumed. Intercepted here instead
  // of relying on the submit button being unreachable, so Enter on any
  // step but the last one just advances a step, exactly like clicking
  // Avanti, rather than submitting mid-wizard.
  form.addEventListener('submit', (event) => {
    if (current !== steps.length - 1) {
      event.preventDefault();
      goToNextStep();
    }
  });

  render();
}

const CONDITIONS_INITIALIZED_ATTR = 'data-kometio-form-conditions-initialized';

/** The answers as the submission would carry them: a box is true or false, anything else its value, a chosen file just "there". */
function currentAnswers(form: HTMLFormElement): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const control of Array.from(form.elements)) {
    if (
      !(
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) ||
      control.name === '' ||
      control.name.startsWith('_')
    ) {
      continue;
    }
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      answers[control.name] = control.checked;
    } else if (control instanceof HTMLInputElement && control.type === 'file') {
      answers[control.name] = control.files?.length ? {} : undefined;
    } else {
      answers[control.name] = control.value;
    }
  }
  return answers;
}

function isConditionalField(value: unknown): value is ConditionalFormField {
  if (typeof value !== 'object' || value === null) return false;
  if (!('id' in value) || typeof value.id !== 'string') return false;
  if (!('showWhen' in value)) return false;
  const condition = value.showWhen;
  if (condition === null) return true;
  return (
    typeof condition === 'object' &&
    'fieldId' in condition &&
    typeof condition.fieldId === 'string' &&
    'equals' in condition &&
    (condition.equals === null || typeof condition.equals === 'string')
  );
}

/**
 * Shows each field whose condition is met and hides the rest, on every
 * answer — the same rule the server applies to the submission
 * (visibleFormFieldIds), so the two cannot disagree about what was asked.
 *
 * A hidden field is disabled as well as hidden: the browser neither
 * validates nor submits a disabled control, so a required field the
 * visitor cannot see never blocks the form, and an answer given before the
 * condition changed is not sent.
 */
function wireConditionalFields(element: HTMLElement): void {
  if (
    !(element instanceof HTMLFormElement) ||
    element.hasAttribute(CONDITIONS_INITIALIZED_ATTR)
  ) {
    return;
  }
  const form = element;
  const raw = form.dataset.kometioFormConditions;
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;
  const fields = parsed.filter(isConditionalField);
  form.setAttribute(CONDITIONS_INITIALIZED_ATTR, '');

  function apply() {
    const visible = visibleFormFieldIds(fields, currentAnswers(form));
    for (const field of fields) {
      if (!field.showWhen) continue;
      const wrapper = form.querySelector<HTMLElement>(
        `[data-kometio-form-field="${CSS.escape(field.id)}"]`,
      );
      if (!wrapper) continue;
      const shown = visible.has(field.id);
      wrapper.hidden = !shown;
      for (const control of Array.from(
        wrapper.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >('input, select, textarea'),
      )) {
        control.disabled = !shown;
      }
    }
  }

  form.addEventListener('input', apply);
  form.addEventListener('change', apply);
  apply();
}

export const formBehaviors: BlockBehavior[] = [
  { selector: '.kometio-form form', wire: wireMultiStepForm },
  { selector: '.kometio-form form', wire: wireConditionalFields },
];
