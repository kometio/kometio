/**
 * Whether a value is an object to read keys from: not `null`, not an array.
 * A guard in place of `value as Record<string, unknown>` after a `typeof`
 * check, which tells the compiler what the code already knows.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
