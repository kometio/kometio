import { sectionBlockContract, type SectionProps } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';

// Not `coreBlock()`, the one block that is not: its props are declared as
// `SectionProps` because what `z.infer` gives for its schema (`catchall`)
// contradicts itself and `{ section: null }` does not satisfy it — see
// `SectionProps`. `coreBlock` types `defaultProps` by the inference.
export const sectionBlock: BlockDescriptor<SectionProps> = {
  type: sectionBlockContract.type,
  label: 'blocks.section.label',
  category: 'layout',
  icon: 'rows-3',
  defaultProps: { section: null },
  fields: [
    // One field, and the instance's own values are NOT declared here.
    //
    // They cannot be: which fields an instance may change depends on the
    // section it points at — data fetched at runtime — while a descriptor
    // is static, and is also what a theme has to be able to serialise as
    // JSON. The Inspector draws them from the section itself; see
    // `section-instance-fields.tsx`.
    FieldBuilder.custom(
      'section',
      'blocks.section.fields.section.fieldLabel',
      'section',
    ),
  ],
  // NOT a container, and that is the feature rather than an omission: the
  // blocks a section shows belong to the section, not to this page, so the
  // editor must not offer to drop anything into an instance or drag
  // anything out of one (docs/adr/0059).
  isContainer: false,
  // Only the space it occupies. Everything a section LOOKS like is the
  // blocks inside it, each of which carries its own styling — offering a
  // background or a padding on the wrapper would be a second, competing
  // place to set the same thing, and one the section's author cannot see.
  stylableProperties: ['maxWidth'],
  defaultStyle: sectionBlockContract.style,
};
