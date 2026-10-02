import type { z } from 'zod';

/**
 * A picker's stored value, read with the schema the site reads it with —
 * or `null`, which every picker already shows as "nothing chosen yet".
 *
 * The inspector hands a control the raw prop. Nothing in the editor parses
 * props through a block's schema, so a block saved before a field existed
 * holds no key at all, and the value can be anything that was once saved
 * there. Asserting it into the picker's type was a cast the data did not
 * honour.
 */
export function readPickedValue<T>(
  schema: z.ZodType<T>,
  value: unknown,
): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
