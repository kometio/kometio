/**
 * A value as PHP's `serialize()` writes it.
 *
 * Arrays come back as a `Map`, not an object, because the order has to
 * survive. PHP has one array type for both a list and a dictionary, so a
 * field definition mixes integer keys with string ones — and a JS object
 * enumerates integer-like keys first, in ascending order, whatever order
 * they were written in. A repeater's rows are a list; reordering them
 * silently is exactly the kind of thing nobody notices until a page comes
 * out shuffled.
 */
export type PhpValue =
  string | number | boolean | null | Map<string | number, PhpValue>;

export class PhpUnserializeError extends Error {
  constructor(message: string, offset: number) {
    super(`${message} (at byte ${offset})`);
    this.name = 'PhpUnserializeError';
  }
}

/**
 * Reads PHP's serialisation format.
 *
 * WordPress stores structured postmeta this way, and an ACF field
 * definition — which is what this exists for — is a nest of them:
 * `a:9:{s:4:"type";s:5:"group";s:10:"sub_fields";a:3:{...}}`. Ten lines
 * of format, and no dependency worth taking for it.
 *
 * It works on bytes rather than on characters, which is the part that is
 * easy to get wrong: a PHP string declares its length in **bytes**, so
 * `s:6:"Caffè"` is six bytes and five characters, and a reader that
 * counts characters walks off the end on the first accented word — which,
 * on an Italian site, is immediately.
 */
export function phpUnserialize(input: string): PhpValue {
  const bytes = Buffer.from(input, 'utf8');
  const reader = { bytes, offset: 0 };
  const value = readValue(reader);
  return value;
}

interface Reader {
  bytes: Buffer;
  offset: number;
}

function fail(reader: Reader, message: string): never {
  throw new PhpUnserializeError(message, reader.offset);
}

function expect(reader: Reader, char: string): void {
  if (reader.bytes[reader.offset] !== char.charCodeAt(0)) {
    fail(reader, `expected ${JSON.stringify(char)}`);
  }
  reader.offset += 1;
}

/** Up to (not including) `stop`, as ASCII — every delimiter in this format is one byte. */
function readUntil(reader: Reader, stop: string): string {
  const end = reader.bytes.indexOf(stop.charCodeAt(0), reader.offset);
  if (end === -1) fail(reader, `unterminated value, expected ${stop}`);
  const text = reader.bytes.toString('latin1', reader.offset, end);
  reader.offset = end + 1;
  return text;
}

function readValue(reader: Reader): PhpValue {
  const type = String.fromCharCode(reader.bytes[reader.offset] ?? 0);
  switch (type) {
    case 'N':
      reader.offset += 1;
      expect(reader, ';');
      return null;
    case 'b': {
      reader.offset += 2; // b:
      const raw = readUntil(reader, ';');
      return raw === '1';
    }
    case 'i': {
      reader.offset += 2; // i:
      const raw = readUntil(reader, ';');
      const parsed = Number.parseInt(raw, 10);
      if (Number.isNaN(parsed)) fail(reader, `not an integer: ${raw}`);
      return parsed;
    }
    case 'd': {
      reader.offset += 2; // d:
      const raw = readUntil(reader, ';');
      // PHP writes INF/-INF/NAN in words; none of them mean anything in a
      // field definition, and a NaN quietly spreading is worse than a 0.
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    case 's': {
      reader.offset += 2; // s:
      const byteLength = Number.parseInt(readUntil(reader, ':'), 10);
      if (Number.isNaN(byteLength) || byteLength < 0) {
        fail(reader, 'bad string length');
      }
      expect(reader, '"');
      const start = reader.offset;
      const end = start + byteLength;
      if (end > reader.bytes.length) fail(reader, 'string runs past the end');
      const text = reader.bytes.toString('utf8', start, end);
      reader.offset = end;
      expect(reader, '"');
      expect(reader, ';');
      return text;
    }
    case 'a': {
      reader.offset += 2; // a:
      const count = Number.parseInt(readUntil(reader, ':'), 10);
      if (Number.isNaN(count) || count < 0) fail(reader, 'bad array length');
      expect(reader, '{');
      const entries = new Map<string | number, PhpValue>();
      for (let index = 0; index < count; index += 1) {
        const key = readValue(reader);
        if (typeof key !== 'string' && typeof key !== 'number') {
          fail(reader, 'array key is neither a string nor an integer');
        }
        entries.set(key, readValue(reader));
      }
      expect(reader, '}');
      return entries;
    }
    default:
      fail(reader, `unsupported type ${JSON.stringify(type)}`);
  }
}

/** The entry at `key`, when the value is an array and the entry is a string. */
export function phpString(value: PhpValue, key: string): string {
  if (!(value instanceof Map)) return '';
  const entry = value.get(key);
  return typeof entry === 'string' ? entry : '';
}

/** The entry at `key`, when the value is an array and the entry is one too. */
export function phpArray(
  value: PhpValue,
  key: string,
): Map<string | number, PhpValue> | null {
  if (!(value instanceof Map)) return null;
  const entry = value.get(key);
  return entry instanceof Map ? entry : null;
}
