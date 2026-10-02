import { describe, expect, it } from 'vitest';
import { themeFieldDescriptorSchema } from './theme-blocks';
import { CUSTOM_FIELD_CONTROLS } from './custom-field-control';

/**
 * This schema is the wire shape: a theme's block descriptors are read from
 * `themes/<name>/blocks/*.block.ts` and served to editor-app as JSON. What
 * it accepts is exactly what a theme is allowed to declare.
 */
describe('themeFieldDescriptorSchema', () => {
  it('accepts a custom field naming a control', () => {
    // This was rejected until 2026-09-07, for a reason that was true at
    // the time: the field carried a live React component and could not
    // survive JSON. It names its control now, so it can.
    for (const control of CUSTOM_FIELD_CONTROLS) {
      const parsed = themeFieldDescriptorSchema.safeParse({
        kind: 'custom',
        key: 'picker',
        label: 'blocks.faq.fields.picker.fieldLabel',
        control,
      });
      expect(parsed.success, control).toBe(true);
    }
  });

  it('rejects a control the editor cannot render', () => {
    expect(
      themeFieldDescriptorSchema.safeParse({
        kind: 'custom',
        key: 'picker',
        label: 'blocks.faq.fields.picker.fieldLabel',
        control: 'spreadsheet',
      }).success,
    ).toBe(false);
  });

  it('rejects a custom field that still carries a component', () => {
    // The old shape. Accepting it would mean a descriptor holding a
    // function again, and the whole point is that it holds data.
    expect(
      themeFieldDescriptorSchema.safeParse({
        kind: 'custom',
        key: 'picker',
        label: 'blocks.faq.fields.picker.fieldLabel',
        component: () => null,
      }).success,
    ).toBe(false);
  });

  it('accepts the rich text kind, so a theme can have formatted body copy too', () => {
    expect(
      themeFieldDescriptorSchema.safeParse({
        kind: 'richtext',
        key: 'body',
        label: 'blocks.faq.fields.body.fieldLabel',
        translatable: true,
      }).success,
    ).toBe(true);
  });
});
