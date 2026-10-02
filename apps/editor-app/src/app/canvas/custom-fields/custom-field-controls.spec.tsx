import { describe, expect, it } from 'vitest';
import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import { CUSTOM_FIELD_CONTROLS } from './custom-field-controls';

const ALL_BLOCKS = [...pageBlocks, ...headerFooterBlocks];

describe('CUSTOM_FIELD_CONTROLS', () => {
  // A descriptor names a control; if the editor has no component under
  // that name, the field renders as nothing at all — no error, no empty
  // input, just a label with a blank space where the picker should be.
  // Nobody would notice until a customer could not choose an image.
  it('has a component for every control any block asks for', () => {
    const asked = new Set(
      ALL_BLOCKS.flatMap((descriptor) =>
        descriptor.fields
          .filter((field) => field.kind === 'custom')
          .map((field) => field.control),
      ),
    );

    expect(asked.size).toBeGreaterThan(0);
    for (const control of asked) {
      expect(CUSTOM_FIELD_CONTROLS[control]).toBeTypeOf('function');
    }
  });

  it('has no entry pointing at nothing', () => {
    for (const [name, component] of Object.entries(CUSTOM_FIELD_CONTROLS)) {
      expect(component, `control "${name}"`).toBeTypeOf('function');
    }
  });
});

/**
 * The guarantee the split was made for: block descriptors are data.
 *
 * They used to hold live React components, and that single property
 * decided who could read the registry at all — the API could not look up
 * which fields hold rich text (ADR-0046) without pulling React into a
 * Node server, and a theme could not declare a custom field, because the
 * value cannot cross JSON.
 */
describe('block descriptors are data', () => {
  it('survive a round trip through JSON, fields included', () => {
    for (const descriptor of ALL_BLOCKS) {
      const roundTripped: unknown = JSON.parse(JSON.stringify(descriptor));
      expect(roundTripped, descriptor.type).toEqual(descriptor);
    }
  });

  it('carry no function anywhere in their fields', () => {
    for (const descriptor of ALL_BLOCKS) {
      for (const field of descriptor.fields) {
        for (const [key, value] of Object.entries(field)) {
          expect(
            typeof value,
            `${descriptor.type}.${field.key} -> ${key}`,
          ).not.toBe('function');
        }
      }
    }
  });
});
