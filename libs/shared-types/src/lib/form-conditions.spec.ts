import { describe, expect, it } from 'vitest';
import type { FormField } from './form-fields';
import { formConditionProblems, visibleFormFieldIds } from './form-conditions';
import { formFieldsSchema } from './form-fields';

const reason: FormField = {
  id: 'reason',
  label: 'Reason',
  type: 'select',
  required: true,
  options: ['Quote', 'Other'],
};
const details: FormField = {
  id: 'details',
  label: 'Tell us more',
  type: 'text',
  required: true,
  showWhen: { fieldId: 'reason', equals: 'Other' },
};
const newsletter: FormField = {
  id: 'newsletter',
  label: 'Newsletter',
  type: 'checkbox',
  required: false,
};
const topics: FormField = {
  id: 'topics',
  label: 'Topics',
  type: 'text',
  required: false,
  showWhen: { fieldId: 'newsletter', equals: null },
};

describe('visibleFormFieldIds', () => {
  it('shows every field that has no condition', () => {
    expect(visibleFormFieldIds([reason, newsletter], {})).toEqual(
      new Set(['reason', 'newsletter']),
    );
  });

  it('shows a field once a select has the option it names, and only then', () => {
    const fields = [reason, details];

    expect(
      visibleFormFieldIds(fields, { reason: 'Quote' }).has('details'),
    ).toBe(false);
    expect(
      visibleFormFieldIds(fields, { reason: 'Other' }).has('details'),
    ).toBe(true);
  });

  it('reads "any answer" as a ticked box, and an unticked one as none', () => {
    const fields = [newsletter, topics];

    expect(
      visibleFormFieldIds(fields, { newsletter: true }).has('topics'),
    ).toBe(true);
    expect(
      visibleFormFieldIds(fields, { newsletter: false }).has('topics'),
    ).toBe(false);
  });

  it('reads "any answer" on a text field as something other than blanks', () => {
    const name: FormField = {
      id: 'name',
      label: 'Name',
      type: 'text',
      required: false,
    };
    const greet: FormField = {
      id: 'greet',
      label: 'Greeting',
      type: 'text',
      required: false,
      showWhen: { fieldId: 'name', equals: null },
    };

    expect(
      visibleFormFieldIds([name, greet], { name: '   ' }).has('greet'),
    ).toBe(false);
    expect(
      visibleFormFieldIds([name, greet], { name: 'Ada' }).has('greet'),
    ).toBe(true);
  });

  /*
   * A hidden field counts as unanswered, whatever value the browser still
   * holds for it: otherwise a field could show because of an answer the
   * visitor can no longer see.
   */
  it('hides a field that depends on a hidden one, even if that one still has a value', () => {
    const more: FormField = {
      id: 'more',
      label: 'More',
      type: 'text',
      required: false,
      showWhen: { fieldId: 'details', equals: null },
    };

    const visible = visibleFormFieldIds([reason, details, more], {
      reason: 'Quote',
      details: 'left over from before',
    });

    expect(visible.has('details')).toBe(false);
    expect(visible.has('more')).toBe(false);
  });

  it('hides a field whose condition names a field the form no longer has', () => {
    expect(
      visibleFormFieldIds([details], { reason: 'Other' }).has('details'),
    ).toBe(false);
  });
});

describe('formConditionProblems', () => {
  it('finds nothing wrong with conditions that name an earlier field and a real option', () => {
    expect(
      formConditionProblems([reason, details, newsletter, topics]).size,
    ).toBe(0);
  });

  it.each([
    [
      'self',
      [{ ...reason, showWhen: { fieldId: 'reason', equals: null } }],
      'reason',
    ],
    ['unknown-field', [details], 'details'],
    ['not-earlier', [details, reason], 'details'],
    [
      'equals-needs-select',
      [
        newsletter,
        { ...topics, showWhen: { fieldId: 'newsletter', equals: 'yes' } },
      ],
      'topics',
    ],
    [
      'unknown-option',
      [
        reason,
        { ...details, showWhen: { fieldId: 'reason', equals: 'Refund' } },
      ],
      'details',
    ],
  ] as const)('reports %s', (problem, fields, fieldId) => {
    expect(formConditionProblems(fields).get(fieldId)).toBe(problem);
  });

  it('is what refuses a form on save', () => {
    expect(formFieldsSchema.safeParse([details, reason]).success).toBe(false);
    expect(formFieldsSchema.safeParse([reason, details]).success).toBe(true);
  });
});
