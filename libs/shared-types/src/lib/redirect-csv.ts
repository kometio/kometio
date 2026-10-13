import type { RedirectStatus } from './redirect-rules';

/** More rows than this are not a list somebody checked; and the answer is built in one request. */
export const MAX_REDIRECT_CSV_ROWS = 5000;

export interface RedirectCsvRow {
  /** The line of the file it came from, 1-based, so that a problem can be pointed at. */
  line: number;
  from: string;
  to: string;
  status: RedirectStatus;
}

export interface RedirectCsvProblem {
  line: number;
  problem: 'missing-from' | 'missing-to' | 'bad-status';
  /** What the cell said, for the message. */
  value?: string;
}

export interface ParsedRedirectCsv {
  rows: RedirectCsvRow[];
  problems: RedirectCsvProblem[];
  /** More rows than the limit were in the file; the first ones are in `rows`. */
  truncated: boolean;
}

const FROM_HEADERS = new Set([
  'from',
  'source',
  'old',
  'old url',
  'old address',
  'old path',
  'url',
  'origine',
  'da',
]);
const TO_HEADERS = new Set([
  'to',
  'target',
  'destination',
  'new',
  'new url',
  'new address',
  'new path',
  'redirect',
  'destinazione',
  'a',
]);
const STATUS_HEADERS = new Set([
  'status',
  'type',
  'code',
  'redirect type',
  'status code',
  'tipo',
]);

const STATUS_WORDS: Record<string, RedirectStatus> = {
  '301': 301,
  permanent: 301,
  permanente: 301,
  '302': 302,
  temporary: 302,
  temporaneo: 302,
  '410': 410,
  gone: 410,
  removed: 410,
  rimosso: 410,
};

/**
 * Splits the text into rows of cells: quotes may hold the separator, a line
 * break and a doubled quote (RFC 4180). A `\r\n` is one line break.
 */
function splitRows(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const flush = () => {
    row.push(cell);
    cell = '';
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? '';
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
    } else if (character === '"' && cell === '') {
      quoted = true;
    } else if (character === separator) {
      flush();
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      flush();
      rows.push(row);
      row = [];
    } else {
      cell += character;
    }
  }
  if (cell !== '' || row.length > 0) {
    flush();
    rows.push(row);
  }
  return rows;
}

/** The separator the first line uses most: a spreadsheet in Italy saves `;`, one in England `,`. */
function detectSeparator(text: string): string {
  const firstLine =
    text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
  let best = ',';
  let bestCount = 0;
  for (const candidate of [',', ';', '\t']) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * A list of redirects as a person has it: from a spreadsheet or pasted from
 * an SEO tool. Two or three columns — the old address, where to, and
 * optionally permanent/temporary/gone — with or without a header row, with
 * `,`, `;` or a tab, and the cells quoted or not.
 *
 * It only reads. Whether an address is a valid one, or taken, is for the
 * rules to say, row by row, and the answer names the line.
 */
export function parseRedirectCsv(text: string): ParsedRedirectCsv {
  const cleaned = text.replace(/^\uFEFF/, '');
  const grid = splitRows(cleaned, detectSeparator(cleaned));

  const lineOf = (index: number): number => index + 1;
  let fromAt = 0;
  let toAt = 1;
  let statusAt = 2;
  let start = 0;

  const first = grid.find((row) => row.some((cell) => cell.trim() !== ''));
  if (first) {
    const names = first.map((cell) => cell.trim().toLowerCase());
    const fromIndex = names.findIndex((name) => FROM_HEADERS.has(name));
    const toIndex = names.findIndex((name) => TO_HEADERS.has(name));
    if (fromIndex !== -1 && toIndex !== -1) {
      fromAt = fromIndex;
      toAt = toIndex;
      const statusIndex = names.findIndex((name) => STATUS_HEADERS.has(name));
      statusAt = statusIndex === -1 ? -1 : statusIndex;
      start = grid.indexOf(first) + 1;
    }
  }

  const rows: RedirectCsvRow[] = [];
  const problems: RedirectCsvProblem[] = [];
  let truncated = false;

  for (let index = start; index < grid.length; index += 1) {
    const cells = grid[index] ?? [];
    if (cells.every((cell) => cell.trim() === '')) continue;
    if (rows.length + problems.length >= MAX_REDIRECT_CSV_ROWS) {
      truncated = true;
      break;
    }
    const line = lineOf(index);
    const from = (cells[fromAt] ?? '').trim();
    const to = (cells[toAt] ?? '').trim();
    const statusCell = statusAt === -1 ? '' : (cells[statusAt] ?? '').trim();

    if (from === '') {
      problems.push({ line, problem: 'missing-from' });
      continue;
    }
    let status: RedirectStatus = 301;
    if (statusCell !== '') {
      const known = STATUS_WORDS[statusCell.toLowerCase()];
      if (known === undefined) {
        problems.push({ line, problem: 'bad-status', value: statusCell });
        continue;
      }
      status = known;
    }
    if (to === '' && status !== 410) {
      problems.push({ line, problem: 'missing-to' });
      continue;
    }
    rows.push({ line, from, to, status });
  }

  return { rows, problems, truncated };
}
