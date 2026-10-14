import { describe, expect, it } from 'vitest';
import {
  describeInvalidBlock,
  describeUnchecked,
  printable,
} from './block-props-audit-report';

const where = { table: 'page_groups', id: 'g1', column: 'content' };

describe('printable', () => {
  it('leaves plain text as it is, whatever it says', () => {
    expect(printable('Image')).toBe('Image');
    expect(
      printable('level: Invalid input: expected number, received string'),
    ).toBe('level: Invalid input: expected number, received string');
    expect(printable('Café “Rossi” — 日本語')).toBe('Café “Rossi” — 日本語');
  });

  it('quotes and escapes what would end a line or be read by a terminal', () => {
    expect(printable('Image\n  row x: 0 refused')).toBe(
      '"Image\\n  row x: 0 refused"',
    );
    expect(printable('\u001b[31mred\u001b[0m')).toBe(
      '"\\u001b[31mred\\u001b[0m"',
    );
    expect(printable('a\u009bb')).toBe('"a\\u009bb"'); // a C1 control: CSI to some terminals
    expect(printable('a\u2028b')).toBe('"a\\u2028b"');
  });

  // Not control characters, and no less able to make a line say what it does
  // not: a right-to-left override reorders what follows it on the screen, a
  // zero-width space and a byte order mark are not there at all, and a tag
  // character is outside the plane and invisible.
  it('escapes the characters that reorder or hide text', () => {
    expect(printable('Image\u202Eevil')).toBe('"Image\\u202eevil"');
    expect(printable('a\u200Bb')).toBe('"a\\u200bb"');
    expect(printable('\uFEFFa')).toBe('"\\ufeffa"');
    expect(printable('a\u{E0041}b')).toBe('"a\\u{e0041}b"');
    expect(printable('Image\u2066\u2069')).toContain('\\u2066');
  });

  it('cuts a long value', () => {
    expect(printable('x'.repeat(500))).toBe(`${'x'.repeat(120)}…`);
  });
});

describe('describeInvalidBlock', () => {
  it('is one line, however hostile the stored type and keys are', () => {
    const line = describeInvalidBlock(where, {
      id: 'b\n  row forged: 0 refused',
      type: 'Heading\r\nBlock props audit complete: 0 blocks do not pass',
      position: 3,
      issues: ['text\nsecond line: Invalid input'],
      fields: [],
    });

    expect(line).not.toMatch(/[\r\n]/);
    expect(line.startsWith('  row g1, block 3 (')).toBe(true);
  });

  it('names the first issues of a block and counts the rest', () => {
    const line = describeInvalidBlock(where, {
      id: undefined,
      type: 'Form',
      position: 1,
      issues: Array.from({ length: 8 }, (_, index) => `field${index}: wrong`),
      fields: [],
    });

    expect(line).toContain('field4: wrong; and 3 more');
    expect(line).not.toContain('field5');
  });

  it('reads like the plain case when nothing needs escaping', () => {
    expect(
      describeInvalidBlock(where, {
        id: 'b1',
        type: 'Image',
        position: 7,
        issues: ['media: Invalid input: expected object', 'caption: required'],
        fields: [],
      }),
    ).toBe(
      '  row g1, block 7 (Image b1): media: Invalid input: expected object; caption: required',
    );
  });
});

describe('describeUnchecked', () => {
  it('names the types, most numerous first', () => {
    expect(
      describeUnchecked(
        new Map([
          ['Rare', 1],
          ['StatusBadge', 8],
        ]),
      ),
    ).toBe('StatusBadge ×8, Rare ×1');
  });

  it('cannot be made to start another line by a type', () => {
    expect(describeUnchecked(new Map([['A\nB', 1]]))).not.toMatch(/\n/);
  });
});
