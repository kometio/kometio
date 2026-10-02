import { describe, expect, it } from 'vitest';
import { comparisonValueKind } from './comparison-value';

describe('comparisonValueKind', () => {
  it.each(['yes', 'Yes', 'sì', 'Sì', 'SI', 'si', 'true', '✓', '✔'])(
    'reads "%s" as included',
    (value) => {
      expect(comparisonValueKind(value)).toBe('yes');
    },
  );

  it.each(['no', 'No', 'NO', 'false', '✗', '✕', '×'])(
    'reads "%s" as not included',
    (value) => {
      expect(comparisonValueKind(value)).toBe('no');
    },
  );

  it.each(['10 GB', 'Unlimited', '', 'sino', 'nope'])(
    'shows "%s" as the words it is',
    (value) => {
      expect(comparisonValueKind(value)).toBe('text');
    },
  );
});
