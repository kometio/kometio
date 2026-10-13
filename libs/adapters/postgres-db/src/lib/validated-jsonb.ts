import { customType } from 'drizzle-orm/pg-core';

/**
 * What a schema has to offer to say what a column holds: zod's `safeParse`,
 * and nothing else of zod's, so that this library does not depend on it. The
 * schemas themselves live in `@kometio/shared-types`, beside the types the
 * columns used to be annotated with.
 */
export interface JsonSchema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: {
          issues: readonly { path: readonly PropertyKey[]; message: string }[];
        };
      };
}

/**
 * JSON that is in a column and is not what the column's schema says it is
 * (docs/adr/0123). It is neither a request that was refused nor a rule of the
 * domain: it is the stored data, and what it needs is somebody to be told, so
 * it is an ordinary error — a 500 with a request id, in the log and where
 * errors are reported.
 *
 * It names the column and where in the value, and never the value: the
 * content of a page is not for a log.
 */
export class StoredJsonInvalidError extends Error {
  constructor(
    readonly column: string,
    readonly direction: 'read' | 'write',
    readonly issues: readonly string[],
  ) {
    super(
      `The JSON ${direction === 'read' ? 'stored in' : 'being written to'} "${column}" is not what its schema says: ${issues.join('; ')}`,
    );
    this.name = 'StoredJsonInvalidError';
  }
}

/** At most this many issues are named; a column with a thousand wrong blocks has one thing to say. */
const MAX_ISSUES = 5;

function describe(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string[] {
  const shown = issues.slice(0, MAX_ISSUES).map((issue) => {
    const where = issue.path.map(String).join('.');
    return `${where === '' ? '(the value)' : where}: ${issue.message}`;
  });
  const more = issues.length - shown.length;
  return more > 0 ? [...shown, `and ${more} more`] : shown;
}

/**
 * A `jsonb` column whose value is checked against `schema` where it crosses the
 * driver, both ways: every query that reads the column, from whichever
 * repository, gets a value that is what the type says, or an error; and what is
 * written is held to the same.
 *
 * It validates and does not transform. The value that comes out is the one that
 * is stored, with whatever keys it has: a schema that strips what it does not
 * know, or fills in a default, would otherwise rewrite the data on its way
 * through a read and a save.
 *
 * A default is written as SQL (`.default(sql\`'{}'::jsonb\`)`), as the column
 * itself does not ask whether it is valid.
 */
export function validatedJsonb<T>(name: string, schema: JsonSchema<T>) {
  const check = (value: unknown, direction: 'read' | 'write'): T => {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new StoredJsonInvalidError(
        name,
        direction,
        describe(result.error.issues),
      );
    }
    // The one cast: the schema has just said that `value` is a T, and handing
    // back `value` and not `result.data` is the point of this function (see
    // its comment): the parse is a copy that has been through the schema's
    // transforms, and the stored value is not to be replaced by one.
    return value as T;
  };
  return customType<{ data: T; driverData: unknown }>({
    dataType: () => 'jsonb',
    // The driver parses jsonb itself; a string is what a driver that does not
    // gives (the built-in column does the same).
    fromDriver: (stored) =>
      check(typeof stored === 'string' ? JSON.parse(stored) : stored, 'read'),
    toDriver: (value) => JSON.stringify(check(value, 'write')),
  })(name);
}
