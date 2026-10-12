import { progressBarBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/** How far along something is — a fundraiser, a skill, a project. */
export const progressBarBlock = coreBlock(progressBarBlockContract, {
  label: 'blocks.progressBar.label',
  category: 'content',
  icon: 'gauge',
  defaultProps: { label: '', value: 50, showValue: true },
  fields: [
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.progressBar.fields.label.fieldLabel',
    },
    {
      kind: 'number',
      key: 'value',
      min: 0,
      max: 100,
      step: 1,
      label: 'blocks.progressBar.fields.value.fieldLabel',
    },
    {
      kind: 'boolean',
      key: 'showValue',
      label: 'blocks.progressBar.fields.showValue.fieldLabel',
    },
  ],
});
