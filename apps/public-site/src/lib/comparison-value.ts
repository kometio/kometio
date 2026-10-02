/**
 * What a comparison cell says: included, not included, or words of its own.
 *
 * The words people actually type in a comparison, in the two languages
 * the editor speaks and as the symbols themselves. Case and accents are
 * ignored ("Sì", "SI", "si" are one answer), anything else is shown as
 * written — "10 GB" is not a yes.
 */
export type ComparisonValueKind = 'yes' | 'no' | 'text';

const YES = new Set(['yes', 'si', 'true', '✓', '✔', '✅']);
const NO = new Set(['no', 'false', '✗', '✕', '×', '❌']);

export function comparisonValueKind(value: string): ComparisonValueKind {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (YES.has(normalized)) return 'yes';
  if (NO.has(normalized)) return 'no';
  return 'text';
}
