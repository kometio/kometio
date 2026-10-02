import { z } from 'zod';

/**
 * The editor controls a `kind: 'custom'` field can ask for, by name.
 *
 * It lives here, and not next to `FieldDescriptor` in `@kometio/block-sdk`,
 * because two different things need the SAME list and neither can own it:
 * the authoring type in block-sdk, and `themeFieldDescriptorSchema`, which
 * validates a theme's descriptors at runtime. block-sdk already depends on
 * this package, so putting it the other way round would be a cycle — and
 * duplicating it would mean a theme could name a control the type system
 * accepts and the schema rejects, or the reverse.
 *
 * `media` means an image, for history's sake: it was named before the
 * library held anything else, and theme descriptors already use it that
 * way. `video` and `audio` are its siblings, so a field says which kind
 * it takes and the picker offers nothing else — and `file` is the one
 * that takes any kind at all, for a download.
 *
 * A closed set on purpose: it is the contract between a descriptor, which
 * is data, and the editor, which is the only place that can draw
 * anything. A name that is not in it renders nothing at all — no error,
 * just a label with a blank space under it — which is why it is validated
 * rather than trusted.
 */
export const customFieldControlSchema = z.enum([
  'audio',
  'color',
  'date',
  'feature-list',
  'file',
  'form',
  'gallery',
  'icon',
  'media',
  'page',
  'section',
  'table-data',
  'taxonomy',
  'term',
  'time',
  'video',
]);

export type CustomFieldControl = z.infer<typeof customFieldControlSchema>;

/** The same list as a plain array, for a runtime check that has no Zod in hand. */
export const CUSTOM_FIELD_CONTROLS: readonly CustomFieldControl[] =
  customFieldControlSchema.options;
