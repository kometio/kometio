import type { TimelineStepProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

export const timelineStepBlock: BlockDescriptor<TimelineStepProps> = {
  type: 'TimelineStep',
  label: 'blocks.timelineStep.label',
  category: 'socialProof',
  icon: 'circle-dot',
  defaultProps: {
    label: 'Fase 1',
    title: 'Titolo della fase',
    description: 'Descrizione della fase...',
  },
  fields: [
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      label: 'blocks.timelineStep.fields.label.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'text',
      key: 'title',
      translatable: true,
      label: 'blocks.timelineStep.fields.title.fieldLabel',
      inlineEditable: true,
    },
    {
      kind: 'richtext',
      key: 'description',
      translatable: true,
      label: 'blocks.timelineStep.fields.description.fieldLabel',
      inlineEditable: true,
    },
  ],
  // The line and the gutter its marker sits in belong to Timeline; on its
  // own the marker hangs outside the content column.
  allowedParentTypes: ['Timeline'],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.TimelineStep,
};
