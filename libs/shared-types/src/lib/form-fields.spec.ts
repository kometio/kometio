import { describe, expect, it } from 'vitest';
import {
  FORM_FIELD_MAX_LENGTH,
  type FormField,
  formFieldFileValueSchema,
  formFieldSchema,
  formFieldMaxLength,
  formFieldValueSchema,
  formFieldsSchema,
  formStepSchema,
  formStepsSchema,
} from './form-fields';

describe('form-fields schemas', () => {
  it('accepts a valid text field', () => {
    const result = formFieldSchema.safeParse({
      id: 'field-1',
      label: 'Nome',
      type: 'text',
      required: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a select field with options', () => {
    const result = formFieldSchema.safeParse({
      id: 'field-1',
      label: 'Motivo del contatto',
      type: 'select',
      required: false,
      options: ['Informazioni', 'Preventivo', 'Altro'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a field with an empty label', () => {
    const result = formFieldSchema.safeParse({
      id: 'field-1',
      label: '',
      type: 'text',
      required: true,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a newsletter-consent field', () => {
    const result = formFieldSchema.safeParse({
      id: 'field-1',
      label: 'Iscrivimi alla newsletter',
      type: 'newsletter-consent',
      required: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a file field', () => {
    const result = formFieldSchema.safeParse({
      id: 'field-1',
      label: 'Curriculum',
      type: 'file',
      required: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts date and time fields', () => {
    expect(
      formFieldSchema.safeParse({
        id: 'field-1',
        label: 'Data preferita',
        type: 'date',
        required: false,
      }).success,
    ).toBe(true);
    expect(
      formFieldSchema.safeParse({
        id: 'field-2',
        label: 'Ora preferita',
        type: 'time',
        required: false,
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown field type', () => {
    const result = formFieldSchema.safeParse({
      id: 'field-1',
      label: 'Allegato',
      type: 'attachment',
      required: false,
    });
    expect(result.success).toBe(false);
  });

  it('validates an array of fields', () => {
    const result = formFieldsSchema.safeParse([
      { id: 'f1', label: 'Nome', type: 'text', required: true },
      { id: 'f2', label: 'Email', type: 'email', required: true },
      { id: 'f3', label: 'Messaggio', type: 'textarea', required: false },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts a field with a stepId, and one without', () => {
    expect(
      formFieldSchema.safeParse({
        id: 'f1',
        label: 'Nome',
        type: 'text',
        required: true,
        stepId: 'step-1',
      }).success,
    ).toBe(true);
    expect(
      formFieldSchema.safeParse({
        id: 'f2',
        label: 'Email',
        type: 'email',
        required: true,
      }).success,
    ).toBe(true);
  });
});

describe('formStepSchema', () => {
  it('accepts a valid step', () => {
    const result = formStepSchema.safeParse({
      id: 'step-1',
      title: 'Dati personali',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a step missing a title', () => {
    const result = formStepSchema.safeParse({ id: 'step-1' });
    expect(result.success).toBe(false);
  });

  it('rejects a step with an empty title', () => {
    const result = formStepSchema.safeParse({ id: 'step-1', title: '' });
    expect(result.success).toBe(false);
  });

  it('validates an array of steps', () => {
    const result = formStepsSchema.safeParse([
      { id: 'step-1', title: 'Dati personali' },
      { id: 'step-2', title: 'Dettagli richiesta' },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts an empty steps array (single-step form, the default)', () => {
    expect(formStepsSchema.safeParse([]).success).toBe(true);
  });
});

describe('formFieldFileValueSchema', () => {
  it('accepts a valid uploaded-file value', () => {
    const result = formFieldFileValueSchema.safeParse({
      url: 'http://localhost:3000/api/uploads/attachments/abc.pdf',
      filename: 'cv.pdf',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a value missing the filename', () => {
    const result = formFieldFileValueSchema.safeParse({
      url: 'http://localhost:3000/api/uploads/attachments/abc.pdf',
    });
    expect(result.success).toBe(false);
  });
});

describe('formFieldValueSchema', () => {
  const field = (
    type: FormField['type'],
    extra: Partial<FormField> = {},
  ): FormField => ({ id: 'f', label: 'F', type, required: false, ...extra });
  const accepts = (target: FormField, value: unknown) =>
    formFieldValueSchema(target).safeParse(value).success;

  it('takes text only as a string, and only up to its length', () => {
    expect(accepts(field('text'), 'Ciao')).toBe(true);
    expect(accepts(field('text'), {})).toBe(false);
    expect(accepts(field('text'), ['a'])).toBe(false);
    expect(accepts(field('text'), 42)).toBe(false);
    expect(
      accepts(field('text'), 'a'.repeat(FORM_FIELD_MAX_LENGTH.text + 1)),
    ).toBe(false);
    expect(
      accepts(field('textarea'), 'a'.repeat(FORM_FIELD_MAX_LENGTH.text + 1)),
    ).toBe(true);
  });

  it('takes an email only when it is shaped like one', () => {
    expect(accepts(field('email'), 'mario@esempio.it')).toBe(true);
    expect(accepts(field('email'), 'mario')).toBe(false);
  });

  it('takes a select answer only from its own options', () => {
    const select = field('select', { options: ['Rosso', 'Blu'] });
    expect(accepts(select, 'Rosso')).toBe(true);
    expect(accepts(select, 'Verde')).toBe(false);
    expect(accepts(select, 'rosso')).toBe(false);
  });

  it('takes date and time as the browser sends them', () => {
    expect(accepts(field('date'), '2026-09-29')).toBe(true);
    expect(accepts(field('date'), '29/09/2026')).toBe(false);
    expect(accepts(field('time'), '14:30')).toBe(true);
    expect(accepts(field('time'), '14:30:05')).toBe(true);
    expect(accepts(field('time'), 'le due')).toBe(false);
  });

  it('takes a box only as true or false', () => {
    expect(accepts(field('checkbox'), true)).toBe(true);
    expect(accepts(field('newsletter-consent'), false)).toBe(true);
    expect(accepts(field('checkbox'), 'on')).toBe(false);
  });

  it('takes a file only as a url and a name', () => {
    expect(
      accepts(field('file'), { url: 'https://x/a.pdf', filename: 'cv.pdf' }),
    ).toBe(true);
    expect(accepts(field('file'), 'https://x/a.pdf')).toBe(false);
    expect(
      accepts(field('file'), { url: 'https://x/a.pdf', filename: '' }),
    ).toBe(false);
  });
});

describe('formFieldMaxLength', () => {
  it('gives the typed kinds their limit and the others none', () => {
    expect(formFieldMaxLength('textarea')).toBe(FORM_FIELD_MAX_LENGTH.textarea);
    expect(formFieldMaxLength('email')).toBe(FORM_FIELD_MAX_LENGTH.email);
    expect(formFieldMaxLength('checkbox')).toBeUndefined();
    expect(formFieldMaxLength('select')).toBeUndefined();
  });
});
