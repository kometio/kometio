import { describe, expect, it } from 'vitest';
import { MAX_REDIRECT_CSV_ROWS, parseRedirectCsv } from './redirect-csv';

describe('parseRedirectCsv', () => {
  it('reads two columns with no header', () => {
    const parsed = parseRedirectCsv('/old-a,/new-a\n/old-b,/new-b\n');

    expect(parsed.rows).toEqual([
      { line: 1, from: '/old-a', to: '/new-a', status: 301 },
      { line: 2, from: '/old-b', to: '/new-b', status: 301 },
    ]);
    expect(parsed.problems).toEqual([]);
  });

  it('reads a header, in any order, and a status column', () => {
    const parsed = parseRedirectCsv(
      'Type,Destination,Source\ntemporary,/new,/old\n301,/n2,/o2\n',
    );

    expect(parsed.rows).toEqual([
      { line: 2, from: '/old', to: '/new', status: 302 },
      { line: 3, from: '/o2', to: '/n2', status: 301 },
    ]);
  });

  it('reads the separator the file uses: ; from an Italian spreadsheet, a tab from a paste', () => {
    expect(parseRedirectCsv('from;to\n/a;/b\n').rows[0]).toMatchObject({
      from: '/a',
      to: '/b',
    });
    expect(parseRedirectCsv('/a\t/b\n').rows[0]).toMatchObject({
      from: '/a',
      to: '/b',
    });
  });

  it('reads quoted cells, with the separator, a quote and a line break inside', () => {
    const parsed = parseRedirectCsv('"/a,b","/c ""d"""\n"/multi\nline","/x"\n');

    expect(parsed.rows[0]).toMatchObject({ from: '/a,b', to: '/c "d"' });
    expect(parsed.rows[1]).toMatchObject({ from: '/multi\nline', to: '/x' });
  });

  it('survives a byte order mark and Windows line ends', () => {
    const parsed = parseRedirectCsv('﻿from,to\r\n/a,/b\r\n');

    expect(parsed.rows).toEqual([
      { line: 2, from: '/a', to: '/b', status: 301 },
    ]);
  });

  it('says gone with no destination', () => {
    const parsed = parseRedirectCsv('from,to,status\n/removed,,410\n');

    expect(parsed.rows).toEqual([
      { line: 2, from: '/removed', to: '', status: 410 },
    ]);
  });

  it('names the line of what it cannot use, and goes on', () => {
    const parsed = parseRedirectCsv(
      'from,to,status\n/a,,301\n,/b,301\n/c,/d,maybe\n/e,/f,301\n',
    );

    expect(parsed.problems).toEqual([
      { line: 2, problem: 'missing-to' },
      { line: 3, problem: 'missing-from' },
      { line: 4, problem: 'bad-status', value: 'maybe' },
    ]);
    expect(parsed.rows).toHaveLength(1);
  });

  it('skips blank lines', () => {
    const parsed = parseRedirectCsv('\n/a,/b\n\n\n/c,/d\n');

    expect(parsed.rows.map((row) => row.line)).toEqual([2, 5]);
  });

  it('stops at the limit and says so', () => {
    const text = Array.from(
      { length: MAX_REDIRECT_CSV_ROWS + 10 },
      (_, index) => `/a${index},/b${index}`,
    ).join('\n');

    const parsed = parseRedirectCsv(text);

    expect(parsed.rows).toHaveLength(MAX_REDIRECT_CSV_ROWS);
    expect(parsed.truncated).toBe(true);
  });
});
