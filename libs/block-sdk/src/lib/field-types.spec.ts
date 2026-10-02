import { describe, expect, it } from 'vitest';
import {
  FieldBuilder,
  isFieldVisible,
  type FieldDescriptor,
} from './field-types';

describe('FieldBuilder.custom', () => {
  it('builds a kind: custom FieldDescriptor naming the control to render', () => {
    const field = FieldBuilder.custom('page', 'Pagina', 'page');

    expect(field.kind).toBe('custom');
    expect(field.key).toBe('page');
    expect(field.label).toBe('Pagina');
    if (field.kind === 'custom') {
      expect(field.control).toBe('page');
    }
  });

  // The property this whole shape exists for: a descriptor is DATA. It
  // used to hold a live React component, which meant only something
  // running React could read the registry — the API could not tell which
  // fields hold rich text without pulling React into a Node server, and a
  // theme could not declare a custom field at all because the value
  // cannot survive JSON.
  it('produces a field that survives JSON', () => {
    const field = FieldBuilder.custom('media', 'Immagine', 'media');

    expect(JSON.parse(JSON.stringify(field))).toEqual(field);
  });
});

describe('isFieldVisible', () => {
  const alt: FieldDescriptor = {
    kind: 'text',
    key: 'alt',
    label: 'Alt',
    showWhen: { field: 'isDecorative', equals: false },
  };

  it('shows a field with no condition, whatever the props say', () => {
    const plain: FieldDescriptor = { kind: 'text', key: 'label', label: 'X' };

    expect(isFieldVisible(plain, {})).toBe(true);
    expect(isFieldVisible(plain, { anything: 'at all' })).toBe(true);
  });

  it('follows the sibling prop the condition names', () => {
    expect(isFieldVisible(alt, { isDecorative: false })).toBe(true);
    expect(isFieldVisible(alt, { isDecorative: true })).toBe(false);
  });

  /*
   * The case that decides whether this is usable on real data at all: a
   * block saved before the flag existed has no `isDecorative` prop, and
   * reading its absence as "no answer" would hide the alt field on every
   * image already on the site — the exact opposite of what the condition
   * says.
   */
  it('reads an absent prop as false, not as unknown', () => {
    expect(isFieldVisible(alt, {})).toBe(true);
  });

  it('accepts a list of values', () => {
    const field: FieldDescriptor = {
      kind: 'text',
      key: 'url',
      label: 'URL',
      showWhen: { field: 'linkType', equals: ['url', 'external'] },
    };

    expect(isFieldVisible(field, { linkType: 'url' })).toBe(true);
    expect(isFieldVisible(field, { linkType: 'external' })).toBe(true);
    expect(isFieldVisible(field, { linkType: 'page' })).toBe(false);
  });

  // A condition is data like the rest of the descriptor — a theme
  // declares one over HTTP (themeFieldDescriptorSchema), so it has to
  // cross JSON unchanged.
  it('survives JSON', () => {
    expect(JSON.parse(JSON.stringify(alt))).toEqual(alt);
  });
});
