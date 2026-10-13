import type { InvalidBlockProps } from '@kometio/shared-types';
import type { StoredContentLocation } from './visit-stored-content';

/** A stored value is not for a report to repeat at any length. */
const MAX_SHOWN = 120;

/** A block with a hundred refused props has one thing to say. */
const MAX_ISSUES = 5;

/**
 * Whether a character ends a line or is read by a terminal as a command, not
 * as text: C0 (a newline, an escape), DEL, C1, and the two Unicode separators.
 * By code and not by a pattern, which the linter takes for a mistake.
 */
function isControl(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x2028 ||
    code === 0x2029
  );
}

/**
 * Text that came out of the database, made safe to put in a line of a report.
 *
 * A block's `type`, its id and the keys of its props are whatever was stored,
 * and the report is read in a terminal and pasted into tickets: a newline in a
 * type would start a line the script did not write ("0 blocks refused"), and
 * an escape sequence would be run by the terminal. Plain text is shown as it
 * is; text with a control character is shown quoted and escaped; either is cut
 * at a length.
 */
export function printable(text: string): string {
  const cut = text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}…` : text;
  if (![...cut].some(isControl)) return cut;
  return JSON.stringify(cut).replace(
    /[\u007f-\u009f\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/** One line for a block that did not pass, with where it is. */
export function describeInvalidBlock(
  where: StoredContentLocation,
  problem: InvalidBlockProps,
): string {
  const block = problem.id
    ? `${printable(problem.type)} ${printable(problem.id)}`
    : printable(problem.type);
  const shown = problem.issues.slice(0, MAX_ISSUES).map(printable);
  const more = problem.issues.length - shown.length;
  if (more > 0) shown.push(`and ${more} more`);
  return `  row ${where.id}, block ${problem.position} (${block}): ${shown.join('; ')}`;
}

/** The types an audit had no schema for, the most numerous first, on one line. */
export function describeUnchecked(
  unchecked: ReadonlyMap<string, number>,
): string {
  return [...unchecked]
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => `${printable(type)} ×${count}`)
    .join(', ');
}
