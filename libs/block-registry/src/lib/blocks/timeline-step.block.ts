import { timelineStepBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

export const timelineStepBlock = coreBlock(timelineStepBlockContract, {
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
});
