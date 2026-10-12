import { countdownBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const countdownBlock = coreBlock(countdownBlockContract, {
  label: 'blocks.countdown.label',
  category: 'conversion',
  icon: 'timer',
  defaultProps: {
    targetDate: new Date(Date.now() + THIRTY_DAYS_MS)
      .toISOString()
      .slice(0, 16),
    label: 'Offerta valida fino a',
  },
  fields: [
    // Not inlineEditable: it must stay a strict-format ISO date
    // (Countdown.astro parses it directly) — free typing on the canvas
    // has no format control.
    {
      kind: 'text',
      key: 'targetDate',
      label: 'blocks.countdown.fields.targetDate.fieldLabel',
      placeholder: '2026-12-31T23:59',
    },
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      label: 'blocks.countdown.fields.label.fieldLabel',
      inlineEditable: true,
    },
  ],
});
