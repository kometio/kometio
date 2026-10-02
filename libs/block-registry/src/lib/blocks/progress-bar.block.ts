import type { ProgressBarProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';

/** How far along something is — a fundraiser, a skill, a project. */
export const progressBarBlock: BlockDescriptor<ProgressBarProps> = {
  type: 'ProgressBar',
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
  // The fill's colour, the track's rounding and the bar's thickness — the
  // three things a bar is made of.
  stylableProperties: [
    'backgroundColor',
    'textColor',
    'borderRadius',
    'minHeight',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.ProgressBar,
};
