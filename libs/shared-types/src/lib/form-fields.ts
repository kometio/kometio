import { z } from 'zod';
import { formConditionProblems } from './form-conditions';

/**
 * A form's field definitions — shared between the admin form builder
 * (editor-app), the public-facing renderer (apps/public-site, which
 * fetches a form's fields live at render time, see docs/adr/0015) and
 * submission validation (the payload must match these field ids/types).
 * Curated on purpose: steps (multi-page forms) and one show-when
 * condition per field (see form-conditions.ts) are the only logic a form
 * carries.
 */
export const formFieldTypeSchema = z.enum([
  'text',
  'email',
  'textarea',
  'tel',
  'checkbox',
  'select',
  // Renders and submits exactly like a checkbox (Form.astro) — the only
  // difference is submitForm's own handling: if checked, the submission's
  // email (the form's first `email`-typed field) gets subscribed via
  // NewsletterPort. Not a separate value shape, just a marker on an
  // otherwise-ordinary checkbox field.
  'newsletter-consent',
  // Two separate types, not one combined "datetime" — a booking form
  // might want just a time slot, an event RSVP just a date; each maps to
  // its own native <input type="date"|"time"> (Form.astro), no picker
  // library needed.
  'date',
  'time',
  // Submits as `{ url, filename }` (formFieldFileValueSchema below), not a
  // plain string like every other field type — uploaded separately, before
  // the main submission JSON POST (apps/public-site's submit proxy),
  // through AttachmentStoragePort (raw byte storage, no image processing —
  // see @kometio/ports' own comment on that port for why this can't reuse
  // MediaStoragePort, which is dedicated to the curated, image-only media
  // library).
  'file',
]);
export type FormFieldType = z.infer<typeof formFieldTypeSchema>;

/** The value shape a submitted `file`-typed field carries in a submission's payload — see formFieldTypeSchema's own comment on `'file'`. */
export const formFieldFileValueSchema = z.object({
  url: z.string(),
  filename: z.string(),
});
export type FormFieldFileValue = z.infer<typeof formFieldFileValueSchema>;

/** The url of every file a submission's payload names: one per `file` answer. */
export function fileUrlsOf(
  payload: Readonly<Record<string, unknown>>,
): string[] {
  return Object.values(payload).flatMap((value) => {
    const file = formFieldFileValueSchema.safeParse(value);
    return file.success ? [file.data.url] : [];
  });
}

/**
 * "Show this field only when that one has this answer" — one condition per
 * field. `equals` is a select's option; `null` means any answer at all (a
 * ticked box, a non-empty value). See form-conditions.ts for the rule.
 */
export const formFieldConditionSchema = z.object({
  fieldId: z.string(),
  equals: z.string().nullable(),
});
export type FormFieldCondition = z.infer<typeof formFieldConditionSchema>;

export const formFieldSchema = z.object({
  // Stable per-field id, independent of display order — this is the key
  // a submission's payload is keyed by, so reordering fields in the
  // builder never silently remaps past submissions to the wrong field.
  id: z.string(),
  label: z.string().min(1),
  type: formFieldTypeSchema,
  required: z.boolean(),
  // Only meaningful (and only ever populated) for type: 'select'.
  options: z.array(z.string()).optional(),
  // Which step (formStepSchema below) this field belongs to, for a
  // multi-step form — null/omitted means "no step assigned". Deliberately
  // kept on the flat field, not by restructuring `fields` into
  // `steps[].fields`: a form with no steps defined (the common case,
  // and every form that existed before this feature) needs zero migration
  // and renders exactly as it always has (Form.astro checks
  // `form.steps.length === 0` first) — see docs/adr/0015's own multi-step
  // follow-up note.
  stepId: z.string().nullable().optional(),
  /** Absent or `null`: always shown — every field that existed before conditions. */
  showWhen: formFieldConditionSchema.nullable().optional(),
});
export type FormField = z.infer<typeof formFieldSchema>;

/** A form's fields as it may be saved: every condition names an earlier field, and an option that exists. */
export const formFieldsSchema = z
  .array(formFieldSchema)
  .superRefine((fields, context) => {
    for (const [fieldId, problem] of formConditionProblems(fields)) {
      context.addIssue({
        code: 'custom',
        path: [fields.findIndex((field) => field.id === fieldId), 'showWhen'],
        message: `Invalid condition on field ${fieldId}: ${problem}`,
      });
    }
  });

/**
 * One step of a multi-step form — just an id (matched against
 * FormField.stepId) and a display title, no fields of its own (those stay
 * in the form's flat `fields` array, grouped by `stepId` at render time).
 * A form with an empty `steps` array is a plain single-step form, the
 * default and backward-compatible shape.
 */
export const formStepSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
});
export type FormStep = z.infer<typeof formStepSchema>;

export const formStepsSchema = z.array(formStepSchema);

/**
 * The longest answer each kind of field takes. The public form sets these
 * as `maxlength` and the submission check enforces them, so a visitor is
 * stopped while typing rather than refused after sending. Generous on
 * purpose: they exist to keep a request from carrying a megabyte into a
 * notification email, not to shape what people write.
 */
export const FORM_FIELD_MAX_LENGTH = {
  text: 1_000,
  email: 254,
  tel: 64,
  textarea: 20_000,
} as const satisfies Partial<Record<FormFieldType, number>>;

/** The field's `FORM_FIELD_MAX_LENGTH`, or nothing for a kind of field without one. */
export function formFieldMaxLength(type: FormFieldType): number | undefined {
  switch (type) {
    case 'text':
    case 'email':
    case 'tel':
    case 'textarea':
      return FORM_FIELD_MAX_LENGTH[type];
    default:
      return undefined;
  }
}

const MAX_ATTACHMENT_FILENAME_LENGTH = 255;

/**
 * What an answer to this field may be, once it is not blank — blank and
 * "required" are the submission check's own concern. One rule per type:
 *
 * - text, email, tel, textarea: a string within its length, an email
 *   shaped like one;
 * - date and time: what `<input type="date|time">` sends;
 * - select: one of the field's own options, exactly;
 * - checkbox and newsletter consent: a boolean (the public site's proxy
 *   turns a ticked box into `true`);
 * - file: `{ url, filename }` — that the url is one of this form's own
 *   attachments is checked by the attachment store, which alone knows
 *   where it puts them.
 */
export function formFieldValueSchema(field: FormField): z.ZodType {
  switch (field.type) {
    case 'text':
    case 'tel':
    case 'textarea':
      return z.string().max(FORM_FIELD_MAX_LENGTH[field.type]);
    case 'email':
      return z.string().max(FORM_FIELD_MAX_LENGTH.email).email();
    case 'date':
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    case 'time':
      return z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
    case 'select':
      return z
        .string()
        .refine((answer) => (field.options ?? []).includes(answer));
    case 'checkbox':
    case 'newsletter-consent':
      return z.boolean();
    case 'file':
      return formFieldFileValueSchema.extend({
        filename: z.string().min(1).max(MAX_ATTACHMENT_FILENAME_LENGTH),
      });
  }
}
