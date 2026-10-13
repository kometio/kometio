import type { InvalidBlockProps } from '@kometio/shared-types';
import type { StoredContentLocation } from './visit-stored-content';

/** A stored value is not for a report to repeat at any length. */
const MAX_SHOWN = 120;

/** A block with a hundred refused props has one thing to say. */
const MAX_ISSUES = 5;

/**
 * What a terminal or a reader can be made to do with a character that is not
 * text: control characters (a newline, an escape, C1), format characters
 * (right-to-left overrides and isolates that reorder what is shown after
 * them, zero-width and joiner characters, the byte order mark, tag
 * characters) and the line and paragraph separators. By property, so that a
 * range is not forgotten.
 */
const NOT_TEXT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const NOT_TEXT_EVERYWHERE = new RegExp(NOT_TEXT.source, 'gu');

/**
 * Text that came out of the database, made safe to put in a line of a report.
 *
 * A block's `type`, its id and the keys of its props are whatever was stored,
 * and the report is read in a terminal and pasted into tickets: a newline in a
 * type would start a line the script did not write ("0 blocks refused"), and
 * an escape sequence would be run by the terminal. Plain text is shown as it
 * is; text with a character that is not text is shown quoted and escaped; either
 * is cut at a length.
 */
export function printable(text: string): string {
  const cut = text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}…` : text;
  if (!NOT_TEXT.test(cut)) return cut;
  // JSON.stringify escapes the C0 ones and the quote and the backslash; the
  // rest of the characters above are written as their code point.
  return JSON.stringify(cut).replace(NOT_TEXT_EVERYWHERE, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20
      ? character
      : code > 0xffff
        ? `\\u{${code.toString(16)}}`
        : `\\u${code.toString(16).padStart(4, '0')}`;
  });
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
